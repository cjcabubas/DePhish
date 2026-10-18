export function dashboardController(
  scans,
  { admin = false, now = () => new Date() } = {},
) {
  return async (req, res) => {
    if (!scans)
      return res
        .status(503)
        .json({ message: "Dashboard data is unavailable." });
    const range = req.query?.range ?? "30";
    if (!["7", "30", "90", "all"].includes(range))
      return res.status(400).json({ message: "Invalid activity date range." });
    const end = now();
    let since = range === "all" ? null : new Date(end);
    if (since) {
      since.setUTCHours(0, 0, 0, 0);
      since.setUTCDate(since.getUTCDate() - (Number(range) - 1));
    }
    try {
      const stats = await scans.stats(
        admin ? null : String(req.user._id),
        since,
        end,
      );
      if (!since && stats.activity.length)
        since = new Date(`${stats.activity[0].date}T00:00:00.000Z`);
      const byDate = new Map(stats.activity.map((row) => [row.date, row]));
      const days = since ? Math.floor((end - since) / 86400000) + 1 : 0;
      const activity = Array.from({ length: days }, (_, index) => {
        const day = new Date(since);
        day.setUTCDate(day.getUTCDate() + index);
        const date = day.toISOString().slice(0, 10);
        return (
          byDate.get(date) || {
            date,
            total: 0,
            phishing: 0,
            suspicious: 0,
            legitimate: 0,
          }
        );
      });
      res.json({
        ...stats,
        activity,
        scope: admin ? "all_accounts" : "account",
        generated_at: end.toISOString(),
        period: {
          start: since?.toISOString() ?? null,
          end: end.toISOString(),
          timezone: "UTC",
          days,
          range,
        },
      });
    } catch {
      res
        .status(503)
        .json({ message: "Dashboard data is unavailable. Please try again." });
    }
  };
}
