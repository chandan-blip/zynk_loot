/**
 * Zynk Currency Service - Example Conversions & Tests
 *
 * Run with: node src/services/currencyService.test.js
 */

const {
  convertZynkToCurrency,
  convertCurrencyToZynk,
  getSupportedCurrencies,
  getExchangeRates,
  convertZynkToMultiple,
  formatZynkValue,
  ZYNK_TO_INR_RATE
} = require('./currencyService');

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE CONVERSIONS
// ═══════════════════════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════════════');
console.log('           ZYNK CURRENCY CONVERSION SERVICE - EXAMPLES             ');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(`\nBase Peg: 1 Z = ${ZYNK_TO_INR_RATE} INR\n`);

// ─────────────────────────────────────────────────────────────────────────────
// Example 1: 1 Z → USD
// ─────────────────────────────────────────────────────────────────────────────
console.log('─────────────────────────────────────────────────────────────────────');
console.log('Example 1: 1 Z → USD');
console.log('─────────────────────────────────────────────────────────────────────');

const usdResult = convertZynkToCurrency(1, 'USD');
console.log(`Input:  ${usdResult.input.amount} ${usdResult.input.currency}`);
console.log(`Output: ${usdResult.output.amount} ${usdResult.output.currency} (${usdResult.output.symbol}${usdResult.output.amount})`);
console.log(`Formula: ${usdResult.conversion.formula}`);
console.log(`Rate: 1 USD = ${usdResult.conversion.rate} INR`);
console.log();

// ─────────────────────────────────────────────────────────────────────────────
// Example 2: 1 Z → USDT (Stablecoin)
// ─────────────────────────────────────────────────────────────────────────────
console.log('─────────────────────────────────────────────────────────────────────');
console.log('Example 2: 1 Z → USDT (Stablecoin)');
console.log('─────────────────────────────────────────────────────────────────────');

const usdtResult = convertZynkToCurrency(1, 'USDT');
console.log(`Input:  ${usdtResult.input.amount} ${usdtResult.input.currency}`);
console.log(`Output: ${usdtResult.output.amount} ${usdtResult.output.currency}`);
console.log(`Formula: ${usdtResult.conversion.formula}`);
console.log(`Note: USDT uses actual INR market rate (${usdtResult.conversion.rate} INR)`);
console.log(`Precision: ${usdtResult.conversion.precision} decimal places (crypto)`);
console.log();

// ─────────────────────────────────────────────────────────────────────────────
// Example 3: 1 Z → BTC (High-value crypto)
// ─────────────────────────────────────────────────────────────────────────────
console.log('─────────────────────────────────────────────────────────────────────');
console.log('Example 3: 1 Z → BTC (High-value crypto)');
console.log('─────────────────────────────────────────────────────────────────────');

const btcResult = convertZynkToCurrency(1, 'BTC');
console.log(`Input:  ${btcResult.input.amount} ${btcResult.input.currency}`);
console.log(`Output: ${btcResult.output.amount.toFixed(8)} ${btcResult.output.currency}`);
console.log(`Formula: ${btcResult.conversion.formula}`);
console.log(`Rate: 1 BTC = ${btcResult.conversion.rate.toLocaleString()} INR`);
console.log(`Precision: ${btcResult.conversion.precision} decimal places (satoshi-level)`);
console.log();

// ─────────────────────────────────────────────────────────────────────────────
// Example 4: 100 Z → EUR
// ─────────────────────────────────────────────────────────────────────────────
console.log('─────────────────────────────────────────────────────────────────────');
console.log('Example 4: 100 Z → EUR');
console.log('─────────────────────────────────────────────────────────────────────');

const eurResult = convertZynkToCurrency(100, 'EUR');
console.log(`Input:  ${eurResult.input.amount} ${eurResult.input.currency}`);
console.log(`Output: ${eurResult.output.amount} ${eurResult.output.currency} (${eurResult.output.symbol}${eurResult.output.amount})`);
console.log(`Formula: ${eurResult.conversion.formula}`);
console.log(`INR Equivalent: ₹${eurResult.conversion.inrEquivalent.toLocaleString()}`);
console.log();

// ─────────────────────────────────────────────────────────────────────────────
// Example 5: Reverse conversion - 1 USD → Z
// ─────────────────────────────────────────────────────────────────────────────
console.log('─────────────────────────────────────────────────────────────────────');
console.log('Example 5: Reverse - 1 USD → Z');
console.log('─────────────────────────────────────────────────────────────────────');

const reverseUsd = convertCurrencyToZynk(1, 'USD');
console.log(`Input:  ${reverseUsd.input.amount} ${reverseUsd.input.currency}`);
console.log(`Output: ${reverseUsd.output.amount} ${reverseUsd.output.currency}`);
console.log(`Formula: ${reverseUsd.conversion.formula}`);
console.log();

// ─────────────────────────────────────────────────────────────────────────────
// Example 6: Reverse conversion - 0.001 BTC → Z
// ─────────────────────────────────────────────────────────────────────────────
console.log('─────────────────────────────────────────────────────────────────────');
console.log('Example 6: Reverse - 0.001 BTC → Z');
console.log('─────────────────────────────────────────────────────────────────────');

const reverseBtc = convertCurrencyToZynk(0.001, 'BTC');
console.log(`Input:  ${reverseBtc.input.amount} ${reverseBtc.input.currency}`);
console.log(`Output: ${reverseBtc.output.amount} ${reverseBtc.output.currency}`);
console.log(`Formula: ${reverseBtc.conversion.formula}`);
console.log();

// ─────────────────────────────────────────────────────────────────────────────
// Batch Conversion: 1000 Z to all major currencies
// ─────────────────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════════');
console.log('           BATCH CONVERSION: 1000 Z TO ALL CURRENCIES              ');
console.log('═══════════════════════════════════════════════════════════════════\n');

const batchResult = convertZynkToMultiple(1000, [
  'USD', 'EUR', 'GBP', 'INR', 'AED', 'JPY',
  'USDT', 'BTC', 'ETH', 'SOL'
]);

console.log('FIAT CURRENCIES:');
console.log('────────────────');
['USD', 'EUR', 'GBP', 'INR', 'AED', 'JPY'].forEach(code => {
  const r = batchResult.conversions[code];
  if (r.success) {
    console.log(`  ${code.padEnd(4)} ${r.output.symbol}${r.output.amount.toLocaleString().padStart(12)}`);
  }
});

console.log('\nCRYPTOCURRENCIES:');
console.log('─────────────────');
['USDT', 'BTC', 'ETH', 'SOL'].forEach(code => {
  const r = batchResult.conversions[code];
  if (r.success) {
    console.log(`  ${code.padEnd(5)} ${r.output.amount.toFixed(8)}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Supported Currencies
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('                    SUPPORTED CURRENCIES                            ');
console.log('═══════════════════════════════════════════════════════════════════\n');

const supported = getSupportedCurrencies();
console.log(`Fiat (${supported.fiat.length}):   ${supported.fiat.join(', ')}`);
console.log(`Crypto (${supported.crypto.length}): ${supported.crypto.join(', ')}`);

// ─────────────────────────────────────────────────────────────────────────────
// Format Helper Example
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('                    FORMAT HELPER EXAMPLES                          ');
console.log('═══════════════════════════════════════════════════════════════════\n');

console.log(`formatZynkValue(100, 'USD'): ${formatZynkValue(100, 'USD')}`);
console.log(`formatZynkValue(500, 'EUR'): ${formatZynkValue(500, 'EUR')}`);
console.log(`formatZynkValue(1000, 'BTC'): ${formatZynkValue(1000, 'BTC')}`);

// ─────────────────────────────────────────────────────────────────────────────
// Error Handling Example
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('                    ERROR HANDLING EXAMPLES                         ');
console.log('═══════════════════════════════════════════════════════════════════\n');

const invalidCurrency = convertZynkToCurrency(100, 'INVALID');
console.log('Invalid currency code:');
console.log(`  Success: ${invalidCurrency.success}`);
console.log(`  Error: ${invalidCurrency.error}`);
console.log(`  Code: ${invalidCurrency.code}`);

const invalidAmount = convertZynkToCurrency(-100, 'USD');
console.log('\nNegative amount:');
console.log(`  Success: ${invalidAmount.success}`);
console.log(`  Error: ${invalidAmount.error}`);

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('                         CONVERSION SUMMARY                         ');
console.log('═══════════════════════════════════════════════════════════════════\n');

console.log('┌─────────────────────────────────────────────────────────────────┐');
console.log('│  Zynk (Z) Conversion Reference                                  │');
console.log('├─────────────────────────────────────────────────────────────────┤');
console.log(`│  1 Z = ₹${ZYNK_TO_INR_RATE} INR (fixed peg)                                     │`);
console.log(`│  1 Z = $${convertZynkToCurrency(1, 'USD').output.amount} USD                                            │`);
console.log(`│  1 Z = €${convertZynkToCurrency(1, 'EUR').output.amount} EUR                                            │`);
console.log(`│  1 Z = ${convertZynkToCurrency(1, 'BTC').output.amount.toFixed(8)} BTC                              │`);
console.log('├─────────────────────────────────────────────────────────────────┤');
console.log('│  Precision: Fiat = 2 decimals, Crypto = 8 decimals              │');
console.log('│  Formula: Z → Target = (Z × 100) ÷ INR_rate                     │');
console.log('│  Formula: Target → Z = (Amount × INR_rate) ÷ 100                │');
console.log('└─────────────────────────────────────────────────────────────────┘');
console.log();
