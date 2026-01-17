/**
 * Prize Distribution Service
 *
 * Distribution Logic:
 * - Pool is sum of all number purchases (1 zynk per number)
 * - Exact match (7 digits): 40% of pool
 * - Near matches (6 digits match, different last digit): share 10% of pool
 * - Platform fee: 50% of pool
 *
 * Example: Winning number is 8494849
 * - 8494849 (exact match) → 40% of pool
 * - 8494840, 8494841, ..., 8494848 (up to 9 near matches) → share 10% of pool
 */

const calculateDistribution = (totalPool, nearMatchCount = 0) => {
  const exactMatchPrize = totalPool * 0.4; // 40% for exact match
  const nearMatchPool = totalPool * 0.1; // 10% shared among near matches
  const platformFee = totalPool * 0.5; // 50% platform fee

  const distribution = {
    exactMatch: {
      prize: exactMatchPrize,
      percentage: 40
    },
    nearMatches: {
      totalPool: nearMatchPool,
      count: nearMatchCount,
      perWinner: nearMatchCount > 0 ? nearMatchPool / nearMatchCount : nearMatchPool / 9,
      percentage: 10
    },
    platformFee: {
      amount: platformFee,
      percentage: 50
    }
  };

  return {
    totalPool,
    distribution,
    summary: {
      exactMatchPrize,
      nearMatchPoolTotal: nearMatchPool,
      nearMatchPerWinner: distribution.nearMatches.perWinner,
      platformFee
    }
  };
};

// Get near match numbers for a winning number (same prefix, different last digit)
const getNearMatchNumbers = (winningNumber) => {
  const prefix = winningNumber.substring(0, 6);
  const winningLastDigit = parseInt(winningNumber.charAt(6));

  const nearMatches = [];
  for (let i = 0; i <= 9; i++) {
    if (i !== winningLastDigit) {
      nearMatches.push(`${prefix}${i}`);
    }
  }
  return nearMatches;
};

module.exports = {
  calculateDistribution,
  getNearMatchNumbers
};
