const db = require('../config/database');
// Shared name pool with dailyWinnersService — keeps the masked "Rahul S." /
// "R. Sharma" style consistent between the live activity ticker and the
// daily winners post so the platform feels like one continuous feed.
const { randomMaskedName } = require('../utils/randomNames');

const GAME_NAMES = [
  'Coin Flip', 'Dice Roll', 'Lucky Spin', 'Balloon Pop',
  'Dragon Tower', 'Ice Field', 'Arrow Roulette', 'Egg Hatch', 'Fuse',
  'Mutka King', 'UNO King', 'Shuffle Card', '7-Digit Lottery',
];

const GAME_RESULTS = {
  'Coin Flip':       (a) => `won ${a}Z on Coin Flip`,
  'Dice Roll':       (a) => `rolled ${a}Z on Dice Roll`,
  'Lucky Spin':      (a) => `spun ${a}Z on Lucky Spin`,
  'Balloon Pop':     (a) => `popped ${a}Z on Balloon Pop`,
  'Dragon Tower':    (a) => `climbed Dragon Tower for ${a}Z`,
  'Ice Field':       (a) => `cleared Ice Field for ${a}Z`,
  'Arrow Roulette':  (a) => `hit ${a}Z on Arrow Roulette`,
  'Egg Hatch':       (a) => `hatched ${a}Z on Egg Hatch`,
  'Fuse':            (a) => `defused Fuse for ${a}Z`,
  'Mutka King':      (a) => `crowned ${a}Z on Mutka King`,
  'UNO King':        (a) => `played the wild card for ${a}Z on UNO King`,
  'Shuffle Card':    (a) => `nailed the shuffle for ${a}Z on Shuffle Card`,
  '7-Digit Lottery': (a) => `cashed out ${a}Z on the 7-Digit Lottery`,
};

const ACTIVITY_TYPES = [
  { type: 'vote',                descFn: (u, n, a) => `voted for ${n}` },
  { type: 'buy',                 descFn: (u, n, a) => `bought ${n} for ${a}Z` },
  { type: 'sell',                descFn: (u, n, a) => `sold ${n} for ${a}Z` },
  { type: 'win',                 descFn: (u, n, a) => `won ${a}Z with ${n}` },
  { type: 'zynk_buy',            descFn: (u, n, a) => `purchased ${a}Z` },
  { type: 'transfer',            descFn: (u, n, a) => `sent ${a}Z` },
  { type: 'withdrawal',          descFn: (u, n, a) => `withdrew ${a}Z` },
  { type: 'game_win',            descFn: (u, n, a, g) => g ? GAME_RESULTS[g](a) : `won ${a}Z in a game` },
  { type: 'game_play',           descFn: (u, n, a, g) => `bet ${a}Z on ${g || 'a game'}` },
  { type: 'bonus_daily',         descFn: (u, n, a) => `claimed ${a}Z daily bonus` },
  { type: 'bonus_weekly',        descFn: (u, n, a) => `claimed ${a}Z weekly bonus` },
  { type: 'bonus_monthly',       descFn: (u, n, a) => `claimed ${a}Z monthly bonus` },
  { type: 'bonus_first_deposit', descFn: (u, n, a) => `unlocked a ${a}Z first-deposit bonus` },
  { type: 'invest',              descFn: (u, n, a) => `invested ${a}Z` },
  { type: 'invest_return',       descFn: (u, n, a) => `earned ${a}Z from an investment` },
];

class ActivityService {
  constructor(io) {
    this.io = io;
    this.timer = null;
    this.recentActivities = [];
    this.config = {
      enabled: true,
      frequencyMin: 3,
      frequencyMax: 10,
      amountDigitsMin: 2,
      amountDigitsMax: 4,
      weights: {
        vote: 12,
        buy: 16,
        sell: 6,
        win: 4,
        zynk_buy: 8,
        transfer: 8,
        withdrawal: 5,
        game_win: 12,
        game_play: 11,
        bonus_daily: 6,
        bonus_weekly: 3,
        bonus_monthly: 2,
        bonus_first_deposit: 2,
        invest: 4,
        invest_return: 3,
      }
    };
  }

  async loadConfig() {
    try {
      const [rows] = await db.pool.query(
        "SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE 'activity_%'"
      );

      const map = {};
      rows.forEach(r => { map[r.setting_key] = r.setting_value; });

      this.config.enabled = (map.activity_enabled || 'true') === 'true';
      this.config.frequencyMin = parseInt(map.activity_frequency_min) || 3;
      this.config.frequencyMax = parseInt(map.activity_frequency_max) || 10;
      this.config.amountDigitsMin = parseInt(map.activity_amount_digits_min) || 2;
      this.config.amountDigitsMax = parseInt(map.activity_amount_digits_max) || 4;
      this.config.weights = {
        vote: parseInt(map.activity_weight_vote) || 12,
        buy: parseInt(map.activity_weight_buy) || 16,
        sell: parseInt(map.activity_weight_sell) || 6,
        win: parseInt(map.activity_weight_win) || 4,
        zynk_buy: parseInt(map.activity_weight_zynk_buy) || 8,
        transfer: parseInt(map.activity_weight_transfer) || 8,
        withdrawal: parseInt(map.activity_weight_withdrawal) || 5,
        game_win: parseInt(map.activity_weight_game_win) || 12,
        game_play: parseInt(map.activity_weight_game_play) || 11,
        bonus_daily: parseInt(map.activity_weight_bonus_daily) || 6,
        bonus_weekly: parseInt(map.activity_weight_bonus_weekly) || 3,
        bonus_monthly: parseInt(map.activity_weight_bonus_monthly) || 2,
        bonus_first_deposit: parseInt(map.activity_weight_bonus_first_deposit) || 2,
        invest: parseInt(map.activity_weight_invest) || 4,
        invest_return: parseInt(map.activity_weight_invest_return) || 3,
      };
    } catch (err) {
      console.error('[ACTIVITY] Failed to load config:', err.message);
    }
  }

  async start() {
    await this.loadConfig();
    if (this.config.enabled) {
      this.scheduleNext();
      console.log('[ACTIVITY] Started');
    } else {
      console.log('[ACTIVITY] Disabled by config');
    }
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  scheduleNext() {
    const { frequencyMin, frequencyMax } = this.config;
    const delay = (Math.random() * (frequencyMax - frequencyMin) + frequencyMin) * 1000;
    this.timer = setTimeout(() => {
      this.generateAndBroadcast();
      this.scheduleNext();
    }, delay);
  }

  generateAndBroadcast() {
    const activity = this.generateActivity();
    this.recentActivities.unshift(activity);
    if (this.recentActivities.length > 5) this.recentActivities.length = 5;
    this.io.emit('activity:new', activity);
  }

  getRecent() {
    return this.recentActivities;
  }

  generateActivity() {
    const type = this.pickWeightedType();
    const username = randomMaskedName();
    const number = String(Math.floor(Math.random() * 10000000)).padStart(7, '0');

    const { amountDigitsMin, amountDigitsMax } = this.config;
    const digits = Math.floor(Math.random() * (amountDigitsMax - amountDigitsMin + 1)) + amountDigitsMin;
    const min = Math.pow(10, digits - 1);
    const max = Math.pow(10, digits) - 1;
    const amount = Math.floor(Math.random() * (max - min + 1)) + min;

    // Pick a random game for game-related activity types
    const gameName = (type === 'game_win' || type === 'game_play')
      ? GAME_NAMES[Math.floor(Math.random() * GAME_NAMES.length)]
      : null;

    const typeDef = ACTIVITY_TYPES.find(t => t.type === type) || ACTIVITY_TYPES[0];
    const description = typeDef.descFn(username, number, amount, gameName);

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      username,
      description,
      amount,
      game: gameName,
      time: 'Just now',
      timestamp: Date.now(),
    };
  }

  pickWeightedType() {
    const weights = this.config.weights;
    const entries = Object.entries(weights);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let rand = Math.random() * total;

    for (const [type, weight] of entries) {
      rand -= weight;
      if (rand <= 0) return type;
    }
    return entries[0][0];
  }

  async reloadConfig() {
    this.stop();
    await this.loadConfig();
    if (this.config.enabled) {
      this.scheduleNext();
      console.log('[ACTIVITY] Reloaded config and restarted');
    } else {
      console.log('[ACTIVITY] Reloaded config — disabled');
    }
  }
}

module.exports = ActivityService;
