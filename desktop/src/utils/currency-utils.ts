export function formatUsdCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatUsdCurrencyPrecise(amount: number): string {
  const isSmallAmount = amount < 0.01;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: isSmallAmount ? 4 : 2,
    maximumFractionDigits: isSmallAmount ? 6 : 4,
  }).format(amount);
}