export function linkCheckSummary(check) {
  if (!check) return 'This link was not inspected.';
  const points = check.risk?.score || 0;
  const incomplete = check.registration?.age_days == null || check.destination?.status !== 'checked';
  const reason = check.destination?.status !== 'checked' && check.destination?.reason ? ` ${check.destination.reason}` : '';
  if (points > 0) return `Link checks added ${points} risk points.${incomplete ? ' Some checks remain unavailable.' : ''}${reason}`;
  if (incomplete) return `Link checks are incomplete.${reason} No extra risk points were added; this does not mean the link is safe.`;
  return 'Domain age and connection checks found no extra scoring warnings. This does not guarantee the link is safe.';
}
