// import express from 'express';
// import { 
//   initiatePayment, 
//   verifyPaymentWebhook,
//   handlePaymentCallback, 
//   verifyPayment,         
//   checkOwnership,
//   getPurchasedBooks,
//   cleanupStuckPayments,
//   getPurchaseStatus
// } from '../controllers/paymentController.js';
// import { authenticate } from '../middleware/auth.js';

// const router = express.Router();

// // Initiate payment (only for readers)
// router.post(
//   '/initiate',
//   authenticate,
//   authorize(['reader']),
//   initiatePayment
// );

// // Handle Chapa redirect callback (public - no auth)
// router.get('/callback', handlePaymentCallback);

// // Manual verification (authenticated)
// router.post('/verify', authenticate, verifyPayment);

// // Check ownership
// router.post('/check-ownership', authenticate, checkOwnership);

// // Get purchased books
// //router.get('/my-purchases', authenticate, getPurchasedBooks);

// // Webhook for Chapa (no auth)
// router.post('/webhook/chapa', express.raw({ type: 'application/json' }), verifyPaymentWebhook);

// router.get('/cleanup', cleanupStuckPayments);
// router.get('/purchase-status', authenticate, getPurchaseStatus);

// export default router;