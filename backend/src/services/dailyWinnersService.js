const db = require('../config/database');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DailyWinnersTemplate = require('./dailyWinnersTemplate');

// Per-SMM-order pacing — every order placed against the panel waits a random
// 3–5s first so cheap panels don't drop bursts. Applied inside placeSmmOrder
// so every caller (predictions, winners batch, etc.) gets the same pacing.
const SMM_ORDER_DELAY_MIN_MS = 3000;
const SMM_ORDER_DELAY_MAX_MS = 5000;
function randomSmmOrderDelayMs() {
  return SMM_ORDER_DELAY_MIN_MS
    + crypto.randomInt(0, SMM_ORDER_DELAY_MAX_MS - SMM_ORDER_DELAY_MIN_MS + 1);
}

const PAYMENT_TEMPLATES_DIR = path.join(__dirname, 'paymentTemplates');
const paymentTemplateCache = {};

function loadPaymentTemplate(platform) {
  const file = path.join(PAYMENT_TEMPLATES_DIR, `${platform}.html`);
  if (!fs.existsSync(file)) return null;
  const html = fs.readFileSync(file, 'utf8');
  return html;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const INDIAN_BANKS = [
  'HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Mahindra',
  'Punjab National Bank', 'Bank of Baroda', 'Yes Bank', 'IDFC First Bank', 'Union Bank',
];
const UPI_HANDLES = ['@okhdfcbank', '@okicici', '@oksbi', '@okaxis', '@ybl', '@paytm', '@apl', '@ptyes'];

// Status-bar randomization pool for SMS-style templates. Each render picks a
// network label, battery %, signal-bar fill, and a handful of notification
// icons so two side-by-side screenshots don't look like duplicates.
const STATUSBAR_NET_LABELS = ['5G', '4G', 'LTE', 'H+', '5G+'];
const STATUSBAR_ICON_POOL = [
  // calendar / square
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="#555" stroke-width="2.4"/></svg>',
  // camera / instagram
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="5" stroke="#555" stroke-width="2"/><circle cx="12" cy="12" r="3.5" stroke="#555" stroke-width="2"/><circle cx="17" cy="7" r="1.2" fill="#555"/></svg>',
  // messenger M
  '<span style="font-weight:900;color:#555;font-size:13px;line-height:1;">M</span>',
  // mail
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="12" rx="2" stroke="#555" stroke-width="2"/><path d="M3 7l9 7 9-7" stroke="#555" stroke-width="2" stroke-linecap="round"/></svg>',
  // bluetooth
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M7 7l10 10-5 5V2l5 5L7 17" stroke="#555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  // headphones
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M4 12a8 8 0 0 1 16 0v6h-3v-8h3M4 12v6h3v-8H4" stroke="#555" stroke-width="2" stroke-linejoin="round"/></svg>',
  // alarm clock
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="13" r="8" stroke="#555" stroke-width="2"/><path d="M12 9v4l3 2" stroke="#555" stroke-width="2" stroke-linecap="round"/></svg>',
  // mute speaker
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 9H4v6h5l5 4V5L9 9z" fill="#555"/><path d="M17 9l4 6M21 9l-4 6" stroke="#555" stroke-width="2" stroke-linecap="round"/></svg>',
  // location pin
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z" stroke="#555" stroke-width="2"/><circle cx="12" cy="9" r="2.5" stroke="#555" stroke-width="2"/></svg>',
  // wifi
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M2 9c5.5-5.5 14.5-5.5 20 0M5 12c4-4 10-4 14 0M8 15c2-2 6-2 8 0" stroke="#555" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="19" r="1.4" fill="#555"/></svg>',
];

// Bank-SMS sender profiles used by SMS-style templates (sbi.html etc.). Each
// render picks one so the header sender ID, in-message user phrase, and
// signoff all reference the same bank.
const SMS_BANK_PROFILES = [
  { senderId: 'JD-SBIUPI-S', userPhrase: 'SBI User',     signoff: '-SBI' },
  { senderId: 'AD-HDFCBK',   userPhrase: 'HDFC Customer', signoff: '-HDFC Bank' },
  { senderId: 'VK-ICICIB',   userPhrase: 'ICICI Customer', signoff: '-ICICI Bank' },
  { senderId: 'JK-AXISBK',   userPhrase: 'Axis Customer', signoff: '-Axis Bank' },
  { senderId: 'AX-KOTAKB',   userPhrase: 'Kotak Customer', signoff: '-Kotak Bank' },
];

function numberToIndianWords(num) {
  if (num === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const twoDig = (n) => n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  const threeDig = (n) => {
    const h = Math.floor(n / 100), r = n % 100;
    let s = '';
    if (h) s += ones[h] + ' Hundred';
    if (r) s += (s ? ' ' : '') + twoDig(r);
    return s;
  };
  let n = Math.floor(num);
  let result = '';
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) result += twoDig(crore) + ' Crore ';
  if (lakh) result += twoDig(lakh) + ' Lakh ';
  if (thousand) result += twoDig(thousand) + ' Thousand ';
  if (n) result += threeDig(n) + ' ';
  return 'Rupees ' + result.trim() + ' Only';
}

function slugifyName(name) {
  return (name || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
}

function formatStatusBarTime(date) {
  return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function buildPaymentVars(winner, draw, details = DEFAULT_PAYMENT_DETAILS) {
  const cfg = { ...DEFAULT_PAYMENT_DETAILS, ...(details || {}) };
  const data = winner.json_data || {};
  const amount = Number(winner.amount);
  const now = new Date();
  const paymentAt = new Date(now.getTime() - 20 * 60_000);
  const statusBarAt = new Date(paymentAt.getTime() + 10 * 60_000);
  const nameInitial = (winner.name || '?').trim().charAt(0).toUpperCase();
  const name = (winner.name || '').trim();
  const parts = name.split(/\s+/);
  const initials = (parts[0]?.[0] || 'U') + (parts[1]?.[0] || '');
  const bank = cfg.bankName || INDIAN_BANKS[Math.floor(Math.random() * INDIAN_BANKS.length)];
  const bankLast4 = String(Math.floor(1000 + Math.random() * 9000));
  const handle = cfg.recipientUpiHandle || UPI_HANDLES[Math.floor(Math.random() * UPI_HANDLES.length)];
  const senderName = cfg.senderName || 'Sachin Kumar';
  const senderInitial = senderName.trim().charAt(0).toUpperCase();
  const senderParts = senderName.trim().split(/\s+/);
  const senderInitials = ((senderParts[0]?.[0] || '') + (senderParts[1]?.[0] || '')).toUpperCase();
  const senderUpiId = cfg.senderUpiId || ('6' + Math.floor(100000000 + Math.random() * 899999999) + '@ptyes');
  const smsBank = SMS_BANK_PROFILES[Math.floor(Math.random() * SMS_BANK_PROFILES.length)];

  // Status-bar randomization. Bars and icons are emitted as ready-to-inject
  // HTML so the template stays a flat string substitution.
  const statusBarNet = STATUSBAR_NET_LABELS[Math.floor(Math.random() * STATUSBAR_NET_LABELS.length)];
  const statusBarBattery = String(Math.floor(Math.random() * 81) + 15); // 15..95
  const barsFilled = 2 + Math.floor(Math.random() * 3); // 2..4 of 4 bars lit
  const statusBarBarsHtml = [4, 6, 8, 10].map((h, i) =>
    `<span style="width:2px;height:${h}px;background:#1a1a1a;opacity:${i < barsFilled ? 1 : 0.3};"></span>`
  ).join('');
  const iconPool = [...STATUSBAR_ICON_POOL];
  const iconCount = 3 + Math.floor(Math.random() * 2); // 3..4 unique icons
  const pickedIcons = [];
  for (let i = 0; i < iconCount && iconPool.length; i++) {
    pickedIcons.push(iconPool.splice(Math.floor(Math.random() * iconPool.length), 1)[0]);
  }
  const statusBarLeftIconsHtml = pickedIcons.map(html => `<span class="ic">${html}</span>`).join('')
    + '<span class="dot"></span>';

  return {
    name,
    nameUpper: name.toUpperCase(),
    nameInitial,
    nameInitials: initials.toUpperCase(),
    amount: String(amount),
    amountFormatted: amount.toLocaleString('en-IN', { maximumFractionDigits: 0 }),
    amountWords: numberToIndianWords(amount),
    platform: (data.platform || '').toUpperCase(),
    utr: data.utr || '',
    txnId: data.txnId || data.orderId || data.refId || data.utr || '',
    refId: data.refId || data.txnId || data.utr || '',
    orderId: data.orderId || data.txnId || data.utr || '',
    upiTxnId: data.txnId || data.utr || '',
    mobikwikOrderId: data.orderId || ('ICI' + Math.random().toString(16).slice(2, 14) + Math.floor(10000 + Math.random() * 89999)),
    amazonRefId: 'PTM' + Math.random().toString(16).slice(2, 18) + Math.random().toString(16).slice(2, 10),
    bankName: bank,
    bankLast4,
    accountMask: 'XXXXXXXX' + bankLast4,
    upiHandle: handle,
    senderName,
    senderInitial,
    senderInitials,
    senderUpiId,
    recipientUpiId: slugifyName(name) + handle,
    brandLine: cfg.brandLine,
    supportName: cfg.supportName,
    date: paymentAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    dateShort: paymentAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }),
    weekday: paymentAt.toLocaleDateString('en-IN', { weekday: 'long' }),
    dayMonth: paymentAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    // Compact SBI-SMS style date — "01May26" with no spaces.
    dateSms: String(paymentAt.getDate()).padStart(2, '0')
      + paymentAt.toLocaleDateString('en-US', { month: 'short' })
      + String(paymentAt.getFullYear()).slice(-2),
    time: paymentAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
    time12: paymentAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    pastTime12: paymentAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    statusBarTime: formatStatusBarTime(statusBarAt),
    dateTime: paymentAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' +
              paymentAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    periodId: draw.period_id || '',
    smsSenderId: smsBank.senderId,
    smsUserPhrase: smsBank.userPhrase,
    smsSignoff: smsBank.signoff,
    statusBarNet,
    statusBarBattery,
    statusBarBarsHtml,
    statusBarLeftIconsHtml,
  };
}

const DEFAULT_CAPTION_TEMPLATE =
  `🎉 <b>Today's Winners</b> — Draw #{{periodId}}\n` +
  `💰 Total Payout: {{totalPayoutFormatted}}\n` +
  `🏆 {{winnersCount}} lucky players cashed out!\n\n` +
  `Play at lootmarket.store`;

const CAPTION_SETTING_KEY = 'daily_winners_caption_template';
const PAYMENT_DETAILS_SETTING_KEY = 'payment_template_details';
const SMM_PANEL_SETTING_KEY = 'smm_panel_config';
const PAYMENT_TEMPLATES_ACTIVE_KEY = 'payment_templates_active';

const DEFAULT_PAYMENT_DETAILS = {
  senderName: 'Sachin Kumar',
  senderUpiId: '9090902920@ptyes',
  bankName: 'Punjab National Bank',
  recipientUpiHandle: '@okhdfcbank',
  brandLine: 'LOOT Market Winner',
  supportName: 'LOOT Market',
};

const DEFAULT_SMM_PANEL_CONFIG = {
  enabled: false,
  apiUrl: 'https://cheapestsmmpanels.com/api/v2',
  apiKey: '',
  viewsServiceId: '',
  viewsQuantity: 1000,
  viewsEnabled: true,
  reactionsServiceId: '',
  reactionsQuantity: 100,
  reactionsEnabled: true,
};

function formatINR(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function buildCaptionVars(draw, winners) {
  const totalPayout = winners.reduce((s, w) => s + Number(w.amount), 0);
  const top = winners.length
    ? winners.reduce((a, b) => (Number(a.amount) >= Number(b.amount) ? a : b))
    : null;
  const now = new Date();
  return {
    periodId: draw.period_id || '',
    drawId: String(draw.id || ''),
    winningNumber: draw.winning_number || '',
    winnersCount: String(winners.length),
    totalPayout: String(totalPayout),
    totalPayoutFormatted: formatINR(totalPayout),
    topWinnerName: top ? top.name : '',
    topWinnerAmount: top ? String(top.amount) : '',
    topWinnerAmountFormatted: top ? formatINR(top.amount) : '',
    date: now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
  };
}

function renderTemplate(tpl, vars) {
  return String(tpl).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : `{{${key}}}`
  );
}

// Names + masking helpers live in utils/randomNames so the live activity
// feed and this winners feed share one pool. See that file for pool details.
const { FIRST_NAMES, LAST_NAMES, rand, randomChoice, maskName } = require('../utils/randomNames');

const PLATFORMS = ['phonepe', 'gpay', 'paytm', 'fampay', 'mobikwik', 'amazonpay'];

function randomDigits(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += rand(0, 9);
  return s;
}

function randomAlnum(n) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += chars[rand(0, chars.length - 1)];
  return s;
}

function generateJsonData(platform) {
  if (!platform) platform = randomChoice(PLATFORMS);
  const utr = randomDigits(12);
  const base = { platform, type: 'UPI', utr };
  switch (platform) {
    case 'phonepe':
      return { ...base, txnId: 'T' + randomDigits(16) };
    case 'gpay':
      return { ...base, txnId: 'CICAgID' + randomAlnum(10) };
    case 'paytm':
      return { ...base, orderId: 'PAYTM' + randomDigits(13) };
    case 'fampay':
      return { ...base, refId: 'FMPIB' + randomDigits(10) };
    case 'mobikwik':
      return { ...base, orderId: 'ICI' + randomAlnum(10).toLowerCase() + randomDigits(5), txnId: randomDigits(12) };
    case 'amazonpay':
      return { ...base, refId: 'PTM' + randomAlnum(16).toLowerCase(), txnId: randomDigits(12) };
    default:
      return base;
  }
}

// Fisher–Yates shuffle on a copy. Used so the round-robin platform sequence
// doesn't always start with the same template — fairer when count % active != 0.
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Sample without replacement: build (first, last) pairs and reject ones we've
// already produced this run, so the same masked name never appears twice in
// a single draw. `activePlatforms` is the (shuffled) list of payment templates
// to cycle through — each generated winner gets the next platform round-robin
// so coverage is balanced (12 winners × 3 active → 4 each).
function generateWinners(count, activePlatforms) {
  const platforms = (Array.isArray(activePlatforms) && activePlatforms.length)
    ? shuffleArray(activePlatforms)
    : PLATFORMS;
  const rows = [];
  const seen = new Set();
  // Cap attempts so a low-pool / huge-count call can't loop forever.
  const maxAttempts = count * 12;
  let attempts = 0;
  let platformIdx = 0;

  while (rows.length < count && attempts < maxAttempts) {
    attempts++;
    const first = randomChoice(FIRST_NAMES);
    const last = randomChoice(LAST_NAMES);
    const style = rand(0, 9) === 0 ? 2 : rand(0, 1); // ~10% chance of full name
    const display = maskName(first, last, style);
    if (seen.has(display)) continue;
    seen.add(display);

    const platform = platforms[platformIdx % platforms.length];
    platformIdx++;
    const amount = rand(500, 900) * 100; // ₹50,000 – ₹90,000
    rows.push({
      name: display,
      amount,
      json_data: generateJsonData(platform),
    });
  }
  return rows.sort((a, b) => b.amount - a.amount);
}

class DailyWinnersService {
  constructor() {
    this.telegramToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.telegramChatId = process.env.TELEGRAM_WINNERS_CHANNEL_ID || '';
    // Wired in from index.js. When set, SMM orders go through the queue
    // (asynchronous, paced) instead of calling the panel synchronously.
    this.smmQueueService = null;
  }

  setSmmQueueService(svc) {
    this.smmQueueService = svc;
  }

  // Helper: enqueue an SMM job for a post URL with a context label, or
  // fall back to the legacy in-flight call if the queue isn't wired (in
  // unit tests or before the boot wiring completes).
  async _enqueueOrCallSmm(postUrl, contextLabel, log) {
    if (!postUrl) return { skipped: true, reason: 'no_post_url', placed: 0 };
    if (this.smmQueueService) {
      const id = await this.smmQueueService.enqueue({ postUrl, contextLabel });
      if (id) log?.info?.(`SMM queued #${id} for ${postUrl} [${contextLabel}]`);
      return { queued: true, queueId: id, placed: 0 };
    }
    return this.placeSmmOrdersForPost(postUrl, log);
  }

  async getPaymentDetailsConfig() {
    const [rows] = await db.pool.query(
      'SELECT setting_value FROM settings WHERE setting_key = ?',
      [PAYMENT_DETAILS_SETTING_KEY]
    );
    if (rows.length && rows[0].setting_value) {
      try {
        return { ...DEFAULT_PAYMENT_DETAILS, ...JSON.parse(rows[0].setting_value) };
      } catch (_) {
        return { ...DEFAULT_PAYMENT_DETAILS };
      }
    }
    return { ...DEFAULT_PAYMENT_DETAILS };
  }

  async savePaymentDetailsConfig(config) {
    const merged = { ...DEFAULT_PAYMENT_DETAILS, ...(config || {}) };
    await db.pool.query(
      `INSERT INTO settings (setting_key, setting_value, description)
       VALUES (?, ?, 'Dynamic fields used in payment screenshot templates')
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [PAYMENT_DETAILS_SETTING_KEY, JSON.stringify(merged)]
    );
    return merged;
  }

  getDefaultPaymentDetails() {
    return { ...DEFAULT_PAYMENT_DETAILS };
  }

  getPaymentDetailsSchema() {
    return [
      { key: 'senderName', label: 'Sender Name', placeholder: 'Sachin Kumar' },
      { key: 'senderUpiId', label: 'Sender UPI ID', placeholder: '9090902920@ptyes' },
      { key: 'bankName', label: 'Bank Name', placeholder: 'Punjab National Bank' },
      { key: 'recipientUpiHandle', label: 'Recipient UPI Handle', placeholder: '@okhdfcbank' },
      { key: 'brandLine', label: 'Brand Line', placeholder: 'LOOT Market Winner' },
      { key: 'supportName', label: 'Support Name', placeholder: 'LOOT Market' },
    ];
  }

  async getSmmPanelConfig() {
    const [rows] = await db.pool.query(
      'SELECT setting_value FROM settings WHERE setting_key = ?',
      [SMM_PANEL_SETTING_KEY]
    );
    if (rows.length && rows[0].setting_value) {
      try {
        return { ...DEFAULT_SMM_PANEL_CONFIG, ...JSON.parse(rows[0].setting_value) };
      } catch (_) {
        return { ...DEFAULT_SMM_PANEL_CONFIG };
      }
    }
    return { ...DEFAULT_SMM_PANEL_CONFIG };
  }

  async saveSmmPanelConfig(config) {
    const merged = { ...DEFAULT_SMM_PANEL_CONFIG, ...(config || {}) };
    merged.viewsQuantity = Math.max(0, parseInt(merged.viewsQuantity, 10) || 0);
    merged.reactionsQuantity = Math.max(0, parseInt(merged.reactionsQuantity, 10) || 0);
    merged.enabled = Boolean(merged.enabled);
    merged.viewsEnabled = Boolean(merged.viewsEnabled);
    merged.reactionsEnabled = Boolean(merged.reactionsEnabled);
    await db.pool.query(
      `INSERT INTO settings (setting_key, setting_value, description)
       VALUES (?, ?, 'SMM panel API config for auto-ordering views/reactions on Telegram posts')
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [SMM_PANEL_SETTING_KEY, JSON.stringify(merged)]
    );
    return merged;
  }

  getDefaultSmmPanelConfig() {
    return { ...DEFAULT_SMM_PANEL_CONFIG };
  }

  getSmmPanelSchema() {
    return [
      { key: 'enabled', label: 'Enabled', type: 'boolean' },
      { key: 'apiUrl', label: 'API URL', placeholder: 'https://cheapestsmmpanels.com/api/v2' },
      { key: 'apiKey', label: 'API Key', placeholder: 'your-panel-api-key', secret: true },
      { key: 'viewsEnabled', label: 'Order Views', type: 'boolean' },
      { key: 'viewsServiceId', label: 'Views Service ID', placeholder: 'e.g. 1234' },
      { key: 'viewsQuantity', label: 'Views Quantity', type: 'number', placeholder: '1000' },
      { key: 'reactionsEnabled', label: 'Order Reactions', type: 'boolean' },
      { key: 'reactionsServiceId', label: 'Reactions Service ID', placeholder: 'e.g. 5678' },
      { key: 'reactionsQuantity', label: 'Reactions Quantity', type: 'number', placeholder: '100' },
    ];
  }

  async placeSmmOrder(cfg, { serviceId, quantity, link, kind, log }) {
    await sleep(randomSmmOrderDelayMs());
    const body = new URLSearchParams({
      key: cfg.apiKey,
      action: 'add',
      service: String(serviceId),
      link,
      quantity: String(quantity),
    });
    // Retry once on transient panel errors (429, 5xx, network blip). Cheap
    // SMM panels frequently drop a request under burst load.
    const maxAttempts = 2;
    let lastErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(cfg.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        });
        const text = await res.text();
        let parsed;
        try { parsed = JSON.parse(text); } catch (_) { parsed = { raw: text }; }
        if (!res.ok || parsed.error) {
          const errMsg = `SMM ${kind} order failed: ${res.status} ${parsed.error || text}`;
          const transient = res.status === 429 || res.status >= 500;
          if (transient && attempt < maxAttempts) {
            await sleep(2000);
            continue;
          }
          throw new Error(errMsg);
        }
        log.info(`SMM ${kind} order placed: id=${parsed.order || '?'} qty=${quantity} link=${link}`);
        return { orderId: parsed.order || null, response: parsed };
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts && !/SMM .* order failed:/.test(err.message)) {
          await sleep(2000);
          continue;
        }
        throw err;
      }
    }
    throw lastErr || new Error(`SMM ${kind} order failed after ${maxAttempts} attempts`);
  }

  async placeSmmOrdersForPost(postUrl, log, opts = {}) {
    if (!postUrl) {
      log.warn('SMM: Telegram send succeeded but no postUrl was derived — skipping orders (likely missing chat.username on a private channel)');
      return { skipped: true, reason: 'no_post_url', placed: 0 };
    }
    let cfg = await this.getSmmPanelConfig();
    // Webhook posts override the views/reactions enable flags + quantities,
    // reusing the global panel's API creds + service IDs. The webhook has its
    // own master switch (checked before enqueue), so it is not gated on the
    // global `enabled` flag.
    const ov = opts.configOverride || null;
    if (ov) {
      cfg = {
        ...cfg,
        enabled: true,
        viewsEnabled: !!ov.viewsEnabled,
        viewsQuantity: Math.max(0, parseInt(ov.viewsQuantity, 10) || 0),
        reactionsEnabled: !!ov.reactionsEnabled,
        reactionsQuantity: Math.max(0, parseInt(ov.reactionsQuantity, 10) || 0),
      };
    }
    if (!cfg.enabled) {
      log.info('SMM: disabled in settings — skipping orders');
      return { skipped: true, reason: 'disabled', placed: 0 };
    }
    if (!cfg.apiKey || !cfg.apiUrl) {
      log.warn('SMM: apiKey or apiUrl missing — skipping orders');
      return { skipped: true, reason: 'missing_credentials', placed: 0 };
    }

    log.info(`SMM: queueing orders for ${postUrl}`);
    const results = { skipped: false, placed: 0, views: null, reactions: null };
    if (cfg.viewsEnabled && cfg.viewsServiceId && cfg.viewsQuantity > 0) {
      try {
        results.views = await this.placeSmmOrder(cfg, {
          serviceId: cfg.viewsServiceId,
          quantity: cfg.viewsQuantity,
          link: postUrl,
          kind: 'views',
          log,
        });
        results.placed++;
      } catch (err) {
        log.error(err.message);
        results.views = { error: err.message };
      }
    } else {
      log.info('SMM: views order skipped (disabled or missing serviceId/quantity)');
    }
    if (cfg.reactionsEnabled && cfg.reactionsServiceId && cfg.reactionsQuantity > 0) {
      try {
        results.reactions = await this.placeSmmOrder(cfg, {
          serviceId: cfg.reactionsServiceId,
          quantity: cfg.reactionsQuantity,
          link: postUrl,
          kind: 'reactions',
          log,
        });
        results.placed++;
      } catch (err) {
        log.error(err.message);
        results.reactions = { error: err.message };
      }
    } else {
      log.info('SMM: reactions order skipped (disabled or missing serviceId/quantity)');
    }
    return results;
  }

  async getCaptionTemplate() {
    const [rows] = await db.pool.query(
      'SELECT setting_value FROM settings WHERE setting_key = ?',
      [CAPTION_SETTING_KEY]
    );
    if (rows.length && rows[0].setting_value) return rows[0].setting_value;
    return DEFAULT_CAPTION_TEMPLATE;
  }

  async setCaptionTemplate(value) {
    await db.pool.query(
      `INSERT INTO settings (setting_key, setting_value, description)
       VALUES (?, ?, 'Telegram caption template for daily winners broadcast')
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [CAPTION_SETTING_KEY, value]
    );
  }

  getDefaultCaptionTemplate() {
    return DEFAULT_CAPTION_TEMPLATE;
  }

  getCaptionVariables() {
    return [
      { name: 'periodId', description: 'Draw period id' },
      { name: 'drawId', description: 'Internal draw numeric id' },
      { name: 'winningNumber', description: 'The winning number of the draw' },
      { name: 'winnersCount', description: 'Number of daily winner rows' },
      { name: 'totalPayout', description: 'Raw total payout amount' },
      { name: 'totalPayoutFormatted', description: 'Formatted total, e.g. ₹1,23,456' },
      { name: 'topWinnerName', description: 'Name of the highest paid winner' },
      { name: 'topWinnerAmount', description: 'Raw amount of the top winner' },
      { name: 'topWinnerAmountFormatted', description: 'Formatted top-winner amount' },
      { name: 'date', description: 'Current date, e.g. 11 Apr 2026' },
      { name: 'time', description: 'Current time, e.g. 13:42' },
    ];
  }

  renderCaption(template, draw, winners) {
    return renderTemplate(template, buildCaptionVars(draw, winners));
  }

  createLogger() {
    const entries = [];
    const push = (level, msg) => {
      const line = { ts: new Date().toISOString(), level, msg: String(msg) };
      entries.push(line);
      const prefix = `[DailyWinners]`;
      if (level === 'error') console.error(prefix, msg);
      else console.log(prefix, msg);
    };
    return {
      entries,
      info: (m) => push('info', m),
      warn: (m) => push('warn', m),
      error: (m) => push('error', m),
    };
  }

  async insertForDraw(draw, log) {
    const count = rand(10, 15);
    const activePlatforms = await this.getActivePlatforms();
    const winners = generateWinners(count, activePlatforms);
    const values = winners.map(w => [w.name, w.amount, draw.id, JSON.stringify(w.json_data)]);

    log.info(`Generating ${count} synthetic winners for draw ${draw.period_id} (id=${draw.id}) across ${activePlatforms.length} active templates: ${activePlatforms.join(', ')}`);

    await db.pool.query(
      `INSERT INTO daily_winners (name, amount, draw_id, json_data) VALUES ?`,
      [values]
    );

    log.info(`Inserted ${count} rows into daily_winners`);
    return winners;
  }

  // Generate a count-range of synthetic winners and post one payment screenshot
  // per winner to the configured Telegram channel — used by the Prediction
  // Module's 30-minutes-after-prediction batch. Unlike `processDrawComplete`,
  // there is no underlying lottery draw, no summary card, and the
  // `daily_winners.draw_id` column is left NULL (migration 063 made it
  // nullable).
  async sendSyntheticWinnersBatch({
    minCount = 10,
    maxCount = 15,
    tag = 'batch',
  } = {}) {
    const log = this.createLogger();
    const startedAt = Date.now();
    let winners = [];
    let screenshotsSent = 0;
    let smmOrdersPlaced = 0;
    let success = false;
    let errorMsg = null;

    const lo = Math.max(1, parseInt(minCount, 10) || 1);
    const hi = Math.max(lo, parseInt(maxCount, 10) || lo);
    const count = rand(lo, hi);
    const periodId = `SCHED-${tag}-${Date.now()}`;

    let browser = null;
    try {
      const activePlatforms = await this.getActivePlatforms();
      log.info(`=== sendSyntheticWinnersBatch start (${count} winners, tag=${tag}, ${activePlatforms.length} active templates: ${activePlatforms.join(', ')}) ===`);
      winners = generateWinners(count, activePlatforms);

      // Persist with draw_id = NULL so the social-proof feed still shows these
      // rows on /api/lottery/winners.
      if (winners.length) {
        const values = winners.map(w => [w.name, w.amount, null, JSON.stringify(w.json_data)]);
        await db.pool.query(
          `INSERT INTO daily_winners (name, amount, draw_id, json_data) VALUES ?`,
          [values]
        );
        log.info(`Inserted ${winners.length} synthetic winner rows (draw_id=NULL)`);
      }

      browser = await this.launchBrowser(log);
      const paymentDetails = await this.getPaymentDetailsConfig();
      const fauxDraw = { id: 0, period_id: periodId, winning_number: '' };

      log.info(`Sending ${winners.length} payment screenshots with 3–5s jitter between each`);
      for (let i = 0; i < winners.length; i++) {
        const winner = winners[i];
        const platform = (winner.json_data?.platform || 'phonepe').toLowerCase();
        try {
          const html = this.renderPaymentScreenshot(winner, fauxDraw, paymentDetails);
          if (!html) {
            log.warn(`No template for platform '${platform}', skipping winner ${i + 1}`);
            continue;
          }
          const png = await this.renderHtmlToPng(browser, html, { width: 400, height: 870, mode: 'viewport' });
          const result = await this.sendToTelegram(png, '', log);
          if (!result.skipped) {
            screenshotsSent++;
            const smm = await this._enqueueOrCallSmm(result.postUrl, `winners-screenshot:${tag}`, log);
            smmOrdersPlaced += smm.placed || 0;
          }
          log.info(`[${i + 1}/${winners.length}] ${winner.name} (${platform}) sent`);
        } catch (err) {
          log.error(`Screenshot ${i + 1}/${winners.length} failed: ${err.message}`);
        }

        if (i < winners.length - 1) {
          await sleep(rand(3000, 5000));
        }
      }

      success = true;
      log.info(`=== batch done in ${Date.now() - startedAt}ms, ${screenshotsSent}/${winners.length} screenshots, ${smmOrdersPlaced} SMM orders ===`);
    } catch (err) {
      errorMsg = err.message || String(err);
      log.error(`sendSyntheticWinnersBatch failed: ${errorMsg}`);
    } finally {
      if (browser) {
        try { await browser.close(); log.info('Puppeteer closed'); } catch (_) {}
      }
    }

    return {
      success,
      error: errorMsg,
      tag,
      periodId,
      winnersCount: winners.length,
      screenshotsSent,
      smmOrdersPlaced,
      durationMs: Date.now() - startedAt,
      logs: log.entries,
    };
  }

  async launchBrowser(log) {
    let puppeteer;
    try {
      puppeteer = require('puppeteer');
    } catch (err) {
      throw new Error('puppeteer not installed — run `npm install puppeteer` in backend/');
    }
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
    log.info(`Launching puppeteer (headless Chromium)${executablePath ? ` at ${executablePath}` : ''}`);
    return puppeteer.launch({
      headless: 'new',
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
  }

  async renderHtmlToPng(browser, html, { width, height, mode = 'body' }) {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width, height, deviceScaleFactor: 2 });
      await page.setContent(html, { waitUntil: 'networkidle0' });
      if (mode === 'viewport') {
        // Fixed aspect ratio — clip to viewport, ignoring natural body size
        return await page.screenshot({
          type: 'png',
          omitBackground: false,
          clip: { x: 0, y: 0, width, height },
        });
      }
      const element = await page.$('body');
      return await element.screenshot({ type: 'png', omitBackground: false });
    } finally {
      await page.close();
    }
  }

  renderPaymentScreenshot(winner, draw, details) {
    const data = winner.json_data || {};
    const platform = (data.platform || 'phonepe').toLowerCase();
    const tpl = loadPaymentTemplate(platform) || loadPaymentTemplate('phonepe');
    if (!tpl) return null;
    return renderTemplate(tpl, buildPaymentVars(winner, draw, details));
  }

  // ===== Payment template management (for admin editor) =====

  listPaymentTemplates() {
    if (!fs.existsSync(PAYMENT_TEMPLATES_DIR)) return [];
    return fs.readdirSync(PAYMENT_TEMPLATES_DIR)
      .filter(f => f.endsWith('.html'))
      .map(f => f.replace(/\.html$/, ''))
      .sort();
  }

  // Returns { phonepe: true, gpay: false, ... } for every .html file currently
  // on disk. Any template not yet in the settings blob defaults to active, so
  // dropping a new file into paymentTemplates/ makes it participate immediately.
  async getTemplateActiveStates() {
    const [rows] = await db.pool.query(
      'SELECT setting_value FROM settings WHERE setting_key = ?',
      [PAYMENT_TEMPLATES_ACTIVE_KEY]
    );
    let stored = {};
    if (rows.length && rows[0].setting_value) {
      try { stored = JSON.parse(rows[0].setting_value) || {}; } catch (_) {}
    }
    const onDisk = this.listPaymentTemplates();
    const result = {};
    for (const p of onDisk) {
      // Only an explicit `false` deactivates — unseen platforms default active.
      result[p] = stored[p] !== false;
    }
    return result;
  }

  // List with active flag for the admin UI.
  async listPaymentTemplatesWithState() {
    const states = await this.getTemplateActiveStates();
    return Object.keys(states).map(platform => ({ platform, active: states[platform] }));
  }

  async setTemplateActive(platform, active) {
    this._validatePlatformName(platform);
    // Reject toggling for a non-existent template so the settings blob
    // doesn't accumulate dead keys.
    const onDisk = this.listPaymentTemplates();
    if (!onDisk.includes(platform)) {
      throw new Error(`Unknown payment template: ${platform}`);
    }
    const [rows] = await db.pool.query(
      'SELECT setting_value FROM settings WHERE setting_key = ?',
      [PAYMENT_TEMPLATES_ACTIVE_KEY]
    );
    let stored = {};
    if (rows.length && rows[0].setting_value) {
      try { stored = JSON.parse(rows[0].setting_value) || {}; } catch (_) {}
    }
    stored[platform] = Boolean(active);
    await db.pool.query(
      `INSERT INTO settings (setting_key, setting_value, description)
       VALUES (?, ?, 'Per-platform active flags for payment screenshot templates')
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [PAYMENT_TEMPLATES_ACTIVE_KEY, JSON.stringify(stored)]
    );
    return this.getTemplateActiveStates();
  }

  // Active platforms used by the round-robin in generateWinners. If the admin
  // has deactivated every template (or none on disk), fall back to every file
  // on disk so the winners batch never silently produces zero rows.
  async getActivePlatforms() {
    const states = await this.getTemplateActiveStates();
    const active = Object.keys(states).filter(p => states[p]);
    if (active.length) return active;
    return this.listPaymentTemplates();
  }

  _validatePlatformName(platform) {
    if (!platform || !/^[a-z0-9_-]+$/.test(platform)) {
      throw new Error('Invalid platform name (lowercase alphanumeric, dash, underscore only)');
    }
  }

  getPaymentTemplateSource(platform) {
    this._validatePlatformName(platform);
    const file = path.join(PAYMENT_TEMPLATES_DIR, `${platform}.html`);
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, 'utf8');
  }

  savePaymentTemplate(platform, html) {
    this._validatePlatformName(platform);
    if (typeof html !== 'string') throw new Error('html must be a string');
    if (html.length > 100_000) throw new Error('Template too large (max 100KB)');
    const file = path.join(PAYMENT_TEMPLATES_DIR, `${platform}.html`);
    fs.writeFileSync(file, html, 'utf8');
    delete paymentTemplateCache[platform];
  }

  getSampleWinner() {
    return {
      name: 'Rahul S.',
      amount: 24500,
      json_data: {
        platform: 'phonepe',
        utr: '235489127643',
        txnId: 'T2404111234567890',
        refId: 'FAMABC123DEF456',
        orderId: 'PAYTM1234567890123',
        type: 'UPI',
      },
    };
  }

  async renderPaymentPreviewHtml(platform, sampleOverride = {}) {
    this._validatePlatformName(platform);
    // Always read fresh from disk for preview so code edits show immediately
    delete paymentTemplateCache[platform];
    const html = loadPaymentTemplate(platform) || '';
    const details = await this.getPaymentDetailsConfig();
    const sample = { ...this.getSampleWinner(), ...sampleOverride };
    sample.json_data = { ...this.getSampleWinner().json_data, ...(sampleOverride.json_data || {}), platform };
    const draw = { id: 0, period_id: 'PREVIEW', winning_number: '0000000' };
    return renderTemplate(html, buildPaymentVars(sample, draw, details));
  }

  async renderPaymentPreviewPng(platform, sampleOverride = {}) {
    const rendered = await this.renderPaymentPreviewHtml(platform, sampleOverride);
    const log = this.createLogger();
    const browser = await this.launchBrowser(log);
    try {
      return await this.renderHtmlToPng(browser, rendered, { width: 400, height: 870, mode: 'viewport' });
    } finally {
      await browser.close();
    }
  }

  async sendToTelegram(pngBuffer, caption, log, { maxRetries = 3 } = {}) {
    if (!this.telegramToken || !this.telegramChatId) {
      log.warn('Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_WINNERS_CHANNEL_ID missing) — skipping send');
      return { skipped: true };
    }

    const url = `https://api.telegram.org/bot${this.telegramToken}/sendPhoto`;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      log.info(`Sending photo to Telegram chat ${this.telegramChatId}${attempt > 1 ? ` (retry ${attempt - 1})` : ''}`);
      const form = new FormData();
      form.append('chat_id', this.telegramChatId);
      // Empty caption → omit both fields so the photo posts bare. Used for
      // per-winner payment screenshots where the screenshot speaks for itself.
      if (caption) {
        form.append('caption', caption);
        form.append('parse_mode', 'HTML');
      }
      form.append('photo', new Blob([pngBuffer], { type: 'image/png' }), 'winners.png');

      const res = await fetch(url, { method: 'POST', body: form });
      const body = await res.text();

      if (res.ok) {
        let postUrl = null;
        let messageId = null;
        try {
          const parsed = JSON.parse(body);
          const msg = parsed.result || {};
          messageId = msg.message_id || null;
          const chat = msg.chat || {};
          if (messageId) {
            if (chat.username) {
              postUrl = `https://t.me/${chat.username}/${messageId}`;
            } else if (typeof chat.id === 'number' || typeof chat.id === 'string') {
              const internalId = String(chat.id).replace(/^-100/, '');
              postUrl = `https://t.me/c/${internalId}/${messageId}`;
            }
          }
        } catch (_) { /* non-JSON body */ }
        log.info(`Telegram broadcast OK (${res.status})${postUrl ? ` — ${postUrl}` : ''}`);
        return { skipped: false, response: body, messageId, postUrl };
      }

      // 429 = flood-wait; Telegram tells us how long to back off.
      if (res.status === 429 && attempt < maxRetries) {
        let retryAfter = 1;
        try {
          const parsed = JSON.parse(body);
          retryAfter = parsed.parameters?.retry_after || parsed.retry_after || 1;
        } catch (_) {}
        const waitMs = (Number(retryAfter) + 1) * 1000;
        log.warn(`Telegram 429 flood-wait — sleeping ${waitMs}ms then retrying (attempt ${attempt}/${maxRetries})`);
        await sleep(waitMs);
        continue;
      }

      throw new Error(`Telegram sendPhoto failed: ${res.status} ${body}`);
    }
    throw new Error(`Telegram sendPhoto failed after ${maxRetries} attempts`);
  }

  async sendTestTelegramMessage(text, { placeSmmOrders = true } = {}) {
    const log = this.createLogger();
    const startedAt = Date.now();
    if (!this.telegramToken || !this.telegramChatId) {
      return {
        success: false,
        error: 'Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_WINNERS_CHANNEL_ID missing)',
        logs: log.entries,
      };
    }

    const message = (text && String(text).trim()) ||
      `✅ <b>Test message</b> from LOOT Market admin\n<i>${new Date().toLocaleString('en-IN')}</i>`;

    try {
      log.info(`Sending test message to Telegram chat ${this.telegramChatId}`);
      const url = `https://api.telegram.org/bot${this.telegramToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.telegramChatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      const body = await res.text();
      if (!res.ok) {
        throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
      }

      let postUrl = null;
      let messageId = null;
      try {
        const parsed = JSON.parse(body);
        const msg = parsed.result || {};
        messageId = msg.message_id || null;
        const chat = msg.chat || {};
        if (messageId) {
          if (chat.username) {
            postUrl = `https://t.me/${chat.username}/${messageId}`;
          } else if (typeof chat.id === 'number' || typeof chat.id === 'string') {
            const internalId = String(chat.id).replace(/^-100/, '');
            postUrl = `https://t.me/c/${internalId}/${messageId}`;
          }
        }
      } catch (_) { /* non-JSON */ }
      log.info(`Test message sent (${res.status})${postUrl ? ` — ${postUrl}` : ''}`);

      let smm = null;
      if (placeSmmOrders) {
        smm = await this.placeSmmOrdersForPost(postUrl, log);
      } else {
        log.info('SMM: skipped by request (placeSmmOrders=false)');
      }

      return {
        success: true,
        messageId,
        postUrl,
        chatId: this.telegramChatId,
        sentText: message,
        smm,
        durationMs: Date.now() - startedAt,
        logs: log.entries,
      };
    } catch (err) {
      log.error(err.message);
      return {
        success: false,
        error: err.message,
        durationMs: Date.now() - startedAt,
        logs: log.entries,
      };
    }
  }

  async processDrawComplete(draw) {
    const log = this.createLogger();
    const startedAt = Date.now();
    let winners = [];
    let telegramResult = null;
    let success = false;
    let errorMsg = null;
    let screenshotsSent = 0;
    let smmOrdersPlaced = 0;

    let browser = null;
    try {
      log.info(`=== processDrawComplete start for draw ${draw.period_id} ===`);
      winners = await this.insertForDraw(draw, log);

      browser = await this.launchBrowser(log);

      // Load dynamic details (sender name, UPI IDs, bank, etc.) from settings once per run
      const paymentDetails = await this.getPaymentDetailsConfig();
      log.info(`Payment details loaded: sender=${paymentDetails.senderName}, bank=${paymentDetails.bankName}`);

      // 1. Send individual payment screenshots, one per winner, with 1–3s jitter
      log.info(`Sending ${winners.length} payment screenshots with 1–3s delay between each`);
      for (let i = 0; i < winners.length; i++) {
        const winner = winners[i];
        const platform = (winner.json_data?.platform || 'phonepe').toLowerCase();
        try {
          const html = this.renderPaymentScreenshot(winner, draw, paymentDetails);
          if (!html) {
            log.warn(`No template for platform '${platform}', skipping winner ${i + 1}`);
            continue;
          }
          const png = await this.renderHtmlToPng(browser, html, { width: 400, height: 870, mode: 'viewport' });
          const result = await this.sendToTelegram(png, '', log);
          if (!result.skipped) screenshotsSent++;
          log.info(`[${i + 1}/${winners.length}] ${winner.name} (${platform}) sent`);
          // Every successful Telegram send → run the SMM step. The function
          // itself decides what to do based on settings / postUrl availability
          // and logs its own skip reason.
          if (!result.skipped) {
            const smm = await this._enqueueOrCallSmm(result.postUrl, `winners-screenshot:${draw.period_id || draw.id}`, log);
            smmOrdersPlaced += smm.placed || 0;
          }
        } catch (err) {
          log.error(`Screenshot ${i + 1}/${winners.length} failed: ${err.message}`);
        }

        // Don't sleep after the last one
        if (i < winners.length - 1) {
          // Telegram channel cap is ~20 msg/min for bots; keep 3–5s spacing
          // so a 15-winner run + summary stays comfortably under the limit.
          const delay = rand(3000, 5000);
          await sleep(delay);
        }
      }

      // Longer pause before the summary card — gives Telegram's per-chat
      // counter time to recover after the burst of per-winner sends.
      await sleep(4000);

      // 2. Send summary card
      log.info('Rendering summary card');
      const summaryHtml = DailyWinnersTemplate.render({ winners, draw });
      const summaryPng = await this.renderHtmlToPng(browser, summaryHtml, { width: 900, height: 600 });
      log.info(`Summary PNG rendered: ${summaryPng.length} bytes`);

      const template = await this.getCaptionTemplate();
      const caption = this.renderCaption(template, draw, winners);
      log.info(`Caption rendered (${caption.length} chars)`);

      try {
        telegramResult = await this.sendToTelegram(summaryPng, caption, log);
        if (telegramResult && !telegramResult.skipped) {
          const smm = await this._enqueueOrCallSmm(telegramResult.postUrl, `winners-summary:${draw.period_id || draw.id}`, log);
          smmOrdersPlaced += smm.placed || 0;
        }
      } catch (err) {
        // Don't let a summary-card failure wipe out the entire run's success
        // flag — the per-winner screenshots already landed.
        log.error(`Summary card send failed: ${err.message}`);
        telegramResult = { skipped: false, error: err.message };
      }
      success = true;
      log.info(`=== done in ${Date.now() - startedAt}ms, ${screenshotsSent} screenshots + 1 summary sent, ${smmOrdersPlaced} SMM orders placed ===`);
    } catch (err) {
      errorMsg = err.message || String(err);
      log.error(`processDrawComplete failed: ${errorMsg}`);
    } finally {
      if (browser) {
        try { await browser.close(); log.info('Puppeteer closed'); }
        catch (_) {}
      }
    }

    return {
      success,
      error: errorMsg,
      drawId: draw.id,
      periodId: draw.period_id,
      winnersCount: winners.length,
      screenshotsSent,
      smmOrdersPlaced,
      telegram: telegramResult,
      durationMs: Date.now() - startedAt,
      logs: log.entries,
    };
  }
}

module.exports = DailyWinnersService;
