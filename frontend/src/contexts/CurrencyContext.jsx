import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getUserExchangeRates, updateUserSettings } from '../services/api';

const CurrencyContext = createContext();

// Placeholder USD currency used until rates are fetched. Replaced by the live
// USD entry from the API on first successful fetch.
const FALLBACK_CURRENCY = {
  code: 'USD',
  name: 'US Dollar',
  symbol: '$',
  type: 'fiat',
  rateFromZynk: 1,
  precision: 2,
  _placeholder: true
};

const isLegacyZynk = (code) => !code || code === 'ZYNK' || code === 'Z';

const readSavedCurrency = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('selectedCurrency'));
    if (saved && !isLegacyZynk(saved.code)) return saved;
  } catch {}
  return FALLBACK_CURRENCY;
};

export function CurrencyProvider({ children }) {
  const [selectedCurrency, setSelectedCurrencyState] = useState(readSavedCurrency);
  const [currencies, setCurrencies] = useState([]);
  const [zynkToUsd, setZynkToUsd] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const initializedFromUser = useRef(false);

  // Wrapper that saves to both localStorage and backend
  const setSelectedCurrency = useCallback((currencyOrUpdater) => {
    setSelectedCurrencyState(prev => {
      const next = typeof currencyOrUpdater === 'function'
        ? currencyOrUpdater(prev)
        : currencyOrUpdater;

      // Persist to backend (fire-and-forget)
      if (next && next.code && next.code !== prev.code) {
        const token = localStorage.getItem('token');
        if (token) {
          updateUserSettings({ preferredCurrency: next.code }).catch(() => {});
        }
      }

      return next;
    });
  }, []);

  // Initialize from user's backend preference. Legacy 'ZYNK' values silently
  // fall through to the USD fallback (handled by isLegacyZynk).
  const initFromUser = useCallback((preferredCurrencyCode) => {
    if (initializedFromUser.current) return;
    if (isLegacyZynk(preferredCurrencyCode)) {
      initializedFromUser.current = true;
      return;
    }

    setSelectedCurrencyState(prev => {
      if (prev.code === preferredCurrencyCode) return prev;
      const match = currencies.find(c => c.code === preferredCurrencyCode);
      if (match) {
        initializedFromUser.current = true;
        return match;
      }
      return { ...FALLBACK_CURRENCY, code: preferredCurrencyCode, _pending: true };
    });
    initializedFromUser.current = true;
  }, [currencies]);

  // Fetch exchange rates
  const fetchRates = useCallback(async () => {
    try {
      const response = await getUserExchangeRates();
      const { zynkToUsd: rate, rates } = response.data.data;

      setZynkToUsd(rate);

      const currencyList = rates.map(r => ({
        code: r.currency_code,
        name: r.currency_name,
        symbol: r.currency_symbol,
        type: r.currency_type,
        rateFromZynk: parseFloat(r.rate_from_zynk),
        precision: r.decimal_precision || 2
      }));

      setCurrencies(currencyList);

      // Resolve any pending / placeholder currency against the live list.
      setSelectedCurrencyState(prev => {
        const fresh = currencyList.find(c => c.code === prev.code);
        if (fresh) return fresh;
        // Selected currency not available — fall back to USD or first entry.
        return currencyList.find(c => c.code === 'USD') || currencyList[0] || prev;
      });
    } catch (error) {
      console.error('Failed to fetch exchange rates:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRates();
    // Refresh rates every 5 minutes
    const interval = setInterval(fetchRates, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchRates]);

  // Save selected currency to localStorage
  useEffect(() => {
    localStorage.setItem('selectedCurrency', JSON.stringify(selectedCurrency));
  }, [selectedCurrency]);

  // Convert a stored (zynk) amount into the selected currency.
  const convertFromZynk = useCallback((zynkAmount) => {
    if (!zynkAmount || isNaN(zynkAmount)) return 0;
    return zynkAmount * (selectedCurrency.rateFromZynk || 1);
  }, [selectedCurrency]);

  // Format amount with currency symbol and precision
  const formatCurrency = useCallback((zynkAmount, showSymbol = true) => {
    const converted = convertFromZynk(zynkAmount);
    const precision = selectedCurrency.precision || 2;

    let formatted;
    if (selectedCurrency.type === 'crypto' && converted < 1) {
      formatted = converted.toFixed(precision);
    } else if (converted >= 1000000) {
      formatted = (converted / 1000000).toFixed(2) + 'M';
    } else if (converted >= 1000) {
      formatted = (converted / 1000).toFixed(2) + 'K';
    } else {
      formatted = converted.toFixed(Math.min(precision, 2));
    }

    return showSymbol ? `${selectedCurrency.symbol}${formatted}` : formatted;
  }, [convertFromZynk, selectedCurrency]);

  // Format with full precision (for detailed views)
  const formatCurrencyFull = useCallback((zynkAmount) => {
    const converted = convertFromZynk(zynkAmount);
    const precision = selectedCurrency.precision || 2;

    const formatted = converted.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: precision
    });

    return `${selectedCurrency.symbol}${formatted}`;
  }, [convertFromZynk, selectedCurrency]);

  const value = {
    selectedCurrency,
    setSelectedCurrency,
    currencies,
    zynkToUsd,
    loading,
    convertFromZynk,
    formatCurrency,
    formatCurrencyFull,
    refreshRates: fetchRates,
    initFromUser
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}

export default CurrencyContext;
