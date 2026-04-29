import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiChevronRight, FiTrendingUp, FiPlay, FiZap, FiStar, FiTarget, FiLayers, FiGrid, FiCrosshair, FiGift, FiAlertTriangle } from 'react-icons/fi';
import { GiTwoCoins } from 'react-icons/gi';
import { getNumbers } from '../services/api';
import { useCurrency } from '../contexts/CurrencyContext';

const ALL_GAMES = [
  { name: 'Coin Flip', key: 'coin-flip', icon: GiTwoCoins, maxWin: '1.95x', color: 'from-yellow-500/20 to-amber-500/20', border: 'border-yellow-500/30', iconColor: 'text-yellow-400' },
  { name: 'Dice Roll', key: 'dice-roll', icon: FiZap, maxWin: '5.7x', color: 'from-blue-500/20 to-cyan-500/20', border: 'border-blue-500/30', iconColor: 'text-blue-400' },
  { name: 'Lucky Spin', key: 'lucky-spin', icon: FiStar, maxWin: '10x', color: 'from-purple-500/20 to-pink-500/20', border: 'border-purple-500/30', iconColor: 'text-purple-400' },
  { name: 'Balloon Pop', key: 'balloon-pop', icon: FiTarget, maxWin: '50x', color: 'from-red-500/20 to-pink-500/20', border: 'border-red-500/30', iconColor: 'text-red-400' },
  { name: 'Dragon Tower', key: 'dragon-tower', icon: FiLayers, maxWin: '200x', color: 'from-amber-500/20 to-orange-500/20', border: 'border-amber-500/30', iconColor: 'text-amber-400' },
  { name: 'Ice Field', key: 'ice-field', icon: FiGrid, maxWin: '84x', color: 'from-cyan-500/20 to-blue-500/20', border: 'border-cyan-500/30', iconColor: 'text-cyan-400' },
  { name: 'Arrow Roulette', key: 'arrow-roulette', icon: FiCrosshair, maxWin: '10x', color: 'from-red-500/20 to-orange-500/20', border: 'border-red-500/30', iconColor: 'text-red-400' },
  { name: 'Egg Hatch', key: 'egg-hatch', icon: FiGift, maxWin: '15x', color: 'from-amber-500/20 to-yellow-500/20', border: 'border-amber-500/30', iconColor: 'text-amber-400' },
  { name: 'Fuse', key: 'fuse', icon: FiAlertTriangle, maxWin: '50x', color: 'from-orange-500/20 to-red-500/20', border: 'border-orange-500/30', iconColor: 'text-orange-400' },
];

function GameCrossPromo({ currentGame }) {
  const { formatCurrency } = useCurrency();
  const [hotNumbers, setHotNumbers] = useState([]);

  // Filter out current game and pick 4 random others
  const otherGames = ALL_GAMES.filter(g => g.key !== currentGame)
    .sort(() => 0.5 - Math.random())
    .slice(0, 4);

  useEffect(() => {
    getNumbers({ limit: 5, offset: 0 })
      .then(res => {
        const nums = (res.data.data || [])
          .filter(n => n.votes > 0 || n.owner)
          .slice(0, 5);
        setHotNumbers(nums);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="mt-6 space-y-4">
      {/* Hot Numbers */}
      {hotNumbers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl bg-dark-700/40 border border-white/5 p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FiTrendingUp className="w-4 h-4 text-accent" />
              <h3 className="text-white font-semibold text-sm">Trending Numbers</h3>
            </div>
            <Link to="/" className="text-accent text-xs font-medium flex items-center gap-1 hover:underline">
              View All <FiChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {hotNumbers.map((num) => (
              <Link
                key={num.number}
                to={`/number/${num.number}`}
                className="flex-shrink-0 w-[130px] rounded-lg bg-dark-800/60 border border-dark-400/30 hover:border-accent/30 p-3 transition-all"
              >
                <p className="text-white font-mono font-bold text-sm tracking-wider">{num.number}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-accent text-xs font-semibold">{formatCurrency(num.price)}</span>
                  {num.votes > 0 && (
                    <span className="text-gray-500 text-[10px]">{num.votes} votes</span>
                  )}
                </div>
                {num.owner && (
                  <p className="text-gray-600 text-[10px] mt-1 truncate">by {num.owner}</p>
                )}
              </Link>
            ))}
          </div>
        </motion.div>
      )}

      {/* Other Games */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-xl bg-dark-700/40 border border-white/5 p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FiPlay className="w-4 h-4 text-accent" />
            <h3 className="text-white font-semibold text-sm">Try Other Games</h3>
          </div>
          <Link to="/games" className="text-accent text-xs font-medium flex items-center gap-1 hover:underline">
            All Games <FiChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {otherGames.map((game) => (
            <Link
              key={game.key}
              to={`/games/${game.key}`}
              className={`rounded-lg bg-gradient-to-br ${game.color} border ${game.border} p-3 hover:brightness-110 transition-all relative overflow-hidden`}
            >
              <game.icon className={`absolute -right-1 -bottom-1 w-10 h-10 ${game.iconColor} opacity-[0.08]`} />
              <div className="relative flex items-center gap-2">
                <div className="w-8 h-8 shrink-0 rounded-md bg-dark-700/60 border border-white/10 flex items-center justify-center">
                  <game.icon className={`w-3.5 h-3.5 ${game.iconColor}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-white text-xs font-semibold truncate">{game.name}</p>
                  <p className="text-accent text-[10px] font-bold">up to {game.maxWin}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export default GameCrossPromo;
