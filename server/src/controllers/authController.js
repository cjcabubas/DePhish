import { publicUser } from '../services/authService.js';
const regenerate = req => new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
const save = req => new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
export function createAuthController(service, cookieOptions) {
  async function establish(req, res, user, status = 200) {
    res.clearCookie('dephish.sid', { path: '/api/auth', httpOnly: true, sameSite: 'lax', secure: cookieOptions.secure });
    await regenerate(req);
    req.session.userId = String(user._id);
    await save(req);
    res.status(status).json({ user: publicUser(user) });
  }
  return {
    signup: async (req, res) => establish(req, res, await service.signup(req.validated), 201),
    login: async (req, res) => {
      const user = await service.login(req.validated);
      if (!user) return res.status(401).json({ message: 'Email or password is incorrect.' });
      await establish(req, res, user);
    },
    me: (req, res) => res.json({ user: publicUser(req.user) }),
    logout: async (req, res) => {
      await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
      const { maxAge, ...clearOptions } = cookieOptions;
      res.clearCookie('dephish.sid', clearOptions);
      res.status(204).end();
    },
  };
}
