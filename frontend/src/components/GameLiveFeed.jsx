import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import socketService from '../services/socket';

const WIN_TYPES = ['win', 'game_win'];

function GameLiveFeed() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const unsub = socketService.onActivityNew?.((activity) => {
      const isWin = WIN_TYPES.includes(activity.type);
      const item = {
        id: activity.id,
        username: activity.username,
        amount: activity.amount,
        isWin,
      };

      setItems(prev => [...prev.slice(-2), item]);

      setTimeout(() => {
        setItems(prev => prev.filter(i => i.id !== item.id));
      }, 3500);
    });

    return () => unsub?.();
  }, []);

  return (
    <div className="absolute top-36 right-2 md:right-16 w-auto h-10 pointer-events-none z-10">
      <AnimatePresence>
        {items.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: [0, 0.9, 0.9, 0], y: -4 }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
            className="absolute right-0 flex whitespace-nowrap"
          >
            <span className="text-[9px] font-medium opacity-70">
              {item.username} {item.isWin ? 'won' : 'lost'} <span className={`text-[12px] font-bold ${item.isWin ? 'text-green-500' : 'text-red-500'}`}>{item.isWin ? '+' : '-'} {item.amount}Z</span>
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default GameLiveFeed;
