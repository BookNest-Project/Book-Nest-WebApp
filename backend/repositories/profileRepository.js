import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { followRepository } from './followRepository.js';

const USER_PUBLIC_SELECT = `
  id,
  email,
  role,
  bio,
  location,
  website_url,
  avatar_url,
  created_at,
  account_status,
  reader_profiles:reader_profiles!user_id (
    display_name
  ),
  author_profiles:author_profiles!user_id (
    pen_name,
    full_name
  ),
  publisher_profiles:publisher_profiles!user_id (
    company_name
  )
`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pickRoleProfile(user) {
  const reader = Array.isArray(user.reader_profiles) ? user.reader_profiles[0] : user.reader_profiles;
  const author = Array.isArray(user.author_profiles) ? user.author_profiles[0] : user.author_profiles;
  const publisher = Array.isArray(user.publisher_profiles) ? user.publisher_profiles[0] : user.publisher_profiles;
  return { reader, author, publisher };
}

async function findUserForPublicProfile(slug, currentUserId) {
  if (slug === 'me') {
    if (!currentUserId) return { user: null, error: null };
    const { data, error } = await supabaseAdmin
      .from('users')
      .select(USER_PUBLIC_SELECT)
      .eq('id', currentUserId)
      .maybeSingle();
    return { user: data, error };
  }

  if (UUID_RE.test(slug)) {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select(USER_PUBLIC_SELECT)
      .eq('id', slug)
      .maybeSingle();
    return { user: data, error };
  }

  const { data: readerProfiles, error: readerError } = await supabaseAdmin
    .from('reader_profiles')
    .select('user_id, username');

  if (!readerError && readerProfiles?.length) {
    const readerMatch = readerProfiles.find((row) => {
      const normalized = row.username?.replace(/^@/, '').trim().toLowerCase();
      return normalized === slug;
    });

    if (readerMatch) {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select(USER_PUBLIC_SELECT)
        .eq('id', readerMatch.user_id)
        .maybeSingle();
      return { user: data, error };
    }
  }

  const { data: candidates, error } = await supabaseAdmin
    .from('users')
    .select(USER_PUBLIC_SELECT)
    .ilike('email', `${slug}@%`);

  if (error) return { user: null, error };
  if (!candidates?.length) return { user: null, error: null };

  const exact = candidates.find((u) => u.email.split('@')[0].toLowerCase() === slug);
  return { user: exact || (candidates.length === 1 ? candidates[0] : null), error: null };
}

export const profileRepository = {
  async getProfile(userId) {
    try {
      // Get user with all profile data
      const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select(`
          id,
          email,
          role,
          account_status,
          bio,
          location,
          website_url,
          avatar_url,
          created_at,
          reader_profiles:reader_profiles!user_id (
            display_name
          ),
          author_profiles:author_profiles!user_id (
            pen_name,
            full_name
          ),
          publisher_profiles:publisher_profiles!user_id (
            company_name
          )
        `)
        .eq('id', userId)
        .single();

      if (userError) throw userError;

      // Get user settings
      let settings = {
        is_public: true,
        show_email: false,
        show_reading_stats: true,
        email_notifications: true,
        push_notifications: true,
        marketing_emails: false,
      };

      const { data: userSettings, error: settingsError } = await supabaseAdmin
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (!settingsError && userSettings) {
        settings = userSettings;
      } else {
        // Create default settings if not exists
        await supabaseAdmin
          .from('user_settings')
          .insert({
            user_id: userId,
            is_public: true,
            show_email: false,
            show_reading_stats: true,
            email_notifications: true,
            push_notifications: true,
            marketing_emails: false,
          });
      }

      // Get counts
      const [followersCount, followingCount, postsCount] = await Promise.all([
        supabaseAdmin.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', userId),
        supabaseAdmin.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', userId),
        supabaseAdmin.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'published'),
      ]);

      // Determine public name based on role
      let publicName = user.email.split('@')[0];
      if (user.role === 'reader' && user.reader_profiles?.display_name) {
        publicName = user.reader_profiles.display_name;
      } else if (user.role === 'author' && user.author_profiles?.pen_name) {
        publicName = user.author_profiles.pen_name;
      } else if (user.role === 'publisher' && user.publisher_profiles?.company_name) {
        publicName = user.publisher_profiles.company_name;
      }

      return {
        id: user.id,
        email: user.email,
        role: user.role,
        publicName,
        bio: user.bio,
        location: user.location,
        website_url: user.website_url,
        avatar_url: user.avatar_url,
        created_at: user.created_at,
        follower_count: followersCount.count || 0,
        following_count: followingCount.count || 0,
        post_count: postsCount.count || 0,
        settings,
        profile_data: user.role === 'author' ? user.author_profiles : (user.role === 'publisher' ? user.publisher_profiles : user.reader_profiles),
      };
    } catch (error) {
      logger.error('Get profile error', { error: error.message });
      throw error;
    }
  },

  async updateProfile(userId, updates) {
    try {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

      const userUpdates = {
        bio: updates.bio,
        location: updates.location,
        updated_at: new Date().toISOString(),
      };

      if (user?.role === 'author' || user?.role === 'publisher') {
        userUpdates.website_url = updates.website_url;
      }

      const { error } = await supabaseAdmin
        .from('users')
        .update(userUpdates)
        .eq('id', userId);

      if (error) throw error;

      if (user.role === 'author' && updates.pen_name) {
        await supabaseAdmin
          .from('author_profiles')
          .update({ pen_name: updates.pen_name, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
      } else if (user.role === 'publisher' && updates.company_name) {
        await supabaseAdmin
          .from('publisher_profiles')
          .update({ company_name: updates.company_name, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
      } else if (user.role === 'reader' && updates.display_name) {
        await supabaseAdmin
          .from('reader_profiles')
          .update({ display_name: updates.display_name, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
      }

      return { error: null };
    } catch (error) {
      logger.error('Update profile error', { error: error.message });
      return { error: error.message };
    }
  },

  async updateAvatar(userId, avatarUrl) {
    try {
      const { error } = await supabaseAdmin
        .from('users')
        .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) throw error;
      return { error: null };
    } catch (error) {
      logger.error('Update avatar error', { error: error.message });
      return { error: error.message };
    }
  },

  async updateSettings(userId, settings) {
    try {
      const { error } = await supabaseAdmin
        .from('user_settings')
        .upsert({
          user_id: userId,
          ...settings,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      return { error: null };
    } catch (error) {
      logger.error('Update settings error', { error: error.message });
      return { error: error.message };
    }
  },

  async getReadingStatsSummary(userId) {
    const { data: stats } = await supabaseAdmin
      .from('user_reading_stats')
      .select('current_streak, longest_streak, total_books_completed')
      .eq('user_id', userId)
      .maybeSingle();

    const { data: dailyRows } = await supabaseAdmin
      .from('daily_reading_stats')
      .select('pages_read, minutes_read, seconds_read')
      .eq('user_id', userId);

    let totalPages = 0;
    let totalMinutes = 0;
    for (const row of dailyRows || []) {
      totalPages += row.pages_read || 0;
      totalMinutes += (row.minutes_read || 0) + Math.floor((row.seconds_read || 0) / 60);
    }

    return {
      current_streak: stats?.current_streak || 0,
      longest_streak: stats?.longest_streak || 0,
      books_completed: stats?.total_books_completed || 0,
      total_pages: totalPages,
      total_minutes: totalMinutes,
    };
  },

  async getAchievementsSummary(userId, limit = 6) {
    const { data } = await supabaseAdmin
      .from('user_achievements')
      .select('achievement_id, earned_at, achievement:achievement_definitions(title, icon)')
      .eq('user_id', userId)
      .order('earned_at', { ascending: false })
      .limit(limit);

    return (data || []).map((row) => ({
      id: row.achievement_id,
      title: row.achievement?.title || row.achievement_id,
      icon: row.achievement?.icon,
      earned_at: row.earned_at,
    }));
  },

  async getPublicProfile(username, currentUserId = null) {
    try {
      const slug = String(username || '').replace(/^@/, '').trim().toLowerCase();
      if (!slug) {
        const err = new Error('Profile not found');
        err.statusCode = 404;
        throw err;
      }

      const { user, error: userError } = await findUserForPublicProfile(slug, currentUserId);

      if (userError) throw userError;
      if (!user || user.account_status !== 'active') {
        const err = new Error('Profile not found');
        err.statusCode = 404;
        throw err;
      }

      const { data: settings } = await supabaseAdmin
        .from('user_settings')
        .select('is_public, show_email, show_reading_stats')
        .eq('user_id', user.id)
        .maybeSingle();

      const isPublic = settings?.is_public !== false;
      const isOwnProfile = currentUserId === user.id;
      let isFollowing = false;
      if (currentUserId && !isOwnProfile) {
        isFollowing = await followRepository.isFollowing(currentUserId, user.id);
      }

      const canViewDetails = isOwnProfile || isPublic || isFollowing;

      const { reader, author, publisher } = pickRoleProfile(user);
      let publicName = user.email.split('@')[0];
      let publicUsername = user.email.split('@')[0].toLowerCase();
      if (user.role === 'reader' && reader?.display_name) {
        publicName = reader.display_name;
      } else if (user.role === 'author' && author?.pen_name) {
        publicName = author.pen_name;
      } else if (user.role === 'publisher' && publisher?.company_name) {
        publicName = publisher.company_name;
      }

      const { data: readerUsernameRow } = await supabaseAdmin
        .from('reader_profiles')
        .select('username')
        .eq('user_id', user.id)
        .maybeSingle();

      if (readerUsernameRow?.username) {
        publicUsername =
          readerUsernameRow.username.replace(/^@/, '').trim().toLowerCase() || publicUsername;
      }

      const publicProfile = {
        id: user.id,
        name: publicName,
        username: publicUsername,
        role: user.role,
        avatarUrl: user.avatar_url,
        joinedAt: user.created_at,
        isPrivate: !isPublic,
        isFollowing,
        isOwnProfile,
        bio: null,
        location: null,
        website: null,
        email: undefined,
        followerCount: 0,
        followingCount: 0,
        postCount: 0,
        readingStats: undefined,
        achievements: undefined,
        photos: [],
      };

      if (canViewDetails) {
        try {
          publicProfile.photos = await this.getProfilePhotos(user.id);
        } catch {
          publicProfile.photos = [];
        }
        publicProfile.bio = user.bio;
        publicProfile.location = user.location;
        if (user.role === 'author' || user.role === 'publisher') {
          publicProfile.website = user.website_url;
        }

        if (settings?.show_email) {
          publicProfile.email = user.email;
        }

        try {
          const [followersCount, followingCount, postsCount] = await Promise.all([
            supabaseAdmin.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', user.id),
            supabaseAdmin.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', user.id),
            supabaseAdmin.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'published'),
          ]);

          publicProfile.followerCount = followersCount.count || 0;
          publicProfile.followingCount = followingCount.count || 0;
          publicProfile.postCount = postsCount.count || 0;
        } catch (countError) {
          logger.warn('Public profile counts unavailable', { error: countError.message, userId: user.id });
        }

        if (settings?.show_reading_stats !== false && user.role === 'reader') {
          try {
            publicProfile.readingStats = await this.getReadingStatsSummary(user.id);
            publicProfile.achievements = await this.getAchievementsSummary(user.id);
          } catch (statsError) {
            logger.warn('Public profile stats unavailable', { error: statsError.message, userId: user.id });
          }
        }
      } else {
        try {
          const followersCount = await supabaseAdmin
            .from('follows')
            .select('id', { count: 'exact', head: true })
            .eq('following_id', user.id);
          publicProfile.followerCount = followersCount.count || 0;
        } catch (countError) {
          logger.warn('Public profile follower count unavailable', { error: countError.message, userId: user.id });
        }
      }

      return publicProfile;
    } catch (error) {
      if (error.statusCode) throw error;
      logger.error('Get public profile error', { error: error.message });
      throw error;
    }
  },

  async deleteAccount(userId) {
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('avatar_url')
      .eq('id', userId)
      .maybeSingle();

    if (user?.avatar_url) {
      try {
        const marker = '/booknest/';
        const idx = user.avatar_url.indexOf(marker);
        if (idx >= 0) {
          const path = user.avatar_url.slice(idx + marker.length);
          await supabaseAdmin.storage.from('booknest').remove([path]);
        }
      } catch {
        /* ignore storage cleanup errors */
      }
    }

    const { error: disableError } = await supabaseAdmin
      .from('users')
      .update({
        account_status: 'disabled',
        bio: null,
        location: null,
        website_url: null,
        avatar_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (disableError) throw disableError;

    try {
      await supabaseAdmin.auth.admin.deleteUser(userId);
    } catch (authErr) {
      logger.warn('Auth user delete failed (account disabled in DB)', {
        userId,
        error: authErr.message,
      });
    }

    return { deleted: true };
  },

  async getProfilePhotos(userId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_profile_photos')
        .select('id, image_url, sort_order, created_at')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        if (/user_profile_photos/i.test(error.message) && /does not exist/i.test(error.message)) {
          return [];
        }
        throw error;
      }
      return (data || []).map((row) => ({
        id: row.id,
        imageUrl: row.image_url,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
      }));
    } catch (error) {
      logger.warn('Profile photos unavailable', { userId, error: error.message });
      return [];
    }
  },

  async addProfilePhoto(userId, imageUrl) {
    const { count } = await supabaseAdmin
      .from('user_profile_photos')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { data, error } = await supabaseAdmin
      .from('user_profile_photos')
      .insert({
        user_id: userId,
        image_url: imageUrl,
        sort_order: count || 0,
      })
      .select('id, image_url, sort_order, created_at')
      .single();

    if (error) throw error;
    return {
      id: data.id,
      imageUrl: data.image_url,
      sortOrder: data.sort_order,
      createdAt: data.created_at,
    };
  },

  async deleteProfilePhoto(userId, photoId) {
    const { data, error } = await supabaseAdmin
      .from('user_profile_photos')
      .select('id, image_url')
      .eq('id', photoId)
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    const { error: delError } = await supabaseAdmin
      .from('user_profile_photos')
      .delete()
      .eq('id', photoId);

    if (delError) throw delError;
    return data;
  },
};