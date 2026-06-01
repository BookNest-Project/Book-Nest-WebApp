import { adminUserRepository } from '../repositories/adminUserRepository.js';
import { recordAdminTask } from '../utils/adminTaskLogger.js';

function displayNameForUser(user, profiles) {
  const { reader, author, publisher, admin } = profiles;
  if (user.role === 'author') {
    return author?.full_name || author?.pen_name || user.email.split('@')[0];
  }
  if (user.role === 'publisher') {
    return publisher?.company_name || user.email.split('@')[0];
  }
  if (user.role === 'admin') {
    return admin?.display_name || user.email.split('@')[0];
  }
  return reader?.display_name || user.email.split('@')[0];
}

function avatarForUser(user, profiles) {
  const { reader, author, publisher, admin } = profiles;
  return (
    (user.role === 'author' && author?.avatar_url) ||
    (user.role === 'publisher' && publisher?.avatar_url) ||
    (user.role === 'admin' && admin?.avatar_url) ||
    reader?.avatar_url ||
    null
  );
}

function verificationStatus(user, profiles) {
  if (user.role === 'reader') {
    if (user.account_status !== 'active') return 'inactive';
    return 'registered';
  }

  if (user.account_status !== 'active') return 'pending';

  if (user.role === 'admin') return 'verified';

  if (user.role === 'author') {
    return profiles.author ? 'verified' : 'pending';
  }

  if (user.role === 'publisher') {
    return profiles.publisher ? 'verified' : 'pending';
  }

  return 'verified';
}

function systemStatus(accountStatus) {
  if (accountStatus === 'active') return 'active';
  return 'banned';
}

function formatBookDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function mapUserBooks(rawBooks) {
  return (rawBooks ?? []).map((book) => ({
    id: book.id,
    title: book.title,
    status: book.status,
    genre: book.genres?.name || null,
    coverImageUrl: book.cover_image_url || null,
    updatedAt: book.updated_at || book.created_at,
    updatedLabel: formatBookDate(book.updated_at || book.created_at),
  }));
}

function formatActivity(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const date = d.toISOString().slice(0, 10);
    const time = d.toTimeString().slice(0, 5);
    return `${date} ${time}`;
  } catch {
    return iso;
  }
}

function isPendingInvitation(user, profiles) {
  if (user.role !== 'author' && user.role !== 'publisher') return false;
  if (user.account_status !== 'active') return false;
  if (user.role === 'author') return !profiles.author;
  if (user.role === 'publisher') return !profiles.publisher;
  return false;
}

function buildProfileDetail(user, profile) {
  if (!profile) return null;

  if (user.role === 'reader') {
    return {
      type: 'reader',
      displayName: profile.display_name || null,
      avatarUrl: profile.avatar_url || null,
      bio: profile.bio || null,
    };
  }

  if (user.role === 'author') {
    return {
      type: 'author',
      penName: profile.pen_name || null,
      fullName: profile.full_name || null,
      avatarUrl: profile.avatar_url || null,
      bio: profile.bio || null,
      websiteUrl: profile.website_url || null,
    };
  }

  if (user.role === 'publisher') {
    return {
      type: 'publisher',
      companyName: profile.company_name || null,
      avatarUrl: profile.avatar_url || null,
      bio: profile.bio || null,
      websiteUrl: profile.website_url || null,
      supportEmail: profile.support_email || null,
    };
  }

  if (user.role === 'admin') {
    return {
      type: 'admin',
      displayName: profile.display_name || null,
      avatarUrl: profile.avatar_url || null,
      bio: profile.bio || null,
    };
  }

  return null;
}

export const adminUserService = {
  async getStats() {
    const [total, authors, banned, readers, publishers, admins] = await Promise.all([
      adminUserRepository.countAll(),
      adminUserRepository.countByRole('author'),
      adminUserRepository.countBannedUsers(),
      adminUserRepository.countByRole('reader'),
      adminUserRepository.countByRole('publisher'),
      adminUserRepository.countByRole('admin'),
    ]);
    const verifiedAuthors = await adminUserRepository.countVerifiedAuthors();

    const rawUsers = await adminUserRepository.listAllUsersRaw({ max: 5000 });
    const userIds = rawUsers.map((u) => u.id);
    const [readersProfiles, authorsProfiles, publishersProfiles] = await Promise.all([
      adminUserRepository.findReaderProfiles(userIds),
      adminUserRepository.findAuthorProfiles(userIds),
      adminUserRepository.findPublisherProfiles(userIds),
    ]);
    const readerMap = Object.fromEntries(readersProfiles.map((p) => [p.user_id, p]));
    const authorMap = Object.fromEntries(authorsProfiles.map((p) => [p.user_id, p]));
    const publisherMap = Object.fromEntries(publishersProfiles.map((p) => [p.user_id, p]));

    const pendingInvitations = rawUsers.filter((user) =>
      isPendingInvitation(user, {
        reader: readerMap[user.id] || null,
        author: authorMap[user.id] || null,
        publisher: publisherMap[user.id] || null,
      }),
    ).length;

    const verifiedPct = total > 0 ? Math.round((verifiedAuthors / total) * 100) : 0;

    return {
      totalUsers: total,
      verifiedAuthors,
      verifiedPercent: verifiedPct,
      bannedAccounts: banned,
      pendingInvitations,
      byRole: { readers, authors, publishers, admins },
    };
  },

  async listUsers({ page, limit, search, role, status, segment }) {
    const safePage = Math.max(page || 1, 1);
    const safeLimit = Math.min(Math.max(limit || 10, 1), 100);

    let users = [];
    let total = 0;

    if (segment === 'banned') {
      ({ users, total } = await adminUserRepository.listUsers({
        page: safePage,
        limit: safeLimit,
        search,
        role: role || null,
        statuses: ['suspended', 'disabled'],
      }));
    } else if (segment === 'verified_authors') {
      const authorIds = await adminUserRepository.getAuthorProfileUserIds();
      let filteredIds = authorIds;
      if (role && role !== 'author') {
        filteredIds = [];
      } else {
        const activeAuthors = await adminUserRepository.listAllUsersRaw({
          search,
          role: 'author',
        });
        const activeIdSet = new Set(
          activeAuthors.filter((u) => u.account_status === 'active').map((u) => u.id),
        );
        filteredIds = authorIds.filter((id) => activeIdSet.has(id));
      }
      ({ users, total } = await adminUserRepository.listUsersByIds({
        userIds: filteredIds,
        page: safePage,
        limit: safeLimit,
        search,
        role: 'author',
      }));
    } else if (segment === 'pending') {
      const rawUsers = await adminUserRepository.listAllUsersRaw({
        search,
        role: role || null,
      });
      const userIds = rawUsers.map((u) => u.id);
      const [readers, authors, publishers] = await Promise.all([
        adminUserRepository.findReaderProfiles(userIds),
        adminUserRepository.findAuthorProfiles(userIds),
        adminUserRepository.findPublisherProfiles(userIds),
      ]);
      const readerMap = Object.fromEntries(readers.map((p) => [p.user_id, p]));
      const authorMap = Object.fromEntries(authors.map((p) => [p.user_id, p]));
      const publisherMap = Object.fromEntries(publishers.map((p) => [p.user_id, p]));

      const pendingUsers = rawUsers.filter((user) =>
        isPendingInvitation(user, {
          reader: readerMap[user.id] || null,
          author: authorMap[user.id] || null,
          publisher: publisherMap[user.id] || null,
        }),
      );

      total = pendingUsers.length;
      const from = (safePage - 1) * safeLimit;
      const pageUsers = pendingUsers.slice(from, from + safeLimit);
      const items = await this.mapUsersToRows(pageUsers);

      return {
        items,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          totalPages: Math.ceil(total / safeLimit) || 1,
        },
        segment: segment || 'all',
      };
    } else {
      ({ users, total } = await adminUserRepository.listUsers({
        page: safePage,
        limit: safeLimit,
        search,
        role: role || null,
        status: status || null,
      }));
    }

    const items = await this.mapUsersToRows(users);

    return {
      items,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit) || 1,
      },
      segment: segment || 'all',
    };
  },

  async mapUsersToRows(users) {
    const userIds = users.map((u) => u.id);
    const [readers, authors, publishers, admins] = await Promise.all([
      adminUserRepository.findReaderProfiles(userIds),
      adminUserRepository.findAuthorProfiles(userIds),
      adminUserRepository.findPublisherProfiles(userIds),
      adminUserRepository.findAdminProfiles(userIds),
    ]);

    const readerMap = Object.fromEntries(readers.map((p) => [p.user_id, p]));
    const authorMap = Object.fromEntries(authors.map((p) => [p.user_id, p]));
    const publisherMap = Object.fromEntries(publishers.map((p) => [p.user_id, p]));
    const adminMap = Object.fromEntries(admins.map((p) => [p.user_id, p]));

    return users.map((user) => {
      const profiles = {
        reader: readerMap[user.id] || null,
        author: authorMap[user.id] || null,
        publisher: publisherMap[user.id] || null,
        admin: adminMap[user.id] || null,
      };

      const name = displayNameForUser(user, profiles);
      const initials = name
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

      return {
        id: user.id,
        email: user.email,
        name,
        initials,
        avatarUrl: avatarForUser(user, profiles),
        role: user.role,
        verificationStatus: verificationStatus(user, profiles),
        systemStatus: systemStatus(user.account_status),
        accountStatus: user.account_status,
        banReason: user.account_status_reason || null,
        statusUpdatedAt: user.status_updated_at || null,
        lastActivity: formatActivity(user.updated_at),
        lastActivityAt: user.updated_at,
        createdAt: user.created_at,
      };
    });
  },

  async exportUsers({ search, role, status }) {
    const users = await adminUserRepository.listAllUsers({ search, role, status });
    const items = await this.mapUsersToRows(users);
    return {
      items,
      total: items.length,
      filters: {
        search: search || null,
        role: role || null,
        status: status || null,
      },
    };
  },

  async getUserDetail(userId) {
    const user = await adminUserRepository.findUserById(userId);
    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }

    const [row] = await this.mapUsersToRows([user]);
    const userIds = [userId];
    const [readers, authors, publishers, admins, rawBooks] = await Promise.all([
      adminUserRepository.findReaderProfiles(userIds),
      adminUserRepository.findAuthorProfiles(userIds),
      adminUserRepository.findPublisherProfiles(userIds),
      adminUserRepository.findAdminProfiles(userIds),
      user.role === 'reader'
        ? Promise.resolve([])
        : adminUserRepository.listBooksByUser(userId),
    ]);

    const profile =
      user.role === 'author'
        ? authors[0] || null
        : user.role === 'publisher'
          ? publishers[0] || null
          : user.role === 'admin'
            ? admins[0] || null
            : readers[0] || null;

    const books = mapUserBooks(rawBooks);
    const bookCount =
      user.role === 'reader' ? 0 : books.length || (await adminUserRepository.countBooksByAuthor(userId));

    return {
      ...row,
      profile: buildProfileDetail(user, profile),
      books,
      bookCount,
      memberSince: formatActivity(user.created_at).split(' ')[0],
    };
  },

  async updateUserStatus(userId, { accountStatus, reason, adminId }) {
    const user = await adminUserRepository.findUserById(userId);
    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }
    if (userId === adminId) {
      const err = new Error('You cannot change your own account status');
      err.statusCode = 403;
      throw err;
    }
    if (user.role === 'admin') {
      const err = new Error('Admin account status cannot be changed from this panel');
      err.statusCode = 403;
      throw err;
    }

    const allowed = ['active', 'suspended', 'disabled'];
    if (!allowed.includes(accountStatus)) {
      const err = new Error('Invalid account status');
      err.statusCode = 400;
      throw err;
    }

    if (accountStatus !== 'active') {
      if (user.role === 'author') {
        const trimmed = (reason || '').trim();
        if (trimmed.length < 5) {
          const err = new Error('A reason of at least 5 characters is required when banning authors');
          err.statusCode = 400;
          throw err;
        }
      }
    }

    const trimmedReason = accountStatus === 'active' ? null : (reason || '').trim() || null;

    await adminUserRepository.updateAccountStatus(userId, {
      status: accountStatus,
      reason: trimmedReason,
    });

    await recordAdminTask({
      adminId,
      category: 'users',
      action: 'user_status_updated',
      targetUserId: userId,
      details: {
        email: user.email,
        role: user.role,
        status: accountStatus,
        reason: trimmedReason,
      },
    });

    return this.getUserDetail(userId);
  },

  async banUser(userId, { reason, adminId }) {
    const user = await adminUserRepository.findUserById(userId);
    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }
    if (user.role === 'admin') {
      const err = new Error('Admin accounts cannot be banned');
      err.statusCode = 403;
      throw err;
    }
    if (!['reader', 'author', 'publisher'].includes(user.role)) {
      const err = new Error('This account type cannot be banned');
      err.statusCode = 403;
      throw err;
    }
    if (userId === adminId) {
      const err = new Error('You cannot ban your own account');
      err.statusCode = 403;
      throw err;
    }
    if (user.role === 'author') {
      const trimmed = (reason || '').trim();
      if (trimmed.length < 5) {
        const err = new Error('A ban reason of at least 5 characters is required for authors');
        err.statusCode = 400;
        throw err;
      }
    }

    const trimmedReason = (reason || '').trim() || null;
    await adminUserRepository.updateAccountStatus(userId, {
      status: 'suspended',
      reason: trimmedReason,
    });

    await recordAdminTask({
      adminId,
      category: 'users',
      action: 'user_banned',
      targetUserId: userId,
      details: { reason: trimmedReason, email: user.email, role: user.role },
    });

    const [row] = await this.mapUsersToRows([
      await adminUserRepository.findUserById(userId),
    ]);
    return row;
  },

  async approveUser(userId, { adminId }) {
    const user = await adminUserRepository.findUserById(userId);
    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }
    if (userId === adminId) {
      const err = new Error('You cannot change your own account status here');
      err.statusCode = 403;
      throw err;
    }
    if (user.role !== 'author' && user.role !== 'publisher') {
      const err = new Error('Only authors and publishers can be approved from this panel');
      err.statusCode = 403;
      throw err;
    }

    await adminUserRepository.updateAccountStatus(userId, {
      status: 'active',
      reason: null,
    });

    await recordAdminTask({
      adminId,
      category: 'users',
      action: 'user_approved',
      targetUserId: userId,
      details: { email: user.email, role: user.role },
    });

    const [row] = await this.mapUsersToRows([
      await adminUserRepository.findUserById(userId),
    ]);
    return row;
  },
};
