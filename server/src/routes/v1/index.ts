import { Router } from 'express';
import authRoutes from './auth.routes.js';
import listingRoutes from './listing.routes.js';
import tenantRoutes from './tenant.routes.js';
import interestRoutes from './interest.routes.js';
import conversationRoutes from './conversation.routes.js';
import adminRoutes from './admin.routes.js';
import { authLimiter, apiLimiter } from '../../middleware/rate-limiter.js';

const router = Router();

router.use('/auth', authLimiter, authRoutes);
router.use('/listings', apiLimiter, listingRoutes);
router.use('/tenants', apiLimiter, tenantRoutes);
router.use('/interests', apiLimiter, interestRoutes);
router.use('/conversations', apiLimiter, conversationRoutes);
router.use('/admin', apiLimiter, adminRoutes);

export default router;
