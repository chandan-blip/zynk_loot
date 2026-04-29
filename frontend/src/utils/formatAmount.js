/**
 * Format a stored (zynk) amount into the user's selected display currency.
 * @param {number} zynkAmount - Amount stored internally (zynk units)
 * @param {object} selectedCurrency - Selected currency object from CurrencyContext
 * @returns {string} Formatted amount with currency symbol
 */
export function formatAmount(zynkAmount, selectedCurrency) {
  const symbol = selectedCurrency?.symbol || '$';
  const rate = selectedCurrency?.rateFromZynk || 1;
  const precision = selectedCurrency?.precision || 2;

  const safe = Number(zynkAmount);
  const converted = !zynkAmount || isNaN(safe) ? 0 : safe * rate;

  let formatted;
  if (selectedCurrency?.type === 'crypto' && converted < 1) {
    formatted = converted.toFixed(precision);
  } else if (converted >= 1000000) {
    formatted = (converted / 1000000).toFixed(2) + 'M';
  } else {
    formatted = converted.toLocaleString(undefined, {
      maximumFractionDigits: Math.min(precision, 2)
    });
  }

  return `${symbol}${formatted}`;
}

/**
 * Rewrite legacy currency literals embedded in backend-supplied strings
 * (e.g. "Purchased 1000 Zynk", "Deposit of 50 coins", "won 100Z on Coin Flip")
 * into the user's selected currency. Numbers stand alone are untouched.
 *
 * @param {string} text - Source text from the API
 * @param {object} selectedCurrency - Selected currency object
 * @returns {string} Text with amounts re-rendered in the selected currency
 */
export function rewriteAmounts(text, selectedCurrency) {
  if (!text || typeof text !== 'string') return text || '';

  return text.replace(
    /(\d+(?:,\d{3})*(?:\.\d+)?)\s?(Zynk|coins|Z)\b/gi,
    (_match, numStr) => {
      const value = parseFloat(numStr.replace(/,/g, ''));
      return formatAmount(value, selectedCurrency);
    }
  );
}

/**
 * Get conversion rate string for display (e.g. "1 unit = $0.10").
 * @param {object} selectedCurrency - Selected currency object
 * @returns {string} Rate display string
 */
export function getConversionRate(selectedCurrency) {
  if (!selectedCurrency) return null;

  const rate = selectedCurrency.rateFromZynk || 1;
  const precision = selectedCurrency.precision || 2;

  return `1 unit = ${selectedCurrency.symbol}${rate.toFixed(precision)}`;
}
