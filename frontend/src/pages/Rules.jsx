import { motion } from 'framer-motion';
import { FiFileText, FiCheck, FiAlertTriangle, FiAward, FiUsers, FiDollarSign, FiClock, FiTrendingUp, FiHeart, FiShield, FiRefreshCw } from 'react-icons/fi';
import { GiTwoCoins } from 'react-icons/gi';
import usePageTitle from '../hooks/usePageTitle';
import PageHeader from '../components/PageHeader';

const rules = [
  {
    icon: FiUsers,
    title: 'Eligibility',
    items: [
      'Must be 18 years or older to participate',
      'One account per person — multiple accounts are strictly prohibited',
      'Valid email address required for registration',
      'Must agree to Terms of Service and Privacy Policy',
      'Users must comply with local laws and regulations',
    ],
  },
  {
    icon: GiTwoCoins,
    title: 'Numbers & Pricing',
    items: [
      'Numbers are 7 digits long (0000000 to 9999999)',
      'Base price starts from the configured amount (shown on Home page)',
      'Price increases as more digits are revealed during a draw',
      'You can purchase multiple numbers to increase your chances',
      'Numbers bought between draws are held as "pending" for the next session',
      'All purchases contribute to the prize pool',
    ],
  },
  {
    icon: FiClock,
    title: 'Draw Sessions',
    items: [
      'Up to 3 draw sessions per day: Morning, Evening, and Night',
      'Each session has its own prize pool and winning number',
      'Winning number is generated using a cryptographically secure RNG',
      'Digits are revealed one at a time over the draw period',
      'Numbers that don\'t match revealed digits are eliminated',
      'You can buy numbers for the current draw or the upcoming session',
    ],
  },
  {
    icon: FiAward,
    title: 'Prize Distribution',
    items: [
      'Exact Match (all 7 digits): 80% of the prize pool',
      'Near Match (first 6 digits): Share 10% of the prize pool',
      'Near matches are numbers with the same first 6 digits as the winner',
      'Example: If 8494849 wins, 8494840–8494848 are near matches',
      'If no exact match, the jackpot portion rolls over',
      'Platform fee is deducted from the pool to cover operations',
    ],
  },
  {
    icon: FiTrendingUp,
    title: 'Cash-Out & Multipliers',
    items: [
      'As digits are revealed and match, your ticket earns a multiplier',
      'Multiplier increases with each additional matched digit',
      'You can cash out at any time to lock in your current return',
      'Set auto-cashout to automatically cash out at a target match count',
      'Once cashed out, you receive the payout instantly',
      'Holding longer means higher potential return — but more risk',
    ],
  },
  {
    icon: FiHeart,
    title: 'Voting System',
    items: [
      'Vote for numbers you believe will win — voting is free',
      'Highly voted numbers appear higher in the numbers list',
      'If a number you voted for wins, you earn a small bonus reward',
      'You can remove your vote at any time before the draw ends',
      'Voting does not affect draw outcomes in any way',
    ],
  },
  {
    icon: FiDollarSign,
    title: 'Payments & Withdrawals',
    items: [
      'Winnings and cash-outs are credited to your balance instantly',
      'Minimum withdrawal amount: 500 Zynk',
      'Withdrawals are processed within 24–48 business hours',
      'Identity verification may be required for withdrawals',
      'You are responsible for any taxes applicable to your winnings',
      'Fraudulent deposits or chargebacks will result in account suspension',
    ],
  },
  {
    icon: FiRefreshCw,
    title: 'Instant Games',
    items: [
      'Instant games (Coin Flip, Dice, Spin, etc.) are separate from draws',
      'Each game has its own rules, odds, and maximum win multiplier',
      'All games use provably fair cryptographic RNG',
      'Minimum and maximum bet limits apply per game',
      'Winnings from games are credited to your balance immediately',
    ],
  },
];

const prohibitedActions = [
  'Creating or using multiple accounts',
  'Exploiting bugs, glitches, or platform vulnerabilities',
  'Colluding with other players to manipulate outcomes',
  'Using automated bots, scripts, or third-party tools',
  'Sharing your account credentials with others',
  'Fraudulent payment activities or chargebacks',
  'Abusive behavior towards other users or staff',
  'Attempting to reverse-engineer or hack the platform',
  'Money laundering or any form of financial fraud',
  'Circumventing any security or verification measures',
];

function Rules() {
  usePageTitle('Rules');

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader icon={FiFileText} title="Rules" description="How the platform works" />

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

      {/* Dispute Resolution */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-dark-800/50 rounded-lg sm:rounded-lg border border-dark-400/30 p-5 sm:p-6 mb-8"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <FiShield className="w-5 h-5 text-accent" />
          </div>
          <h3 className="text-lg font-bold text-white">Dispute Resolution</h3>
        </div>
        <ul className="space-y-3">
          {[
            'All draw results are generated by a tamper-proof cryptographic system and are final',
            'If you believe there is an error, contact support within 48 hours of the draw',
            'Disputes are reviewed by our team and resolved within 5 business days',
            'In case of a technical error, affected users will be compensated fairly',
            'LOOT reserves the right to void results in cases of proven fraud or system malfunction',
            'Decisions made by the LOOT team after review are considered final',
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <FiCheck className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
              <span className="text-gray-400 text-sm">{item}</span>
            </li>
          ))}
        </ul>
      </motion.div>

      {/* Fair Play Notice */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-gradient-to-br from-accent/10 to-emerald-500/5 rounded-lg sm:rounded-lg border border-accent/20 p-5 sm:p-6 text-center"
      >
        <h3 className="text-lg font-bold text-white mb-2">
          Provably Fair Gaming
        </h3>
        <p className="text-gray-400 text-sm sm:text-base max-w-2xl mx-auto">
          LOOT uses a cryptographically secure random number generator to ensure all draws and games
          are completely fair and transparent. No employee or administrator has access to upcoming results.
          Every outcome is independently verifiable. We are committed to maintaining the highest standards
          of integrity and fairness for all our users.
        </p>
      </motion.div>
    </div>
  );
}

export default Rules;
