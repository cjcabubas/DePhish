import express from 'express';
import cors from 'cors';
import { scanRoutes } from './routes/scanRoutes.js';
import helmet from 'helmet';
import { linkRoutes } from './routes/linkRoutes.js';
import session from 'express-session';
import { createAuthService } from './services/authService.js';
import { createAuthController } from './controllers/authController.js';
import { authRoutes } from './routes/authRoutes.js';
import { apiRateLimit } from './middleware/rateLimits.js';
import { reportRoutes } from './routes/reportRoutes.js';
import { learnRoutes } from './routes/learnRoutes.js';
export function createApp({ config, users, store, scans, identifiers, consents, reports, progress, reportAnalyze, isReady = () => true, authLimit = 15, apiLimit = 120 }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  // CORS must come before helmet so preflight responses include the right headers.
  app.use(cors({
    origin: config.origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-DePhish-Client'],
  }));
  app.use(helmet());
  app.use('/api', apiRateLimit({ limit: apiLimit }));
  app.use(express.json({ limit: '16kb' }));
  app.get('/health', (req, res) => res.status(isReady() ? 200 : 503).json({ service: 'DePhish-Auth', ready: isReady() }));
  app.use('/api/links', linkRoutes);
  app.use('/api/auth', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!isReady() || !store) return res.status(503).json({ message: 'Accounts are not available yet. Please try again later.' });
    // Same-origin frontend proxy. Custom header blocks cross-site form submissions;
    // Origin allowlist rejects requests from untrusted browser origins.
    if (req.method !== 'GET' && (req.get('X-DePhish-Client') !== 'web' || !req.is('application/json') ||
        (req.get('Origin') && !config.origins.includes(req.get('Origin')))))
      return res.status(403).json({ message: 'Request origin or format is not allowed.' });
    next();
  });
  if (store) {
    // sameSite 'none' is required for cross-site cookies (Vercel frontend → Render backend).
    // 'none' requires secure:true which is enforced in production.
    const cookie = { httpOnly: true, secure: config.production, sameSite: config.production ? 'none' : 'lax', path: '/api', maxAge: 7 * 24 * 60 * 60 * 1000 };
    app.use(['/api/auth', '/api/scans', '/api/reports', '/api/learn'], session({ name: 'dephish.sid', secret: config.sessionSecret, store, resave: false, saveUninitialized: false, cookie }));
    app.use('/api/auth', authRoutes(createAuthController(createAuthService(users), cookie), users, authLimit));
  }
  app.use('/api/scans', scanRoutes(config.mlApiUrl || 'http://127.0.0.1:8000', { users, scans, identifiers, consents, pseudonymizationKey: config.sessionSecret, origins: config.origins }));
  app.use('/api/reports', reportRoutes({ users, scans, reports, consents, origins: config.origins,
    mlUrl: config.mlApiUrl || 'http://127.0.0.1:8000', analyze: reportAnalyze }));
  app.use('/api/learn', learnRoutes({ users, progress }));
  app.use((req, res) => res.status(404).json({ message: 'Endpoint not found.' }));
  app.use((error, req, res, next) => {
    if (error.code === 11000) return res.status(409).json({ message: 'An account with this email already exists.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ message: 'Request is too large.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON request.' });
    // Never expose connection strings, password hashes, or internal errors.
    res.status(503).json({ message: 'Account service is temporarily unavailable. Please try again.' });
  });
  return app;
}
