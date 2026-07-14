import { Router } from 'express';
import authRoutes from './auth.routes.js';
import listingRoutes from './listing.routes.js';
import tenantRoutes from './tenant.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/listings', listingRoutes);
router.use('/tenants', tenantRoutes);

// Placeholder routes — will add as we build each phase
// router.use('/interests', interestRoutes);
// router.use('/conversations', conversationRoutes);
// router.use('/admin', adminRoutes);

export default router;
