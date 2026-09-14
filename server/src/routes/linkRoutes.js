import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { checkLink } from '../controllers/linkController.js';
export const linkRoutes = Router();
let active = 0;
linkRoutes.post('/check', rateLimit({ windowMs: 60000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many link checks. Try again in a minute.' } }), async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (active >= 8) return res.status(503).json({ message: 'Link inspection is busy. Please try again.' });
  active++;
  try { await checkLink(req, res, next); } finally { active--; }
});
