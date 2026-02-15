const db = require('../config/database');

const USERNAMES = [
  'CryptoKing', 'LuckyAce', 'NumberPro', 'ZynkMaster', 'LootHunter',
  'BigWinner', 'FastTrader', 'GoldRush', 'DiamondHands', 'MoonShot',
  'SilverFox', 'NightOwl', 'StarPlayer', 'ThunderBolt', 'IronWill',
  'PhoenixRise', 'CosmicRay', 'NeonGlow', 'ShadowKing', 'BlazeRunner',
  'AceHigh', 'WildCard', 'DarkHorse', 'StormChaser', 'GoldenEagle',
  'SilentWolf', 'RapidFire', 'IceBreaker', 'SkyWalker', 'TigerEye',
  'CrystalBall', 'RocketFuel', 'OceanWave', 'DesertFox', 'JungleKing',
  'PixelDust', 'VoltStrike', 'ZenMaster', 'NovaStar', 'EchoWave'
];

const ACTIVITY_TYPES = [
  { type: 'vote', descFn: (u, n, a) => `voted for ${n}` },
  { type: 'buy', descFn: (u, n, a) => `bought ${n} for ${a}Z` },
  { type: 'sell', descFn: (u, n, a) => `sold ${n} for ${a}Z` },
  { type: 'win', descFn: (u, n, a) => `won ${a}Z with ${n}` },
  { type: 'zynk_buy', descFn: (u, n, a) => `purchased ${a}Z` },
  { type: 'transfer', descFn: (u, n, a) => `sent ${a}Z` },
  { type: 'withdrawal', descFn: (u, n, a) => `withdrew ${a}Z` },
];

class ActivityService {
  constructor(io) {
    this.io = io;
    this.timer = null;
    this.config = {
      enabled: true,
      frequencyMin: 3,
      frequencyMax: 10,
      amountDigitsMin: 2,
      amountDigitsMax: 4,
      weights: {
        vote: 20,
        buy: 25,
        sell: 10,
        win: 5,
        zynk_buy: 15,
        transfer: 15,
        withdrawal: 10,
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
        vote: parseInt(map.activity_weight_vote) || 20,
        buy: parseInt(map.activity_weight_buy) || 25,
        sell: parseInt(map.activity_weight_sell) || 10,
        win: parseInt(map.activity_weight_win) || 5,
        zynk_buy: parseInt(map.activity_weight_zynk_buy) || 15,
        transfer: parseInt(map.activity_weight_transfer) || 15,
        withdrawal: parseInt(map.activity_weight_withdrawal) || 10,
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
    this.io.emit('activity:new', activity);
  }

  generateActivity() {
    const type = this.pickWeightedType();
    const username = USERNAMES[Math.floor(Math.random() * USERNAMES.length)];
    const number = String(Math.floor(Math.random() * 10000000)).padStart(7, '0');

    const { amountDigitsMin, amountDigitsMax } = this.config;
    const digits = Math.floor(Math.random() * (amountDigitsMax - amountDigitsMin + 1)) + amountDigitsMin;
    const min = Math.pow(10, digits - 1);
    const max = Math.pow(10, digits) - 1;
    const amount = Math.floor(Math.random() * (max - min + 1)) + min;

    const typeDef = ACTIVITY_TYPES.find(t => t.type === type) || ACTIVITY_TYPES[0];
    const description = typeDef.descFn(username, number, amount);

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      username,
      description,
      amount,
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
