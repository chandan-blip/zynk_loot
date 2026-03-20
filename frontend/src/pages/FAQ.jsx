import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiHelpCircle, FiChevronDown, FiMessageCircle } from 'react-icons/fi';
import useStore from '../store/useStore';
import SupportChat from '../components/SupportChat';
import usePageTitle from '../hooks/usePageTitle';
import PageHeader from '../components/PageHeader';

const faqCategories = [
  {
    category: 'Getting Started',
    items: [
      {
        question: 'What is LOOT?',
        answer: 'LOOT is a number-based draw platform where you purchase 7-digit numbers and win prizes when your number matches the randomly drawn winning number. We also offer instant games like Coin Flip, Dice Roll, Lucky Spin, and more. Everything runs on Zynk (Z), our platform currency.'
      },
      {
        question: 'How do I create an account?',
        answer: 'Tap "Register" on the login screen, enter your email, username, and password. You must be at least 18 years old. Only one account per person is allowed — multiple accounts will be suspended.'
      },
      {
        question: 'What is Zynk (Z)?',
        answer: 'Zynk is the platform currency used for all transactions on LOOT — buying numbers, playing games, receiving prizes, and withdrawals. You can purchase Zynk through the Wallet page using supported payment methods.'
      },
      {
        question: 'Is LOOT free to use?',
        answer: 'Creating an account is free. To participate in draws or play games, you need Zynk. Number prices start from the base price and increase as digits are revealed during a draw.'
      },
    ],
  },
  {
    category: 'Draws & Numbers',
    items: [
      {
        question: 'How do draws work?',
        answer: 'Each draw has a 7-digit winning number generated using a cryptographically secure random number generator. Digits are revealed one at a time over the draw period. Numbers that match the revealed digits stay in the running — those that don\'t are eliminated. At the end, exact matches win 80% of the pool and near matches (6 digits) share 10%.'
      },
      {
        question: 'How many draws happen per day?',
        answer: 'There are up to 3 draw sessions per day — Morning, Evening, and Night. Each session has its own prize pool and winning number. You can buy numbers for the current draw or the upcoming session.'
      },
      {
        question: 'What happens when I buy a number?',
        answer: 'Your number is enrolled in the current active draw (or queued for the next session if no draw is active). As digits are revealed, if your number matches, its value increases with a multiplier. You can cash out early for a guaranteed return or hold for a bigger win.'
      },
      {
        question: 'Can I buy numbers between draws?',
        answer: 'Yes! Numbers purchased between draws are marked as "pending" and automatically enrolled in the next draw session when it starts.'
      },
      {
        question: 'What is a near match?',
        answer: 'A near match is a number that matches the first 6 out of 7 digits of the winning number. For example, if the winning number is 8494849, then 8494840 through 8494848 are all near matches. Near matches share 10% of the prize pool.'
      },
      {
        question: 'What is the cash-out feature?',
        answer: 'As digits are revealed and your number matches, you earn a multiplier on your purchase price. You can cash out at any point to lock in your return instead of waiting for the full draw. You can also set an auto-cashout at a specific number of matched digits.'
      },
      {
        question: 'What does voting do?',
        answer: 'Voting lets you support numbers you like. Numbers with more votes appear higher in the list. Voting is free and helps the community discover popular numbers. If a number you voted for wins, you earn a small reward.'
      },
    ],
  },
  {
    category: 'Payments & Withdrawals',
    items: [
      {
        question: 'How do I add Zynk to my account?',
        answer: 'Go to your Wallet page and tap "Deposit". Select a package or enter a custom amount, choose your payment method, and complete the transaction. Zynk is credited to your account once payment is confirmed.'
      },
      {
        question: 'How do I withdraw my winnings?',
        answer: 'Go to your Wallet page and tap "Withdraw". Enter the amount you want to withdraw (minimum 500Z). Withdrawals are processed within 24-48 business hours. You may be asked to verify your identity for security purposes.'
      },
      {
        question: 'Are there any fees?',
        answer: 'Number purchases contribute to the prize pool. A platform fee is deducted from the pool to cover operations. There are no hidden fees for deposits or withdrawals, though your payment provider may charge their own processing fees.'
      },
      {
        question: 'What payment methods are supported?',
        answer: 'We support multiple payment methods including UPI, bank transfers, and other local payment options. Available methods are shown on the Wallet page during deposit.'
      },
    ],
  },
  {
    category: 'Instant Games',
    items: [
      {
        question: 'What instant games are available?',
        answer: 'LOOT offers Coin Flip (1.95x), Dice Roll (up to 5.7x), Lucky Spin (up to 10x), Balloon Pop (up to 50x), Dragon Tower (up to 200x), Ice Field (up to 84x), Arrow Roulette (up to 10x), Egg Hatch (up to 15x), and Fuse (up to 50x). Each game has different mechanics and max win multipliers.'
      },
      {
        question: 'Are the games fair?',
        answer: 'Yes. All games use a cryptographically secure random number generator. Outcomes are provably fair — the system cannot be manipulated by anyone, including our team. Each result is independent and verifiable.'
      },
    ],
  },
  {
    category: 'Account & Security',
    items: [
      {
        question: 'How is my account protected?',
        answer: 'We use industry-standard security including encrypted passwords (bcrypt hashing), TLS encryption for all data in transit, session management with automatic timeouts, and real-time monitoring for suspicious activity. See our Security page for more details.'
      },
      {
        question: 'I forgot my password. What do I do?',
        answer: 'Use the "Forgot Password" link on the login page. You\'ll receive a password reset email. If you don\'t receive it, check your spam folder or contact our support team.'
      },
      {
        question: 'Can I change my username or email?',
        answer: 'You can update your profile information from the Profile page. For email changes, you may need to verify the new email address.'
      },
      {
        question: 'What is the referral/promote system?',
        answer: 'Share your referral link from the Promote page. When someone signs up and makes their first purchase using your link, you earn a referral commission in Zynk. The more you promote, the more you earn.'
      },
      {
        question: 'How do I contact support?',
        answer: 'Use the in-app support chat (available when logged in), visit our Contact Us page, or email us at support@lootmarket.com. We typically respond within 24 hours, and live chat responses are usually under 5 minutes.'
      },
    ],
  },
  {
    category: 'Investments',
    items: [
      {
        question: 'What is the LOOT investment system?',
        answer: 'The investment system allows you to invest your Zynk and earn returns over time. Different investment plans are available with varying durations and return rates. Visit the Invest page for current plans and details.'
      },
      {
        question: 'Are investments guaranteed?',
        answer: 'Investment returns are based on the published plan terms. Once you invest, the return rate is locked for your investment period. You can withdraw your investment plus returns when the plan matures.'
      },
    ],
  },
];

// Flatten for rendering
const faqs = faqCategories.flatMap(cat =>
  cat.items.map(item => ({ ...item, category: cat.category }))
);

function FAQ() {
  usePageTitle('FAQ');

  const [openIndex, setOpenIndex] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const { isAuthenticated } = useStore();

  const toggleFAQ = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader icon={FiHelpCircle} title="FAQ" description="Common questions answered" />

      {/* FAQ by Category */}
      <div className="space-y-6">
        {faqCategories.map((cat, catIdx) => (
          <motion.div
            key={cat.category}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: catIdx * 0.08 }}
          >
            <h2 className="text-white font-bold text-base mb-3 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-accent" />
              {cat.category}
            </h2>
            <div className="space-y-2">
              {cat.items.map((faq, index) => {
                const globalIdx = `${catIdx}-${index}`;
                return (
                  <div
                    key={globalIdx}
                    className="bg-dark-800/50 rounded-lg border border-dark-400/30 overflow-hidden"
                  >
                    <button
                      onClick={() => toggleFAQ(globalIdx)}
                      className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-dark-700/30 transition-colors"
                    >
                      <span className="text-white font-medium text-sm sm:text-base pr-4">
                        {faq.question}
                      </span>
                      <FiChevronDown
                        className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${
                          openIndex === globalIdx ? 'rotate-180 text-accent' : ''
                        }`}
                      />
                    </button>
                    <AnimatePresence>
                      {openIndex === globalIdx && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className="px-4 sm:px-5 pb-4 sm:pb-5 text-gray-400 text-sm sm:text-base leading-relaxed border-t border-dark-400/30 pt-4">
                            {faq.answer}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Contact Section */}
      <div className="mt-8 sm:mt-12 p-6 sm:p-8 bg-gradient-to-br from-accent/10 to-emerald-500/5 rounded-lg border border-accent/20 text-center">
        <h3 className="text-lg sm:text-xl font-bold text-white mb-2">
          Still have questions?
        </h3>
        <p className="text-gray-400 text-sm sm:text-base mb-4">
          Our support team is here to help you
        </p>
        {isAuthenticated ? (
          <button
            onClick={() => setChatOpen(true)}
            className="px-6 py-3 bg-accent text-dark-900 font-semibold rounded-lg hover:bg-accent/90 transition-colors inline-flex items-center gap-2"
          >
            <FiMessageCircle className="w-5 h-5" />
            Contact Support
          </button>
        ) : (
          <a
            href="/login"
            className="px-6 py-3 bg-accent text-dark-900 font-semibold rounded-lg hover:bg-accent/90 transition-colors inline-block"
          >
            Login to Contact Support
          </a>
        )}
      </div>

      {/* Support Chat Modal */}
      <SupportChat isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}

export default FAQ;
