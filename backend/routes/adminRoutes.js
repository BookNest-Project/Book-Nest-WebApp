import express from 'express';
import {
  adminLogin,
  adminMe,
  getQueueStats,
  listBooks,
  getPendingBooks,
  getBookDetail,
  reviewBook,
  approveBook,
  rejectBook,
  notifyAuthorRejection,
  revertBookApproval,
  getAdminNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../controllers/adminApproval.js';
import { getUserStats, listUsers, exportUsers, getUserDetail, banUser, approveUser, updateUserStatus, bulkUploadUsers } from '../controllers/adminUser.js';
import {
  getInvitationTemplates,
  previewInvitation,
  listInvitations,
  getInvitation,
  createInvitation,
  sendInvitation,
  resendInvitation,
  deleteInvitation,
  updateInvitation,
} from '../controllers/adminInvitation.js';
import { getReportsCenter } from '../controllers/adminReports.js';
import { getDashboardOverview } from '../controllers/adminDashboard.js';
import { uploadAdminAvatar, updateAdminProfile } from '../controllers/adminProfile.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate, bookReviewStatusSchema, invitationCreateSchema, invitationPreviewSchema, invitationUpdateSchema } from '../middleware/validation.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      message: 'BookNest admin API',
      public: {
        login: 'POST /api/admin/login',
        me: 'GET /api/admin/me',
        authLogin: 'POST /api/auth/login (any role; admin routes need role=admin)',
      },
      protected: {
        queueStats: 'GET /api/admin/books/queue/stats',
        listBooks: 'GET /api/admin/books/list?status=all|pending_review|approved|rejected',
        pendingBooks: 'GET /api/admin/books/queue/pending',
        bookDetail: 'GET /api/admin/books/:id',
        approveBook: 'POST /api/admin/books/:id/approve',
        rejectBook: 'POST /api/admin/books/:id/reject',
        notifyAuthorRejection: 'POST /api/admin/books/:id/notify-author',
        reviewBook: 'PATCH /api/admin/books/:id/review',
        userStats: 'GET /api/admin/users/stats',
        listUsers: 'GET /api/admin/users',
        exportUsers: 'GET /api/admin/users/export',
        bulkUploadUsers: 'POST /api/admin/users/bulk',
        invitations: 'GET /api/admin/invitations',
        invitationTemplates: 'GET /api/admin/invitations/templates',
        userDetail: 'GET /api/admin/users/:id',
        banUser: 'POST /api/admin/users/:id/ban',
        approveUser: 'POST /api/admin/users/:id/approve',
        updateUserStatus: 'PATCH /api/admin/users/:id/status',
        uploadProfileAvatar: 'POST /api/admin/profile/avatar',
        updateProfile: 'PATCH /api/admin/profile',
        reportsCenter: 'GET /api/admin/reports',
        dashboardOverview: 'GET /api/admin/dashboard/overview',
      },
      auth: 'Cookie token or Authorization: Bearer <token from login response>',
    },
  });
});

// Public admin auth (no token required)
router.post('/login', adminLogin);
router.get('/me', adminMe);

// Protected admin routes
router.use(authenticate, requireRole(['admin']));
router.post('/profile/avatar', upload.single('avatar'), uploadAdminAvatar);
router.patch('/profile', updateAdminProfile);
router.post('/profile/name', updateAdminProfile);
router.get('/users/stats', getUserStats);
router.get('/users/export', exportUsers);
router.post('/users/bulk', bulkUploadUsers);
router.get('/invitations/templates', getInvitationTemplates);
router.post('/invitations/preview', validate(invitationPreviewSchema), previewInvitation);
router.get('/invitations', listInvitations);
router.post('/invitations', validate(invitationCreateSchema), createInvitation);
router.get('/invitations/:id', getInvitation);
router.patch('/invitations/:id', validate(invitationUpdateSchema), updateInvitation);
router.post('/invitations/:id/send', sendInvitation);
router.post('/invitations/:id/resend', resendInvitation);
router.delete('/invitations/:id', deleteInvitation);
router.get('/users/:id', getUserDetail);
router.post('/users/:id/ban', banUser);
router.post('/users/:id/approve', approveUser);
router.patch('/users/:id/status', updateUserStatus);
router.get('/users', listUsers);
router.get('/reports', getReportsCenter);
router.get('/dashboard/overview', getDashboardOverview);
router.get('/books/queue/stats', getQueueStats);
router.get('/books/queue/pending', getPendingBooks);
router.get('/notifications', getAdminNotifications);
router.patch('/notifications/read-all', markAllNotificationsRead);
router.patch('/notifications/:id/read', markNotificationRead);
router.get('/books/list', listBooks);
router.get('/books/pending', getPendingBooks);
router.get('/books/:id', getBookDetail);
router.post('/books/:id/approve', approveBook);
router.post('/books/:id/reject', rejectBook);
router.post('/books/:id/notify-author', notifyAuthorRejection);
router.post('/books/:id/revert-approval', revertBookApproval);
router.patch('/books/:id/review', validate(bookReviewStatusSchema), reviewBook);

export default router;
