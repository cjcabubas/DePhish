import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { validateAuth, validateEmail, validateCode, validateAuthenticatedCode, validateMfaChange, validateReset } from '../middleware/validateAuth.js';
import { requireAuth } from '../middleware/auth.js';
export function authRoutes(controller, users, limit = 15) {
  const router = Router();
  const account = rateLimit({ windowMs: 15 * 60_000, limit, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many account attempts. Please try again in 15 minutes.' } });
  const issue = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many code requests. Please try again later.' } });
  const verify = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many code attempts. Request another code later.' } });
  router.post('/signup', issue, validateAuth('registration-request'), controller.registrationRequest);
  router.post('/signup/resend', issue, validateAuth('registration-request'), controller.registrationResend);
  router.post('/signup/verify', verify, validateAuth('registration-verify'), controller.registrationVerify);
  router.post('/login', account, validateAuth('login'), controller.login);
  router.post('/mfa-login/resend', issue, validateAuth('login'), controller.resendLoginMfa);
  router.post('/mfa-login/verify', verify, validateCode, controller.verifyLoginMfa);
  router.post('/forgot-password', issue, validateEmail, controller.requestForgot);
  router.post('/forgot-password/verify', verify, validateCode, controller.verifyForgot);
  router.post('/reset-password', verify, validateReset, controller.resetPassword);
  router.get('/security', requireAuth(users), controller.security);
  router.post('/security/mfa', requireAuth(users), issue, validateMfaChange, controller.requestMfaSetting);
  router.post('/security/mfa/verify', requireAuth(users), verify, validateAuthenticatedCode, controller.confirmMfaSetting);
  router.get('/me', requireAuth(users), controller.me);
  router.post('/logout', controller.logout);
  return router;
}
