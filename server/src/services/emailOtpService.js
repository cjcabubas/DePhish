import bcrypt from 'bcryptjs';
import { randomInt, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

const ttl = 5 * 60 * 1000;
const digest = (secret, value) => createHmac('sha256', secret).update(value).digest('hex');
const eq = (a, b) => { const x = Buffer.from(a || ''), y = Buffer.from(b || ''); return x.length === y.length && timingSafeEqual(x, y); };
export function createEmailOtpService({ users, otps, grants, email, secret, now = () => Date.now() }) {
  const codeHash = (purpose, address, code) => digest(secret, `${purpose}:${address}:${code}`);
  const tokenHash = token => digest(secret, `reset:${token}`);
  async function issue({ address, purpose, name, userId, action, challengeToken }) {
    const current = await otps.get(address, purpose); const time = now();
    if (current && time - current.lastSentAt.getTime() < 60_000) throw new Error('Please wait before requesting another code.');
    const windowStart = current?.windowStartedAt?.getTime() || time;
    if (current && time - windowStart < 60 * 60_000 && current.requestCount >= 5) throw new Error('Too many code requests. Please try again later.');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const reserved = await otps.put(address, purpose, { email: address, purpose, codeHash: codeHash(purpose, address, code), codeExpiresAt: new Date(time + ttl), expiresAt: new Date(time + 60 * 60_000), lastSentAt: new Date(time), windowStartedAt: new Date(time - windowStart >= 60 * 60_000 ? time : windowStart), requestCount: current && time - windowStart < 60 * 60_000 ? current.requestCount + 1 : 1, attempts: 0, name, userId, action, challengeHash: challengeToken ? digest(secret, `mfa:${challengeToken}`) : undefined });
    if (!reserved) throw new Error('Please wait before requesting another code.');
    try { await email.sendOtp({ to: address, name, code, purpose }); }
    catch (error) { await otps.remove(address, purpose); throw error; }
  }
  async function verify(address, purpose, code, extra = {}) {
    const row = await otps.get(address, purpose); const time = now();
    if (!row || !row.codeExpiresAt || row.codeExpiresAt.getTime() <= time || row.attempts >= 5 || !eq(row.codeHash, codeHash(purpose, address, code)) || (extra.challengeToken && !eq(row.challengeHash, digest(secret, `mfa:${extra.challengeToken}`)))) {
      if (row && row.codeExpiresAt?.getTime() > time && row.attempts < 5) await otps.incrementAttempts(row._id);
      return null;
    }
    return otps.consume(row._id, new Date(time), row.codeHash);
  }
  return {
    configured: email.configured,
    async requestRegistration({ name, email: address }) { if (await users.findByEmailAddress(address)) return; await issue({ address, purpose: 'registration', name }); },
    async register({ name, email: address, password, code }) { const row = await verify(address, 'registration', code); if (!row || await users.findByEmailAddress(address)) return null; const passwordHash = await bcrypt.hash(password, 12); return users.create({ name, email: address, passwordHash, emailVerified: true, mfaEnabled: false, role: 'user' }); },
    async requestForgot(address) { const user = await users.findByEmail(address); if (user) await issue({ address, purpose: 'forgot_password', name: user.name, userId: user._id }); },
    async verifyForgot({ email: address, code }) { const row = await verify(address, 'forgot_password', code); if (!row?.userId) return null; const token = randomBytes(32).toString('base64url'); await grants.put({ email: address, userId: row.userId, tokenHash: tokenHash(token), expiresAt: new Date(now() + 10 * 60_000) }); return token; },
    async resetPassword({ email: address, resetToken, password }) { const grant = await grants.find(address, tokenHash(resetToken), new Date(now())); if (!grant) return false; const passwordHash = await bcrypt.hash(password, 12); const consumed = await grants.consume(grant._id, new Date(now())); if (!consumed) return false; await users.updatePassword(grant.userId, passwordHash); const user = await users.findByEmailAddress(address); await email.sendPasswordChanged({ to: address, name: user?.name }).catch(() => {}); return true; },
    async startLoginMfa(user) { const challengeToken = randomBytes(32).toString('base64url'); await issue({ address: user.email, purpose: 'mfa_login', name: user.name, userId: user._id, challengeToken }); return challengeToken; },
    async verifyLoginMfa({ email: address, code, challengeToken }) { const row = await verify(address, 'mfa_login', code, { challengeToken }); return row?.userId ? users.findById(row.userId) : null; },
    async issueMfaSetting(user, action) { await issue({ address: user.email, purpose: action ? 'mfa_enable' : 'mfa_disable', name: user.name, userId: user._id, action }); },
    async confirmMfaSetting(user, code, enabled) { const purpose = enabled ? 'mfa_enable' : 'mfa_disable'; const row = await verify(user.email, purpose, code); if (!row || String(row.userId) !== String(user._id) || row.action !== enabled) return null; return users.setMfa(user._id, enabled); },
  };
}
