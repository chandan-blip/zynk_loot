const db = require('../config/database');
const fs = require('fs');
const path = require('path');
const DailyWinnersTemplate = require('./dailyWinnersTemplate');

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

function randomStatusBarTime() {
  const h = Math.floor(Math.random() * 17) + 7; // 7..23
  const m = Math.floor(Math.random() * 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
}

function buildPaymentVars(winner, draw, details = DEFAULT_PAYMENT_DETAILS) {
  const cfg = { ...DEFAULT_PAYMENT_DETAILS, ...(details || {}) };
  const data = winner.json_data || {};
  const amount = Number(winner.amount);
  const now = new Date();
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
    date: now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    dateShort: now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }),
    time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
    time12: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    statusBarTime: randomStatusBarTime(),
    dateTime: now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' +
              now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    periodId: draw.period_id || '',
  };
}

const DEFAULT_CAPTION_TEMPLATE =
  `🎉 <b>Today's Winners</b> — Draw #{{periodId}}\n` +
  `💰 Total Payout: {{totalPayoutFormatted}}\n` +
  `🏆 {{winnersCount}} lucky players cashed out!\n\n` +
  `Play at lootmarket.store`;

const CAPTION_SETTING_KEY = 'daily_winners_caption_template';
const PAYMENT_DETAILS_SETTING_KEY = 'payment_template_details';

const DEFAULT_PAYMENT_DETAILS = {
  senderName: 'Sachin Kumar',
  senderUpiId: '6299228657@ptyes',
  bankName: 'Punjab National Bank',
  recipientUpiHandle: '@okhdfcbank',
  brandLine: 'LOOT Market Winner',
  supportName: 'LOOT Market',
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

const FIRST_NAMES = [
  'Rahul', 'Amit', 'Priya', 'Neha', 'Vikram', 'Rohit', 'Anjali', 'Suresh',
  'Deepak', 'Kavita', 'Manish', 'Pooja', 'Arjun', 'Sneha', 'Karthik', 'Meera',
  'Sandeep', 'Divya', 'Rajesh', 'Shreya', 'Gaurav', 'Ritu', 'Naveen', 'Isha',
  'Ajay', 'Swati', 'Vivek', 'Anita', 'Harish', 'Nisha', 'Prakash', 'Tanvi',
  'Kiran', 'Lakshmi', 'Mohit', 'Payal', 'Saurabh', 'Aarti', 'Yogesh', 'Rekha',
];

const LAST_NAMES = [
  'Sharma', 'Verma', 'Patel', 'Kumar', 'Singh', 'Gupta', 'Reddy', 'Nair',
  'Iyer', 'Menon', 'Shah', 'Joshi', 'Das', 'Mishra', 'Yadav', 'Chauhan',
  'Agarwal', 'Bansal', 'Khan', 'Rao', 'Pillai', 'Thakur', 'Pandey', 'Saxena',
];

const PLATFORMS = ['phonepe', 'gpay', 'paytm', 'fampay', 'mobikwik', 'amazonpay'];

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[rand(0, arr.length - 1)];
}

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

function maskName(first, last) {
  return `${first} ${last[0]}.`;
}

function generateJsonData() {
  const platform = randomChoice(PLATFORMS);
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

function generateWinners(count) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const first = randomChoice(FIRST_NAMES);
    const last = randomChoice(LAST_NAMES);
    const amount = rand(5, 500) * 100; // ₹500 – ₹50,000
    rows.push({
      name: maskName(first, last),
      amount,
      json_data: generateJsonData(),
    });
  }
  return rows.sort((a, b) => b.amount - a.amount);
}

class DailyWinnersService {
  constructor() {
    this.telegramToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.telegramChatId = process.env.TELEGRAM_WINNERS_CHANNEL_ID || '';
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
      { key: 'senderUpiId', label: 'Sender UPI ID', placeholder: '6299228657@ptyes' },
      { key: 'bankName', label: 'Bank Name', placeholder: 'Punjab National Bank' },
      { key: 'recipientUpiHandle', label: 'Recipient UPI Handle', placeholder: '@okhdfcbank' },
      { key: 'brandLine', label: 'Brand Line', placeholder: 'LOOT Market Winner' },
      { key: 'supportName', label: 'Support Name', placeholder: 'LOOT Market' },
    ];
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
    const winners = generateWinners(count);
    const values = winners.map(w => [w.name, w.amount, draw.id, JSON.stringify(w.json_data)]);

    log.info(`Generating ${count} synthetic winners for draw ${draw.period_id} (id=${draw.id})`);

    await db.pool.query(
      `INSERT INTO daily_winners (name, amount, draw_id, json_data) VALUES ?`,
      [values]
    );

    log.info(`Inserted ${count} rows into daily_winners`);
    return winners;
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

  async sendToTelegram(pngBuffer, caption, log) {
    if (!this.telegramToken || !this.telegramChatId) {
      log.warn('Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_WINNERS_CHANNEL_ID missing) — skipping send');
      return { skipped: true };
    }

    log.info(`Sending photo to Telegram chat ${this.telegramChatId}`);
    const form = new FormData();
    form.append('chat_id', this.telegramChatId);
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    form.append('photo', new Blob([pngBuffer], { type: 'image/png' }), 'winners.png');

    const url = `https://api.telegram.org/bot${this.telegramToken}/sendPhoto`;
    const res = await fetch(url, { method: 'POST', body: form });
    const body = await res.text();
    if (!res.ok) {
      throw new Error(`Telegram sendPhoto failed: ${res.status} ${body}`);
    }
    log.info(`Telegram broadcast OK (${res.status})`);
    return { skipped: false, response: body };
  }

  async processDrawComplete(draw) {
    const log = this.createLogger();
    const startedAt = Date.now();
    let winners = [];
    let telegramResult = null;
    let success = false;
    let errorMsg = null;
    let screenshotsSent = 0;

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
          const caption =
            `💸 <b>${winner.name}</b> just received <b>${formatINR(winner.amount)}</b>\n` +
            `via ${platform.toUpperCase()} · Draw #${draw.period_id}`;
          const result = await this.sendToTelegram(png, caption, log);
          if (!result.skipped) screenshotsSent++;
          log.info(`[${i + 1}/${winners.length}] ${winner.name} (${platform}) sent`);
        } catch (err) {
          log.error(`Screenshot ${i + 1}/${winners.length} failed: ${err.message}`);
        }

        // Don't sleep after the last one
        if (i < winners.length - 1) {
          const delay = rand(1000, 3000);
          await sleep(delay);
        }
      }

      // Short pause before the summary card
      await sleep(1500);

      // 2. Send summary card
      log.info('Rendering summary card');
      const summaryHtml = DailyWinnersTemplate.render({ winners, draw });
      const summaryPng = await this.renderHtmlToPng(browser, summaryHtml, { width: 900, height: 600 });
      log.info(`Summary PNG rendered: ${summaryPng.length} bytes`);

      const template = await this.getCaptionTemplate();
      const caption = this.renderCaption(template, draw, winners);
      log.info(`Caption rendered (${caption.length} chars)`);

      telegramResult = await this.sendToTelegram(summaryPng, caption, log);
      success = true;
      log.info(`=== done in ${Date.now() - startedAt}ms, ${screenshotsSent} screenshots + 1 summary sent ===`);
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
      telegram: telegramResult,
      durationMs: Date.now() - startedAt,
      logs: log.entries,
    };
  }
}

module.exports = DailyWinnersService;
