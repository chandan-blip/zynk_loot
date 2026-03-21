import { useState } from 'react';
import { motion } from 'framer-motion';
import { FiMail, FiMessageSquare, FiClock, FiMapPin, FiSend, FiHelpCircle, FiAlertCircle, FiDollarSign, FiShield } from 'react-icons/fi';
import usePageTitle from '../hooks/usePageTitle';
import PageHeader from '../components/PageHeader';
import toast from 'react-hot-toast';

const contactMethods = [
  {
    icon: FiMail,
    title: 'Email Support',
    description: 'Get help via email',
    detail: 'support@lootmarket.store',
    responseTime: 'Response within 24 hours',
  },
  {
    icon: FiMessageSquare,
    title: 'Live Chat',
    description: 'Chat with our team',
    detail: 'Available on platform',
    responseTime: 'Typically under 5 minutes',
  },
  {
    icon: FiClock,
    title: 'Support Hours',
    description: 'We are here for you',
    detail: '24/7 Support',
    responseTime: 'Round the clock assistance',
  },
];

const topics = [
  { value: 'general', label: 'General Inquiry', icon: FiHelpCircle },
  { value: 'account', label: 'Account Issue', icon: FiShield },
  { value: 'payment', label: 'Payment & Withdrawal', icon: FiDollarSign },
  { value: 'bug', label: 'Bug Report', icon: FiAlertCircle },
  { value: 'feedback', label: 'Feedback & Suggestions', icon: FiMessageSquare },
];

function Contact() {
  usePageTitle('Contact Us');
  const [form, setForm] = useState({ name: '', email: '', topic: 'general', message: '' });
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast.error('Please fill in all fields');
      return;
    }
    setSending(true);
    // Simulate send
    await new Promise(r => setTimeout(r, 1000));
    toast.success('Message sent! We\'ll get back to you soon.');
    setForm({ name: '', email: '', topic: 'general', message: '' });
    setSending(false);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader icon={FiMail} title="Contact Us" description="We're here to help" />

      {/* Contact Methods */}
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        {contactMethods.map((method, index) => (
          <motion.div
            key={method.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-dark-800/50 rounded-lg border border-dark-400/30 p-5 text-center"
          >
            <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mx-auto mb-3">
              <method.icon className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-white font-semibold mb-1">{method.title}</h3>
            <p className="text-accent text-sm font-medium mb-1">{method.detail}</p>
            <p className="text-gray-500 text-xs">{method.responseTime}</p>
          </motion.div>
        ))}
      </div>

      {/* Contact Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-dark-800/50 rounded-lg border border-dark-400/30 p-5 sm:p-6 mb-8"
      >
        <h2 className="text-lg font-bold text-white mb-1">Send us a message</h2>
        <p className="text-gray-500 text-sm mb-5">Fill out the form below and we'll respond as soon as possible.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-400 text-sm mb-1.5">Your Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-4 py-2.5 bg-dark-700/50 border border-dark-400/30 rounded-lg text-white text-sm placeholder-gray-600 focus:border-accent/50 focus:outline-none transition-colors"
                placeholder="Enter your name"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1.5">Email Address</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-4 py-2.5 bg-dark-700/50 border border-dark-400/30 rounded-lg text-white text-sm placeholder-gray-600 focus:border-accent/50 focus:outline-none transition-colors"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-1.5">Topic</label>
            <div className="flex flex-wrap gap-2">
              {topics.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, topic: t.value }))}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-all ${
                    form.topic === t.value
                      ? 'bg-accent/10 border-accent/40 text-accent'
                      : 'bg-dark-700/30 border-dark-400/30 text-gray-400 hover:border-dark-400/50'
                  }`}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-1.5">Message</label>
            <textarea
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              rows={5}
              className="w-full px-4 py-2.5 bg-dark-700/50 border border-dark-400/30 rounded-lg text-white text-sm placeholder-gray-600 focus:border-accent/50 focus:outline-none transition-colors resize-none"
              placeholder="Describe your issue or question..."
            />
          </div>

          <button
            type="submit"
            disabled={sending}
            className="flex items-center gap-2 px-6 py-3 bg-accent text-dark-900 font-semibold rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            <FiSend className="w-4 h-4" />
            {sending ? 'Sending...' : 'Send Message'}
          </button>
        </form>
      </motion.div>

      {/* Office Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-gradient-to-br from-accent/10 to-emerald-500/5 rounded-lg border border-accent/20 p-5 sm:p-6"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <FiMapPin className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="text-white font-semibold">Our Office</h3>
            <p className="text-gray-400 text-sm">Registered Business Address</p>
          </div>
        </div>
        <p className="text-gray-400 text-sm leading-relaxed">
          LOOT Market Technologies Pvt. Ltd.
        </p>
      </motion.div>
    </div>
  );
}

export default Contact;
