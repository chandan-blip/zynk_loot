import { createContext, useContext } from 'react';
import { INR_CURRENCY, formatAmount, formatAmountFull } from '../utils/formatAmount';

// Legacy CurrencyContext — kept as a stub so existing useCurrency() callers
// keep compiling without touching ~45 files. The app is INR-only now; there
// is no picker, no conversion, no exchange-rate fetch.

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const value = {
    selectedCurrency: INR_CURRENCY,
    setSelectedCurrency: () => {},
    currencies: [INR_CURRENCY],
    zynkToUsd: 1,
    loading: false,
    convertFromZynk: (amount) => Number(amount) || 0,
    formatCurrency: (amount) => formatAmount(amount),
    formatCurrencyFull: (amount) => formatAmountFull(amount),
    refreshRates: () => Promise.resolve(),
    initFromUser: () => {},
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    // Defensive default — if the provider got removed somewhere, still return
    // a usable shape so individual components don't crash.
    return {
      selectedCurrency: INR_CURRENCY,
      setSelectedCurrency: () => {},
      currencies: [INR_CURRENCY],
      zynkToUsd: 1,
      loading: false,
      convertFromZynk: (amount) => Number(amount) || 0,
      formatCurrency: (amount) => formatAmount(amount),
      formatCurrencyFull: (amount) => formatAmountFull(amount),
      refreshRates: () => Promise.resolve(),
      initFromUser: () => {},
    };
  }
  return ctx;
}

export default CurrencyContext;
