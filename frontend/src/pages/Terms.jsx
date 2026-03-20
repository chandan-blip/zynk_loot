import { motion } from 'framer-motion';
import { FiFileText, FiCheck } from 'react-icons/fi';
import usePageTitle from '../hooks/usePageTitle';
import PageHeader from '../components/PageHeader';

const sections = [
  {
    title: '1. Acceptance of Terms',
    content: `By accessing or using the LOOT platform, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing this platform.

These terms apply to all users, including visitors, registered users, and participants in any games or draws offered on the platform.`,
  },
  {
    title: '2. Account Registration',
    content: `To use certain features of our platform, you must register for an account. You agree to:

\u2022 Provide accurate, current, and complete information
\u2022 Maintain and update your information to keep it accurate
\u2022 Maintain the security of your password and account
\u2022 Accept responsibility for all activities under your account
\u2022 Notify us immediately of any unauthorized use
\u2022 Be at least 18 years of age

You may not create multiple accounts. One account per person is strictly enforced.`,
  },
  {
    title: '3. Platform Services',
    content: `LOOT provides a number-based draw platform where users can:

\u2022 Purchase 7-digit numbers for participation in draws
\u2022 Vote for numbers to increase community engagement
\u2022 Win prizes based on matching drawn numbers
\u2022 Trade and transfer numbers with other users
\u2022 Participate in instant games and other activities

All services are provided on an "as is" and "as available" basis. We reserve the right to modify, suspend, or discontinue any aspect of the platform at any time.`,
  },
  {
    title: '4. Draws & Prizes',
    content: `\u2022 Draws are conducted using a cryptographically secure random number generator
\u2022 Prize distribution follows the published rules available on our Rules page
\u2022 Exact Match (7 digits): 80% of the prize pool
\u2022 Near Match (6 digits): 10% of the prize pool (shared among winners)
\u2022 Platform fee is deducted as published
\u2022 Winnings are credited to your account balance upon draw completion
\u2022 All draw results are final and non-contestable
\u2022 We reserve the right to void results in cases of suspected fraud or technical error`,
  },
  {
    title: '5. Payments & Withdrawals',
    content: `\u2022 All purchases are made using Zynk (Z), the platform currency
\u2022 Zynk can be purchased through approved payment methods
\u2022 Minimum withdrawal amounts apply as displayed on the platform
\u2022 Withdrawals are processed within 24-48 business hours
\u2022 We reserve the right to request identity verification before processing withdrawals
\u2022 Refunds are issued at our sole discretion
\u2022 You are responsible for any taxes applicable to your winnings`,
  },
  {
    title: '6. Prohibited Conduct',
    content: `You agree not to:

\u2022 Use the platform for any illegal or unauthorized purpose
\u2022 Create or use multiple accounts
\u2022 Use automated scripts, bots, or similar tools
\u2022 Exploit bugs, glitches, or vulnerabilities
\u2022 Collude with other users to manipulate outcomes
\u2022 Engage in money laundering or fraudulent activities
\u2022 Harass, abuse, or harm other users
\u2022 Attempt to reverse-engineer or hack the platform
\u2022 Share your account credentials with others

Violation of these terms may result in immediate account suspension or termination.`,
  },
  {
    title: '7. Intellectual Property',
    content: `All content on the LOOT platform, including but not limited to text, graphics, logos, icons, images, software, and design elements, is the property of LOOT and is protected by applicable intellectual property laws.

You may not reproduce, distribute, modify, or create derivative works from any content on this platform without our express written permission.`,
  },
  {
    title: '8. Limitation of Liability',
    content: `To the fullest extent permitted by law, LOOT shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to:

\u2022 Loss of profits, data, or other intangible losses
\u2022 Service interruptions or platform downtime
\u2022 Unauthorized access to your account
\u2022 Any third-party conduct on the platform
\u2022 Technical malfunctions or errors

Our total liability shall not exceed the amount you have deposited in the preceding 12 months.`,
  },
  {
    title: '9. Account Termination',
    content: `We may suspend or terminate your account at our discretion if:

\u2022 You violate these Terms of Service
\u2022 You engage in fraudulent or suspicious activity
\u2022 You fail to provide requested verification documents
\u2022 We are required to do so by law
\u2022 Your account has been inactive for an extended period

Upon termination, remaining legitimate balances may be withdrawn subject to verification.`,
  },
  {
    title: '10. Changes to Terms',
    content: `We reserve the right to modify these Terms of Service at any time. Changes become effective upon posting to the platform. Your continued use after changes are posted constitutes acceptance of the modified terms.

We will make reasonable efforts to notify users of significant changes via email or platform notifications.`,
  },
];

function Terms() {
  usePageTitle('Terms of Service');

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader icon={FiFileText} title="Terms of Service" description="Last updated: March 2026" />

      {/* Introduction */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-dark-800/50 rounded-lg border border-dark-400/30 p-5 sm:p-6 mb-6"
      >
        <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
          Welcome to LOOT. These Terms of Service govern your use of our platform and services.
          By using LOOT, you agree to these terms in their entirety. Please read them carefully
          before using our services.
        </p>
      </motion.div>

      {/* Sections */}
      <div className="space-y-4 sm:space-y-3">
        {sections.map((section, index) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-dark-800/50 rounded-lg border border-dark-400/30 p-5 sm:p-6"
          >
            <h2 className="text-lg font-bold text-white mb-3">{section.title}</h2>
            <div className="text-gray-400 text-sm sm:text-base leading-relaxed whitespace-pre-line">
              {section.content}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Agreement */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="mt-6 bg-gradient-to-br from-accent/10 to-emerald-500/5 rounded-lg border border-accent/20 p-5 sm:p-6 text-center"
      >
        <div className="flex items-center justify-center gap-2 mb-2">
          <FiCheck className="w-5 h-5 text-accent" />
          <h3 className="text-lg font-bold text-white">Your Agreement</h3>
        </div>
        <p className="text-gray-400 text-sm sm:text-base max-w-2xl mx-auto">
          By creating an account or using LOOT, you acknowledge that you have read, understood,
          and agree to be bound by these Terms of Service and our Privacy Policy.
        </p>
      </motion.div>
    </div>
  );
}

export default Terms;
