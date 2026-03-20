import { motion } from 'framer-motion';
import { FiLock, FiShield, FiCheck, FiServer, FiKey, FiEye, FiRefreshCw, FiAlertTriangle } from 'react-icons/fi';
import usePageTitle from '../hooks/usePageTitle';
import PageHeader from '../components/PageHeader';

const securityFeatures = [
  {
    icon: FiLock,
    title: 'End-to-End Encryption',
    description: 'All data transmitted between your device and our servers is encrypted using TLS 1.3, the latest encryption standard.',
    items: ['256-bit AES encryption', 'TLS 1.3 protocol', 'Encrypted data at rest', 'Secure key management'],
  },
  {
    icon: FiKey,
    title: 'Account Protection',
    description: 'Multiple layers of security protect your account from unauthorized access.',
    items: ['Secure password hashing (bcrypt)', 'Session management & auto-logout', 'Login attempt monitoring', 'Suspicious activity alerts'],
  },
  {
    icon: FiServer,
    title: 'Infrastructure Security',
    description: 'Our servers are hosted in secure, compliant data centers with enterprise-grade protection.',
    items: ['DDoS protection', 'Regular security patches', 'Network firewall protection', 'Redundant backup systems'],
  },
  {
    icon: FiEye,
    title: 'Fraud Prevention',
    description: 'Advanced systems monitor and detect fraudulent activity to protect all users.',
    items: ['Real-time transaction monitoring', 'Multi-account detection', 'Bot & automation prevention', 'IP & device fingerprinting'],
  },
];

const fairnessFeatures = [
  {
    title: 'Cryptographic RNG',
    description: 'Draw numbers are generated using a cryptographically secure random number generator, ensuring no one can predict or manipulate results.',
  },
  {
    title: 'Provably Fair',
    description: 'Every draw result can be independently verified. We publish the methodology and allow users to audit outcomes.',
  },
  {
    title: 'No Insider Access',
    description: 'Winning numbers are generated automatically. No employee or administrator has knowledge of or access to upcoming results.',
  },
  {
    title: 'Transparent Prize Pool',
    description: 'Prize pools are calculated in real-time based on actual purchases. All prize distributions follow published rules.',
  },
];

const userTips = [
  'Use a strong, unique password for your LOOT account',
  'Never share your login credentials with anyone',
  'Log out from shared or public devices',
  'Keep your email address up to date for security notifications',
  'Report suspicious activity immediately',
  'Be cautious of phishing emails or fake LOOT websites',
];

function Security() {
  usePageTitle('Security');

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader icon={FiShield} title="Security" description="How we keep you safe" />

      {/* Intro */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-dark-800/50 rounded-lg border border-dark-400/30 p-5 sm:p-6 mb-6"
      >
        <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
          Security is at the foundation of everything we do at LOOT. We employ industry-leading
          security measures to protect your account, your funds, and your personal information.
          Our platform is built with security-first architecture and undergoes regular audits.
        </p>
      </motion.div>

      {/* Security Features */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {securityFeatures.map((feature, index) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-dark-800/50 rounded-lg border border-dark-400/30 p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <feature.icon className="w-5 h-5 text-accent" />
              </div>
              <h3 className="text-white font-semibold">{feature.title}</h3>
            </div>
            <p className="text-gray-400 text-sm mb-3">{feature.description}</p>
            <ul className="space-y-2">
              {feature.items.map((item, i) => (
                <li key={i} className="flex items-center gap-2">
                  <FiCheck className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                  <span className="text-gray-500 text-xs">{item}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>

      {/* Provably Fair */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mb-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <FiRefreshCw className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-bold text-white">Provably Fair Gaming</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {fairnessFeatures.map((feature, index) => (
            <div key={feature.title} className="bg-dark-800/50 rounded-lg border border-dark-400/30 p-4">
              <h3 className="text-white font-semibold text-sm mb-2">{feature.title}</h3>
              <p className="text-gray-500 text-xs leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* User Tips */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-gradient-to-br from-accent/10 to-emerald-500/5 rounded-lg border border-accent/20 p-5 sm:p-6 mb-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <FiAlertTriangle className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Protect Your Account</h3>
            <p className="text-gray-400 text-sm">Tips to keep your account secure</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {userTips.map((tip, i) => (
            <div key={i} className="flex items-start gap-2">
              <FiCheck className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
              <span className="text-gray-300 text-sm">{tip}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Report */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-dark-800/50 rounded-lg border border-dark-400/30 p-5 sm:p-6 text-center"
      >
        <h3 className="text-lg font-bold text-white mb-2">Report a Security Issue</h3>
        <p className="text-gray-400 text-sm sm:text-base mb-4 max-w-xl mx-auto">
          If you discover a security vulnerability or suspect unauthorized activity on your account,
          please contact us immediately.
        </p>
        <button className="px-6 py-3 bg-accent text-dark-900 font-semibold rounded-lg hover:bg-accent/90 transition-colors">
          Report Security Issue
        </button>
      </motion.div>
    </div>
  );
}

export default Security;
