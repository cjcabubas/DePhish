import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { validateAuth } from '../middleware/validateAuth.js';
import { requireAuth } from '../middleware/auth.js';
export function authRoutes(controller, users, limit = 15) {
  const router = Router();
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Too many account attempts. Please try again in 15 minutes.' } });
  router.post('/signup', limiter, validateAuth('signup'), controller.signup);
  router.post('/login', limiter, validateAuth('login'), controller.login);
  router.get('/me', requireAuth(users), controller.me);
  router.post('/logout', controller.logout);
  return router;
}
