import express from 'express';
import { followController } from '../controllers/followController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.post('/:userId/follow', followController.follow);
router.delete('/:userId/follow', followController.unfollow);
router.post('/:userId/toggle', followController.toggleFollow);
router.get('/:userId/is-following', followController.isFollowing);
router.get('/:userId/followers', followController.getFollowers);
router.get('/:userId/following', followController.getFollowing);

export default router;