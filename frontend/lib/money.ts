// Fares/wallet balances arrive as paisa strings (see lib/types.ts) -- this
// is the one place that gets converted to a displayed Taka amount.
export function formatPaisa(paisa: string): string {
  const value = Number(paisa) / 100;
  return `৳${value.toFixed(2)}`;
}
