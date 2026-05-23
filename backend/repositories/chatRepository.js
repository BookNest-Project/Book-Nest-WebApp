import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export const chatRepository = {
  /**
   * Get or create a direct chat between two users
   */
  async getOrCreateDirectChat(userId1, userId2) {
    try {
      // Check if chat already exists
      const { data: existingParticipants } = await supabaseAdmin
        .from('chat_participants')
        .select('chat_id')
        .eq('user_id', userId1);

      if (existingParticipants && existingParticipants.length > 0) {
        const chatIds = existingParticipants.map(p => p.chat_id);
        
        const { data: existing } = await supabaseAdmin
          .from('chat_participants')
          .select('chat_id')
          .eq('user_id', userId2)
          .in('chat_id', chatIds);

        if (existing && existing.length > 0) {
          const chatId = existing[0].chat_id;
          const { data: chat } = await supabaseAdmin
            .from('chats')
            .select('*')
            .eq('id', chatId)
            .single();
          return { chat, isNew: false };
        }
      }

      // Create new direct chat
      const { data: chat, error: chatError } = await supabaseAdmin
        .from('chats')
        .insert({ type: 'direct' })
        .select()
        .single();

      if (chatError) throw chatError;

      // Add participants
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

  /**
   * Create a group chat
   */
  async createGroupChat(name, createdBy, memberIds) {
    try {
      // Create group chat
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

      // Add all participants (including creator)
      const participants = [...new Set([createdBy, ...memberIds])].map(userId => ({
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

  /**
   * Get user's all chats
   */
  async getUserChats(userId) {
    try {
      const { data: participants, error } = await supabaseAdmin
        .from('chat_participants')
        .select(`
          chat_id,
          chats!inner (
            id,
            type,
            name,
            created_by,
            created_at,
            updated_at
          )
        `)
        .eq('user_id', userId);

      if (error) throw error;

      const chats = await Promise.all(participants.map(async (p) => {
        const chat = p.chats;
        
        // Get other participants info (for direct chats)
        let otherParticipant = null;
        if (chat.type === 'direct') {
          const { data: otherParticipants } = await supabaseAdmin
            .from('chat_participants')
            .select(`
              user_id,
              users!inner (
                id,
                email,
                avatar_url,
                bio
              )
            `)
            .eq('chat_id', chat.id)
            .neq('user_id', userId);

          if (otherParticipants && otherParticipants[0]) {
            const user = otherParticipants[0].users;
            otherParticipant = {
              id: user.id,
              name: user.email.split('@')[0],
              email: user.email,
              avatarUrl: user.avatar_url,
            };
          }
        }

        // Get last message
        const { data: lastMessage } = await supabaseAdmin
          .from('messages')
          .select('*')
          .eq('chat_id', chat.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        // Get unread count
        const { count: unreadCount } = await supabaseAdmin
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('chat_id', chat.id)
          .eq('is_read', false)
          .neq('sender_id', userId);

        // Get participant count for groups
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
          participants: chat.type === 'direct' ? [otherParticipant] : [],
          participantCount: chat.type === 'group' ? participantCount : undefined,
          lastMessage: lastMessage ? {
            content: lastMessage.content,
            senderId: lastMessage.sender_id,
            senderName: lastMessage.sender_id === userId ? 'You' : (chat.type === 'direct' ? otherParticipant?.name : ''),
            createdAt: lastMessage.created_at,
            isRead: lastMessage.is_read,
          } : null,
          unreadCount: unreadCount || 0,
          updatedAt: chat.updated_at,
        };
      }));

      // Sort by last message time
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

  /**
   * Get chat messages
   */
  async getChatMessages(chatId, userId, page = 1, limit = 50) {
    try {
      // Verify user is participant
      const { data: isParticipant, error: participantError } = await supabaseAdmin
        .from('chat_participants')
        .select('id')
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .maybeSingle();

      if (participantError) throw participantError;
      if (!isParticipant) {
        throw new Error('Not a participant');
      }

      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data: messages, error, count } = await supabaseAdmin
        .from('messages')
        .select(`
          id,
          content,
          sender_id,
          is_read,
          created_at,
          users!sender_id (
            id,
            email,
            avatar_url
          )
        `)
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      // Mark messages as read
      await supabaseAdmin
        .from('messages')
        .update({ is_read: true })
        .eq('chat_id', chatId)
        .neq('sender_id', userId)
        .eq('is_read', false);

      const formattedMessages = (messages || []).map(msg => ({
        id: msg.id,
        content: msg.content,
        senderId: msg.sender_id,
        senderName: msg.users.email.split('@')[0],
        senderAvatar: msg.users.avatar_url,
        isRead: msg.is_read,
        createdAt: msg.created_at,
      })).reverse();

      return {
        messages: formattedMessages,
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

  /**
   * Send message
   */
  async sendMessage(chatId, userId, content) {
    try {
      // Verify user is participant
      const { data: isParticipant, error: participantError } = await supabaseAdmin
        .from('chat_participants')
        .select('id')
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .maybeSingle();

      if (participantError) throw participantError;
      if (!isParticipant) {
        throw new Error('Not a participant');
      }

      const { data: message, error } = await supabaseAdmin
        .from('messages')
        .insert({
          chat_id: chatId,
          sender_id: userId,
          content,
        })
        .select(`
          id,
          content,
          sender_id,
          is_read,
          created_at,
          users!sender_id (
            id,
            email,
            avatar_url
          )
        `)
        .single();

      if (error) throw error;

      // Update chat updated_at
      await supabaseAdmin
        .from('chats')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', chatId);

      return {
        id: message.id,
        content: message.content,
        senderId: message.sender_id,
        senderName: message.users.email.split('@')[0],
        senderAvatar: message.users.avatar_url,
        isRead: message.is_read,
        createdAt: message.created_at,
      };
    } catch (error) {
      logger.error('Send message error', { error: error.message });
      throw error;
    }
  },

  /**
   * Add member to group chat
   */
  async addGroupMember(chatId, userId, newMemberId) {
    try {
      // Verify chat is group
      const { data: chat, error: chatError } = await supabaseAdmin
        .from('chats')
        .select('type')
        .eq('id', chatId)
        .single();

      if (chatError) throw chatError;
      if (chat.type !== 'group') {
        throw new Error('Not a group chat');
      }

      // Verify current user is member
      const { data: isMember, error: memberError } = await supabaseAdmin
        .from('chat_participants')
        .select('id')
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .maybeSingle();

      if (memberError) throw memberError;
      if (!isMember) {
        throw new Error('Not a member');
      }

      // Add new member
      const { error: insertError } = await supabaseAdmin
        .from('chat_participants')
        .insert({
          chat_id: chatId,
          user_id: newMemberId,
        });

      if (insertError && insertError.code !== '23505') throw insertError;

      return { success: true };
    } catch (error) {
      logger.error('Add group member error', { error: error.message });
      throw error;
    }
  },

  /**
   * Remove member from group chat
   */
  async removeGroupMember(chatId, userId, memberToRemoveId) {
    try {
      // Verify chat is group
      const { data: chat, error: chatError } = await supabaseAdmin
        .from('chats')
        .select('type')
        .eq('id', chatId)
        .single();

      if (chatError) throw chatError;
      if (chat.type !== 'group') {
        throw new Error('Not a group chat');
      }

      // Verify current user is member
      const { data: isMember, error: memberError } = await supabaseAdmin
        .from('chat_participants')
        .select('id')
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .maybeSingle();

      if (memberError) throw memberError;
      if (!isMember) {
        throw new Error('Not a member');
      }

      // Remove member
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
};