const db = require('../config/database');
const crypto = require('crypto');

// PredictionService — drives the daily Telegram broadcast schedule that the
// admin configures from the Prediction page. There are 7 fixed time slots per
// day (default 08, 10, 12, 14, 16, 18, 20 IST). When a slot fires:
//
//   1. A "get ready" text message is posted to the Telegram channel.
//   2. After `getReadyLeadSeconds`, three prediction posts are sent — one per
//      configured pick (game + card_count_type + per-pick message), spaced
//      `predictionSpacingSeconds` apart. Each post renders a small card image
//      with the pre-rolled cards and a caption.
//   3. A final trailer text is posted.
//   4. After `winnersDelaySeconds` (default 30 min), `dailyWinnersService`
//      generates a fresh batch of 10–15 synthetic winners and pushes their
//      payment screenshots to the same channel.
//
// All knobs live in a single `settings.prediction_schedule_config` JSON row
// — the source of truth for the cron handlers and the admin UI.
//
// Predictions here are pure broadcasts: they do NOT lock the real outcome of
// any shuffle/mutka/uno round (the per-round pre-roll/push flow was removed).

const SUPPORTED_GAMES = ['shuffle_card', 'mutka_king', 'uno_king'];
const CARD_COUNT_TYPES = [1, 2, 3, 4];

const DECK_SIZES = {
  shuffle_card: 52,
  mutka_king:   52,
  uno_king:     54,
};

const SMM_MASTER_SETTING_KEY = 'prediction_smm_enabled';
const SCHEDULE_SETTING_KEY = 'prediction_schedule_config';

const DEFAULT_SCHEDULE_HOURS = [8, 10, 12, 14, 16, 18, 20];

const DEFAULT_SCHEDULE_CONFIG = {
  enabled: true,
  timezone: 'Asia/Kolkata',
  getReadyMessage: '🔔 <b>Get ready!</b>\nNext prediction batch drops in a moment.',
  getReadyLeadSeconds: 60,
  predictionSpacingSeconds: 8,
  hypeStickerDelaySeconds: 3,
  resultStickerDelaySeconds: 3,
  trailerMessage: '💰 <b>Don\'t miss the next round!</b>',
  trailerDelaySeconds: 5,
  winnersDelaySeconds: 1800,
  winnersMinCount: 10,
  winnersMaxCount: 15,
  slots: DEFAULT_SCHEDULE_HOURS.map((hour, i) => ({
    hour,
    enabled: true,
    picks: [
      { game: SUPPORTED_GAMES[i % 3],       cardCountType: ((i)     % 4) + 1, message: '' },
      { game: SUPPORTED_GAMES[(i + 1) % 3], cardCountType: ((i + 1) % 4) + 1, message: '' },
      { game: SUPPORTED_GAMES[(i + 2) % 3], cardCountType: ((i + 2) % 4) + 1, message: '' },
    ],
  })),
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
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
    return `${RANK_LABELS[cardRank(id)]}${SUIT_SYMBOLS[cardSuit(id)]}`;
  }).join('  ');
}

function gameLabel(game) {
  if (game === 'shuffle_card') return 'Shuffle Card';
  if (game === 'mutka_king')   return 'Mutka King';
  if (game === 'uno_king')     return 'UNO King';
  return game;
}

// Hype stickers — sent at random after each prediction pick to build channel
// energy. Each entry only needs `file_id` (Telegram's reusable sticker handle);
// the other fields are kept for human reference. Add/remove freely — an empty
// array disables the hype step.
const HYPE_STICKERS = [
  { file_id: 'CAACAgUAAyEFAATdYERoAAIFQ2oCxf9Te4m_XoeXv1fScpqF5ExdAAJQDwACZFEBVUyoQXBywDFIOwQ', emoji: '👍', set_name: 'Bharat_no1' },
  { file_id: 'CAACAgUAAyEFAATuMWxaAAM7agNty6V2N0-tTFhPW1hBOOLeG9EAAi8NAAKiL6BVTjb7jO0ByFo7BA', emoji: '💯', set_name: 'Bharat_no1' },
  { file_id: 'CAACAgUAAyEFAATuMWxaAAM8agNt84KrJxfGOD8URtKT3I4LTdAAAmQRAALGtblVViPacs6fZ447BA', emoji: '📣', set_name: 'Bharat_no1' },
  { file_id: 'CAACAgUAAyEFAATuMWxaAAM9agNt9yQSrkQ9j3ivpjV0CSMjb2EAAjIRAAKn9QFV9_pzbOcdufE7BA', emoji: '☺️', set_name: 'Bharat_no1' },
  { file_id: 'CAACAgUAAyEFAATuMWxaAAM-agNuBc3ikdO19Z3aA7pvwlYoOTYAAjkOAAJR4elVY1kywGhUHGc7BA', emoji: '🔥', set_name: 'Bharat_no1' },
  { file_id: 'CAACAgUAAyEFAATuMWxaAAM_agNuDleY8ccrUpLdM15oaeu_70UAAvYNAAIQLFhW3wO80-FLyR87BA', emoji: '🤑', set_name: 'Bharat_no1' },
  { file_id: 'CAACAgUAAyEFAATuMWxaAANAagNuET6AjfZwULrodr0K-bJLVOsAAmANAAJ2nvFV4CtZiFyOHZ47BA', emoji: '🦘', set_name: 'Bharat_no1' },
  { file_id: 'CAACAgUAAyEFAATuMWxaAANBagNuEuEM1XurSZy6Fh38GiFZkWkAAtILAAL2GvBVOzclhK2q9ec7BA', emoji: '🦆', set_name: 'Bharat_no1' },
];

// Slot-start sticker — single fixed sticker sent at the very top of every slot
// run, before the get-ready text. Set to '' to disable.
const SLOT_START_STICKER_FILE_ID = 'CAACAgUAAyEFAATuMWxaAAM6agNtb9fVRpCILTdz9ebXshvFpPEAAhUPAAI7hAABVTwClcxvv6zFOwQ';

function pickRandomHypeSticker() {
  if (!HYPE_STICKERS.length) return null;
  return HYPE_STICKERS[crypto.randomInt(0, HYPE_STICKERS.length)];
}

// Result stickers — sent at random the moment a locked round finishes, so the
// channel gets a celebratory beat right after the game reveals its cards.
const RESULT_STICKERS = [
  { file_id: 'CAACAgUAAyEFAATuMWxaAANCagNwbn1bUz7o3skBGD-XE5kj950AAtcPAALz26hVdbNjogca2XI7BA', emoji: '😍', set_name: 'Bharat_no1' },
  { file_id: 'CAACAgUAAyEFAATuMWxaAANDagNwb02DqY0Rut7cWyU39hwcxvMAAi4OAAIaa6FVT_oQjJm0Xmk7BA', emoji: '🏆', set_name: 'Bharat_no1' },
  { file_id: 'CAACAgUAAyEFAATuMWxaAANEagNwcctOj-KVmyH3F1N_rpEN80gAAmsOAALfDqFVAWtcvAJteY07BA', emoji: '🙂', set_name: 'Bharat_no1' },
  { file_id: 'CAACAgUAAyEFAATuMWxaAANFagNwevt5aQi2IVCbgILmdC5bR18AAvsQAAKOhjlWVIojkSEdjgw7BA', emoji: '🐯', set_name: 'Bharat_no1' },
  { file_id: 'CAACAgUAAyEFAATuMWxaAANGagNwipLuh9HIrnPtXsjZJNEMO7sAAp4RAAILMvBVhpIj0XtD2ng7BA', emoji: '🦉', set_name: 'Bharat_no1' },
];

function pickRandomResultSticker() {
  if (!RESULT_STICKERS.length) return null;
  return RESULT_STICKERS[crypto.randomInt(0, RESULT_STICKERS.length)];
}

// ── Server-side card visuals ─────────────────────────────────────────────────
// Renders a small HTML snippet that mimics the frontend's PlayingCard /
// UnoCard look. Puppeteer rasterizes it to PNG for the Telegram photo.

const SUIT_COLOR = ['#0f172a', '#dc2626', '#dc2626', '#0f172a'];
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

function isValidPick(pick) {
  return (
    pick &&
    SUPPORTED_GAMES.includes(pick.game) &&
    CARD_COUNT_TYPES.includes(parseInt(pick.cardCountType, 10))
  );
}

function normalizeConfig(raw) {
  const cfg = { ...DEFAULT_SCHEDULE_CONFIG, ...(raw || {}) };
  cfg.enabled = !!cfg.enabled;
  cfg.timezone = String(cfg.timezone || DEFAULT_SCHEDULE_CONFIG.timezone);
  cfg.getReadyMessage = String(cfg.getReadyMessage ?? '');
  cfg.trailerMessage  = String(cfg.trailerMessage ?? '');
  cfg.getReadyLeadSeconds       = clampInt(cfg.getReadyLeadSeconds,       0, 3600,  DEFAULT_SCHEDULE_CONFIG.getReadyLeadSeconds);
  cfg.predictionSpacingSeconds  = clampInt(cfg.predictionSpacingSeconds,  0, 600,   DEFAULT_SCHEDULE_CONFIG.predictionSpacingSeconds);
  cfg.hypeStickerDelaySeconds   = clampInt(cfg.hypeStickerDelaySeconds,   0, 120,   DEFAULT_SCHEDULE_CONFIG.hypeStickerDelaySeconds);
  cfg.resultStickerDelaySeconds = clampInt(cfg.resultStickerDelaySeconds, 0, 120,   DEFAULT_SCHEDULE_CONFIG.resultStickerDelaySeconds);
  cfg.trailerDelaySeconds       = clampInt(cfg.trailerDelaySeconds,       0, 600,   DEFAULT_SCHEDULE_CONFIG.trailerDelaySeconds);
  cfg.winnersDelaySeconds       = clampInt(cfg.winnersDelaySeconds,       0, 21600, DEFAULT_SCHEDULE_CONFIG.winnersDelaySeconds);
  cfg.winnersMinCount = clampInt(cfg.winnersMinCount, 1, 50, DEFAULT_SCHEDULE_CONFIG.winnersMinCount);
  cfg.winnersMaxCount = clampInt(cfg.winnersMaxCount, cfg.winnersMinCount, 100, DEFAULT_SCHEDULE_CONFIG.winnersMaxCount);

  // Always materialize 7 slots so the UI has a stable shape. Defaults fill in
  // any missing slot from DEFAULT_SCHEDULE_CONFIG.
  const incomingSlots = Array.isArray(cfg.slots) ? cfg.slots : [];
  cfg.slots = DEFAULT_SCHEDULE_CONFIG.slots.map((def, i) => {
    const s = incomingSlots[i] || {};
    const hour = clampInt(s.hour, 0, 23, def.hour);
    const enabled = s.enabled == null ? def.enabled : !!s.enabled;
    const picksIn = Array.isArray(s.picks) ? s.picks : [];
    const picks = [0, 1, 2].map((j) => {
      const p = picksIn[j] || {};
      const defPick = def.picks[j];
      const game = SUPPORTED_GAMES.includes(p.game) ? p.game : defPick.game;
      const cardCountType = CARD_COUNT_TYPES.includes(parseInt(p.cardCountType, 10))
        ? parseInt(p.cardCountType, 10) : defPick.cardCountType;
      return {
        game,
        cardCountType,
        message: typeof p.message === 'string' ? p.message : '',
      };
    });
    return { hour, enabled, picks };
  });

  return cfg;
}

function clampInt(v, lo, hi, fallback) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

class PredictionService {
  constructor() {
    // Wired in from index.js so we can reuse the SMM-order pipeline and the
    // puppeteer card-image render path.
    this.dailyWinnersService = null;
    // Wired in from index.js — used at slot fire to find the next open round
    // for each picked (game, card_count_type) so we can pre-roll its cards
    // and broadcast the real period_id, turning the post into a sure shot.
    this.gameServices = {
      shuffle_card: null,
      mutka_king:   null,
      uno_king:     null,
    };
    // Round-id → pre-rolled cards. Drained by the matching game service in
    // its _completeRound; we only keep this populated for ~60s at a time.
    this.predictedByRoundId = new Map();
    // Timer handles for the in-flight delayed steps of each slot run, keyed
    // by slotIndex — cleared when stop() is called so the process can exit
    // cleanly during dev restarts.
    this.pendingTimers = new Map();
  }

  setDailyWinnersService(svc) {
    this.dailyWinnersService = svc;
  }

  setGameServices({ shuffleCardService, mutkaKingService, unoKingService } = {}) {
    if (shuffleCardService) this.gameServices.shuffle_card = shuffleCardService;
    if (mutkaKingService)   this.gameServices.mutka_king   = mutkaKingService;
    if (unoKingService)     this.gameServices.uno_king     = unoKingService;
  }

  // Called by the matching game service inside _completeRound. Returns the
  // stashed cards for `roundId` (and clears them) or null if none.
  consumeCardsForRound(roundId) {
    if (!this.predictedByRoundId.has(roundId)) return null;
    const cards = this.predictedByRoundId.get(roundId);
    this.predictedByRoundId.delete(roundId);
    return cards;
  }

  // Master SMM toggle — single row in `settings` so admin can flip it once
  // for the whole module. Defaults to enabled when no row exists.
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

  getDefaultScheduleConfig() {
    return JSON.parse(JSON.stringify(DEFAULT_SCHEDULE_CONFIG));
  }

  async getScheduleConfig() {
    try {
      const [rows] = await db.pool.query(
        'SELECT setting_value FROM settings WHERE setting_key = ?',
        [SCHEDULE_SETTING_KEY]
      );
      if (!rows.length || !rows[0].setting_value) {
        return normalizeConfig(null);
      }
      const raw = typeof rows[0].setting_value === 'string'
        ? JSON.parse(rows[0].setting_value)
        : rows[0].setting_value;
      return normalizeConfig(raw);
    } catch (err) {
      console.error('[PRED] getScheduleConfig parse error:', err.message);
      return normalizeConfig(null);
    }
  }

  async setScheduleConfig(raw) {
    const cfg = normalizeConfig(raw);
    await db.pool.query(
      `INSERT INTO settings (setting_key, setting_value, description)
       VALUES (?, ?, 'Prediction Module daily Telegram broadcast schedule')
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [SCHEDULE_SETTING_KEY, JSON.stringify(cfg)]
    );
    return cfg;
  }

  // Entry point for the cron handlers. slotIndex is 0..6.
  async runScheduledSlot(slotIndex, { manual = false } = {}) {
    const cfg = await this.getScheduleConfig();
    if (!cfg.enabled) {
      console.log(`[PRED] Slot ${slotIndex + 1} skipped — master schedule disabled`);
      return { skipped: true, reason: 'master_disabled' };
    }
    const slot = cfg.slots[slotIndex];
    if (!slot) {
      console.warn(`[PRED] Slot ${slotIndex + 1} skipped — slot config missing`);
      return { skipped: true, reason: 'no_slot' };
    }
    if (!slot.enabled) {
      console.log(`[PRED] Slot ${slotIndex + 1} (${slot.hour}:00) skipped — slot disabled`);
      return { skipped: true, reason: 'slot_disabled' };
    }

    const validPicks = (slot.picks || []).filter(isValidPick);
    if (!validPicks.length) {
      console.warn(`[PRED] Slot ${slotIndex + 1} has no valid picks — nothing to broadcast`);
      return { skipped: true, reason: 'no_picks' };
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_WINNERS_CHANNEL_ID;
    if (!token || !chatId) {
      console.warn('[PRED] Telegram not configured — slot run aborted');
      return { skipped: true, reason: 'no_telegram' };
    }

    const label = `slot ${slotIndex + 1} (${String(slot.hour).padStart(2, '0')}:00)${manual ? ' [manual]' : ''}`;
    const startedAt = Date.now();
    console.log(`[PRED] Running ${label} — ${validPicks.length} picks, get-ready lead ${cfg.getReadyLeadSeconds}s, spacing ${cfg.predictionSpacingSeconds}s`);

    // Step 0: slot-start hype sticker (best-effort) — sets the tone before the
    // get-ready text drops. Disabled when SLOT_START_STICKER_FILE_ID is empty.
    if (SLOT_START_STICKER_FILE_ID) {
      try {
        await this._sendTelegramSticker({ token, chatId, fileId: SLOT_START_STICKER_FILE_ID });
      } catch (err) {
        console.error(`[PRED] ${label} slot-start sticker send failed:`, err.message);
      }
    }

    // Step 1: get-ready text (best-effort, doesn't abort the run)
    if (cfg.getReadyMessage) {
      try {
        await this._sendTelegramText({ token, chatId, text: cfg.getReadyMessage });
      } catch (err) {
        console.error(`[PRED] ${label} get-ready send failed:`, err.message);
      }
    }

    // Step 2: wait the lead time, then post each pick
    if (cfg.getReadyLeadSeconds > 0) {
      await sleep(cfg.getReadyLeadSeconds * 1000);
    }

    let pushed = 0;
    for (let i = 0; i < validPicks.length; i++) {
      const pick = validPicks[i];
      let lockedRound = null;
      try {
        lockedRound = await this._sendPredictionPost({
          token,
          chatId,
          game: pick.game,
          cardCountType: pick.cardCountType,
          message: pick.message || '',
          slotHour: slot.hour,
        });
        pushed++;
      } catch (err) {
        console.error(`[PRED] ${label} pick ${i + 1} (${pick.game}/${pick.cardCountType}) failed:`, err.message);
      }

      // After each pick: drop a random hype sticker (best-effort) so the
      // channel feels alive between cards. No-op if HYPE_STICKERS is empty.
      // hypeStickerDelaySeconds gives the prediction text room to breathe
      // before the sticker lands — without it the two messages arrive in the
      // same instant and the hype beat is lost.
      const hype = pickRandomHypeSticker();
      if (hype && hype.file_id) {
        if (cfg.hypeStickerDelaySeconds > 0) {
          await sleep(cfg.hypeStickerDelaySeconds * 1000);
        }
        try {
          await this._sendTelegramSticker({ token, chatId, fileId: hype.file_id });
        } catch (err) {
          console.error(`[PRED] ${label} hype sticker send failed:`, err.message);
        }
      }

      // Wait for the locked round to complete so the next beat (result sticker
      // and, if there's another pick, the next prediction) lands AFTER the
      // game reveals its cards. Runs for every pick including the last one.
      if (lockedRound && lockedRound.completeAt) {
        const waitMs = Math.max(0, new Date(lockedRound.completeAt).getTime() - Date.now());
        if (waitMs > 0) {
          console.log(`[PRED] ${label} waiting ${Math.round(waitMs / 1000)}s for round ${lockedRound.roundId} (${lockedRound.periodId}) to complete`);
          await sleep(waitMs);
        }
      }

      // Result sticker — fires after the round reveal. Best-effort.
      // resultStickerDelaySeconds keeps it from landing on top of the
      // game-result message so the win moment reads as a distinct beat.
      const result = pickRandomResultSticker();
      if (result && result.file_id) {
        if (cfg.resultStickerDelaySeconds > 0) {
          await sleep(cfg.resultStickerDelaySeconds * 1000);
        }
        try {
          await this._sendTelegramSticker({ token, chatId, fileId: result.file_id });
        } catch (err) {
          console.error(`[PRED] ${label} result sticker send failed:`, err.message);
        }
      }

      // Spacing wait — only between picks, not after the last one.
      if (i < validPicks.length - 1 && cfg.predictionSpacingSeconds > 0) {
        await sleep(cfg.predictionSpacingSeconds * 1000);
      }
    }

    // Trailer after the last pick — same delay rules as the post-winners
    // trailer so the channel always gets a closing message even if the 30-min
    // winners timer dies (server restart, manual re-trigger, etc.). A second
    // trailer also fires after the winners batch lands below.
    await this._sendTrailer(label, token, chatId, cfg);

    // Step 3: schedule the 30-min winners-screenshot batch, then the trailer
    // text is sent at the very end (after the last payment screenshot lands).
    if (this.dailyWinnersService && cfg.winnersDelaySeconds >= 0 && cfg.winnersMaxCount > 0) {
      const delay = cfg.winnersDelaySeconds * 1000;
      console.log(`[PRED] ${label} winners batch scheduled in ${cfg.winnersDelaySeconds}s (${cfg.winnersMinCount}-${cfg.winnersMaxCount} screenshots)`);
      this._setSlotTimer(slotIndex, 'winners', delay, async () => {
        // Re-read config inside the timeout so admin edits to trailerMessage
        // or trailerDelaySeconds made during the 30-min wait apply.
        let liveCfg = cfg;
        try { liveCfg = await this.getScheduleConfig(); } catch (_) {}

        console.log(`[PRED] ${label} winners batch firing`);
        try {
          const result = await this.dailyWinnersService.sendSyntheticWinnersBatch({
            minCount: liveCfg.winnersMinCount,
            maxCount: liveCfg.winnersMaxCount,
            tag: `slot${slotIndex + 1}_${String(slot.hour).padStart(2, '0')}`,
          });
          console.log(`[PRED] ${label} winners batch done: ${result.screenshotsSent}/${result.winnersCount} screenshots, ${result.smmOrdersPlaced} SMM`);
        } catch (err) {
          console.error(`[PRED] ${label} winners batch failed:`, err.message);
        }

        await this._sendTrailer(label, token, chatId, liveCfg);
      });
    } else {
      // No winners batch configured — still send the trailer (if set) after
      // the configured delay so the slot ends with the closing message.
      await this._sendTrailer(label, token, chatId, cfg);
    }

    console.log(`[PRED] ${label} finished in ${Date.now() - startedAt}ms — ${pushed}/${validPicks.length} predictions pushed`);
    return { skipped: false, slotIndex, hour: slot.hour, pushed, total: validPicks.length };
  }

  // Admin "Test now" button — fire one slot immediately, regardless of schedule.
  async triggerSlotNow(slotIndex) {
    const idx = parseInt(slotIndex, 10);
    if (!Number.isFinite(idx) || idx < 0 || idx > 6) {
      throw new Error('slotIndex must be between 0 and 6');
    }
    return this.runScheduledSlot(idx, { manual: true });
  }

  _setSlotTimer(slotIndex, key, ms, fn) {
    if (!this.pendingTimers.has(slotIndex)) this.pendingTimers.set(slotIndex, {});
    const handles = this.pendingTimers.get(slotIndex);
    clearTimeout(handles[key]);
    handles[key] = setTimeout(async () => {
      try { await fn(); }
      finally { delete handles[key]; }
    }, ms);
  }

  // Trailer is sent at the very end of a slot — after the winners batch
  // (or right after the predictions if there's no winners step). Pulled into
  // a helper so both branches share the same delay + retry behavior and so a
  // failure here can't silently swallow the closing message.
  async _sendTrailer(label, token, chatId, cfg) {
    if (!cfg?.trailerMessage) {
      console.log(`[PRED] ${label} no trailer message configured — skipping trailer`);
      return;
    }
    const delay = Math.max(0, parseInt(cfg.trailerDelaySeconds, 10) || 0);
    if (delay > 0) {
      console.log(`[PRED] ${label} trailer scheduled in ${delay}s`);
      await sleep(delay * 1000);
    }
    try {
      await this._sendTelegramText({ token, chatId, text: cfg.trailerMessage });
      console.log(`[PRED] ${label} trailer sent`);
    } catch (err) {
      console.error(`[PRED] ${label} trailer send failed:`, err.message);
    }
  }

  async _sendTelegramText({ token, chatId, text }, { maxRetries = 3 } = {}) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
      const body = await res.text();
      if (res.ok) return body;
      // 429 = flood-wait; respect Telegram's retry_after then try again.
      if (res.status === 429 && attempt < maxRetries) {
        let retryAfter = 1;
        try {
          const parsed = JSON.parse(body);
          retryAfter = parsed.parameters?.retry_after || parsed.retry_after || 1;
        } catch (_) {}
        const waitMs = (Number(retryAfter) + 1) * 1000;
        console.warn(`[PRED] Telegram 429 — sleeping ${waitMs}ms and retrying (${attempt}/${maxRetries})`);
        await sleep(waitMs);
        continue;
      }
      throw new Error(`Telegram sendMessage ${res.status}: ${body.slice(0, 200)}`);
    }
    throw new Error(`Telegram sendMessage failed after ${maxRetries} attempts`);
  }

  async _sendTelegramSticker({ token, chatId, fileId }, { maxRetries = 2 } = {}) {
    const url = `https://api.telegram.org/bot${token}/sendSticker`;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, sticker: fileId }),
      });
      const body = await res.text();
      if (res.ok) return body;
      if (res.status === 429 && attempt < maxRetries) {
        let retryAfter = 1;
        try {
          const parsed = JSON.parse(body);
          retryAfter = parsed.parameters?.retry_after || parsed.retry_after || 1;
        } catch (_) {}
        await sleep((Number(retryAfter) + 1) * 1000);
        continue;
      }
      throw new Error(`Telegram sendSticker ${res.status}: ${body.slice(0, 200)}`);
    }
    throw new Error(`Telegram sendSticker failed after ${maxRetries} attempts`);
  }

  async _sendPredictionPost({ token, chatId, game, cardCountType, message, slotHour }) {
    const deckSize = DECK_SIZES[game];
    if (!deckSize) throw new Error(`Unsupported game "${game}"`);
    const cards = secureSample(deckSize, cardCountType);

    // Try to lock this prediction to the next real round so the game's reveal
    // matches what we broadcast. Only valid while the round is still in
    // `betting` — if it's already locked/completed the game won't pick our
    // cards up and the broadcast falls back to a synthetic period id.
    let roundId = 0;
    let periodId = `SCHED-${String(slotHour).padStart(2, '0')}-${Date.now()}`;
    let lockedRound = null;

    const svc = this.gameServices[game];
    if (svc && typeof svc.getCurrentRound === 'function') {
      const round = svc.getCurrentRound(cardCountType);
      if (round && round.status === 'betting') {
        roundId = round.id;
        periodId = round.periodId;
        this.predictedByRoundId.set(round.id, cards);
        lockedRound = round;
        console.log(`[PRED] Locked ${game}/${cardCountType} → round ${round.id} (${round.periodId}), completes at ${round.completeAt}`);
      } else {
        console.warn(`[PRED] No betting round for ${game}/${cardCountType} — broadcasting synthetic prediction`);
      }
    }

    const [logRes] = await db.pool.query(
      `INSERT INTO prediction_log (game, card_count_type, round_id, period_id, predicted_cards, telegram_pushed)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [game, cardCountType, roundId, periodId, JSON.stringify(cards)]
    );
    const logId = logRes.insertId;

    const cardsLine = formatCardsForGame(game, cards);
    const header =
      `🎯 <b>Sure Shot: ${gameLabel(game)}</b>\n` +
      `<b>Single - (${cardCountType}C)</b>\n` +
      `Period: <b>${periodId}</b>\n` +
      `Cards: <b>${cardsLine}</b>`;
    const body = message ? `\n\n${message}` : '';
    const text = header + body;

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
      if (!res.ok) {
        await db.pool.query('UPDATE prediction_log SET telegram_error = ? WHERE id = ?',
          [`sendPhoto ${res.status}: ${respText.slice(0, 200)}`, logId]).catch(() => {});
        throw new Error(`Telegram sendPhoto ${res.status}: ${respText.slice(0, 200)}`);
      }
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
      if (!res.ok) {
        await db.pool.query('UPDATE prediction_log SET telegram_error = ? WHERE id = ?',
          [`sendMessage ${res.status}: ${respText.slice(0, 200)}`, logId]).catch(() => {});
        throw new Error(`Telegram sendMessage ${res.status}: ${respText.slice(0, 200)}`);
      }
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

    await db.pool.query(
      `UPDATE prediction_log
          SET telegram_pushed = 1,
              telegram_message_id = ?,
              telegram_post_url = ?,
              pushed_at = NOW()
        WHERE id = ?`,
      [messageId, postUrl, logId]
    ).catch(() => {});

    console.log(`[PRED] Pushed ${game}/${cardCountType} ${periodId}${postUrl ? ` → ${postUrl}` : ''}`);

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

    return {
      logId,
      messageId,
      postUrl,
      roundId,
      periodId,
      completeAt: lockedRound?.completeAt || null,
    };
  }

  async _renderCardsPng({ game, cardCountType, periodId, cards }) {
    if (!this.dailyWinnersService) throw new Error('dailyWinnersService not wired');
    const html = buildPredictionImageHTML({ game, cards });
    const log = this._createSmmLogger(game, cardCountType, periodId);
    const browser = await this.dailyWinnersService.launchBrowser(log);
    try {
      return await this.dailyWinnersService.renderHtmlToPng(browser, html, {
        width: 320,
        height: 140,
        mode: 'body',
      });
    } finally {
      try { await browser.close(); } catch (_) {}
    }
  }

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
    for (const handles of this.pendingTimers.values()) {
      for (const k of Object.keys(handles)) clearTimeout(handles[k]);
    }
    this.pendingTimers.clear();
  }
}

module.exports = PredictionService;
module.exports.SUPPORTED_GAMES = SUPPORTED_GAMES;
module.exports.CARD_COUNT_TYPES = CARD_COUNT_TYPES;
