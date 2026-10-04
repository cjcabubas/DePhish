function emailOf(value) { return typeof value === 'string' && value.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim().toLowerCase() : null; }
function codeOf(value) { return typeof value === 'string' && /^\d{6}$/.test(value); }
export function validateAuth(kind) { return (req, res, next) => {
  const email = emailOf(req.body?.email), { name, password } = req.body || {};
  if (!email) return res.status(400).json({ message: 'Enter a valid email address.' });
  if (kind !== 'registration-request' && (typeof password !== 'string' || password.length < (kind === 'registration-verify' ? 12 : 1) || Buffer.byteLength(password, 'utf8') > 72)) return res.status(400).json({ message: 'Use a valid password (at least 12 characters for a new password and no more than 72 UTF-8 bytes).' });
  if (kind.startsWith('registration') && (typeof name !== 'string' || !name.trim() || name.trim().length > 80)) return res.status(400).json({ message: 'Enter a name between 1 and 80 characters.' });
  req.validated = { ...req.body, email, ...(name ? { name: name.trim() } : {}) }; next();
}; }
export function validateEmail(req, res, next) { const email = emailOf(req.body?.email); if (!email) return res.status(400).json({ message: 'Enter a valid email address.' }); req.validated = { ...req.body, email }; next(); }
export function validateCode(req, res, next) { const email = emailOf(req.body?.email); if (!email || !codeOf(req.body?.code)) return res.status(400).json({ message: 'Enter a valid email address and the 6-digit code.' }); req.validated = { ...req.body, email }; next(); }
export function validateMfaConfirmation(req, res, next) { if (!codeOf(req.body?.code) || typeof req.body?.enabled !== 'boolean') return res.status(400).json({ message: 'Enter the 6-digit code and the pending MFA action.' }); req.validated = { code: req.body.code, enabled: req.body.enabled }; next(); }
export function validateMfaChange(req, res, next) { const { password, enabled } = req.body || {}; if (typeof password !== 'string' || password.length < 1 || Buffer.byteLength(password, 'utf8') > 72 || typeof enabled !== 'boolean') return res.status(400).json({ message: 'Enter your current password and choose a valid MFA setting.' }); req.validated = { password, enabled }; next(); }
export function validateReset(req, res, next) { const email = emailOf(req.body?.email), { resetToken, password } = req.body || {}; if (!email || typeof resetToken !== 'string' || !resetToken || typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ message: 'Enter a valid reset request and a password of at least 12 characters.' }); req.validated = { email, resetToken, password }; next(); }
