import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiMessageCircle, FiSend, FiUser, FiClock, FiCheck, FiCheckCircle, FiXCircle, FiFilter } from 'react-icons/fi';
import toast from 'react-hot-toast';
import {
  getAdminConversations,
  getAdminConversationMessages,
  sendAdminSupportMessage,
  markAdminSupportRead,
  updateConversationStatus
} from '../../services/api';
import socketService from '../../services/socket';

function AdminSupport() {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const messagesEndRef = useRef(null);

  // Store selected conversation ID in a ref so we can access it in socket callback
  const selectedConversationRef = useRef(null);

  useEffect(() => {
    selectedConversationRef.current = selectedConversation?.id;
  }, [selectedConversation?.id]);

  // Socket setup - runs once on mount
  useEffect(() => {
    // Ensure socket is connected with auth token
    const token = localStorage.getItem('token');
    if (token) {
      socketService.connect(token);
    }

    loadConversations();

    // Join admin support room
    socketService.joinAdminSupport();

    // Subscribe to new messages
    const unsubMessage = socketService.onSupportMessage((data) => {
      const currentConvId = selectedConversationRef.current;

      // Update conversations list
      setConversations(prev => {
        const updated = prev.map(c => {
          if (c.id === data.conversationId) {
            return {
              ...c,
              last_message: data.message.message,
              last_message_at: data.message.created_at,
              unread_admin_count: c.id === currentConvId ? 0 : c.unread_admin_count + 1
            };
          }
          return c;
        });
        // Sort by last_message_at
        return updated.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
      });

      // Add message to current conversation
      if (data.conversationId === currentConvId) {
        setMessages(prev => [...prev, data.message]);
        scrollToBottom();
      }
    });

    return () => {
      socketService.leaveAdminSupport();
      unsubMessage?.();
    };
  }, []);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const response = await getAdminConversations(statusFilter);
      if (response.data.success) {
        setConversations(response.data.data || []);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
      toast.error('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [statusFilter]);

  const selectConversation = async (conversation) => {
    setSelectedConversation(conversation);
    setMessagesLoading(true);

    try {
      const response = await getAdminConversationMessages(conversation.id);
      if (response.data.success) {
        setMessages(response.data.data.messages || []);
        setSelectedConversation(response.data.data.conversation);
        // Mark as read
        await markAdminSupportRead(conversation.id);
        // Update local state
        setConversations(prev =>
          prev.map(c => c.id === conversation.id ? { ...c, unread_admin_count: 0 } : c)
        );
        scrollToBottom();
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      toast.error('Failed to load messages');
    } finally {
      setMessagesLoading(false);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sending || !selectedConversation) return;

    try {
      setSending(true);
      const response = await sendAdminSupportMessage(selectedConversation.id, newMessage.trim());
      if (response.data.success) {
        setMessages(prev => [...prev, response.data.data.message]);
        setNewMessage('');
        scrollToBottom();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (status) => {
    if (!selectedConversation) return;

    try {
      await updateConversationStatus(selectedConversation.id, status);
      setSelectedConversation(prev => ({ ...prev, status }));
      setConversations(prev =>
        prev.map(c => c.id === selectedConversation.id ? { ...c, status } : c)
      );
      toast.success(`Status updated to ${status}`);
    } catch (error) {
      console.error('Failed to update status:', error);
      toast.error('Failed to update status');
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
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

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return 'text-yellow-400 bg-yellow-400/10';
      case 'resolved': return 'text-green-400 bg-green-400/10';
      case 'closed': return 'text-gray-400 bg-gray-400/10';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'open': return FiClock;
      case 'resolved': return FiCheckCircle;
      case 'closed': return FiXCircle;
      default: return FiClock;
    }
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
    <div className="h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Support Chat</h1>
        <div className="flex items-center gap-2">
          <FiFilter className="w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-dark-700 border border-dark-400 rounded-lg text-white text-sm focus:outline-none focus:border-accent/50"
          >
            <option value="">All Status</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      <div className="h-[calc(100%-4rem)] flex gap-4">
        {/* Conversations List */}
        <div className="w-80 bg-dark-800 rounded-xl border border-dark-400/50 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-dark-400/50">
            <h2 className="text-white font-semibold">Conversations</h2>
            <p className="text-xs text-gray-500 mt-1">{conversations.length} total</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <FiMessageCircle className="w-12 h-12 text-gray-600 mb-3" />
                <p className="text-gray-500 text-sm">No conversations yet</p>
              </div>
            ) : (
              conversations.map((conv) => {
                const StatusIcon = getStatusIcon(conv.status);
                return (
                  <motion.div
                    key={conv.id}
                    whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                    onClick={() => selectConversation(conv)}
                    className={`p-4 border-b border-dark-400/30 cursor-pointer transition-colors ${
                      selectedConversation?.id === conv.id ? 'bg-accent/10 border-l-2 border-l-accent' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-dark-600 flex items-center justify-center flex-shrink-0">
                        <FiUser className="w-5 h-5 text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-white font-medium text-sm truncate">{conv.username}</p>
                          {conv.unread_admin_count > 0 && (
                            <span className="px-2 py-0.5 bg-accent text-dark-900 text-xs font-bold rounded-full">
                              {conv.unread_admin_count}
                            </span>
                          )}
                        </div>
                        <p className="text-gray-500 text-xs truncate mb-2">{conv.last_message || 'No messages'}</p>
                        <div className="flex items-center justify-between">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${getStatusColor(conv.status)}`}>
                            <StatusIcon className="w-3 h-3" />
                            {conv.status}
                          </span>
                          <span className="text-xs text-gray-600">
                            {formatDate(conv.last_message_at)} {formatTime(conv.last_message_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 bg-dark-800 rounded-xl border border-dark-400/50 flex flex-col overflow-hidden">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-dark-400/50 flex items-center justify-between bg-dark-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-dark-600 flex items-center justify-center">
                    <FiUser className="w-5 h-5 text-gray-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{selectedConversation.username}</h3>
                    <p className="text-xs text-gray-500">{selectedConversation.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedConversation.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border-0 focus:outline-none focus:ring-2 focus:ring-accent/50 ${getStatusColor(selectedConversation.status)}`}
                  >
                    <option value="open">Open</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messagesLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <FiMessageCircle className="w-12 h-12 text-gray-600 mb-3" />
                    <p className="text-gray-500">No messages yet</p>
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
                            className={`flex ${message.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[70%] rounded-lg px-4 py-2 ${
                                message.sender_type === 'admin'
                                  ? 'bg-accent text-dark-900'
                                  : 'bg-dark-600 text-white'
                              }`}
                            >
                              {message.sender_type === 'user' && (
                                <p className="text-xs font-medium text-accent mb-1">
                                  {message.sender_name}
                                </p>
                              )}
                              <p className="text-sm whitespace-pre-wrap break-words">{message.message}</p>
                              <div className={`flex items-center justify-end gap-1 mt-1 ${
                                message.sender_type === 'admin' ? 'text-dark-600' : 'text-gray-500'
                              }`}>
                                <span className="text-xs">{formatTime(message.created_at)}</span>
                                {message.sender_type === 'admin' && message.is_read && (
                                  <FiCheck className="w-3 h-3" />
                                )}
                              </div>
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
                    placeholder="Type your reply..."
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
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-20 h-20 rounded-full bg-dark-600 flex items-center justify-center mb-4">
                <FiMessageCircle className="w-10 h-10 text-gray-500" />
              </div>
              <h3 className="text-white font-medium mb-2">Select a conversation</h3>
              <p className="text-gray-500 text-sm">
                Choose a conversation from the list to view messages
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminSupport;
