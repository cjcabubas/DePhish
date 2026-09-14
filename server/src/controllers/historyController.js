export function historyController(scans) {
  return async (req, res) => {
    const limit = Number(req.query.limit ?? 50);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ message: 'Limit must be between 1 and 100.' });
    if (!scans) return res.status(503).json({ message: 'Scan history unavailable.' });
    try {
      const rows = await scans.list(String(req.user._id), limit);
      res.json({ scans: rows.map(row => ({ id: String(row._id), title: row.title, created_at: row.createdAt, result: row.result })) });
    } catch { res.status(503).json({ message: 'Scan history unavailable.' }); }
  };
}
