import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const name = 'dephish.guest';
// A separate, signed HttpOnly cookie survives account-session expiration. The
// public guestId alone is never accepted as proof of possession.
export function guestIdentity(config) {
  const options = { httpOnly: true, secure: Boolean(config.production),
    sameSite: config.production ? 'none' : 'lax', path: '/api/', maxAge: 365 * 86400000 };
  const sign = id => createHmac('sha256', config.sessionSecret).update(`guest:${id}`).digest('hex');
  return (req, res, next) => {
    if (!config.sessionSecret) return next();
    const value = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
    const [id, signature] = (value || '').split('.');
    const valid = /^guest_[a-f0-9]{64}$/.test(id || '') && /^[a-f0-9]{64}$/.test(signature || '') &&
      value === `${id}.${signature}` && timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(id), 'hex'));
    req.guestId = valid ? id : null;
    req.rotateGuestIdentity = () => {
      req.guestId = `guest_${randomBytes(32).toString('hex')}`;
      res.cookie(name, `${req.guestId}.${sign(req.guestId)}`, options);
    };
    // Bootstrap on the frontend's /me request, or on the first submission.
    if (!req.guestId && !req.session?.userId) req.rotateGuestIdentity();
    next();
  };
}
