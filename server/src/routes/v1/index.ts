import { Router } from 'express';
import authRoutes from './auth.routes.js';
import listingRoutes from './listing.routes.js';
import tenantRoutes from './tenant.routes.js';
import interestRoutes from './interest.routes.js';
import conversationRoutes from './conversation.routes.js';
import adminRoutes from './admin.routes.js';

const router = Router();

// Rate limiters are mounted once in app.ts. Keeping the router free of duplicate
// mounts prevents one request from being counted twice.
router.use('/auth', authRoutes);
router.use('/listings', listingRoutes);
router.use('/tenants', tenantRoutes);
router.use('/interests', interestRoutes);
router.use('/conversations', conversationRoutes);
router.use('/admin', adminRoutes);

export default router;
