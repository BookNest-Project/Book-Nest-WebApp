import express from 'express';
import { feedController } from '../controllers/feedController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

// Feed
router.get('/', feedController.getFeed);
router.get('/my-posts', feedController.getUserPosts);

// Posts
router.post('/posts', feedController.createPost);
router.put('/posts/:postId', feedController.updatePost);
router.delete('/posts/:postId', feedController.deletePost);

// Drafts
router.post('/drafts', feedController.saveDraft);
router.post('/drafts/:postId/publish', feedController.publishDraft);

// Interactions
router.post('/posts/:postId/like', feedController.likePost);
router.delete('/posts/:postId/like', feedController.unlikePost);

export default router;