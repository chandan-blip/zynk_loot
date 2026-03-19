// Demo mode hooks: mirrors real backend responses exactly.
// When user has zero balance, these replace the API call.
// 90% win rate with the user's entered bet amount.

function roll(winChance = 0.9) {
  return Math.random() < winChance;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Wraps result in the same shape as axios response: res.data.data
function apiShape(data) {
  return { data: { success: true, data: { ...data, isDemo: true } } };
}

// ── Coin Flip ──
// Backend: result='heads'|'tails', multiplier=1.95 on win
export function demoCoinFlip(betAmount, prediction) {
  const isWin = roll();
  const result = isWin ? prediction : (prediction === 'heads' ? 'tails' : 'heads');
  const multiplier = isWin ? 1.95 : 0;
  const winAmount = isWin ? Math.floor(betAmount * multiplier * 100) / 100 : 0;
  return apiShape({ betId: null, result, prediction, isWin, betAmount, winAmount, multiplier, newBalance: 0 });
}

// ── Dice Roll ──
// Backend: result='1'-'6', multiplier=5.7 on win
export function demoDiceRoll(betAmount, prediction) {
  const isWin = roll();
  const result = isWin ? prediction : pick([1,2,3,4,5,6].filter(n => n !== prediction));
  const multiplier = isWin ? 5.7 : 0;
  const winAmount = isWin ? Math.floor(betAmount * multiplier * 100) / 100 : 0;
  return apiShape({ betId: null, result: String(result), prediction: String(prediction), isWin, betAmount, winAmount, multiplier, newBalance: 0 });
}

// ── Lucky Spin ──
// Backend: result=segment.label, segmentIndex, multiplier from segment
const SPIN_SEGMENTS = [
  { label: '0x',   multiplier: 0,    weight: 30 },
  { label: '0.5x', multiplier: 0.5,  weight: 25 },
  { label: '1x',   multiplier: 1,    weight: 18 },
  { label: '1.5x', multiplier: 1.5,  weight: 12 },
  { label: '2x',   multiplier: 2,    weight: 7 },
  { label: '3x',   multiplier: 3,    weight: 4 },
  { label: '5x',   multiplier: 5,    weight: 2.5 },
  { label: '10x',  multiplier: 10,   weight: 1.5 },
];

export function demoLuckySpin(betAmount) {
  const isWin = roll();

  let selectedIndex;
  if (isWin) {
    // Pick a winning segment (multiplier > 1) weighted
    const winSegments = SPIN_SEGMENTS
      .map((s, i) => ({ ...s, i }))
      .filter(s => s.multiplier >= 1.5);
    selectedIndex = pick(winSegments).i;
  } else {
    // Pick a losing segment (0x or 0.5x)
    const loseSegments = SPIN_SEGMENTS
      .map((s, i) => ({ ...s, i }))
      .filter(s => s.multiplier < 1);
    selectedIndex = pick(loseSegments).i;
  }

  const segment = SPIN_SEGMENTS[selectedIndex];
  const multiplier = segment.multiplier;
  const actualWin = multiplier > 0;
  const winAmount = actualWin ? Math.floor(betAmount * multiplier * 100) / 100 : 0;

  return apiShape({ betId: null, result: segment.label, segmentIndex: selectedIndex, isWin: actualWin, betAmount, winAmount, multiplier, newBalance: 0 });
}

// ── Balloon Pop ──
export function demoBalloonPop(betAmount, cashoutMultiplier) {
  const isWin = roll();
  const popPoint = isWin
    ? cashoutMultiplier + Math.random() * 5
    : cashoutMultiplier * (0.3 + Math.random() * 0.5);
  const multiplier = cashoutMultiplier;
  const winAmount = isWin ? Math.floor(betAmount * multiplier * 100) / 100 : 0;
  const resultLabel = isWin ? `Popped at ${popPoint.toFixed(2)}x - You cashed out!` : `Popped at ${popPoint.toFixed(2)}x`;
  return apiShape({ betId: null, result: resultLabel, isWin, betAmount, winAmount, multiplier, popPoint, newBalance: 0 });
}

// ── Dragon Tower ──
export function demoDragonTower(betAmount, targetFloors) {
  const isWin = roll();
  const multiplier = isWin ? parseFloat(Math.pow(1.94, targetFloors).toFixed(2)) : 0;
  const survivedFloors = isWin ? targetFloors : Math.floor(Math.random() * targetFloors);
  const failedFloor = isWin ? null : survivedFloors + 1;
  const winAmount = isWin ? Math.floor(betAmount * multiplier * 100) / 100 : 0;
  const resultLabel = isWin ? `Cleared ${targetFloors} floors!` : `Failed at floor ${failedFloor}`;
  return apiShape({ betId: null, result: resultLabel, isWin, betAmount, winAmount, multiplier, targetFloors, survivedFloors, failedFloor, newBalance: 0 });
}

// ── Ice Field ──
export function demoIceField(betAmount, difficulty, targetRows) {
  const isWin = roll();
  const perRow = (5 / (5 - difficulty)) * 0.97;
  const multiplier = isWin ? parseFloat(Math.pow(perRow, targetRows).toFixed(2)) : 0;
  const survivedRows = isWin ? targetRows : Math.floor(Math.random() * targetRows);
  const failedRow = isWin ? null : survivedRows + 1;
  const winAmount = isWin ? Math.floor(betAmount * multiplier * 100) / 100 : 0;
  const resultLabel = isWin ? `Crossed ${targetRows} rows!` : `Fell at row ${failedRow}`;
  return apiShape({ betId: null, result: resultLabel, isWin, betAmount, winAmount, multiplier, difficulty, targetRows, survivedRows, failedRow, newBalance: 0 });
}

// ── Arrow Roulette ──
export function demoArrowRoulette(betAmount) {
  const isWin = roll();
  const winRings = [
    { label: '1.5x', multiplier: 1.5, index: 3 },
    { label: '2x', multiplier: 2, index: 4 },
    { label: '5x', multiplier: 5, index: 5 },
    { label: '10x', multiplier: 10, index: 6 },
  ];
  const loseRings = [
    { label: 'MISS', multiplier: 0, index: 0 },
    { label: '0.5x', multiplier: 0.5, index: 1 },
  ];
  const ring = isWin ? pick(winRings) : pick(loseRings);
  const winAmount = isWin ? Math.floor(betAmount * ring.multiplier * 100) / 100 : 0;
  return apiShape({ betId: null, result: ring.label, ringIndex: ring.index, isWin, betAmount, winAmount, multiplier: ring.multiplier, newBalance: 0 });
}

// ── Egg Hatch ──
export function demoEggHatch(betAmount) {
  const isWin = roll();
  const winEggs = [
    { label: '1.5x', multiplier: 1.5 },
    { label: '3x', multiplier: 3 },
    { label: '5x', multiplier: 5 },
    { label: '15x', multiplier: 15 },
  ];
  const loseEggs = [
    { label: '0x', multiplier: 0 },
    { label: '0.5x', multiplier: 0.5 },
  ];
  const egg = isWin ? pick(winEggs) : pick(loseEggs);
  const winAmount = isWin ? Math.floor(betAmount * egg.multiplier * 100) / 100 : 0;
  return apiShape({ betId: null, result: egg.label, isWin, betAmount, winAmount, multiplier: egg.multiplier, newBalance: 0 });
}

// ── Fuse ──
export function demoFuse(betAmount, cashoutMultiplier) {
  const isWin = roll();
  const boomPoint = isWin
    ? cashoutMultiplier + Math.random() * 5
    : cashoutMultiplier * (0.3 + Math.random() * 0.5);
  const multiplier = cashoutMultiplier;
  const winAmount = isWin ? Math.floor(betAmount * multiplier * 100) / 100 : 0;
  const resultLabel = isWin ? `Boom at ${boomPoint.toFixed(2)}x - You cut in time!` : `Boom at ${boomPoint.toFixed(2)}x`;
  return apiShape({ betId: null, result: resultLabel, isWin, betAmount, winAmount, multiplier, boomPoint, newBalance: 0 });
}

// Check if user should play in demo mode
export function isDemoMode(user) {
  return !user || parseFloat(user.balance || 0) <= 0;
}
