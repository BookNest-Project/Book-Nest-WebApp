import express from 'express';
import {
  getDashboardStats,
  createAuthorProfile,
  createCategory,
  createPublisherProfile,
  inviteUser,
  linkAuthorProfile,
  linkPublisherProfile,
  listBooks,
  listReports,
  listUsers,
  listWithdrawals,
  reviewBook,
  reviewBookFormat,
  reviewWithdrawal,
  updateReport,
  updateUserStatus,
} from '../controllers/adminController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  authorProfileSchema,
  bookReviewStatusSchema,
  categorySchema,
  linkManagedProfileSchema,
  publisherProfileSchema,
  validate,
} from '../middleware/validation.js';

const router = express.Router();

router.use(authenticate, authorize(['admin']));

router.get('/dashboard', getDashboardStats);
router.get('/users', listUsers);
router.patch('/users/:id/status', updateUserStatus);
router.post('/invites', inviteUser);

router.get('/books', listBooks);
router.patch('/books/:id/review', validate(bookReviewStatusSchema), reviewBook);
router.patch('/books/:bookId/formats/:formatId/review', validate(bookReviewStatusSchema), reviewBookFormat);

router.get('/reports', listReports);
router.patch('/reports/:id', updateReport);

router.get('/withdrawals', listWithdrawals);
router.patch('/withdrawals/:id/review', reviewWithdrawal);

router.post('/categories', validate(categorySchema), createCategory);
router.post('/authors', validate(authorProfileSchema), createAuthorProfile);
router.post('/publishers', validate(publisherProfileSchema), createPublisherProfile);
router.patch('/authors/:id/link-user', validate(linkManagedProfileSchema), linkAuthorProfile);
router.patch('/publishers/:id/link-user', validate(linkManagedProfileSchema), linkPublisherProfile);

export default router;
