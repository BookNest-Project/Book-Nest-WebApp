import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

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
      const { error } = await supabaseAdmin
        .from('users')
        .update({
          bio: updates.bio,
          location: updates.location,
          website_url: updates.website_url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;

      // Update role-specific profile
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

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
        })
        .eq('user_id', userId);

      if (error) throw error;
      return { error: null };
    } catch (error) {
      logger.error('Update settings error', { error: error.message });
      return { error: error.message };
    }
  },

  async getPublicProfile(username, currentUserId = null) {
    try {
      // First find user by email (username is email prefix)
      const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select(`
          id,
          email,
          role,
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
        .ilike('email', `${username}%`)
        .limit(1)
        .single();

      if (userError) throw userError;

      // Get settings to check privacy
      const { data: settings } = await supabaseAdmin
        .from('user_settings')
        .select('is_public')
        .eq('user_id', user.id)
        .single();

      // If account is private, return limited info
      const isPublic = settings?.is_public !== false;

      let publicName = user.email.split('@')[0];
      if (user.role === 'reader' && user.reader_profiles?.display_name) {
        publicName = user.reader_profiles.display_name;
      } else if (user.role === 'author' && user.author_profiles?.pen_name) {
        publicName = user.author_profiles.pen_name;
      } else if (user.role === 'publisher' && user.publisher_profiles?.company_name) {
        publicName = user.publisher_profiles.company_name;
      }

      const publicProfile = {
        id: user.id,
        name: publicName,
        username: user.email.split('@')[0],
        role: user.role,
        avatarUrl: user.avatar_url,
        bio: isPublic ? user.bio : null,
        location: isPublic ? user.location : null,
        website: isPublic ? user.website_url : null,
        joinedAt: user.created_at,
        isPrivate: !isPublic,
      };

      const [followersCount, followingCount, postsCount] = await Promise.all([
        supabaseAdmin.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', user.id),
        supabaseAdmin.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', user.id),
        supabaseAdmin.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'published'),
      ]);

      publicProfile.followerCount = followersCount.count || 0;
      publicProfile.followingCount = followingCount.count || 0;
      publicProfile.postCount = postsCount.count || 0;

      if (currentUserId && currentUserId !== user.id) {
        const { data: followRelation } = await supabaseAdmin
          .from('follows')
          .select('id')
          .eq('follower_id', currentUserId)
          .eq('following_id', user.id)
          .maybeSingle();
        publicProfile.isFollowing = !!followRelation;
      } else {
        publicProfile.isFollowing = false;
      }

      return publicProfile;
    } catch (error) {
      logger.error('Get public profile error', { error: error.message });
      throw error;
    }
  },
};