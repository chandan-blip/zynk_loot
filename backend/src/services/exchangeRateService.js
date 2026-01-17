const axios = require('axios');

// Cache for exchange rates (refresh every 10 minutes)
let ratesCache = null;
let lastFetch = null;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// Free API: Frankfurter (no API key needed) - USD as base
const FRANKFURTER_API = 'https://api.frankfurter.app/latest?from=USD';

// Fallback: ExchangeRate-API free tier
const EXCHANGERATE_API = 'https://open.er-api.com/v6/latest/USD';

/**
 * Fetch exchange rates from free APIs
 * Returns rates relative to USD (how many units of currency = 1 USD)
 */
async function fetchExchangeRates() {
  // Check cache
  if (ratesCache && lastFetch && (Date.now() - lastFetch < CACHE_DURATION)) {
    return ratesCache;
  }

  try {
    // Try Frankfurter API first (rates from USD to other currencies)
    const response = await axios.get(FRANKFURTER_API, {
      timeout: 5000
    });

    if (response.data && response.data.rates) {
      // Add USD = 1 to the rates
      const rates = { USD: 1, ...response.data.rates };
      ratesCache = {
        base: 'USD',
        rates,
        source: 'frankfurter',
        updated: new Date().toISOString()
      };
      lastFetch = Date.now();
      console.log('Exchange rates fetched from Frankfurter API');
      return ratesCache;
    }
  } catch (error) {
    console.error('Frankfurter API error:', error.message);
  }

  try {
    // Fallback to ExchangeRate-API
    const response = await axios.get(EXCHANGERATE_API, {
      timeout: 5000
    });

    if (response.data && response.data.rates) {
      ratesCache = {
        base: 'USD',
        rates: response.data.rates,
        source: 'exchangerate-api',
        updated: new Date().toISOString()
      };
      lastFetch = Date.now();
      console.log('Exchange rates fetched from ExchangeRate-API');
      return ratesCache;
    }
  } catch (error) {
    console.error('ExchangeRate-API error:', error.message);
  }

  // Return cached rates if available, even if expired
  if (ratesCache) {
    console.warn('Using stale exchange rates');
    return ratesCache;
  }

  // Hardcoded fallback rates (approximate: 1 USD = X units)
  console.warn('Using fallback hardcoded rates');
  return {
    base: 'USD',
    rates: {
      USD: 1,
      INR: 83.5,
      EUR: 0.92,
      GBP: 0.79,
      AED: 3.67,
      SGD: 1.34,
      AUD: 1.53,
      CAD: 1.36,
      JPY: 149.5
    },
    source: 'fallback',
    updated: new Date().toISOString()
  };
}

/**
 * Get formatted currency list with rates
 * @param {number} zynkToUsd - How many USD = 1 Zynk (e.g., 0.1 means 1 Z = $0.10)
 */
async function getCurrencyList(zynkToUsd = 0.1) {
  const data = await fetchExchangeRates();

  // Currency configurations
  const currencyConfig = {
    USD: { name: 'US Dollar', symbol: '$', type: 'fiat', precision: 2, order: 1 },
    INR: { name: 'Indian Rupee', symbol: '₹', type: 'fiat', precision: 2, order: 2 },
    EUR: { name: 'Euro', symbol: '€', type: 'fiat', precision: 2, order: 3 },
    GBP: { name: 'British Pound', symbol: '£', type: 'fiat', precision: 2, order: 4 },
    AED: { name: 'UAE Dirham', symbol: 'د.إ', type: 'fiat', precision: 2, order: 5 },
    SGD: { name: 'Singapore Dollar', symbol: 'S$', type: 'fiat', precision: 2, order: 6 },
    AUD: { name: 'Australian Dollar', symbol: 'A$', type: 'fiat', precision: 2, order: 7 },
    CAD: { name: 'Canadian Dollar', symbol: 'C$', type: 'fiat', precision: 2, order: 8 },
    JPY: { name: 'Japanese Yen', symbol: '¥', type: 'fiat', precision: 0, order: 9 }
  };

  const currencies = [];

  for (const [code, config] of Object.entries(currencyConfig)) {
    if (data.rates[code]) {
      // Rate from API: 1 USD = X units of currency
      const usdToThis = data.rates[code];

      // Zynk to this currency: zynkToUsd * usdToThis
      // e.g., 1 Z = $0.10, 1 USD = 83.5 INR -> 1 Z = 0.10 * 83.5 = 8.35 INR
      const zynkToThis = zynkToUsd * usdToThis;

      currencies.push({
        currency_code: code,
        currency_name: config.name,
        currency_symbol: config.symbol,
        currency_type: config.type,
        rate_from_zynk: zynkToThis, // How many units of this currency = 1 Zynk
        decimal_precision: config.precision,
        display_order: config.order,
        is_active: true
      });
    }
  }

  // Sort by order
  currencies.sort((a, b) => a.display_order - b.display_order);

  return {
    zynkToUsd,
    rates: currencies,
    source: data.source,
    updated: data.updated
  };
}

/**
 * Clear the cache (useful for testing or forcing refresh)
 */
function clearCache() {
  ratesCache = null;
  lastFetch = null;
}

module.exports = {
  fetchExchangeRates,
  getCurrencyList,
  clearCache
};
