import express from 'express';
import { feedController } from '../controllers/feedController.js';
import { authenticate, authenticateOptional } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

router.get('/users/:userId/posts', authenticateOptional, feedController.getUserPublicPosts);
router.get('/posts/:postId/comments', authenticateOptional, feedController.getComments);

router.use(authenticate);

router.get('/', feedController.getFeed);
router.get('/my-posts', feedController.getUserPosts);

router.post('/posts/upload-image', upload.single('image'), feedController.uploadPostImage);
router.post('/posts', feedController.createPost);
router.put('/posts/:postId', feedController.updatePost);
router.delete('/posts/:postId', feedController.deletePost);
router.post('/posts/:postId/share', feedController.sharePost);

router.post('/drafts', feedController.saveDraft);
router.put('/drafts/:postId', feedController.updateDraft);
router.post('/drafts/:postId/publish', feedController.publishDraft);

router.post('/posts/:postId/like', feedController.likePost);
router.delete('/posts/:postId/like', feedController.unlikePost);

router.post('/posts/:postId/comments', feedController.createComment);
router.post('/comments/:commentId/like', feedController.likeComment);
router.delete('/comments/:commentId/like', feedController.unlikeComment);

router.post('/reports', feedController.createReport);

export default router;
