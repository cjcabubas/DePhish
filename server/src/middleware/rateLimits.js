import { rateLimit } from 'express-rate-limit';

export function apiRateLimit({ limit = 120, windowMs = 60000, message = 'Too many API requests. Please try again in a minute.' } = {}) {
  return rateLimit({ limit, windowMs, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message }, handler(req, res, next, options) {
      res.set('Cache-Control', 'no-store');
      res.status(options.statusCode).json(options.message);
    } });
}
