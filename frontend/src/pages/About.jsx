import { motion } from 'framer-motion';
import { FiInfo, FiTarget, FiUsers, FiShield, FiZap, FiGlobe, FiAward, FiHeart } from 'react-icons/fi';
import usePageTitle from '../hooks/usePageTitle';
import PageHeader from '../components/PageHeader';
import { useCurrency } from '../contexts/CurrencyContext';

const values = [
  {
    icon: FiShield,
    title: 'Trust & Transparency',
    description: 'Every draw uses a cryptographically secure RNG. Results are provably fair and independently verifiable.',
  },
  {
    icon: FiUsers,
    title: 'Community First',
    description: 'Built for players, by players. Our platform is shaped by community feedback and participation.',
  },
  {
    icon: FiZap,
    title: 'Innovation',
    description: 'We constantly improve our platform with new features, games, and better user experiences.',
  },
  {
    icon: FiHeart,
    title: 'Responsible Gaming',
    description: 'We promote healthy gaming habits and provide tools for users to stay in control of their spending.',
  },
];

const buildStats = (formatCurrency) => [
  { label: 'Active Users', value: '50K+' },
  { label: 'Draws Completed', value: '10K+' },
  { label: 'Total Prizes Paid', value: `${formatCurrency(5000000)}+` },
  { label: 'Uptime', value: '99.9%' },
];

const milestones = [
  { year: '2024', title: 'Platform Launch', description: 'LOOT was founded with a vision to create a fair and transparent number draw platform.' },
  { year: '2024', title: 'Instant Games', description: 'Expanded beyond draws to offer instant games including Coin Flip, Dice Roll, and more.' },
  { year: '2025', title: 'Community Growth', description: 'Reached 50,000+ active users and introduced community voting features.' },
  { year: '2026', title: 'Investment Platform', description: 'Launched the investment system allowing users to grow their holdings.' },
];

function About() {
  usePageTitle('About Us');
  const { formatCurrency } = useCurrency();
  const stats = buildStats(formatCurrency);

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader icon={FiInfo} title="About LOOT" description="Our story and mission" />

      {/* Mission */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-dark-800/50 rounded-lg border border-dark-400/30 p-5 sm:p-6 mb-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <FiTarget className="w-5 h-5 text-accent" />
          </div>
          <h2 className="text-lg font-bold text-white">Our Mission</h2>
        </div>
        <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
          LOOT is a next-generation number draw platform built on the principles of fairness,
          transparency, and community trust. Our mission is to provide an exciting and secure
          gaming experience where every user has a genuine, verifiable chance to win. We leverage
          advanced cryptographic technology to ensure that all outcomes are truly random and
          tamper-proof.
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            className="bg-dark-800/50 rounded-lg border border-dark-400/30 p-4 text-center"
          >
            <p className="text-xl sm:text-2xl font-bold text-accent">{stat.value}</p>
            <p className="text-gray-500 text-xs mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Our Values */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-6"
      >
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <FiAward className="w-5 h-5 text-accent" /> Our Values
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {values.map((value, index) => (
            <motion.div
              key={value.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.1 }}
              className="bg-dark-800/50 rounded-lg border border-dark-400/30 p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <value.icon className="w-5 h-5 text-accent" />
                </div>
                <h3 className="text-white font-semibold">{value.title}</h3>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">{value.description}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Milestones */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mb-6"
      >
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <FiGlobe className="w-5 h-5 text-accent" /> Our Journey
        </h2>
        <div className="space-y-3">
          {milestones.map((milestone, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + index * 0.1 }}
              className="flex gap-4 bg-dark-800/50 rounded-lg border border-dark-400/30 p-4"
            >
              <div className="flex-shrink-0 w-14 h-14 rounded-lg bg-accent/10 flex items-center justify-center">
                <span className="text-accent font-bold text-sm">{milestone.year}</span>
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">{milestone.title}</h3>
                <p className="text-gray-400 text-sm mt-1">{milestone.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="bg-gradient-to-br from-accent/10 to-emerald-500/5 rounded-lg border border-accent/20 p-5 sm:p-6 text-center"
      >
        <h3 className="text-lg font-bold text-white mb-2">Join the LOOT Community</h3>
        <p className="text-gray-400 text-sm sm:text-base max-w-2xl mx-auto">
          Be part of a growing community of players who trust LOOT for fair, transparent,
          and exciting gaming. Your next win could be just one number away.
        </p>
      </motion.div>
    </div>
  );
}

export default About;
