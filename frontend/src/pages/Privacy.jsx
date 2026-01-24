import { motion } from 'framer-motion';
import { FiShield, FiLock, FiEye, FiDatabase, FiMail, FiGlobe } from 'react-icons/fi';

const sections = [
  {
    icon: FiDatabase,
    title: 'Information We Collect',
    content: `We collect information you provide directly to us, including:

• Account information (username, email, password)
• Profile information (display name, avatar)
• Transaction history and game activity
• Communications with our support team

We also automatically collect certain information when you use our platform, including device information, IP address, and usage patterns.`,
  },
  {
    icon: FiEye,
    title: 'How We Use Your Information',
    content: `We use the information we collect to:

• Provide, maintain, and improve our services
• Process transactions and send related information
• Send technical notices and support messages
• Respond to your comments and questions
• Monitor and analyze trends and usage
• Detect, investigate, and prevent fraudulent transactions
• Personalize and improve your experience`,
  },
  {
    icon: FiLock,
    title: 'Data Security',
    content: `We implement appropriate security measures to protect your personal information:

• Encryption of data in transit and at rest
• Regular security assessments and audits
• Access controls and authentication
• Secure data storage infrastructure
• Employee training on data protection

While we strive to protect your information, no method of transmission over the Internet is 100% secure.`,
  },
  {
    icon: FiGlobe,
    title: 'Information Sharing',
    content: `We do not sell, trade, or rent your personal information to third parties. We may share your information only in the following circumstances:

• With your consent
• To comply with legal obligations
• To protect our rights and prevent fraud
• With service providers who assist our operations
• In connection with a merger or acquisition`,
  },
  {
    icon: FiMail,
    title: 'Communications',
    content: `We may send you communications about:

• Account and transaction updates
• Security alerts and notifications
• Promotional offers (with your consent)
• Changes to our policies

You can opt out of promotional communications at any time through your account settings.`,
  },
];

function Privacy() {
  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8 sm:mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg bg-accent/10 mb-4">
          <FiShield className="w-8 h-8 text-accent" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
          Privacy Policy
        </h1>
        <p className="text-gray-500 text-sm sm:text-base">
          Last updated: January 2025
        </p>
      </div>

      {/* Introduction */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-dark-800/50 rounded-lg sm:rounded-lg border border-dark-400/30 p-5 sm:p-6 mb-6"
      >
        <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
          At LOOT, we take your privacy seriously. This Privacy Policy explains how we collect,
          use, disclose, and safeguard your information when you use our platform. Please read
          this policy carefully to understand our practices regarding your personal data.
        </p>
      </motion.div>

      {/* Sections */}
      <div className="space-y-4 sm:space-y-3">
        {sections.map((section, index) => (
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
              <h2 className="text-lg font-bold text-white">{section.title}</h2>
            </div>
            <div className="text-gray-400 text-sm sm:text-base leading-relaxed whitespace-pre-line">
              {section.content}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Your Rights */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="mt-6 bg-gradient-to-br from-accent/10 to-emerald-500/5 rounded-lg sm:rounded-lg border border-accent/20 p-5 sm:p-6"
      >
        <h3 className="text-lg font-bold text-white mb-3">Your Rights</h3>
        <p className="text-gray-400 text-sm sm:text-base mb-4">
          You have the right to:
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            'Access your personal data',
            'Correct inaccurate data',
            'Request data deletion',
            'Object to data processing',
            'Data portability',
            'Withdraw consent',
          ].map((right, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="text-gray-300 text-sm">{right}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Contact */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="mt-6 p-5 sm:p-6 bg-dark-800/50 rounded-lg sm:rounded-lg border border-dark-400/30 text-center"
      >
        <h3 className="text-lg font-bold text-white mb-2">Questions?</h3>
        <p className="text-gray-400 text-sm sm:text-base mb-4">
          If you have any questions about this Privacy Policy, please contact us.
        </p>
        <button className="px-6 py-3 bg-accent text-dark-900 font-semibold rounded-lg hover:bg-accent/90 transition-colors">
          Contact Privacy Team
        </button>
      </motion.div>
    </div>
  );
}

export default Privacy;
