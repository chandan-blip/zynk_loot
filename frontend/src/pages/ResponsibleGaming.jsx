import { motion } from 'framer-motion';
import { FiHeart, FiAlertTriangle, FiCheckCircle, FiPhone, FiShield, FiClock, FiDollarSign, FiUsers } from 'react-icons/fi';
import usePageTitle from '../hooks/usePageTitle';
import PageHeader from '../components/PageHeader';

const tips = [
  {
    icon: FiDollarSign,
    title: 'Set a Budget',
    description: 'Decide how much you can afford to spend before you start playing. Never spend more than you can afford to lose.',
  },
  {
    icon: FiClock,
    title: 'Set Time Limits',
    description: 'Take regular breaks and set time limits for your gaming sessions. Don\'t let gaming interfere with your daily life.',
  },
  {
    icon: FiShield,
    title: 'Play for Fun',
    description: 'Gaming should be entertainment, not a way to make money. Enjoy the experience regardless of the outcome.',
  },
  {
    icon: FiUsers,
    title: 'Talk to Someone',
    description: 'If you feel gaming is becoming a problem, reach out to friends, family, or a professional counselor.',
  },
];

const warningSignsItems = [
  'Spending more money than you planned',
  'Chasing losses by playing more',
  'Borrowing money to play',
  'Neglecting work, studies, or relationships',
  'Feeling anxious or irritable when not playing',
  'Lying about how much time or money you spend gaming',
  'Playing to escape problems or negative feelings',
  'Difficulty stopping even when you want to',
];

const platformTools = [
  {
    icon: FiDollarSign,
    title: 'Deposit Limits',
    description: 'Set daily, weekly, or monthly deposit limits to control your spending.',
  },
  {
    icon: FiClock,
    title: 'Session Reminders',
    description: 'Receive notifications when you\'ve been playing for extended periods.',
  },
  {
    icon: FiShield,
    title: 'Self-Exclusion',
    description: 'Temporarily or permanently exclude yourself from the platform if needed.',
  },
  {
    icon: FiCheckCircle,
    title: 'Transaction History',
    description: 'Full visibility into your spending and gaming activity at all times.',
  },
];

const helpResources = [
  { name: 'National Problem Gambling Helpline', detail: '1-800-522-4700', available: '24/7, Free & Confidential' },
  { name: 'Gamblers Anonymous', detail: 'www.gamblersanonymous.org', available: 'Online support & meetings' },
  { name: 'LOOT Support Team', detail: 'support@lootmarket.store', available: '24/7 Platform Support' },
];

function ResponsibleGaming() {
  usePageTitle('Responsible Gaming');

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader icon={FiHeart} title="Responsible Gaming" description="Play safe, play smart" />

      {/* Commitment */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-dark-800/50 rounded-lg border border-dark-400/30 p-5 sm:p-6 mb-6"
      >
        <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
          At LOOT, we are committed to promoting responsible gaming. We believe gaming should
          be a fun and enjoyable form of entertainment. We provide tools and resources to help
          you stay in control and make informed decisions about your gaming activity.
        </p>
      </motion.div>

      {/* Tips */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {tips.map((tip, index) => (
          <motion.div
            key={tip.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-dark-800/50 rounded-lg border border-dark-400/30 p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <tip.icon className="w-5 h-5 text-accent" />
              </div>
              <h3 className="text-white font-semibold">{tip.title}</h3>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">{tip.description}</p>
          </motion.div>
        ))}
      </div>

      {/* Warning Signs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-red-500/5 rounded-lg border border-red-500/20 p-5 sm:p-6 mb-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
            <FiAlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <h3 className="text-lg font-bold text-white">Warning Signs</h3>
        </div>
        <p className="text-gray-400 text-sm mb-4">
          If you or someone you know shows any of these signs, it may be time to seek help:
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {warningSignsItems.map((sign, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
              <span className="text-gray-400 text-sm">{sign}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Platform Tools */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mb-6"
      >
        <h2 className="text-lg font-bold text-white mb-4">Our Tools to Help You</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {platformTools.map((tool) => (
            <div key={tool.title} className="bg-dark-800/50 rounded-lg border border-dark-400/30 p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                <tool.icon className="w-4 h-4 text-accent" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">{tool.title}</h3>
                <p className="text-gray-500 text-xs mt-1">{tool.description}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Help Resources */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-gradient-to-br from-accent/10 to-emerald-500/5 rounded-lg border border-accent/20 p-5 sm:p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <FiPhone className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Need Help?</h3>
            <p className="text-gray-400 text-sm">Free and confidential resources are available</p>
          </div>
        </div>
        <div className="space-y-3">
          {helpResources.map((resource, i) => (
            <div key={i} className="flex items-center justify-between bg-dark-800/30 rounded-lg p-3">
              <div>
                <p className="text-white text-sm font-medium">{resource.name}</p>
                <p className="text-gray-500 text-xs">{resource.available}</p>
              </div>
              <span className="text-accent text-sm font-semibold">{resource.detail}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export default ResponsibleGaming;
