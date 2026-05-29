// Single source of truth for amount display. The app is INR-only — stored
// numeric values are treated as raw INR and rendered with a ₹ symbol. No
// conversion, no exchange rates, no per-user picker.

export const INR_CURRENCY = {
  code: 'INR',
  name: 'Indian Rupee',
  symbol: '₹',
  type: 'fiat',
  rateFromZynk: 1,
  precision: 2,
};

// Always render the full numeric value with comma grouping and two decimals —
// no K/M abbreviation. e.g. 10000000 -> "₹10,000,000.00".
export function formatAmount(amount) {
  const safe = Number(amount);
  const v = !amount || isNaN(safe) ? 0 : safe;
  return `₹${v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatAmountFull(amount) {
  return formatAmount(amount);
}

// Backward-compat: callers previously passed (amount, selectedCurrency) — the
// selectedCurrency arg is ignored now. Kept as a no-op param to avoid an audit
// of every call site.
// eslint-disable-next-line no-unused-vars
export function rewriteAmounts(text, _selectedCurrency) {
  if (!text || typeof text !== 'string') return text || '';
  // Strip any legacy "Z"/"Zynk"/"coins" suffix that the backend may still emit.
  return text.replace(
    /(\d+(?:,\d{3})*(?:\.\d+)?)\s?(Zynk|coins|Z)\b/gi,
    (_m, numStr) => `₹${numStr}`
  );
}

export function getConversionRate() {
  return null;
}
