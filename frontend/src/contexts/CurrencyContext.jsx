import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getUserExchangeRates, updateUserSettings } from '../services/api';

const CurrencyContext = createContext();

// Default currency is Zynk
const DEFAULT_CURRENCY = {
  code: 'ZYNK',
  name: 'Zynk',
  symbol: 'Z',
  type: 'native',
  rateFromZynk: 1,
  precision: 2
};

export function CurrencyProvider({ children }) {
  const [selectedCurrency, setSelectedCurrencyState] = useState(() => {
    const saved = localStorage.getItem('selectedCurrency');
    return saved ? JSON.parse(saved) : DEFAULT_CURRENCY;
  });
  const [currencies, setCurrencies] = useState([DEFAULT_CURRENCY]);
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

  // Initialize from user's backend preference
  const initFromUser = useCallback((preferredCurrencyCode) => {
    if (initializedFromUser.current) return;
    if (!preferredCurrencyCode || preferredCurrencyCode === 'ZYNK') {
      initializedFromUser.current = true;
      return;
    }

    // Try to find the currency in the loaded list
    setSelectedCurrencyState(prev => {
      if (prev.code === preferredCurrencyCode) return prev;
      const match = currencies.find(c => c.code === preferredCurrencyCode);
      if (match) {
        initializedFromUser.current = true;
        return match;
      }
      // Currency not loaded yet — store the code so fetchRates can resolve it
      return { ...DEFAULT_CURRENCY, code: preferredCurrencyCode, _pending: true };
    });
    initializedFromUser.current = true;
  }, [currencies]);

  // Fetch exchange rates
  const fetchRates = useCallback(async () => {
    try {
      const response = await getUserExchangeRates();
      const { zynkToUsd: rate, rates } = response.data.data;

      setZynkToUsd(rate);

      // Build currency list: ZYNK first, then other currencies
      const currencyList = [
        DEFAULT_CURRENCY,
        ...rates.map(r => ({
          code: r.currency_code,
          name: r.currency_name,
          symbol: r.currency_symbol,
          type: r.currency_type,
          rateFromZynk: parseFloat(r.rate_from_zynk), // How many units of this currency = 1 Zynk
          precision: r.decimal_precision || 2
        }))
      ];

      setCurrencies(currencyList);

      // Update selectedCurrency with fresh rate from server
      setSelectedCurrencyState(prev => {
        if (prev.code === 'ZYNK') return prev;
        const fresh = currencyList.find(c => c.code === prev.code);
        return fresh || DEFAULT_CURRENCY;
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

  // Convert Zynk to selected currency
  const convertFromZynk = useCallback((zynkAmount) => {
    if (!zynkAmount || isNaN(zynkAmount)) return 0;

    if (selectedCurrency.code === 'ZYNK') {
      return zynkAmount;
    }

    // Direct conversion: zynkAmount * rateFromZynk
    return zynkAmount * selectedCurrency.rateFromZynk;
  }, [selectedCurrency]);

  // Format amount with currency symbol and precision
  const formatCurrency = useCallback((zynkAmount, showSymbol = true) => {
    const converted = convertFromZynk(zynkAmount);
    const precision = selectedCurrency.precision || 2;

    // Format with appropriate precision
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

    if (showSymbol) {
      if (selectedCurrency.code === 'ZYNK') {
        return `${formatted} Z`;
      }
      return `${selectedCurrency.symbol}${formatted}`;
    }

    return formatted;
  }, [convertFromZynk, selectedCurrency]);

  // Format with full precision (for detailed views)
  const formatCurrencyFull = useCallback((zynkAmount) => {
    const converted = convertFromZynk(zynkAmount);
    const precision = selectedCurrency.precision || 2;

    const formatted = converted.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: precision
    });

    if (selectedCurrency.code === 'ZYNK') {
      return `${formatted} Z`;
    }
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
