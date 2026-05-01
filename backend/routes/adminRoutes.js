// import express from 'express';
// import {
//   createAuthorProfile,
//   createCategory,
//   createPublisherProfile,
//   linkAuthorProfile,
//   linkPublisherProfile,
//   listUsers,
//   reviewBook
// } from '../controllers/adminController.js';
// import { authenticate, } from '../middleware/auth.js';
// import {
//   authorProfileSchema,
//   bookReviewStatusSchema,
//   categorySchema,
//   linkManagedProfileSchema,
//   publisherProfileSchema,
//   validate
// } from '../middleware/validation.js';

// const router = express.Router();

// //router.use(authenticate, authorize(['admin']));

// router.get('/users', listUsers);
// router.post('/categories', validate(categorySchema), createCategory);
// router.post('/authors', validate(authorProfileSchema), createAuthorProfile);
// router.post('/publishers', validate(publisherProfileSchema), createPublisherProfile);
// router.patch('/authors/:id/link-user', validate(linkManagedProfileSchema), linkAuthorProfile);
// router.patch('/publishers/:id/link-user', validate(linkManagedProfileSchema), linkPublisherProfile);
// router.patch('/books/:id/review', validate(bookReviewStatusSchema), reviewBook);

// export default router;
