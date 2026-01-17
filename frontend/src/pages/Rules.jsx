import { motion } from 'framer-motion';
import { FiFileText, FiCheck, FiAlertTriangle, FiAward, FiUsers, FiDollarSign } from 'react-icons/fi';
import { GiTwoCoins } from 'react-icons/gi';

const rules = [
  {
    icon: FiUsers,
    title: 'Eligibility',
    items: [
      'Must be 18 years or older to participate',
      'One account per person',
      'Valid email address required',
      'Must agree to Terms of Service',
    ],
  },
  {
    icon: GiTwoCoins,
    title: 'Entry & Participation',
    items: [
      'Each number costs 1 Zynk to purchase',
      'Numbers are 7 digits long (0000000-9999999)',
      'You can own multiple numbers',
      'Pool is sum of all number purchases',
    ],
  },
  {
    icon: FiAward,
    title: 'Prize Distribution',
    items: [
      'Exact Match (7 digits): 80% of pool',
      'Near Match (6 digits): Share 10% of pool',
      'Near matches are numbers with same first 6 digits',
      'Example: If 8494849 wins, 8494840-8494848 are near matches',
      'Platform fee: 50% of pool',
    ],
  },
  {
    icon: FiDollarSign,
    title: 'Payouts',
    items: [
      'Winnings are credited instantly',
      'Minimum withdrawal: 500 coins',
      'Withdrawals processed within 24-48 hours',
      'Platform fee: 50% of pool (covers operations)',
    ],
  },
];

const prohibitedActions = [
  'Using multiple accounts',
  'Exploiting bugs or glitches',
  'Colluding with other players',
  'Using automated bots or scripts',
  'Sharing account credentials',
  'Fraudulent payment activities',
];

function Rules() {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8 sm:mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg bg-accent/10 mb-4">
          <FiFileText className="w-8 h-8 text-accent" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
          Game Rules
        </h1>
        <p className="text-gray-500 text-sm sm:text-base">
          Please read and understand the rules before participating
        </p>
      </div>

      {/* Rules Grid */}
      <div className="grid sm:grid-cols-2 gap-4 sm:gap-6 mb-8">
        {rules.map((section, index) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-dark-800/50 rounded-lg sm:rounded-lg border border-dark-400/30 p-5 sm:p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <section.icon className="w-5 h-5 text-accent" />
              </div>
              <h3 className="text-lg font-bold text-white">{section.title}</h3>
            </div>
            <ul className="space-y-3">
              {section.items.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <FiCheck className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                  <span className="text-gray-400 text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>

      {/* Prohibited Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-red-500/5 rounded-lg sm:rounded-lg border border-red-500/20 p-5 sm:p-6 mb-8"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
            <FiAlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <h3 className="text-lg font-bold text-white">Prohibited Actions</h3>
        </div>
        <p className="text-gray-400 text-sm mb-4">
          The following actions are strictly prohibited and may result in account suspension:
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {prohibitedActions.map((action, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
              <span className="text-gray-400 text-sm">{action}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Fair Play Notice */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-gradient-to-br from-accent/10 to-emerald-500/5 rounded-lg sm:rounded-lg border border-accent/20 p-5 sm:p-6 text-center"
      >
        <h3 className="text-lg font-bold text-white mb-2">
          Provably Fair Gaming
        </h3>
        <p className="text-gray-400 text-sm sm:text-base max-w-2xl mx-auto">
          LOOT uses a cryptographically secure random number generator to ensure all rounds are
          completely fair and transparent. Every result can be independently verified.
        </p>
      </motion.div>
    </div>
  );
}

export default Rules;
