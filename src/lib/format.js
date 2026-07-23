export function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

export function fmtCost(n) {
  if (n >= 100) return '$' + n.toFixed(0);
  if (n >= 1)   return '$' + n.toFixed(2);
  return '$' + n.toFixed(3);
}
