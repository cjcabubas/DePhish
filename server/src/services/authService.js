import bcrypt from 'bcryptjs';
export const publicUser = user => ({ id: String(user._id), name: user.name, email: user.email, role: user.role });
export function createAuthService(users) {
  // Same-cost password verification for unknown accounts.
  const dummyHash = bcrypt.hash('not-a-real-account-password', 12);
  return {
    async signup({ name, email, password }) {
      const passwordHash = await bcrypt.hash(password, 12);
      return users.create({ name, email, passwordHash, role: 'user' });
    },
    async login({ email, password }) {
      const user = await users.findByEmail(email);
      const valid = await bcrypt.compare(password, user?.passwordHash || await dummyHash);
      if (!user || !valid) return null;
      return user;
    },
  };
}
