/**
 * Format amount based on user's selected currency and conversion rates
 * @param {number} zynkAmount - Amount in Zynk
 * @param {object} selectedCurrency - Selected currency object from context
 * @returns {string} Formatted amount with currency symbol
 */
export function formatAmount(zynkAmount, selectedCurrency) {
  if (!zynkAmount || isNaN(zynkAmount)) return `0 Z`;

  // If ZYNK is selected, just return Zynk format
  if (!selectedCurrency || selectedCurrency.code === 'ZYNK') {
    return `${zynkAmount.toLocaleString()} Z`;
  }

  // Convert Zynk to target currency using rateFromZynk
  // rateFromZynk = how many units of this currency = 1 Zynk
  const convertedValue = zynkAmount * (selectedCurrency.rateFromZynk || 1);
  const precision = selectedCurrency.precision || 2;

  // Format based on value size
  let formatted;
  if (selectedCurrency.type === 'crypto' && convertedValue < 1) {
    formatted = convertedValue.toFixed(precision);
  } else if (convertedValue >= 1000000) {
    formatted = (convertedValue / 1000000).toFixed(2) + 'M';
  } else {
    formatted = convertedValue.toLocaleString(undefined, {
      maximumFractionDigits: Math.min(precision, 2)
    });
  }

  return `${selectedCurrency.symbol}${formatted}`;
}

/**
 * Get conversion rate string for display
 * @param {object} selectedCurrency - Selected currency object
 * @returns {string} Rate display string like "1 Z = $0.10"
 */
export function getConversionRate(selectedCurrency) {
  if (!selectedCurrency || selectedCurrency.code === 'ZYNK') {
    return null;
  }

  const rate = selectedCurrency.rateFromZynk || 1;
  const precision = selectedCurrency.precision || 2;

  return `1 Z = ${selectedCurrency.symbol}${rate.toFixed(precision)}`;
}
