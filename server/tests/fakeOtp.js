import bcrypt from 'bcryptjs';
export function fakeOtp(users) {
  return { configured: true, async requestRegistration() {}, async register({ name, email, password, code }) {
    if (!/^\d{6}$/.test(code) || await users.findByEmail(email)) return null;
    return users.create({ name, email, passwordHash: await bcrypt.hash(password, 4), emailVerified: true, mfaEnabled: false, role: 'user' });
  }, async requestForgot() {}, async verifyForgot() { return null; }, async resetPassword() { return false; }, async startLoginMfa() { return 'challenge'; }, async verifyLoginMfa({ email, code, challengeToken }) { return code === '000042' && challengeToken === 'challenge' ? users.findByEmail(email) : null; }, async issueMfaSetting() {}, async confirmMfaSetting() { return null; } };
}
export async function signupWithOtp(request, fields) {
  await request('/api/auth/signup', { name: fields.name, email: fields.email });
  return request('/api/auth/signup/verify', { ...fields, code: '000042' });
}
