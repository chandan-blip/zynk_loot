import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiHelpCircle, FiChevronDown, FiMessageCircle } from 'react-icons/fi';
import useStore from '../store/useStore';
import SupportChat from '../components/SupportChat';
import usePageTitle from '../hooks/usePageTitle';
import PageHeader from '../components/PageHeader';

const faqs = [
  {
    question: 'What is LOOT?',
    answer: 'LOOT is a prize distribution platform where players can participate in rounds for a chance to win coins. Each round has a fixed entry fee and prizes are distributed to the top performers.'
  },
  {
    question: 'How do I participate in a round?',
    answer: 'Simply navigate to the Home page, select a loot box, and click "Join" to enter the round. Make sure you have sufficient balance to cover the entry fee.'
  },
  {
    question: 'How much does a number cost?',
    answer: 'Each 7-digit number costs 1 Zynk to purchase. You can buy as many numbers as you want to increase your chances of winning.'
  },
  {
    question: 'How are winners determined?',
    answer: 'A 7-digit winning number is randomly generated each day. If your number matches exactly, you win 80% of the pool. If your number matches the first 6 digits (near match), you share 10% of the pool with other near matches.'
  },
  {
    question: 'What is a near match?',
    answer: 'Near matches are numbers that have the same first 6 digits as the winning number but differ in the last digit. For example, if 8494849 wins, numbers 8494840 through 8494848 are near matches and share 10% of the pool.'
  },
  {
    question: 'When do I receive my winnings?',
    answer: 'Winnings are credited to your account instantly after the round completes. You can view your balance in the sidebar or header.'
  },
  {
    question: 'How do I deposit coins?',
    answer: 'Click the "Add" or "Deposit" button in the sidebar to add coins to your account. We support various payment methods.'
  },
  {
    question: 'Can I withdraw my coins?',
    answer: 'Yes, you can withdraw your coins at any time. Navigate to your account settings to initiate a withdrawal request.'
  },
  {
    question: 'Is the platform fair?',
    answer: 'Absolutely. We use a provably fair system that allows you to verify the randomness of each round. All results are transparent and can be audited.'
  },
  {
    question: 'How do I contact support?',
    answer: 'You can reach our support team through the contact form or email us directly. We typically respond within 24 hours.'
  },
];

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

      {/* FAQ List */}
      <div className="space-y-3">
        {faqs.map((faq, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-dark-800/50 rounded-lg border border-dark-400/30 overflow-hidden"
          >
            <button
              onClick={() => toggleFAQ(index)}
              className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-dark-700/30 transition-colors"
            >
              <span className="text-white font-medium text-sm sm:text-base pr-4">
                {faq.question}
              </span>
              <FiChevronDown
                className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${
                  openIndex === index ? 'rotate-180 text-accent' : ''
                }`}
              />
            </button>
            <AnimatePresence>
              {openIndex === index && (
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
