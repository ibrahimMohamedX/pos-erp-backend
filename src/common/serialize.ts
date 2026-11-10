export function money(value: unknown, decimals = 2): string {
  const n = Number(value ?? 0);
  return n.toFixed(decimals);
}

export function num(value: unknown, decimals = 2): number {
  return Number(Number(value ?? 0).toFixed(decimals));
}

export function parsePageLimit(query: Record<string, unknown>, defaultLimit = 20) {
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? defaultLimit) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}
