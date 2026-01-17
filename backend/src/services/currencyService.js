/**
 * Zynk (Z) Currency Conversion Service
 *
 * Base Peg: 1 Z = 100 INR (fixed internal rate)
 *
 * Conversion Model:
 * ─────────────────
 * Zynk is a synthetic internal currency pegged to INR at a fixed rate.
 * All conversions use INR as the intermediary reference currency.
 *
 * Formulas:
 *   Z → INR:    INR = Z × 100
 *   Z → Target: TargetAmount = (Z × 100) ÷ INR_rate_of_target
 *   Target → Z: Z = (Amount × INR_rate_of_target) ÷ 100
 *
 * Precision:
 *   - Fiat currencies: 2 decimal places (standard monetary precision)
 *   - Cryptocurrencies: 8 decimal places (satoshi-level precision)
 *   - Zynk: 2 decimal places (internal currency)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const ZYNK_TO_INR_RATE = 100; // Fixed peg: 1 Z = 100 INR

const CURRENCY_TYPES = {
  FIAT: 'fiat',
  CRYPTO: 'crypto'
};

const DECIMAL_PRECISION = {
  [CURRENCY_TYPES.FIAT]: 2,
  [CURRENCY_TYPES.CRYPTO]: 8,
  ZYNK: 2
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXCHANGE RATE DATA STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Exchange rates: Amount of INR needed to buy 1 unit of the currency
 *
 * Example: If USD/INR = 83.50, it means 1 USD = 83.50 INR
 *
 * Rate source should be updated periodically from a reliable API
 * (e.g., Open Exchange Rates, CoinGecko, or internal treasury rates)
 */
const exchangeRates = {
  // Last updated timestamp (ISO 8601)
  updatedAt: '2026-01-17T10:00:00Z',

  // Base currency for all rates
  baseCurrency: 'INR',

  // Fiat currencies: INR per 1 unit of currency
  fiat: {
    INR: { rate: 1, symbol: '₹', name: 'Indian Rupee', type: CURRENCY_TYPES.FIAT },
    USD: { rate: 83.50, symbol: '$', name: 'US Dollar', type: CURRENCY_TYPES.FIAT },
    EUR: { rate: 90.25, symbol: '€', name: 'Euro', type: CURRENCY_TYPES.FIAT },
    GBP: { rate: 105.80, symbol: '£', name: 'British Pound', type: CURRENCY_TYPES.FIAT },
    AED: { rate: 22.73, symbol: 'د.إ', name: 'UAE Dirham', type: CURRENCY_TYPES.FIAT },
    JPY: { rate: 0.54, symbol: '¥', name: 'Japanese Yen', type: CURRENCY_TYPES.FIAT },
    AUD: { rate: 54.20, symbol: 'A$', name: 'Australian Dollar', type: CURRENCY_TYPES.FIAT },
    CAD: { rate: 61.15, symbol: 'C$', name: 'Canadian Dollar', type: CURRENCY_TYPES.FIAT },
    CHF: { rate: 93.40, symbol: 'Fr', name: 'Swiss Franc', type: CURRENCY_TYPES.FIAT },
    CNY: { rate: 11.45, symbol: '¥', name: 'Chinese Yuan', type: CURRENCY_TYPES.FIAT }
  },

  // Cryptocurrencies: INR per 1 unit of crypto
  crypto: {
    USDT: { rate: 83.50, symbol: '₮', name: 'Tether USD', type: CURRENCY_TYPES.CRYPTO },
    BTC: { rate: 8750000, symbol: '₿', name: 'Bitcoin', type: CURRENCY_TYPES.CRYPTO },
    ETH: { rate: 275000, symbol: 'Ξ', name: 'Ethereum', type: CURRENCY_TYPES.CRYPTO },
    BNB: { rate: 52000, symbol: 'BNB', name: 'Binance Coin', type: CURRENCY_TYPES.CRYPTO },
    SOL: { rate: 17500, symbol: 'SOL', name: 'Solana', type: CURRENCY_TYPES.CRYPTO },
    XRP: { rate: 175, symbol: 'XRP', name: 'Ripple', type: CURRENCY_TYPES.CRYPTO }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get currency data by code
 * @param {string} currencyCode - Currency code (e.g., 'USD', 'BTC')
 * @returns {object|null} Currency data or null if not found
 */
function getCurrencyData(currencyCode) {
  const code = currencyCode.toUpperCase();
  return exchangeRates.fiat[code] || exchangeRates.crypto[code] || null;
}

/**
 * Check if currency is supported
 * @param {string} currencyCode - Currency code
 * @returns {boolean}
 */
function isSupportedCurrency(currencyCode) {
  return getCurrencyData(currencyCode) !== null;
}

/**
 * Get decimal precision for a currency type
 * @param {string} type - Currency type ('fiat' or 'crypto')
 * @returns {number} Decimal precision
 */
function getPrecision(type) {
  return DECIMAL_PRECISION[type] || DECIMAL_PRECISION[CURRENCY_TYPES.FIAT];
}

/**
 * Round a number to specified decimal places
 * Uses banker's rounding (round half to even) for financial accuracy
 * @param {number} value - Value to round
 * @param {number} decimals - Number of decimal places
 * @returns {number} Rounded value
 */
function roundToDecimals(value, decimals) {
  const multiplier = Math.pow(10, decimals);
  // Use Math.round for standard rounding
  // For true banker's rounding, a more complex implementation would be needed
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Validate amount is a positive number
 * @param {number} amount - Amount to validate
 * @returns {boolean}
 */
function isValidAmount(amount) {
  return typeof amount === 'number' && !isNaN(amount) && isFinite(amount) && amount >= 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORE CONVERSION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert Zynk (Z) to a target currency
 *
 * Formula: TargetAmount = (Z × ZYNK_TO_INR_RATE) ÷ INR_rate_of_target
 *
 * @param {number} zAmount - Amount in Zynk
 * @param {string} currencyCode - Target currency code
 * @returns {object} Conversion result
 *
 * @example
 * convertZynkToCurrency(1, 'USD')
 * // Returns: { success: true, amount: 1.20, currency: 'USD', ... }
 */
function convertZynkToCurrency(zAmount, currencyCode) {
  // Validate inputs
  if (!isValidAmount(zAmount)) {
    return {
      success: false,
      error: 'Invalid Zynk amount. Must be a non-negative number.',
      code: 'INVALID_AMOUNT'
    };
  }

  const code = currencyCode.toUpperCase();
  const currencyData = getCurrencyData(code);

  if (!currencyData) {
    return {
      success: false,
      error: `Unsupported currency: ${currencyCode}`,
      code: 'UNSUPPORTED_CURRENCY',
      supportedCurrencies: getSupportedCurrencies()
    };
  }

  // Convert Z to INR first, then INR to target currency
  const inrAmount = zAmount * ZYNK_TO_INR_RATE;
  const targetAmount = inrAmount / currencyData.rate;

  // Apply appropriate rounding based on currency type
  const precision = getPrecision(currencyData.type);
  const roundedAmount = roundToDecimals(targetAmount, precision);

  return {
    success: true,
    input: {
      amount: zAmount,
      currency: 'Z',
      name: 'Zynk'
    },
    output: {
      amount: roundedAmount,
      currency: code,
      symbol: currencyData.symbol,
      name: currencyData.name,
      type: currencyData.type
    },
    conversion: {
      rate: currencyData.rate,
      zynkToInrRate: ZYNK_TO_INR_RATE,
      inrEquivalent: inrAmount,
      precision: precision,
      formula: `${zAmount} Z × ${ZYNK_TO_INR_RATE} INR/Z ÷ ${currencyData.rate} INR/${code} = ${roundedAmount} ${code}`
    },
    timestamp: new Date().toISOString(),
    ratesUpdatedAt: exchangeRates.updatedAt
  };
}

/**
 * Convert a currency amount to Zynk (Z)
 *
 * Formula: Z = (Amount × INR_rate_of_source) ÷ ZYNK_TO_INR_RATE
 *
 * @param {number} amount - Amount in source currency
 * @param {string} currencyCode - Source currency code
 * @returns {object} Conversion result
 *
 * @example
 * convertCurrencyToZynk(1, 'USD')
 * // Returns: { success: true, amount: 0.84, currency: 'Z', ... }
 */
function convertCurrencyToZynk(amount, currencyCode) {
  // Validate inputs
  if (!isValidAmount(amount)) {
    return {
      success: false,
      error: 'Invalid amount. Must be a non-negative number.',
      code: 'INVALID_AMOUNT'
    };
  }

  const code = currencyCode.toUpperCase();
  const currencyData = getCurrencyData(code);

  if (!currencyData) {
    return {
      success: false,
      error: `Unsupported currency: ${currencyCode}`,
      code: 'UNSUPPORTED_CURRENCY',
      supportedCurrencies: getSupportedCurrencies()
    };
  }

  // Convert source currency to INR, then INR to Zynk
  const inrAmount = amount * currencyData.rate;
  const zynkAmount = inrAmount / ZYNK_TO_INR_RATE;

  // Round to Zynk precision (2 decimals)
  const roundedZynk = roundToDecimals(zynkAmount, DECIMAL_PRECISION.ZYNK);

  return {
    success: true,
    input: {
      amount: amount,
      currency: code,
      symbol: currencyData.symbol,
      name: currencyData.name,
      type: currencyData.type
    },
    output: {
      amount: roundedZynk,
      currency: 'Z',
      name: 'Zynk'
    },
    conversion: {
      rate: currencyData.rate,
      zynkToInrRate: ZYNK_TO_INR_RATE,
      inrEquivalent: inrAmount,
      precision: DECIMAL_PRECISION.ZYNK,
      formula: `${amount} ${code} × ${currencyData.rate} INR/${code} ÷ ${ZYNK_TO_INR_RATE} INR/Z = ${roundedZynk} Z`
    },
    timestamp: new Date().toISOString(),
    ratesUpdatedAt: exchangeRates.updatedAt
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get list of all supported currencies
 * @returns {object} Object with fiat and crypto currency lists
 */
function getSupportedCurrencies() {
  return {
    fiat: Object.keys(exchangeRates.fiat),
    crypto: Object.keys(exchangeRates.crypto),
    all: [...Object.keys(exchangeRates.fiat), ...Object.keys(exchangeRates.crypto)]
  };
}

/**
 * Get current exchange rates
 * @returns {object} Exchange rates data
 */
function getExchangeRates() {
  return {
    zynkToInr: ZYNK_TO_INR_RATE,
    updatedAt: exchangeRates.updatedAt,
    baseCurrency: exchangeRates.baseCurrency,
    fiat: { ...exchangeRates.fiat },
    crypto: { ...exchangeRates.crypto }
  };
}

/**
 * Update exchange rates (for periodic rate updates)
 *
 * IMPORTANT: This should only be called by a trusted rate update service
 * with rates from a reliable source. Consider adding authentication/validation.
 *
 * @param {object} newRates - New rates object
 * @returns {object} Result of update operation
 */
function updateExchangeRates(newRates) {
  const errors = [];

  // Validate structure
  if (!newRates || typeof newRates !== 'object') {
    return { success: false, error: 'Invalid rates object' };
  }

  // Update fiat rates
  if (newRates.fiat && typeof newRates.fiat === 'object') {
    for (const [code, data] of Object.entries(newRates.fiat)) {
      if (exchangeRates.fiat[code] && typeof data.rate === 'number' && data.rate > 0) {
        exchangeRates.fiat[code].rate = data.rate;
      } else if (!exchangeRates.fiat[code]) {
        errors.push(`Unknown fiat currency: ${code}`);
      } else {
        errors.push(`Invalid rate for ${code}`);
      }
    }
  }

  // Update crypto rates
  if (newRates.crypto && typeof newRates.crypto === 'object') {
    for (const [code, data] of Object.entries(newRates.crypto)) {
      if (exchangeRates.crypto[code] && typeof data.rate === 'number' && data.rate > 0) {
        exchangeRates.crypto[code].rate = data.rate;
      } else if (!exchangeRates.crypto[code]) {
        errors.push(`Unknown crypto currency: ${code}`);
      } else {
        errors.push(`Invalid rate for ${code}`);
      }
    }
  }

  // Update timestamp
  exchangeRates.updatedAt = new Date().toISOString();

  return {
    success: errors.length === 0,
    updatedAt: exchangeRates.updatedAt,
    errors: errors.length > 0 ? errors : undefined
  };
}

/**
 * Batch convert Zynk to multiple currencies
 * @param {number} zAmount - Amount in Zynk
 * @param {string[]} currencyCodes - Array of target currency codes
 * @returns {object} Object with conversion results for each currency
 */
function convertZynkToMultiple(zAmount, currencyCodes) {
  const results = {};

  for (const code of currencyCodes) {
    results[code] = convertZynkToCurrency(zAmount, code);
  }

  return {
    input: { amount: zAmount, currency: 'Z' },
    conversions: results,
    timestamp: new Date().toISOString()
  };
}

/**
 * Get Zynk equivalent value for display (e.g., "100 Z ≈ $1.20")
 * @param {number} zAmount - Amount in Zynk
 * @param {string} currencyCode - Display currency code
 * @returns {string} Formatted string
 */
function formatZynkValue(zAmount, currencyCode = 'USD') {
  const result = convertZynkToCurrency(zAmount, currencyCode);

  if (!result.success) {
    return `${zAmount} Z`;
  }

  return `${zAmount} Z ≈ ${result.output.symbol}${result.output.amount.toLocaleString()}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// JSON SCHEMA FOR RATE STORAGE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * JSON Schema for exchange rate storage (for validation)
 */
const EXCHANGE_RATE_SCHEMA = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ZynkExchangeRates",
  "type": "object",
  "required": ["updatedAt", "baseCurrency", "fiat", "crypto"],
  "properties": {
    "updatedAt": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp of last update"
    },
    "baseCurrency": {
      "type": "string",
      "const": "INR",
      "description": "Base currency for all rates"
    },
    "fiat": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["rate", "symbol", "name", "type"],
        "properties": {
          "rate": { "type": "number", "minimum": 0, "exclusiveMinimum": true },
          "symbol": { "type": "string" },
          "name": { "type": "string" },
          "type": { "const": "fiat" }
        }
      }
    },
    "crypto": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["rate", "symbol", "name", "type"],
        "properties": {
          "rate": { "type": "number", "minimum": 0, "exclusiveMinimum": true },
          "symbol": { "type": "string" },
          "name": { "type": "string" },
          "type": { "const": "crypto" }
        }
      }
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  // Core conversion functions
  convertZynkToCurrency,
  convertCurrencyToZynk,

  // Utility functions
  getSupportedCurrencies,
  getExchangeRates,
  updateExchangeRates,
  convertZynkToMultiple,
  formatZynkValue,
  isSupportedCurrency,

  // Constants
  ZYNK_TO_INR_RATE,
  CURRENCY_TYPES,
  DECIMAL_PRECISION,
  EXCHANGE_RATE_SCHEMA
};
