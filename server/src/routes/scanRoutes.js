import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { scanController } from '../controllers/scanController.js';
export function scanRoutes(mlUrl) {
  const router = Router();
  let active = 0;
  const scan = scanController(mlUrl);
  router.post('/analyze', rateLimit({ windowMs: 60000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (active >= 4) return res.status(503).json({ message: 'Scanner busy. Please try again.' });
    active++;
    try { await scan(req, res); } finally { active--; }
  });
  return router;
}
