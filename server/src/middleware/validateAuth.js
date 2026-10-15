function emailOf(value) { return typeof value === 'string' && value.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim().toLowerCase() : null; }
function codeOf(value) { return typeof value === 'string' && /^\d{6}$/.test(value); }
function passwordError(value, minimum = 1) { if (typeof value !== 'string' || value.length < minimum) return minimum > 1 ? `Use a password of at least ${minimum} characters.` : 'Enter a valid password.'; if (value.length > 128) return 'Password must be 128 characters or fewer.'; if (Buffer.byteLength(value, 'utf8') > 72) return 'Password must be no more than 72 UTF-8 bytes.'; return ''; }
export function validateAuth(kind) { return (req, res, next) => {
  const email = emailOf(req.body?.email), { name, password } = req.body || {};
  if (!email) return res.status(400).json({ message: 'Enter a valid email address.' });
  if (kind !== 'registration-request') { const issue = passwordError(password, kind === 'registration-verify' ? 12 : 1); if (issue) return res.status(400).json({ message: issue }); }
  if (kind.startsWith('registration') && (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100)) return res.status(400).json({ message: 'Enter a name between 2 and 100 characters.' });
  req.validated = { ...req.body, email, ...(name ? { name: name.trim() } : {}) }; next();
}; }
export function validateEmail(req, res, next) { const email = emailOf(req.body?.email); if (!email) return res.status(400).json({ message: 'Enter a valid email address.' }); req.validated = { ...req.body, email }; next(); }
export function validateCode(req, res, next) { const email = emailOf(req.body?.email); if (!email || !codeOf(req.body?.code)) return res.status(400).json({ message: 'Enter a valid email address and the 6-digit code.' }); req.validated = { ...req.body, email }; next(); }
export function validateMfaConfirmation(req, res, next) { if (!codeOf(req.body?.code) || typeof req.body?.enabled !== 'boolean') return res.status(400).json({ message: 'Enter the 6-digit code and the pending MFA action.' }); req.validated = { code: req.body.code, enabled: req.body.enabled }; next(); }
export function validateMfaChange(req, res, next) { const { password, enabled } = req.body || {}; const issue = passwordError(password); if (issue || typeof enabled !== 'boolean') return res.status(400).json({ message: issue || 'Choose a valid MFA setting.' }); req.validated = { password, enabled }; next(); }
export function validateReset(req, res, next) { const email = emailOf(req.body?.email), { resetToken, password } = req.body || {}; const issue = passwordError(password, 12); if (!email || typeof resetToken !== 'string' || !resetToken || resetToken.length > 128 || issue) return res.status(400).json({ message: issue || 'Enter a valid reset request and a password of at least 12 characters.' }); req.validated = { email, resetToken, password }; next(); }
