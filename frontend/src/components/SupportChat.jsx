import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiSend, FiMessageCircle } from 'react-icons/fi';
import { getSupportConversation, sendSupportMessage, markSupportRead } from '../services/api';
import socketService from '../services/socket';

function SupportChat({ isOpen, onClose }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [conversationStatus, setConversationStatus] = useState('open');
  const messagesEndRef = useRef(null);

  // Connect socket and subscribe to events when modal opens
  useEffect(() => {
    if (isOpen) {
      // Ensure socket is connected with auth token
      const token = localStorage.getItem('token');
      if (token) {
        socketService.connect(token);
      }

      loadConversation();

      // Subscribe to new messages
      const unsubMessage = socketService.onSupportMessage((data) => {
        setMessages(prev => [...prev, data.message]);
        scrollToBottom();
      });

      // Subscribe to status changes
      const unsubStatus = socketService.onSupportStatusChanged((data) => {
        setConversationStatus(data.status);
      });

      return () => {
        unsubMessage?.();
        unsubStatus?.();
      };
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadConversation = async () => {
    try {
      setLoading(true);
      const response = await getSupportConversation();
      if (response.data.success) {
        setMessages(response.data.data.messages || []);
        setConversationStatus(response.data.data.conversation?.status || 'open');
        // Mark messages as read
        await markSupportRead();
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    try {
      setSending(true);
      const response = await sendSupportMessage(newMessage.trim());
      if (response.data.success) {
        setMessages(prev => [...prev, response.data.data.message]);
        setNewMessage('');
        scrollToBottom();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Group messages by date
  const groupedMessages = messages.reduce((groups, message) => {
    const date = formatDate(message.created_at);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {});

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-md h-[600px] max-h-[80vh] bg-dark-800 rounded-xl border border-dark-400/50 flex flex-col overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-dark-400/50 bg-dark-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                  <FiMessageCircle className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Support Chat</h3>
                  <p className="text-xs text-gray-500">
                    {conversationStatus === 'open' && 'We typically reply within a few hours'}
                    {conversationStatus === 'resolved' && 'Issue resolved'}
                    {conversationStatus === 'closed' && 'Conversation closed'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-4">
                    <FiMessageCircle className="w-8 h-8 text-accent" />
                  </div>
                  <h4 className="text-white font-medium mb-1">Start a conversation</h4>
                  <p className="text-gray-500 text-sm">
                    Send us a message and we'll get back to you
                  </p>
                </div>
              ) : (
                Object.entries(groupedMessages).map(([date, dateMessages]) => (
                  <div key={date}>
                    <div className="flex items-center justify-center mb-3">
                      <span className="px-3 py-1 text-xs text-gray-500 bg-dark-600 rounded-full">
                        {date}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {dateMessages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${message.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg px-4 py-2 ${
                              message.sender_type === 'user'
                                ? 'bg-accent text-dark-900'
                                : 'bg-dark-600 text-white'
                            }`}
                          >
                            {message.sender_type === 'admin' && (
                              <p className="text-xs font-medium text-accent mb-1">
                                {message.sender_name} (Support)
                              </p>
                            )}
                            <p className="text-sm whitespace-pre-wrap break-words">{message.message}</p>
                            <p className={`text-xs mt-1 ${
                              message.sender_type === 'user' ? 'text-dark-600' : 'text-gray-500'
                            }`}>
                              {formatTime(message.created_at)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-4 border-t border-dark-400/50 bg-dark-700">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 px-4 py-3 bg-dark-600 border border-dark-400/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent/50 text-sm"
                  maxLength={2000}
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim() || sending}
                  className="px-4 py-3 bg-accent text-dark-900 rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <FiSend className="w-5 h-5" />
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default SupportChat;
