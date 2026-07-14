import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { paginationSchema, type PaginationInput } from 'shared';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as chatService from '../../services/chat.service.js';

const router = Router();

type RequestWithValidatedQuery<T> = Request & { validatedQuery: T };

function validatedQuery<T>(req: Request): T {
  return (req as RequestWithValidatedQuery<T>).validatedQuery;
}

function conversationIdFrom(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string') {
    throw Object.assign(new Error('Conversation ID is required'), { statusCode: 400 });
  }
  return id;
}

router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conversations = await chatService.getConversations(req.user!.userId);
    res.json({ success: true, data: { conversations } });
  } catch (error) {
    next(error);
  }
});

router.get(
  '/:id/messages',
  authenticate,
  validate(paginationSchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await chatService.getConversationMessages(
        req.user!.userId,
        conversationIdFrom(req),
        validatedQuery<PaginationInput>(req)
      );
      res.json({ success: true, data: { messages: result.messages }, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
