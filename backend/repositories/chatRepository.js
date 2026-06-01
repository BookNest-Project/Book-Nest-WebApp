import { randomBytes } from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { getFrontendUrl } from '../utils/envUrls.js';
import { logger } from '../utils/logger.js';
import { feedRepository } from './feedRepository.js';
import { isUserOnline } from '../utils/presence.js';

async function assertParticipant(chatId, userId, { restoreHidden = false } = {}) {
  const { data, error } = await supabaseAdmin
    .from('chat_participants')
    .select('id, hidden_at')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Not a participant');

  if (data.hidden_at) {
    if (restoreHidden) {
      await supabaseAdmin
        .from('chat_participants')
        .update({ hidden_at: null })
        .eq('id', data.id);
      return true;
    }
    throw new Error('Not a participant');
  }

  return true;
}

async function getHiddenMessageIds(userId, chatId) {
  const { data: participantMessages } = await supabaseAdmin
    .from('messages')
    .select('id')
    .eq('chat_id', chatId);

  const messageIds = (participantMessages || []).map((m) => m.id);
  if (messageIds.length === 0) return new Set();

  const { data: hidden } = await supabaseAdmin
    .from('message_deletions')
    .select('message_id')
    .eq('user_id', userId)
    .in('message_id', messageIds);

  return new Set((hidden || []).map((h) => h.message_id));
}

async function resolveUserDisplay(userRow) {
  if (!userRow) return { name: 'User', avatarUrl: null };

  const { data: readerProfile } = await supabaseAdmin
    .from('reader_profiles')
    .select('display_name, avatar_url')
    .eq('user_id', userRow.id)
    .maybeSingle();

  const name =
    readerProfile?.display_name ||
    userRow.email?.split('@')[0] ||
    'User';

  return {
    name,
    avatarUrl: readerProfile?.avatar_url || userRow.avatar_url || null,
  };
}

function formatMessage(msg, display, sharedPost = null) {
  const deletedForEveryone = Boolean(msg.deleted_for_everyone_at);
  return {
    id: msg.id,
    content: deletedForEveryone ? null : msg.content,
    postId: deletedForEveryone ? null : msg.post_id || null,
    sharedPost: deletedForEveryone ? null : sharedPost,
    senderId: msg.sender_id,
    senderName: display.name,
    senderAvatar: display.avatarUrl,
    isRead: msg.is_read,
    isDeleted: deletedForEveryone,
    deletedForEveryone,
    editedAt: msg.edited_at ?? null,
    createdAt: msg.created_at,
  };
}

/** Base columns — works before edited_at migration is applied */
const MESSAGE_SELECT = `
  id,
  content,
  sender_id,
  post_id,
  is_read,
  deleted_for_everyone_at,
  created_at,
  users!sender_id ( id, email, avatar_url )
`;

const MESSAGE_SELECT_WITH_EDIT = `
  id,
  content,
  sender_id,
  post_id,
  is_read,
  deleted_for_everyone_at,
  edited_at,
  created_at,
  users!sender_id ( id, email, avatar_url )
`;

function isMissingEditedAtColumn(error) {
  const msg = error?.message || '';
  return /edited_at/i.test(msg) && /does not exist|column/i.test(msg);
}

async function attachSharedPosts(messages, viewerUserId) {
  const postIds = (messages || []).map((m) => m.post_id).filter(Boolean);
  const postMap = await feedRepository.getPostsByIds(postIds, viewerUserId);
  return postMap;
}

function previewMessageContent(messageRow) {
  if (messageRow.deleted_for_everyone_at) return 'Message deleted';
  if (messageRow.post_id) return 'Shared a post';
  return messageRow.content;
}

export const chatRepository = {
  async getOrCreateDirectChat(userId1, userId2) {
    try {
      if (userId1 === userId2) {
        throw new Error('Cannot chat with yourself');
      }

      const { data: user2Rows } = await supabaseAdmin
        .from('chat_participants')
        .select('chat_id')
        .eq('user_id', userId2);

      for (const row of user2Rows || []) {
        const { data: chat } = await supabaseAdmin
          .from('chats')
          .select('*')
          .eq('id', row.chat_id)
          .eq('type', 'direct')
          .maybeSingle();

        if (!chat) continue;

        const { data: user1Row } = await supabaseAdmin
          .from('chat_participants')
          .select('id, hidden_at')
          .eq('chat_id', chat.id)
          .eq('user_id', userId1)
          .maybeSingle();

        if (user1Row) {
          if (user1Row.hidden_at) {
            await supabaseAdmin
              .from('chat_participants')
              .update({ hidden_at: null })
              .eq('id', user1Row.id);
          }
          return { chat, isNew: false };
        }

        const { count } = await supabaseAdmin
          .from('chat_participants')
          .select('id', { count: 'exact', head: true })
          .eq('chat_id', chat.id);

        if (count === 1) {
          const { error: rejoinError } = await supabaseAdmin
            .from('chat_participants')
            .upsert(
              { chat_id: chat.id, user_id: userId1, hidden_at: null },
              { onConflict: 'chat_id,user_id' }
            );
          if (rejoinError) throw rejoinError;
          return { chat, isNew: false };
        }
      }

      const { data: chat, error: chatError } = await supabaseAdmin
        .from('chats')
        .insert({ type: 'direct' })
        .select()
        .single();

      if (chatError) throw chatError;

      const { error: participantsError } = await supabaseAdmin
        .from('chat_participants')
        .insert([
          { chat_id: chat.id, user_id: userId1 },
          { chat_id: chat.id, user_id: userId2 },
        ]);

      if (participantsError) throw participantsError;

      return { chat, isNew: true };
    } catch (error) {
      logger.error('Get or create direct chat error', { error: error.message });
      throw error;
    }
  },

  async createGroupChat(name, createdBy, memberIds) {
    try {
      const { data: chat, error: chatError } = await supabaseAdmin
        .from('chats')
        .insert({
          type: 'group',
          name,
          created_by: createdBy,
        })
        .select()
        .single();

      if (chatError) throw chatError;

      const participants = [...new Set([createdBy, ...memberIds])].map((userId) => ({
        chat_id: chat.id,
        user_id: userId,
      }));

      const { error: participantsError } = await supabaseAdmin
        .from('chat_participants')
        .insert(participants);

      if (participantsError) throw participantsError;

      return chat;
    } catch (error) {
      logger.error('Create group chat error', { error: error.message });
      throw error;
    }
  },

  async getChatById(chatId, userId) {
    await assertParticipant(chatId, userId, { restoreHidden: true });

    const { data: chat, error } = await supabaseAdmin
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .single();

    if (error) throw error;

    const { data: participants } = await supabaseAdmin
      .from('chat_participants')
      .select(`
        user_id,
        users!inner ( id, email, avatar_url, role, last_seen_at )
      `)
      .eq('chat_id', chatId);

    const formattedParticipants = await Promise.all(
      (participants || []).map(async (p) => {
        const display = await resolveUserDisplay(p.users);
        return {
          id: p.users.id,
          name: display.name,
          email: p.users.email,
          avatarUrl: display.avatarUrl,
          isOnline: isUserOnline(p.users.last_seen_at),
          isSelf: p.users.id === userId,
          isAdmin: chat.type === 'group' && chat.created_by === p.users.id,
        };
      })
    );

    const otherParticipants = formattedParticipants.filter((p) => !p.isSelf);

    return {
      id: chat.id,
      type: chat.type,
      name: chat.type === 'direct' ? otherParticipants[0]?.name : chat.name,
      groupName: chat.name,
      participants: chat.type === 'direct' ? otherParticipants : formattedParticipants,
      members: chat.type === 'group' ? formattedParticipants : undefined,
      createdBy: chat.created_by,
      isAdmin: chat.type === 'group' && chat.created_by === userId,
      updatedAt: chat.updated_at,
    };
  },

  async getUserChats(userId) {
    try {
      const { data: participants, error } = await supabaseAdmin
        .from('chat_participants')
        .select(`
          chat_id,
          hidden_at,
          chats!inner (
            id,
            type,
            name,
            created_by,
            created_at,
            updated_at
          )
        `)
        .eq('user_id', userId)
        .is('hidden_at', null);

      if (error) throw error;

      const chats = await Promise.all(
        (participants || []).map(async (p) => {
          const chat = p.chats;
          let otherParticipant = null;

          if (chat.type === 'direct') {
            const { data: otherParticipants } = await supabaseAdmin
              .from('chat_participants')
              .select(`
                user_id,
                users!inner ( id, email, avatar_url, last_seen_at )
              `)
              .eq('chat_id', chat.id)
              .neq('user_id', userId);

            if (otherParticipants?.[0]) {
              const display = await resolveUserDisplay(otherParticipants[0].users);
              otherParticipant = {
                id: otherParticipants[0].users.id,
                name: display.name,
                email: otherParticipants[0].users.email,
                avatarUrl: display.avatarUrl,
                isOnline: isUserOnline(otherParticipants[0].users.last_seen_at),
              };
            }
          }

          const hiddenIds = await getHiddenMessageIds(userId, chat.id);

          const { data: recentMessages } = await supabaseAdmin
            .from('messages')
            .select('*')
            .eq('chat_id', chat.id)
            .order('created_at', { ascending: false })
            .limit(20);

          const lastMessageRow = (recentMessages || []).find((m) => !hiddenIds.has(m.id));

          const { count: unreadCount } = await supabaseAdmin
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('chat_id', chat.id)
            .eq('is_read', false)
            .neq('sender_id', userId);

          let participantCount = 0;
          if (chat.type === 'group') {
            const { count } = await supabaseAdmin
              .from('chat_participants')
              .select('id', { count: 'exact', head: true })
              .eq('chat_id', chat.id);
            participantCount = count || 0;
          }

          return {
            id: chat.id,
            type: chat.type,
            name: chat.type === 'direct' ? otherParticipant?.name : chat.name,
            participants: chat.type === 'direct' && otherParticipant ? [otherParticipant] : [],
            participantCount: chat.type === 'group' ? participantCount : undefined,
            createdBy: chat.created_by,
            isAdmin: chat.type === 'group' && chat.created_by === userId,
            lastMessage: lastMessageRow
              ? {
                  content: previewMessageContent(lastMessageRow),
                  senderId: lastMessageRow.sender_id,
                  senderName:
                    lastMessageRow.sender_id === userId
                      ? 'You'
                      : chat.type === 'direct'
                        ? otherParticipant?.name
                        : '',
                  createdAt: lastMessageRow.created_at,
                  isRead: lastMessageRow.is_read,
                }
              : null,
            unreadCount: unreadCount || 0,
            updatedAt: chat.updated_at,
          };
        })
      );

      chats.sort((a, b) => {
        const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
        const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
        return timeB - timeA;
      });

      return chats;
    } catch (error) {
      logger.error('Get user chats error', { error: error.message });
      throw error;
    }
  },

  async getChatMessages(chatId, userId, page = 1, limit = 50) {
    try {
      await assertParticipant(chatId, userId, { restoreHidden: true });

      const hiddenIds = await getHiddenMessageIds(userId, chatId);
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let messagesResult = await supabaseAdmin
        .from('messages')
        .select(MESSAGE_SELECT_WITH_EDIT, { count: 'exact' })
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (messagesResult.error && isMissingEditedAtColumn(messagesResult.error)) {
        messagesResult = await supabaseAdmin
          .from('messages')
          .select(MESSAGE_SELECT, { count: 'exact' })
          .eq('chat_id', chatId)
          .order('created_at', { ascending: false })
          .range(from, to);
      }

      if (messagesResult.error) throw messagesResult.error;
      const messages = messagesResult.data;
      const count = messagesResult.count;

      await supabaseAdmin
        .from('messages')
        .update({ is_read: true })
        .eq('chat_id', chatId)
        .neq('sender_id', userId)
        .eq('is_read', false);

      await supabaseAdmin
        .from('chat_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('chat_id', chatId)
        .eq('user_id', userId);

      const postMap = await attachSharedPosts(messages, userId);

      const formattedMessages = await Promise.all(
        (messages || [])
          .filter((msg) => !hiddenIds.has(msg.id))
          .map(async (msg) => {
            const display = await resolveUserDisplay(msg.users);
            const sharedPost = msg.post_id ? postMap.get(msg.post_id) || null : null;
            return formatMessage(msg, display, sharedPost);
          })
      );

      return {
        messages: formattedMessages.reverse(),
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      };
    } catch (error) {
      logger.error('Get chat messages error', { error: error.message });
      throw error;
    }
  },

  async sendMessage(chatId, userId, content, postId = null) {
    try {
      await assertParticipant(chatId, userId);

      const trimmed = content?.trim() || '';
      if (!trimmed && !postId) {
        throw new Error('Content or postId is required');
      }

      if (postId) {
        await feedRepository.getPostById(postId, userId);
      }

      let insertResult = await supabaseAdmin
        .from('messages')
        .insert({
          chat_id: chatId,
          sender_id: userId,
          content: trimmed || 'Shared a post',
          post_id: postId || null,
        })
        .select(MESSAGE_SELECT_WITH_EDIT)
        .single();

      if (insertResult.error && isMissingEditedAtColumn(insertResult.error)) {
        insertResult = await supabaseAdmin
          .from('messages')
          .insert({
            chat_id: chatId,
            sender_id: userId,
            content: trimmed || 'Shared a post',
            post_id: postId || null,
          })
          .select(MESSAGE_SELECT)
          .single();
      }

      if (insertResult.error) throw insertResult.error;
      const message = insertResult.data;

      // Restore the conversation for recipients who previously deleted/hid it
      await supabaseAdmin
        .from('chat_participants')
        .update({ hidden_at: null })
        .eq('chat_id', chatId)
        .neq('user_id', userId);

      if (postId) {
        try {
          await feedRepository.incrementShareCount(postId);
        } catch (shareError) {
          logger.warn('Share count increment failed', { postId, error: shareError.message });
        }
      }

      await supabaseAdmin
        .from('chats')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', chatId);

      const display = await resolveUserDisplay(message.users);
      let sharedPost = null;
      if (message.post_id) {
        try {
          sharedPost = await feedRepository.getPostById(message.post_id, userId);
        } catch {
          sharedPost = null;
        }
      }

      return formatMessage(message, { ...display, name: 'You' }, sharedPost);
    } catch (error) {
      logger.error('Send message error', { error: error.message });
      throw error;
    }
  },

  async deleteMessageForMe(messageId, userId) {
    const { data: message, error } = await supabaseAdmin
      .from('messages')
      .select('id, chat_id')
      .eq('id', messageId)
      .single();

    if (error) throw error;
    await assertParticipant(message.chat_id, userId);

    const { error: insertError } = await supabaseAdmin
      .from('message_deletions')
      .upsert(
        { message_id: messageId, user_id: userId },
        { onConflict: 'message_id,user_id' }
      );

    if (insertError) throw insertError;
    return { success: true };
  },

  async deleteMessageForEveryone(messageId, userId) {
    const { data: message, error } = await supabaseAdmin
      .from('messages')
      .select('id, chat_id, sender_id, deleted_for_everyone_at')
      .eq('id', messageId)
      .single();

    if (error) throw error;
    if (message.sender_id !== userId) {
      throw new Error('Only the sender can delete for everyone');
    }
    if (message.deleted_for_everyone_at) {
      return { success: true };
    }

    await assertParticipant(message.chat_id, userId);

    const { error: updateError } = await supabaseAdmin
      .from('messages')
      .update({
        deleted_for_everyone_at: new Date().toISOString(),
        content: 'This message was deleted',
      })
      .eq('id', messageId);

    if (updateError) throw updateError;
    return { success: true };
  },

  async editMessage(messageId, userId, content) {
    const { data: message, error } = await supabaseAdmin
      .from('messages')
      .select('id, chat_id, sender_id, deleted_for_everyone_at, post_id')
      .eq('id', messageId)
      .single();

    if (error) throw error;
    if (message.sender_id !== userId) {
      throw new Error('Only the sender can edit this message');
    }
    if (message.deleted_for_everyone_at) {
      throw new Error('Message was deleted');
    }
    if (message.post_id) {
      throw new Error('Shared posts cannot be edited');
    }

    const trimmed = content?.trim();
    if (!trimmed) throw new Error('Content is required');

    await assertParticipant(message.chat_id, userId);

    let updatePayload = { content: trimmed, edited_at: new Date().toISOString() };
    let updateResult = await supabaseAdmin
      .from('messages')
      .update(updatePayload)
      .eq('id', messageId)
      .select(MESSAGE_SELECT_WITH_EDIT)
      .single();

    if (updateResult.error && isMissingEditedAtColumn(updateResult.error)) {
      updateResult = await supabaseAdmin
        .from('messages')
        .update({ content: trimmed })
        .eq('id', messageId)
        .select(MESSAGE_SELECT)
        .single();
    }

    if (updateResult.error) throw updateResult.error;
    const updated = updateResult.data;

    const display = await resolveUserDisplay(updated.users);
    return formatMessage(updated, { ...display, name: 'You' }, null);
  },

  async createGroupInvite(chatId, userId) {
    const { data: chat, error: chatError } = await supabaseAdmin
      .from('chats')
      .select('type')
      .eq('id', chatId)
      .single();

    if (chatError) throw chatError;
    if (chat.type !== 'group') throw new Error('Not a group chat');

    await assertParticipant(chatId, userId);

    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: invite, error } = await supabaseAdmin
      .from('chat_invites')
      .insert({
        chat_id: chatId,
        token,
        created_by: userId,
        expires_at: expiresAt,
      })
      .select('token, expires_at')
      .single();

    if (error) throw error;

    const inviteUrl = `${getFrontendUrl()}/messages/join/${invite.token}`;
    return { token: invite.token, inviteUrl, expiresAt: invite.expires_at };
  },

  async joinGroupViaInvite(token, userId) {
    const { data: invite, error } = await supabaseAdmin
      .from('chat_invites')
      .select('id, chat_id, expires_at, is_active')
      .eq('token', token)
      .maybeSingle();

    if (error) throw error;
    if (!invite || !invite.is_active) {
      throw new Error('Invalid or expired invite');
    }
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      throw new Error('Invite link has expired');
    }

    const { data: chat, error: chatError } = await supabaseAdmin
      .from('chats')
      .select('id, type, name')
      .eq('id', invite.chat_id)
      .single();

    if (chatError) throw chatError;
    if (chat.type !== 'group') throw new Error('Invalid group invite');

    const { error: joinError } = await supabaseAdmin
      .from('chat_participants')
      .upsert(
        { chat_id: chat.id, user_id: userId },
        { onConflict: 'chat_id,user_id', ignoreDuplicates: true }
      );

    if (joinError && joinError.code !== '23505') throw joinError;

    return chat;
  },

  async addGroupMember(chatId, userId, newMemberId) {
    try {
      const { data: chat, error: chatError } = await supabaseAdmin
        .from('chats')
        .select('type')
        .eq('id', chatId)
        .single();

      if (chatError) throw chatError;
      if (chat.type !== 'group') throw new Error('Not a group chat');

      await assertParticipant(chatId, userId);

      const { error: insertError } = await supabaseAdmin
        .from('chat_participants')
        .insert({ chat_id: chatId, user_id: newMemberId });

      if (insertError && insertError.code !== '23505') throw insertError;

      return { success: true };
    } catch (error) {
      logger.error('Add group member error', { error: error.message });
      throw error;
    }
  },

  async removeGroupMember(chatId, userId, memberToRemoveId) {
    try {
      const { data: chat, error: chatError } = await supabaseAdmin
        .from('chats')
        .select('type, created_by')
        .eq('id', chatId)
        .single();

      if (chatError) throw chatError;
      if (chat.type !== 'group') throw new Error('Not a group chat');

      await assertParticipant(chatId, userId);

      if (memberToRemoveId !== userId && chat.created_by !== userId) {
        throw new Error('Only the group creator can remove other members');
      }

      if (memberToRemoveId === chat.created_by && memberToRemoveId !== userId) {
        throw new Error('Cannot remove the group creator');
      }

      if (memberToRemoveId === chat.created_by && memberToRemoveId === userId) {
        throw new Error('Group creator must delete the group instead of leaving');
      }

      const { error: deleteError } = await supabaseAdmin
        .from('chat_participants')
        .delete()
        .eq('chat_id', chatId)
        .eq('user_id', memberToRemoveId);

      if (deleteError) throw deleteError;

      return { success: true };
    } catch (error) {
      logger.error('Remove group member error', { error: error.message });
      throw error;
    }
  },

  async deleteDirectChat(chatId, userId) {
    const { data: chat, error: chatError } = await supabaseAdmin
      .from('chats')
      .select('type')
      .eq('id', chatId)
      .single();

    if (chatError) throw chatError;
    if (chat.type !== 'direct') throw new Error('Not a direct chat');

    await assertParticipant(chatId, userId);

    const { error } = await supabaseAdmin
      .from('chat_participants')
      .update({ hidden_at: new Date().toISOString() })
      .eq('chat_id', chatId)
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true };
  },

  async leaveGroup(chatId, userId) {
    return this.removeGroupMember(chatId, userId, userId);
  },

  async deleteGroup(chatId, userId) {
    const { data: chat, error: chatError } = await supabaseAdmin
      .from('chats')
      .select('type, created_by')
      .eq('id', chatId)
      .single();

    if (chatError) throw chatError;
    if (chat.type !== 'group') throw new Error('Not a group chat');
    if (chat.created_by !== userId) {
      throw new Error('Only the group creator can delete the group');
    }

    await assertParticipant(chatId, userId);

    const { error } = await supabaseAdmin.from('chats').delete().eq('id', chatId);
    if (error) throw error;
    return { success: true };
  },

  async getGroupMembers(chatId, userId) {
    const { data: chat, error: chatError } = await supabaseAdmin
      .from('chats')
      .select('type, created_by, name')
      .eq('id', chatId)
      .single();

    if (chatError) throw chatError;
    if (chat.type !== 'group') throw new Error('Not a group chat');

    await assertParticipant(chatId, userId);

    const { data: participants, error } = await supabaseAdmin
      .from('chat_participants')
      .select(`
        user_id,
        users!inner ( id, email, avatar_url, last_seen_at )
      `)
      .eq('chat_id', chatId);

    if (error) throw error;

    const members = await Promise.all(
      (participants || []).map(async (p) => {
        const display = await resolveUserDisplay(p.users);
        return {
          id: p.users.id,
          name: display.name,
          avatarUrl: display.avatarUrl,
          isOnline: isUserOnline(p.users.last_seen_at),
          isSelf: p.users.id === userId,
          isAdmin: chat.created_by === p.users.id,
        };
      })
    );

    members.sort((a, b) => {
      if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return {
      chatId,
      groupName: chat.name,
      createdBy: chat.created_by,
      isAdmin: chat.created_by === userId,
      members,
    };
  },
};
