import { FiMinus, FiPlus } from 'react-icons/fi';
import { sounds } from '../utils/sounds';

export default function BetStepper({ amount, setAmount, disabled, step = 5, min = 5, max }) {
  const current = parseFloat(amount) || 0;

  const adjust = (delta) => {
    if (disabled) return;
    let next = current + delta;
    if (next < min) next = min;
    if (max != null && next > max) next = max;
    setAmount(String(next));
    sounds.tap?.();
  };

  return (
    <div className="flex items-center gap-2 mb-2">
      <button
        type="button"
        onClick={() => adjust(-step)}
        disabled={disabled || current <= min}
        className="w-11 h-11 rounded-lg bg-dark-700/60 border border-white/10 text-gray-300 hover:text-white hover:border-white/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center"
        aria-label="Decrease bet"
      >
        <FiMinus className="w-4 h-4" />
      </button>
      <input
        type="number"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        disabled={disabled}
        placeholder={`Min ${min} Z`}
        className="flex-1 h-11 px-3 rounded-lg bg-dark-700/60 border border-white/10 text-white text-center font-semibold placeholder-gray-500 focus:outline-none focus:border-accent/40 transition-colors"
      />
      <button
        type="button"
        onClick={() => adjust(step)}
        disabled={disabled || (max != null && current >= max)}
        className="w-11 h-11 rounded-lg bg-dark-700/60 border border-white/10 text-gray-300 hover:text-white hover:border-white/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center"
        aria-label="Increase bet"
      >
        <FiPlus className="w-4 h-4" />
      </button>
    </div>
  );
}
