import { publicUser } from '../services/authService.js';
const regenerate = req => new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
const save = req => new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
export function createAuthController(service, cookieOptions, otp, users, ownership) {
  function emailFailure(res, error) {
    if (error.code === 'OTP_RATE_LIMIT') return res.status(429).json({ message: error.message });
    return res.status(503).json({ message: 'Unable to send the verification email. Please try again later or contact the site administrator.' });
  }
  async function establish(req, res, user, status = 200) {
    await ownership?.claim(req.guestId, String(user._id));
    res.clearCookie('dephish.sid', { path: '/api/auth', httpOnly: true, sameSite: cookieOptions.sameSite, secure: cookieOptions.secure });
    await regenerate(req);
    req.session.userId = String(user._id);
    req.session.authVersion = Number(user.sessionVersion ?? 0);
    await save(req);
    req.rotateGuestIdentity?.();
    res.status(status).json({ user: publicUser(user) });
  }
  return {
    registrationRequest: async (req, res) => { if (!otp.configured) return res.status(503).json({ message: 'Email verification is not configured. Please contact the site administrator.' }); try { await otp.requestRegistration(req.validated); res.status(202).json({ message: 'If the address can be registered, a verification code will be sent shortly.' }); } catch (e) { emailFailure(res, e); } },
    registrationVerify: async (req, res) => { let user; try { user = await otp.register(req.validated); } catch (error) { if (error.code !== 11000) throw error; } if (!user) return res.status(400).json({ message: 'The code is invalid, expired, or the email cannot be registered. Request a new code and try again.' }); await establish(req, res, user, 201); },
    registrationResend: async (req, res) => { try { await otp.requestRegistration(req.validated); res.status(202).json({ message: 'If the address can be registered, a new verification code will be sent shortly.' }); } catch (e) { emailFailure(res, e); } },
    login: async (req, res) => { const user = await service.login(req.validated); if (!user) return res.status(401).json({ message: 'Email or password is incorrect.' }); if (user.mfaEnabled) { if (!otp.configured) return res.status(503).json({ message: 'Email MFA is not configured. Please contact the site administrator.' }); try { const challengeToken = await otp.startLoginMfa(user); return res.json({ mfaRequired: true, challengeToken }); } catch (e) { return emailFailure(res, e); } } return establish(req, res, user); },
    requestForgot: (req, res) => { if (!otp.configured) return res.status(503).json({ message: 'Email service is not configured.' }); res.status(202).json({ message: 'If an account exists for that email, a code will be sent shortly.' }); setImmediate(() => otp.requestForgot(req.validated.email).catch(() => console.error('Email processing failed. Check provider configuration.'))); },
    verifyForgot: async (req, res) => { const resetToken = await otp.verifyForgot(req.validated); if (!resetToken) return res.status(400).json({ message: 'The code is invalid or expired. Request a new code and try again.' }); res.json({ resetToken }); },
    resetPassword: async (req, res) => { const done = await otp.resetPassword(req.validated); if (!done) return res.status(400).json({ message: 'The reset authorization is invalid or expired. Verify a new code and try again.' }); res.json({ message: 'Your password has been changed. Please log in with your new password.' }); },
    verifyLoginMfa: async (req, res) => { const user = await otp.verifyLoginMfa(req.validated); if (!user) return res.status(400).json({ message: 'The code is invalid, expired, or no longer usable.' }); await establish(req, res, user); },
    resendLoginMfa: async (req, res) => { const user = await service.login({ email: req.validated.email, password: req.validated.password }); if (!user?.mfaEnabled) return res.status(400).json({ message: 'Sign-in challenge is invalid. Log in again.' }); try { const challengeToken = await otp.startLoginMfa(user); res.status(202).json({ message: 'A new code was sent.', challengeToken }); } catch (e) { emailFailure(res, e); } },
    security: (req, res) => res.json({ emailVerified: req.user.emailVerified, mfaEnabled: req.user.mfaEnabled }),
    requestMfaSetting: async (req, res) => { if (!otp.configured) return res.status(503).json({ message: 'Email MFA is not configured. Please contact the site administrator.' }); const user = await service.login({ email: req.user.email, password: req.validated.password }); if (!user) return res.status(401).json({ message: 'Enter your current password to confirm this change.' }); if (!user.emailVerified) return res.status(403).json({ message: 'Verify your email before changing MFA settings.' }); try { await otp.issueMfaSetting(user, req.validated.enabled); res.status(202).json({ message: 'A confirmation code was sent to your email.' }); } catch (e) { emailFailure(res, e); } },
    confirmMfaSetting: async (req, res) => { const user = await otp.confirmMfaSetting(req.user, req.validated.code, req.validated.enabled); if (!user) return res.status(400).json({ message: 'The code is invalid, expired, or no longer usable.' }); req.session.authVersion = user.sessionVersion; await save(req); res.json({ user: publicUser(user), mfaEnabled: user.mfaEnabled }); },
    me: (req, res) => res.json({ user: publicUser(req.user) }),
    logout: async (req, res) => {
      await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
      const { maxAge, ...clearOptions } = cookieOptions;
      res.clearCookie('dephish.sid', clearOptions);
      req.rotateGuestIdentity?.();
      res.status(204).end();
    },
  };
}
