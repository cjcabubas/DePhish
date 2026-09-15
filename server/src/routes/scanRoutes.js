import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { scanController } from '../controllers/scanController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { dashboardController } from '../controllers/dashboardController.js';
import { historyController } from '../controllers/historyController.js';
export function scanRoutes(mlUrl, { users, scans, origins }) {
  const router = Router();
  let active = 0;
  const scan = scanController(mlUrl, scans);
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/', requireAuth(users), historyController(scans));
  router.get('/stats', requireAuth(users), dashboardController(scans));
  router.get('/admin/stats', requireAuth(users), requireRole('admin'), dashboardController(scans, { admin: true }));
  router.post('/analyze', (req, res, next) => {
    if (!req.is('application/json') || req.get('X-DePhish-Client') !== 'web' || (req.get('Origin') && !origins.includes(req.get('Origin'))))
      return res.status(403).json({ message: 'Request origin or format is not allowed.' });
    if (req.session?.userId) return requireAuth(users)(req, res, next);
    next();
  });
  router.post('/analyze', rateLimit({ windowMs: 60000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (active >= 4) return res.status(503).json({ message: 'Scanner busy. Please try again.' });
    active++;
    try { await scan(req, res); } finally { active--; }
  });
  return router;
}
