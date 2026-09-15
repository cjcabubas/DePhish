export function dashboardController(scans, { admin = false, now = () => new Date() } = {}) {
  return async (req, res) => {
    if (!scans) return res.status(503).json({ message: 'Dashboard data is unavailable.' });
    const end = now();
    const since = new Date(end);
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - 29);
    try {
      const stats = await scans.stats(admin ? null : String(req.user._id), since);
      const byDate = new Map(stats.activity.map(row => [row.date, row]));
      const activity = Array.from({ length: 30 }, (_, index) => {
        const day = new Date(since);
        day.setUTCDate(day.getUTCDate() + index);
        const date = day.toISOString().slice(0, 10);
        return byDate.get(date) || { date, total: 0, phishing: 0, suspicious: 0, legitimate: 0 };
      });
      res.json({ ...stats, activity, scope: admin ? 'all_accounts' : 'account',
        generated_at: end.toISOString(), period: { start: since.toISOString(), end: end.toISOString(), timezone: 'UTC', days: 30 } });
    } catch { res.status(503).json({ message: 'Dashboard data is unavailable. Please try again.' }); }
  };
}
