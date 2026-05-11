const db = require('../config/database');
const crypto = require('crypto');

// PredictionService — coordinates the "pre-roll & broadcast" feature for the
// three card games (Shuffle Card, Mutka King, UNO King).
//
//   Switch ON  → when a round opens for that (game, card_count_type), this
//                service pre-rolls the cards immediately (cryptographically
//                random, same logic the game would have used) and stashes
//                them. The game service later uses these stashed cards for
//                that round's reveal instead of rolling fresh.
//   Telegram ON → 5 seconds after the round opens, the pre-rolled cards are
//                pushed to the shared Daily-Winners Telegram channel
//                (TELEGRAM_WINNERS_CHANNEL_ID — same credentials reused for
//                consistency) along with the admin's custom message. After
//                each successful push, the existing SMM-panel order step
//                from dailyWinnersService is invoked so the post immediately
//                queues views/reactions.
//
// The pre-rolled cards are kept in-memory keyed by `round_id` until the
// round consumes them. A `prediction_log` row is written for every push so
// the admin can audit history.

const SUPPORTED_GAMES = ['shuffle_card', 'mutka_king', 'uno_king'];
const CARD_COUNT_TYPES = [1, 2, 3, 4];

const DECK_SIZES = {
  shuffle_card: 52,
  mutka_king:   52,
  uno_king:     54,
};

const TELEGRAM_PUSH_DELAY_MS = 5_000;
// Master switch (settings.setting_key) — when 0, no SMM orders are placed on
// prediction posts regardless of individual game tiles. Defaults to ON.
const SMM_MASTER_SETTING_KEY = 'prediction_smm_enabled';
// Master switch for the "hype" follow-up sequence (Go-Go-Go + GIF posted at
// +5s and +10s after each prediction). Defaults to ON.
const HYPE_MASTER_SETTING_KEY = 'prediction_hype_enabled';

// Delays for follow-up hype messages, measured from when the prediction was
// posted. With the prediction landing at T=5s after round open, hype #1
// posts at T=10s and hype #2 at T=15s — well inside the 50s betting window.
const HYPE_DELAYS_MS = [5_000, 10_000];

// Variant text for the hype messages — picked at random so a subscriber
// scrolling the channel doesn't see the same phrase every round.
const HYPE_TEXTS = [
  '🚀 <b>GO GO GO!</b>\nBets are open — place yours now!',
  '🔥 <b>HURRY!</b>\nDon\'t miss this round!',
  '⚡ <b>BET NOW!</b>\nThe window is closing fast.',
  '💰 <b>LOCK IT IN!</b>\nLast chance to back the call.',
  '🎯 <b>SECONDS LEFT!</b>\nGet your bet on the table.',
  '🏆 <b>LET\'S GO!</b>\nFortune favors the fast.',
  '💎 <b>WINNERS ACT NOW!</b>\nThe round is heating up.',
];

// Note: we used to send external Giphy/Tenor hype GIFs via Telegram's
// sendAnimation, but Telegram's URL fetcher rejected them inconsistently
// ("wrong type of the web page content" / "content not available"). The
// service now generates its own hype banner via puppeteer (see
// _renderHypeImagePng + buildHypeImageHTML below) — deterministic, no
// third-party CDN, always works.

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function secureSample(range, count) {
  if (count > range) throw new Error('Sample size exceeds range');
  const picked = new Set();
  while (picked.size < count) {
    picked.add(crypto.randomInt(0, range));
  }
  return [...picked];
}

const cardSuit = (id) => Math.floor(id / 13);
const cardRank = (id) => id % 13;
const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];
const UNO_COLOR_LABELS = ['Red', 'Yellow', 'Green', 'Blue'];
const UNO_RANK_LABELS = ['0','1','2','3','4','5','6','7','8','9','Skip','Reverse','+2'];

function formatCardsForGame(game, cards) {
  return cards.map((id) => {
    if (game === 'uno_king') {
      if (id >= 52) return id === 53 ? 'Wild +4' : 'Wild';
      const color = UNO_COLOR_LABELS[Math.floor(id / 13)] || '?';
      const rank = UNO_RANK_LABELS[id % 13] || '?';
      return `${color} ${rank}`;
    }
    // shuffle/mutka — 52-card deck
    return `${RANK_LABELS[cardRank(id)]}${SUIT_SYMBOLS[cardSuit(id)]}`;
  }).join('  ');
}

function gameLabel(game) {
  if (game === 'shuffle_card') return 'Shuffle Card';
  if (game === 'mutka_king')   return 'Mutka King';
  if (game === 'uno_king')     return 'UNO King';
  return game;
}

// ── Server-side card visuals ─────────────────────────────────────────────────
// Renders a small HTML snippet that mimics the frontend's PlayingCard /
// UnoCard look. Puppeteer rasterizes it to PNG for the Telegram photo.

const SUIT_COLOR = ['#0f172a', '#dc2626', '#dc2626', '#0f172a']; // ♣ ♦ ♥ ♠
const UNO_COLOR_HEX = ['#dc2626', '#f5c518', '#16a34a', '#2563eb'];
const UNO_COLOR_DARK = ['#7f1d1d', '#854d0e', '#14532d', '#1e3a8a'];

function renderStandardCardHTML(id) {
  const r = id % 13;
  const s = Math.floor(id / 13);
  const rank = RANK_LABELS[r];
  const suit = SUIT_SYMBOLS[s];
  const color = SUIT_COLOR[s];
  return `
    <div style="position:relative;width:62px;height:88px;border-radius:8px;background:#ffffff;
                box-shadow:0 6px 14px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(0,0,0,0.08);
                font-family:Georgia, 'Times New Roman', serif;color:${color};overflow:hidden;">
      <div style="position:absolute;top:4px;left:6px;font-weight:900;font-size:13px;line-height:1;">${rank}</div>
      <div style="position:absolute;top:18px;left:7px;font-size:11px;line-height:1;">${suit}</div>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
                  font-size:34px;line-height:1;">${suit}</div>
      <div style="position:absolute;bottom:4px;right:6px;font-weight:900;font-size:13px;line-height:1;
                  transform:rotate(180deg);">${rank}</div>
      <div style="position:absolute;bottom:18px;right:7px;font-size:11px;line-height:1;
                  transform:rotate(180deg);">${suit}</div>
    </div>`;
}

function renderUnoCardHTML(id) {
  // Wild = 52 (★), Wild +4 = 53
  if (id >= 52) {
    const label = id === 53 ? '+4' : '★';
    return `
      <div style="position:relative;width:62px;height:88px;border-radius:8px;
                  background:conic-gradient(from 0deg, #dc2626 0deg 90deg, #f5c518 90deg 180deg, #16a34a 180deg 270deg, #2563eb 270deg 360deg);
                  box-shadow:0 6px 14px rgba(0,0,0,0.6);overflow:hidden;
                  display:flex;align-items:center;justify-content:center;
                  font-family:'Arial Black',sans-serif;font-style:italic;font-weight:900;">
        <span style="background:rgba(0,0,0,0.55);color:#fff;padding:4px 8px;border-radius:6px;
                     font-size:18px;line-height:1;">${label}</span>
      </div>`;
  }
  const c = Math.floor(id / 13);
  const r = id % 13;
  const label = UNO_RANK_LABELS[r] || '?';
  const bg = `linear-gradient(160deg, ${UNO_COLOR_HEX[c]} 0%, ${UNO_COLOR_DARK[c]} 100%)`;
  // Top-left + bottom-right corner labels for the classic UNO look.
  return `
    <div style="position:relative;width:62px;height:88px;border-radius:8px;background:${bg};
                box-shadow:0 6px 14px rgba(0,0,0,0.55), inset 0 0 0 2px rgba(255,255,255,0.4);
                font-family:'Arial Black',sans-serif;font-style:italic;font-weight:900;color:#ffffff;
                overflow:hidden;">
      <div style="position:absolute;top:3px;left:6px;font-size:11px;line-height:1;">${label}</div>
      <div style="position:absolute;inset:8px;border-radius:50% / 35%;background:rgba(255,255,255,0.95);
                  display:flex;align-items:center;justify-content:center;
                  color:${UNO_COLOR_HEX[c]};font-size:${label.length > 1 ? '15px' : '24px'};
                  transform:rotate(-12deg);text-shadow:0 1px 0 rgba(0,0,0,0.1);">
        ${label}
      </div>
      <div style="position:absolute;bottom:3px;right:6px;font-size:11px;line-height:1;
                  transform:rotate(180deg);">${label}</div>
    </div>`;
}

function renderCardHTML(game, id) {
  return game === 'uno_king' ? renderUnoCardHTML(id) : renderStandardCardHTML(id);
}

// Punchy "GO GO GO" banner used as a fallback when Telegram can't fetch the
// external hype GIF (Tenor/Giphy hot-link failure, blocked region, etc.).
// Puppeteer rasterizes this to a colorful PNG that we send via sendPhoto.
function buildHypeImageHTML(text) {
  // Strip HTML tags from the hype text — the image is raster, not HTML.
  const plain = String(text || '🚀 GO GO GO!').replace(/<[^>]+>/g, '');
  return `
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8">
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { padding: 30px 50px; display: inline-block;
             background: radial-gradient(circle at 20% 20%, #fde047 0%, transparent 50%),
                         radial-gradient(circle at 80% 80%, #f97316 0%, transparent 50%),
                         linear-gradient(135deg, #dc2626 0%, #b91c1c 50%, #7f1d1d 100%);
             font-family: 'Arial Black', 'Helvetica', sans-serif; }
      .wrap { display: flex; flex-direction: column; align-items: center; gap: 14px;
              min-width: 420px; padding: 24px 40px;
              background: rgba(0,0,0,0.35);
              border: 3px solid rgba(255,255,255,0.9);
              border-radius: 18px;
              box-shadow: 0 12px 32px rgba(0,0,0,0.6),
                          inset 0 0 0 1px rgba(0,0,0,0.4); }
      .title { color: #ffffff; font-size: 48px; font-weight: 900;
               font-style: italic; letter-spacing: 0.04em; line-height: 1.05;
               text-align: center; white-space: pre-line;
               text-shadow: -3px 0 0 #1a1208, 3px 3px 0 #fbbf24,
                            6px 6px 0 rgba(0,0,0,0.55); }
    </style></head><body>
      <div class="wrap">
        <div class="title">${plain}</div>
      </div>
    </body></html>`;
}

// Minimal image: just the row of cards on a clean dark background. All other
// info (period, type, custom message) goes into the Telegram caption text.
function buildPredictionImageHTML({ game, cards }) {
  const cardsHTML = cards.map((id) => renderCardHTML(game, id)).join('');
  return `
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8">
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 14px 16px;
             background: linear-gradient(180deg, #0e3a2a 0%, #0b2c20 100%);
             display: inline-block; }
      .cards { display: flex; gap: 8px; }
    </style></head><body>
      <div class="cards">${cardsHTML}</div>
    </body></html>`;
}

class PredictionService {
  constructor() {
    // Pre-rolled cards keyed by round_id (number) → { game, type, cards, periodId }
    this.predictedByRoundId = new Map();
    // Pending telegram push timers keyed by round_id → setTimeout handle
    this.pushTimers = new Map();
    // Cached config map "game:type" → row, refreshed on demand
    this.configCache = null;
    this.configCacheAt = 0;
    // Wired in from index.js so we can place SMM orders on every prediction
    // post (reuses placeSmmOrdersForPost from dailyWinnersService).
    this.dailyWinnersService = null;
  }

  setDailyWinnersService(svc) {
    this.dailyWinnersService = svc;
  }

  // Master SMM toggle — single row in `settings` so admin can flip it once
  // for all 12 tiles. Defaults to enabled when no row exists.
  async getSmmEnabled() {
    try {
      const [rows] = await db.pool.query(
        'SELECT setting_value FROM settings WHERE setting_key = ?',
        [SMM_MASTER_SETTING_KEY]
      );
      if (!rows.length || rows[0].setting_value == null) return true;
      const v = String(rows[0].setting_value).toLowerCase();
      return v === '1' || v === 'true' || v === 'on' || v === 'yes';
    } catch (_) {
      return true;
    }
  }

  async setSmmEnabled(enabled) {
    await db.pool.query(
      `INSERT INTO settings (setting_key, setting_value, description)
       VALUES (?, ?, 'Master switch: place SMM orders on Telegram predictions')
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [SMM_MASTER_SETTING_KEY, enabled ? '1' : '0']
    );
    return !!enabled;
  }

  // Master toggle for the GO-GO-GO follow-up hype sequence (5s + 10s after
  // every prediction push). Default ON when the settings row is missing.
  async getHypeEnabled() {
    try {
      const [rows] = await db.pool.query(
        'SELECT setting_value FROM settings WHERE setting_key = ?',
        [HYPE_MASTER_SETTING_KEY]
      );
      if (!rows.length || rows[0].setting_value == null) return true;
      const v = String(rows[0].setting_value).toLowerCase();
      return v === '1' || v === 'true' || v === 'on' || v === 'yes';
    } catch (_) {
      return true;
    }
  }

  async setHypeEnabled(enabled) {
    await db.pool.query(
      `INSERT INTO settings (setting_key, setting_value, description)
       VALUES (?, ?, 'Master switch: send Go-Go-Go hype GIFs after each prediction')
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [HYPE_MASTER_SETTING_KEY, enabled ? '1' : '0']
    );
    return !!enabled;
  }

  async _loadConfigs(force = false) {
    const now = Date.now();
    // Cache configs for 1s so a burst of rounds opening doesn't hammer the DB
    if (!force && this.configCache && (now - this.configCacheAt) < 1000) {
      return this.configCache;
    }
    const [rows] = await db.pool.query(
      `SELECT id, game, card_count_type, enabled, telegram_enabled, telegram_message
         FROM prediction_configs`
    );
    const map = new Map();
    for (const r of rows) {
      map.set(`${r.game}:${r.card_count_type}`, {
        id: r.id,
        game: r.game,
        cardCountType: r.card_count_type,
        enabled: !!r.enabled,
        telegramEnabled: !!r.telegram_enabled,
        telegramMessage: r.telegram_message || '',
      });
    }
    this.configCache = map;
    this.configCacheAt = now;
    return map;
  }

  async getConfigs() {
    const map = await this._loadConfigs(true);
    return Array.from(map.values()).sort((a, b) => {
      if (a.game !== b.game) return SUPPORTED_GAMES.indexOf(a.game) - SUPPORTED_GAMES.indexOf(b.game);
      return a.cardCountType - b.cardCountType;
    });
  }

  async updateConfig(game, cardCountType, { enabled, telegramEnabled, telegramMessage }) {
    if (!SUPPORTED_GAMES.includes(game)) throw new Error(`Unsupported game "${game}"`);
    if (!CARD_COUNT_TYPES.includes(cardCountType)) throw new Error('card_count_type must be 1, 2, 3, or 4');

    await db.pool.query(
      `INSERT INTO prediction_configs (game, card_count_type, enabled, telegram_enabled, telegram_message)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         enabled = VALUES(enabled),
         telegram_enabled = VALUES(telegram_enabled),
         telegram_message = VALUES(telegram_message)`,
      [
        game,
        cardCountType,
        enabled ? 1 : 0,
        telegramEnabled ? 1 : 0,
        telegramMessage || null,
      ]
    );
    // Invalidate cache so the next round open sees the new toggle.
    this.configCache = null;
    return { game, cardCountType, enabled: !!enabled, telegramEnabled: !!telegramEnabled, telegramMessage: telegramMessage || '' };
  }

  // Called by a game service when a round has just opened. If the matching
  // config has `enabled=true`, this pre-rolls the cards immediately, returns
  // them so the game service can stash them on the in-memory round, and (if
  // telegram is enabled) schedules the 5s-after-open broadcast.
  async preGenerateForRound({ game, cardCountType, roundId, periodId }) {
    if (!SUPPORTED_GAMES.includes(game)) return null;
    if (!CARD_COUNT_TYPES.includes(cardCountType)) return null;

    const configs = await this._loadConfigs();
    const cfg = configs.get(`${game}:${cardCountType}`);
    if (!cfg || !cfg.enabled) return null;

    const deckSize = DECK_SIZES[game];
    const cards = secureSample(deckSize, cardCountType);

    this.predictedByRoundId.set(roundId, { game, cardCountType, periodId, cards });

    // Log the pre-roll (telegram_pushed will be flipped to 1 when push succeeds)
    let logId = null;
    try {
      const [res] = await db.pool.query(
        `INSERT INTO prediction_log (game, card_count_type, round_id, period_id, predicted_cards, telegram_pushed)
         VALUES (?, ?, ?, ?, ?, 0)`,
        [game, cardCountType, roundId, periodId, JSON.stringify(cards)]
      );
      logId = res.insertId;
    } catch (err) {
      console.error('[PRED] Failed to write prediction_log:', err.message);
    }

    if (cfg.telegramEnabled) {
      this._schedulePush({
        roundId,
        game,
        cardCountType,
        periodId,
        cards,
        customMessage: cfg.telegramMessage,
        logId,
      });
    }

    console.log(
      `[PRED] Pre-rolled ${game}/${cardCountType} round ${periodId} → cards=[${cards.join(',')}]` +
      (cfg.telegramEnabled ? ` (telegram push scheduled in ${TELEGRAM_PUSH_DELAY_MS}ms)` : '')
    );

    return cards;
  }

  // Called by the game service inside _completeRound. If we pre-rolled this
  // round, returns the cached cards (and clears them). Returns null otherwise.
  consumeCardsForRound(roundId) {
    const entry = this.predictedByRoundId.get(roundId);
    if (!entry) return null;
    this.predictedByRoundId.delete(roundId);
    return entry.cards;
  }

  _schedulePush({ roundId, game, cardCountType, periodId, cards, customMessage, logId }) {
    // Clear any duplicate timer for the same round (shouldn't happen but
    // defensive against pre-roll being called twice).
    const existing = this.pushTimers.get(roundId);
    if (existing) clearTimeout(existing);

    const handle = setTimeout(async () => {
      this.pushTimers.delete(roundId);
      try {
        await this._sendToTelegram({ game, cardCountType, periodId, cards, customMessage, logId });
      } catch (err) {
        console.error('[PRED] Telegram push failed:', err.message);
        if (logId) {
          db.pool
            .query('UPDATE prediction_log SET telegram_error = ? WHERE id = ?', [err.message, logId])
            .catch(() => {});
        }
      }
    }, TELEGRAM_PUSH_DELAY_MS);
    this.pushTimers.set(roundId, handle);
  }

  async _sendToTelegram({ game, cardCountType, periodId, cards, customMessage, logId }) {
    // Reuse the Daily Winners credentials so the same bot + channel posts
    // both predictions and winner broadcasts. No separate env var.
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_WINNERS_CHANNEL_ID;
    if (!token || !chatId) {
      throw new Error('Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_WINNERS_CHANNEL_ID missing)');
    }

    const cardsLine = formatCardsForGame(game, cards);
    const header =
      `🎯 <b>Sure Shot: ${gameLabel(game)}</b>\n` +
      `<b>Single - (${cardCountType}C)</b>\n` +
      `Period: <b>${periodId}</b>\n` +
      `Cards: <b>${cardsLine}</b>`;
    const body = customMessage ? `\n\n${customMessage}` : '';
    const text = header + body;

    // Try to render a small card-graphic PNG and send via sendPhoto so the
    // Telegram post shows the actual cards. Falls back to plain sendMessage
    // if puppeteer isn't available or anything in the render step throws.
    let png = null;
    if (this.dailyWinnersService) {
      try {
        png = await this._renderCardsPng({ game, cardCountType, periodId, cards });
      } catch (err) {
        console.error('[PRED] Card image render failed, falling back to text-only:', err.message);
      }
    }

    let res;
    let respText;
    if (png) {
      const url = `https://api.telegram.org/bot${token}/sendPhoto`;
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('caption', text);
      form.append('parse_mode', 'HTML');
      form.append('photo', new Blob([png], { type: 'image/png' }), 'prediction.png');
      res = await fetch(url, { method: 'POST', body: form });
      respText = await res.text();
      if (!res.ok) throw new Error(`Telegram sendPhoto ${res.status}: ${respText}`);
    } else {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      respText = await res.text();
      if (!res.ok) throw new Error(`Telegram sendMessage ${res.status}: ${respText}`);
    }

    let messageId = null;
    let postUrl = null;
    try {
      const parsed = JSON.parse(respText);
      const msg = parsed.result || {};
      messageId = msg.message_id || null;
      const chat = msg.chat || {};
      if (messageId) {
        if (chat.username) postUrl = `https://t.me/${chat.username}/${messageId}`;
        else if (chat.id != null) {
          const internal = String(chat.id).replace(/^-100/, '');
          postUrl = `https://t.me/c/${internal}/${messageId}`;
        }
      }
    } catch (_) { /* non-JSON body */ }

    console.log(`[PRED] Telegram pushed ${game}/${cardCountType} period ${periodId}${postUrl ? ` → ${postUrl}` : ''}`);

    if (logId) {
      db.pool
        .query(
          `UPDATE prediction_log
              SET telegram_pushed = 1,
                  telegram_message_id = ?,
                  telegram_post_url = ?,
                  pushed_at = NOW()
            WHERE id = ?`,
          [messageId, postUrl, logId]
        )
        .catch(() => {});
    }

    // After every successful Telegram push, queue SMM orders (views/reactions)
    // for the post — same logic Daily Winners uses, reused via the wired
    // dailyWinnersService reference. Gated by:
    //   1. The master switch (settings.prediction_smm_enabled).
    //   2. dailyWinnersService being wired in.
    //   3. A usable postUrl having been derived.
    //   4. The Daily Winners SMM panel config (apiKey, services, etc.).
    if (this.dailyWinnersService && postUrl) {
      const masterOn = await this.getSmmEnabled();
      if (!masterOn) {
        console.log('[PRED] SMM master switch off — skipping SMM order');
      } else {
        try {
          const log = this._createSmmLogger(game, cardCountType, periodId);
          const smm = await this.dailyWinnersService.placeSmmOrdersForPost(postUrl, log);
          if (smm && !smm.skipped && smm.placed > 0) {
            console.log(`[PRED] SMM orders placed: ${smm.placed} for ${postUrl}`);
          }
        } catch (err) {
          console.error('[PRED] SMM order step failed:', err.message);
        }
      }
    }

    // Hype follow-up sequence — GO-GO-GO messages with random GIFs at
    // +5s and +10s after the prediction send. Each one is fire-and-forget so
    // it never blocks the round flow. Gated by the master toggle.
    const hypeOn = await this.getHypeEnabled();
    if (hypeOn) {
      for (const delay of HYPE_DELAYS_MS) {
        setTimeout(() => {
          this._sendHypeMessage({ token, chatId, game, cardCountType, periodId })
            .catch(err => console.error('[PRED] Hype send failed:', err.message));
        }, delay);
      }
      console.log(`[PRED] Hype sequence scheduled (+${HYPE_DELAYS_MS.join('ms +')}ms)`);
    }
  }

  // Hype delivery: we generate the image ourselves via puppeteer so the
  // result is deterministic and doesn't depend on third-party CDNs (Giphy /
  // Tenor URLs were being rejected by Telegram with "content not available"
  // and "wrong type"). Falls back to plain text only if puppeteer fails.
  async _sendHypeMessage({ token, chatId, game, cardCountType, periodId }) {
    const text = pickRandom(HYPE_TEXTS);

    // ── Primary: puppeteer-rendered hype banner via sendPhoto ──
    if (this.dailyWinnersService) {
      try {
        const png = await this._renderHypeImagePng(text);
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('caption', text);
        form.append('parse_mode', 'HTML');
        form.append('photo', new Blob([png], { type: 'image/png' }), 'hype.png');
        const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: 'POST',
          body: form,
        });
        if (res.ok) {
          console.log(`[PRED] Hype image sent (${game}/${cardCountType} ${periodId})`);
          return;
        }
        const body = await res.text();
        console.warn(`[PRED] Hype sendPhoto ${res.status}: ${body.slice(0, 200)} — falling back to text.`);
      } catch (err) {
        console.warn('[PRED] Hype image render/send threw:', err.message, '— falling back to text.');
      }
    }

    // ── Fallback: plain sendMessage ──
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Telegram sendMessage ${res.status}: ${body.slice(0, 200)}`);
    }
    console.log(`[PRED] Hype text sent (${game}/${cardCountType} ${periodId})`);
  }

  // Puppeteer-renders a "GO GO GO" banner via the existing dailyWinnersService
  // pipeline. Returns a PNG buffer; throws if puppeteer or the helper isn't
  // available (caller catches and falls through to text).
  async _renderHypeImagePng(text) {
    if (!this.dailyWinnersService) throw new Error('dailyWinnersService not wired');
    const html = buildHypeImageHTML(text);
    const log = { info: () => {}, warn: () => {}, error: () => {} };
    const browser = await this.dailyWinnersService.launchBrowser(log);
    try {
      return await this.dailyWinnersService.renderHtmlToPng(browser, html, {
        width: 600,
        height: 260,
        mode: 'body',
      });
    } finally {
      try { await browser.close(); } catch (_) {}
    }
  }

  // Launch headless Chromium (via dailyWinnersService's helper) and rasterize
  // the prediction-card HTML to a small PNG suitable for a Telegram photo.
  // Returns a Buffer or throws on any puppeteer failure.
  async _renderCardsPng({ game, cardCountType, periodId, cards }) {
    if (!this.dailyWinnersService) throw new Error('dailyWinnersService not wired');
    const html = buildPredictionImageHTML({ game, cards });
    const log = this._createSmmLogger(game, cardCountType, periodId);
    const browser = await this.dailyWinnersService.launchBrowser(log);
    try {
      // mode='body' lets the rendered image auto-size to the card row.
      // Width covers up to 4 cards (62px each) + 3 gaps (8px) + 16px padding × 2.
      return await this.dailyWinnersService.renderHtmlToPng(browser, html, {
        width: 320,
        height: 140,
        mode: 'body',
      });
    } finally {
      try { await browser.close(); } catch (_) {}
    }
  }

  // Minimal logger shim so placeSmmOrdersForPost (which expects info/warn/error
  // callbacks) gets a compatible object that prefixes our [PRED] tag.
  _createSmmLogger(game, type, periodId) {
    const prefix = `[PRED/${game}/${type} ${periodId}]`;
    return {
      info:  (m) => console.log(prefix, m),
      warn:  (m) => console.warn(prefix, m),
      error: (m) => console.error(prefix, m),
    };
  }

  async getRecentLog({ game = null, cardCountType = null, limit = 50 } = {}) {
    const lim = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
    const where = [];
    const params = [];
    if (game) { where.push('game = ?'); params.push(game); }
    if (cardCountType) { where.push('card_count_type = ?'); params.push(parseInt(cardCountType, 10)); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(lim);

    const [rows] = await db.pool.query(
      `SELECT id, game, card_count_type, round_id, period_id, predicted_cards,
              telegram_pushed, telegram_message_id, telegram_post_url, telegram_error,
              pushed_at, created_at
         FROM prediction_log
         ${whereSql}
         ORDER BY id DESC
         LIMIT ?`,
      params
    );
    return rows.map((r) => ({
      id: r.id,
      game: r.game,
      cardCountType: r.card_count_type,
      roundId: r.round_id,
      periodId: r.period_id,
      predictedCards: typeof r.predicted_cards === 'string'
        ? JSON.parse(r.predicted_cards)
        : r.predicted_cards,
      telegramPushed: !!r.telegram_pushed,
      telegramMessageId: r.telegram_message_id,
      telegramPostUrl: r.telegram_post_url,
      telegramError: r.telegram_error,
      pushedAt: r.pushed_at,
      createdAt: r.created_at,
    }));
  }

  stop() {
    for (const t of this.pushTimers.values()) clearTimeout(t);
    this.pushTimers.clear();
    this.predictedByRoundId.clear();
  }
}

module.exports = PredictionService;
module.exports.SUPPORTED_GAMES = SUPPORTED_GAMES;
module.exports.CARD_COUNT_TYPES = CARD_COUNT_TYPES;
