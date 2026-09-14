export function requireAuth(users) {
  return async (req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ message: 'Please log in.' });
    try {
      const user = await users.findById(req.session.userId);
      if (!user) return res.status(401).json({ message: 'Please log in again.' });
      req.user = user;
      next();
    } catch (error) { next(error); }
  };
}
export const requireRole = role => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Please log in.' });
  if (req.user.role !== role) return res.status(403).json({ message: 'Access denied.' });
  next();
};
