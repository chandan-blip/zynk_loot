// VIP tier ladder — a 32-step progression driven by lifetime spend. Shared by
// the dedicated /vip page and the small tier badge in the wallet header so the
// two never drift apart. Each tier: { name, icon, color, min, bonus }.
//   - min   : lifetime spend (₹) required to reach the tier
//   - bonus : % bonus applied to earnings at that tier
//   - icon  : emoji rendered inside the 3D medallion
//   - color : medallion / accent color

export const TIER_THRESHOLDS = [
  { name: 'Wood',        icon: '🪵', color: '#9b7653', min: 0,        bonus: 0 },
  { name: 'Copper',      icon: '🪙', color: '#b87333', min: 250,      bonus: 1 },
  { name: 'Bronze',      icon: '🥉', color: '#cd7f32', min: 500,      bonus: 1 },
  { name: 'Iron',        icon: '⚙️', color: '#9aa0a6', min: 1000,     bonus: 2 },
  { name: 'Steel',       icon: '🔩', color: '#7d8590', min: 2000,     bonus: 2 },
  { name: 'Silver',      icon: '🥈', color: '#c0c0c0', min: 3500,     bonus: 3 },
  { name: 'Pearl',       icon: '🤍', color: '#e3dac9', min: 5000,     bonus: 3 },
  { name: 'Gold',        icon: '🥇', color: '#ffd700', min: 7500,     bonus: 4 },
  { name: 'Emerald',     icon: '💚', color: '#2ecc71', min: 10000,    bonus: 5 },
  { name: 'Jade',        icon: '🟢', color: '#00a86b', min: 13000,    bonus: 6 },
  { name: 'Turquoise',   icon: '🩵', color: '#40e0d0', min: 16500,    bonus: 6 },
  { name: 'Sapphire',    icon: '🔵', color: '#3b6fe0', min: 20000,    bonus: 7 },
  { name: 'Topaz',       icon: '🟡', color: '#ffb347', min: 24500,    bonus: 8 },
  { name: 'Amethyst',    icon: '🟣', color: '#9b5de5', min: 30000,    bonus: 9 },
  { name: 'Ruby',        icon: '❤️', color: '#e0115f', min: 37000,    bonus: 10 },
  { name: 'Onyx',        icon: '⬛', color: '#4b4e57', min: 45000,    bonus: 11 },
  { name: 'Diamond',     icon: '💎', color: '#7fdbff', min: 55000,    bonus: 12 },
  { name: 'Crystal',     icon: '🔮', color: '#b388ff', min: 68000,    bonus: 13 },
  { name: 'Champion',    icon: '🏆', color: '#ffcf40', min: 82000,    bonus: 14 },
  { name: 'Master',      icon: '🎖️', color: '#ff8c42', min: 100000,   bonus: 15 },
  { name: 'Grandmaster', icon: '🏅', color: '#ff6b6b', min: 125000,   bonus: 16 },
  { name: 'Elite',       icon: '⭐', color: '#ffd93d', min: 155000,   bonus: 17 },
  { name: 'Legend',      icon: '🌟', color: '#ffe066', min: 195000,   bonus: 18 },
  { name: 'Mythic',      icon: '💫', color: '#c77dff', min: 245000,   bonus: 20 },
  { name: 'Ascendant',   icon: '🔥', color: '#ff7b00', min: 310000,   bonus: 21 },
  { name: 'Radiant',     icon: '☀️', color: '#ffd000', min: 390000,   bonus: 22 },
  { name: 'Celestial',   icon: '🌙', color: '#90caf9', min: 490000,   bonus: 23 },
  { name: 'Cosmic',      icon: '🪐', color: '#7c4dff', min: 620000,   bonus: 24 },
  { name: 'Galactic',    icon: '🌌', color: '#5c6bc0', min: 780000,   bonus: 25 },
  { name: 'Immortal',    icon: '☄️', color: '#ff5252', min: 1000000,  bonus: 27 },
  { name: 'Divine',      icon: '👑', color: '#ffd700', min: 1300000,  bonus: 28 },
  { name: 'Eternal',     icon: '💠', color: '#64ffda', min: 1700000,  bonus: 30 },
];

// Highest tier whose spend requirement is met.
export function getCurrentTier(spent = 0) {
  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (spent >= TIER_THRESHOLDS[i].min) return TIER_THRESHOLDS[i];
  }
  return TIER_THRESHOLDS[0];
}

// The next tier above `current`, or null if already at the top.
export function getNextTier(current) {
  const idx = TIER_THRESHOLDS.findIndex((t) => t.name === current.name);
  return idx >= 0 && idx < TIER_THRESHOLDS.length - 1 ? TIER_THRESHOLDS[idx + 1] : null;
}
