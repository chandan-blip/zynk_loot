// Monkey-patch react-hot-toast so any toast message containing legacy "Z" /
// "Zynk" / "coins" amounts is auto-rewritten into the user's selected
// currency. Importing this file once at app start applies the patch globally,
// so every existing `toast.success(...)`, `toast.error(...)`, etc. call site
// gets the conversion for free.

import toast from 'react-hot-toast';
import { rewriteAmounts } from './formatAmount';

const FALLBACK_CURRENCY = {
  code: 'INR',
  symbol: '₹',
  rateFromZynk: 1,
  precision: 2,
  type: 'fiat',
};

function readCurrentCurrency() {
  try {
    const saved = JSON.parse(localStorage.getItem('selectedCurrency'));
    if (saved && saved.code && saved.code !== 'ZYNK' && saved.code !== 'Z') {
      return saved;
    }
  } catch {}
  return FALLBACK_CURRENCY;
}

function rewriteMessage(input) {
  if (typeof input !== 'string') return input;
  return rewriteAmounts(input, readCurrentCurrency());
}

const METHODS = ['success', 'error', 'loading'];

if (!toast.__currencyPatched) {
  for (const m of METHODS) {
    const orig = toast[m];
    if (typeof orig !== 'function') continue;
    toast[m] = function (msg, opts) {
      return orig(rewriteMessage(msg), opts);
    };
  }

  // .promise(promise, { loading, success, error }) — rewrite each label
  if (typeof toast.promise === 'function') {
    const origPromise = toast.promise;
    toast.promise = function (promise, msgs, opts) {
      const wrapped = msgs && typeof msgs === 'object'
        ? Object.fromEntries(
            Object.entries(msgs).map(([k, v]) => [
              k,
              typeof v === 'function'
                ? (...args) => rewriteMessage(v(...args))
                : rewriteMessage(v),
            ])
          )
        : msgs;
      return origPromise(promise, wrapped, opts);
    };
  }

  toast.__currencyPatched = true;
}

export default toast;
