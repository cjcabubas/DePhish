// Start work immediately; keep successful results visible behind a brief loading
// state. Slow requests incur no additional delay, and errors are shown promptly.
export async function withScanLoading(work, { minimumMs = 1200, now = () => performance.now(), wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const started = now();
  const result = await work();
  const remaining = minimumMs - (now() - started);
  if (remaining > 0) await wait(remaining);
  return result;
}
