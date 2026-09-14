export function validateAuth(kind) {
  return (req, res, next) => {
    const { name, email, password } = req.body || {};
    if (typeof email !== 'string' || email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return res.status(400).json({ message: 'Enter a valid email address.' });
    if (typeof password !== 'string' || password.length < (kind === 'signup' ? 12 : 1) || Buffer.byteLength(password, 'utf8') > 72)
      return res.status(400).json({ message: kind === 'signup' ? 'Use a password of at least 12 characters and no more than 72 UTF-8 bytes.' : 'Enter a valid password.' });
    if (kind === 'signup' && (typeof name !== 'string' || !name.trim() || name.trim().length > 80))
      return res.status(400).json({ message: 'Enter a name between 1 and 80 characters.' });
    req.validated = { email: email.trim().toLowerCase(), password, ...(kind === 'signup' ? { name: name.trim() } : {}) };
    next();
  };
}
