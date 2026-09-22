import { Router } from 'express';
import { apiRateLimit } from '../middleware/rateLimits.js';
import { scanController } from '../controllers/scanController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { dashboardController } from '../controllers/dashboardController.js';
import { historyController } from '../controllers/historyController.js';
export function scanRoutes(mlUrl, { users, scans, identifiers, consents, pseudonymizationKey, origins }) {
  const router = Router();
  let active = 0;
  const scan = scanController(mlUrl, scans, identifiers, consents, pseudonymizationKey);
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const reads = apiRateLimit({ limit: 30, message: 'Too many history or dashboard requests. Please try again in a minute.' });
  router.get(['/', '/stats', '/admin/stats', '/admin/identifiers'], reads);
  router.get('/', requireAuth(users), historyController(scans));
  router.get('/stats', requireAuth(users), dashboardController(scans));
  router.get('/admin/stats', requireAuth(users), requireRole('admin'), dashboardController(scans, { admin: true }));
  router.get('/admin/identifiers', requireAuth(users), requireRole('admin'), async (req, res) => {
    const limit = Number(req.query.limit ?? 50);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ message: 'Limit must be between 1 and 100.' });
    if (!identifiers) return res.status(503).json({ message: 'Flagged identifier registry unavailable.' });
    try { res.json({ identifiers: await identifiers.list(limit) }); }
    catch { res.status(503).json({ message: 'Flagged identifier registry unavailable.' }); }
  });
  router.post('/analyze', (req, res, next) => {
    if (!req.is('application/json') || req.get('X-DePhish-Client') !== 'web' || (req.get('Origin') && !origins.includes(req.get('Origin'))))
      return res.status(403).json({ message: 'Request origin or format is not allowed.' });
    if (req.session?.userId) return requireAuth(users)(req, res, next);
    next();
  });
  router.post('/analyze', apiRateLimit({ limit: 10, message: 'Too many scans. Please try again in a minute.' }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (active >= 4) return res.status(503).json({ message: 'Scanner busy. Please try again.' });
    active++;
    try { await scan(req, res); } finally { active--; }
  });
  return router;
}
