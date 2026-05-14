// TelegramDashService — operations-channel notifier.
//
// Sends nicely-formatted HTML messages to the dashboard Telegram channel
// (TELEGRAM_DASH_CHANNEL_ID) on key user events: registration and every
// successful deposit. Reuses the existing TELEGRAM_BOT_TOKEN; no extra bot
// needed.
//
// All sends are best-effort: if the env vars are missing, or Telegram errors,
// we log and move on — they must never block the user action.

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatINR(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function nowIST() {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true,
  });
}

class TelegramDashService {
  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatId = process.env.TELEGRAM_DASH_CHANNEL_ID || '';
  }

  isConfigured() {
    return !!(this.token && this.chatId);
  }

  async _send(text) {
    if (!this.isConfigured()) {
      // Don't spam the logs — only warn once per process if the env is missing.
      if (!this._warnedNotConfigured) {
        console.warn('[DASH] TELEGRAM_BOT_TOKEN or TELEGRAM_DASH_CHANNEL_ID missing — dash notifications disabled');
        this._warnedNotConfigured = true;
      }
      return { skipped: true };
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error(`[DASH] Telegram ${res.status}:`, body.slice(0, 200));
        return { ok: false, status: res.status };
      }
      return { ok: true };
    } catch (err) {
      console.error('[DASH] Telegram send error:', err.message);
      return { ok: false, error: err.message };
    }
  }

  notifyRegistration({ user, referrer = null }) {
    const lines = [
      '🆕 <b>New Registration</b>',
      '',
      `👤 <b>Username:</b> ${escapeHtml(user.username)}`,
      user.email ? `📧 <b>Email:</b> ${escapeHtml(user.email)}`           : null,
      user.phone ? `📱 <b>Phone:</b> <code>${escapeHtml(user.phone)}</code>` : null,
      referrer ? `🔗 <b>Referred by:</b> ${escapeHtml(referrer)}` : null,
      `🆔 <b>User ID:</b> <code>#${user.id}</code>`,
      `🕐 <b>Time:</b> ${nowIST()}`,
    ].filter(Boolean);
    return this._send(lines.join('\n'));
  }

  notifySupportMessage({ user, conversationId, message }) {
    const lines = [
      '💬 <b>New Support Message</b>',
      '',
      `👤 <b>User:</b> ${escapeHtml(user.username)} <code>(#${user.id})</code>`,
      user.email ? `📧 <b>Email:</b> ${escapeHtml(user.email)}` : null,
      user.phone ? `📱 <b>Phone:</b> <code>${escapeHtml(user.phone)}</code>` : null,
      `🆔 <b>Conversation ID:</b> <code>#${conversationId}</code>`,
      '',
      '📝 <b>Message:</b>',
      `<i>${escapeHtml(message)}</i>`,
      '',
      `🕐 <b>Time:</b> ${nowIST()}`,
    ].filter(Boolean);
    return this._send(lines.join('\n'));
  }

  notifyDeposit({
    user,
    amount,
    bonusAmount = null,
    priceLabel = null,
    paymentMethod = null,
    paymentReference = null,
    paymentCurrency = null,
    paymentAmount = null,
    packageName = null,
    source = null,
    orderId = null,
    status = 'awaiting_approval',
  }) {
    const lines = [
      '💰 <b>New Deposit Request</b>',
      '',
      `👤 <b>User:</b> ${escapeHtml(user.username)} <code>(#${user.id})</code>`,
      user.email ? `📧 <b>Email:</b> ${escapeHtml(user.email)}` : null,
      user.phone ? `📱 <b>Phone:</b> <code>${escapeHtml(user.phone)}</code>` : null,
      `💵 <b>Zynk Amount:</b> ${formatINR(amount)} Z`,
      bonusAmount ? `🎁 <b>Bonus:</b> ${formatINR(bonusAmount)} Z` : null,
      packageName ? `📦 <b>Package:</b> ${escapeHtml(packageName)}` : null,
      priceLabel ? `🏷️ <b>Price:</b> ${escapeHtml(priceLabel)}` : null,
      paymentMethod ? `🔧 <b>Payment Method:</b> ${escapeHtml(paymentMethod)}` : null,
      paymentAmount && paymentCurrency
        ? `💱 <b>Paid:</b> ${escapeHtml(String(paymentAmount))} ${escapeHtml(paymentCurrency)}`
        : null,
      paymentReference ? `🧾 <b>Reference:</b> <code>${escapeHtml(paymentReference)}</code>` : null,
      orderId ? `🆔 <b>Order ID:</b> <code>#${orderId}</code>` : null,
      source ? `📍 <b>Flow:</b> ${escapeHtml(source)}` : null,
      status ? `⏳ <b>Status:</b> ${escapeHtml(status)}` : null,
      `🕐 <b>Time:</b> ${nowIST()}`,
    ].filter(Boolean);
    return this._send(lines.join('\n'));
  }
}

module.exports = TelegramDashService;
