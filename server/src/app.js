import express from 'express';
import helmet from 'helmet';
import session from 'express-session';
import { createAuthService } from './services/authService.js';
import { createAuthController } from './controllers/authController.js';
import { authRoutes } from './routes/authRoutes.js';
export function createApp({ config, users, store, isReady = () => true, authLimit = 15 }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '16kb' }));
  app.get('/health', (req, res) => res.status(isReady() ? 200 : 503).json({ service: 'DePhish-Auth', ready: isReady() }));
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
    const cookie = { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/api/auth', maxAge: 7 * 24 * 60 * 60 * 1000 };
    app.use('/api/auth', session({ name: 'dephish.sid', secret: config.sessionSecret, store, resave: false, saveUninitialized: false, cookie }));
    app.use('/api/auth', authRoutes(createAuthController(createAuthService(users), cookie), users, authLimit));
  }
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
