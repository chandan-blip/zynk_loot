import { GiCardRandom } from 'react-icons/gi';

// Single source of truth for the cross-game catalogue shown at the bottom of
// Home and (if needed) inside individual game pages.
const GAMES = [
  {
    name: 'Shuffle Card',
    tag: 'Live · Card',
    desc: 'Bet on 3 cards drawn from a shuffled deck each round. Pick exact cards, a rank, suit, or color.',
    payouts: 'Single 3x · Dual 50x · Triple 500x · Rank 4x · Suit 2x · Color 2x',
  },
  {
    name: 'Mutka King',
    tag: 'Live · Card',
    desc: '4-card draw from a 52-card deck. Pick exact cards, a rank, suit, or color.',
    payouts: '1c 2x · 2c 9x · 3c 100x · 4c 500x · Rank 3x · Suit 2x · Color 2x',
  },
  {
    name: 'UNO King',
    tag: 'Live · Card',
    desc: '4 cards drawn from a 54-card UNO deck each round. Bet on color, number, action, wild, or exact cards.',
    payouts: 'Color 2x · Number 3x · Action 3x · Wild 6x · 1c 2x to 4c 500x',
  },
  {
    name: '7-Digit Lottery',
    tag: 'Live · Lottery',
    desc: 'Pick a 7-digit ticket; partial matches still pay. Live draws on a fixed schedule.',
    payouts: 'Tiered by digits matched · Jackpot for all 7',
  },
  {
    name: 'Lucky Spin',
    tag: 'Wheel',
    desc: 'Spin the wheel — landing slot determines your multiplier.',
    payouts: 'Variable · up to 50x',
  },
  {
    name: 'Coin Flip',
    tag: 'Classic',
    desc: 'Pick heads or tails. Simple 50/50 with instant settle.',
    payouts: '~1.96x on a hit',
  },
  {
    name: 'Dice Roll',
    tag: 'Classic',
    desc: 'Set an over/under target; multiplier scales with the chance you take.',
    payouts: 'Variable · risk-based',
  },
  {
    name: 'Arrow Roulette',
    tag: 'Wheel',
    desc: 'Spinning arrow lands on a colored sector — bet on the sector or color.',
    payouts: 'Sector & color tiers',
  },
  {
    name: 'Dragon Tower',
    tag: 'Crash · Skill',
    desc: 'Climb floors of the tower; cash out before you pick the cursed tile.',
    payouts: 'Compounds × ~1.94 per floor',
  },
  {
    name: 'Ice Field',
    tag: 'Crash · Skill',
    desc: 'Step across the ice — each safe step grows your multiplier; cash out anytime.',
    payouts: 'Compounding by step',
  },
  {
    name: 'Balloon Pop',
    tag: 'Crash',
    desc: 'Inflate the balloon for higher multipliers — pop and you lose your stake.',
    payouts: '1.5x · 2x · 3x · 5x · 10x · 25x presets',
  },
  {
    name: 'Fuse',
    tag: 'Crash',
    desc: 'Light the fuse — defuse before it burns out to lock in your multiplier.',
    payouts: '1.5x · 2x · 3x · 5x · 10x · 25x presets',
  },
  {
    name: 'Egg Hatch',
    tag: 'Mystery',
    desc: 'Choose an egg; hatch reveals a random multiplier from a weighted pool.',
    payouts: '0x to 15x weighted',
  },
];

export default function AllGamesAtAGlance({ className = '', maxHeight = '520px' }) {
  return (
    <div className={`rounded-xl bg-dark-700/50 overflow-hidden ${className}`}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-dark-600/50">
        <GiCardRandom className="w-4 h-4 text-accent" />
        <h3 className="text-white font-semibold text-sm">All Games at a Glance</h3>
      </div>
      <div className="divide-y divide-dark-600/40 overflow-y-auto" style={{ maxHeight }}>
        {GAMES.map((g, i) => (
          <details key={i} className="group">
            <summary className="flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer list-none hover:bg-dark-800/30">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-white text-xs font-semibold truncate">{g.name}</span>
                <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent text-[9px] font-bold uppercase tracking-wider shrink-0">
                  {g.tag}
                </span>
              </div>
              <span className="text-accent text-lg font-bold group-open:rotate-45 transition-transform shrink-0">+</span>
            </summary>
            <div className="px-4 pb-3 pt-1 text-xs text-gray-400 leading-relaxed space-y-1.5">
              <p>{g.desc}</p>
              <p className="text-[10px] text-gold-light/90 font-mono">{g.payouts}</p>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
