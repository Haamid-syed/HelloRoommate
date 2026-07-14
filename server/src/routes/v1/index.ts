import { Router } from 'express';
import authRoutes from './auth.routes.js';

const router = Router();

router.use('/auth', authRoutes);

// Placeholder routes — will add as we build each phase
// router.use('/listings', listingRoutes);
// router.use('/tenants', tenantRoutes);
// router.use('/interests', interestRoutes);
// router.use('/conversations', conversationRoutes);
// router.use('/admin', adminRoutes);

export default router;
