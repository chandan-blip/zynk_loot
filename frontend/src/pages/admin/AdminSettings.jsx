import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiSettings, FiSave, FiClock, FiDollarSign, FiPercent, FiGlobe, FiToggleRight, FiShare2, FiTrendingUp } from 'react-icons/fi';
import { GiTwoCoins } from 'react-icons/gi';
import toast from 'react-hot-toast';
import { getAdminSettings, updateSetting } from '../../services/api';

const settingIcons = {
  // Core settings
  number_base_price: GiTwoCoins,
  vote_cost: FiDollarSign,
  current_period_id: FiSettings,
  zynk_to_usd: FiDollarSign,

  // Cron configuration
  total_digits: FiSettings,
  timezone: FiGlobe,
  cron_enabled: FiToggleRight,
  auto_reveal_enabled: FiToggleRight,

  // Prize multipliers
  exact_match_multiplier: FiPercent,
  near_match_multiplier: FiPercent,
  vote_reward: GiTwoCoins,

  // Referral
  referral_commission_rate: FiShare2,

  // Investment
  invest_enabled: FiToggleRight,
  invest_min_amount: FiTrendingUp,
  invest_max_amount: FiTrendingUp,
  invest_max_per_user: FiTrendingUp,
  invest_base_rate_min: FiPercent,
  invest_base_rate_max: FiPercent,
  invest_early_withdraw_penalty: FiPercent,

  // Activity Feed
  activity_enabled: FiToggleRight,
  activity_frequency_min: FiClock,
  activity_frequency_max: FiClock,
  activity_amount_digits_min: FiSettings,
  activity_amount_digits_max: FiSettings,
  activity_weight_vote: FiPercent,
  activity_weight_buy: FiPercent,
  activity_weight_sell: FiPercent,
  activity_weight_win: FiPercent,
  activity_weight_zynk_buy: FiPercent,
  activity_weight_transfer: FiPercent,
  activity_weight_withdrawal: FiPercent,

  // Session hours
  session_1_generate_hour: FiClock,
  session_1_reveal_start_hour: FiClock,
  session_1_reveal_end_hour: FiClock,
  session_2_generate_hour: FiClock,
  session_2_reveal_start_hour: FiClock,
  session_2_reveal_end_hour: FiClock,
  session_3_generate_hour: FiClock,
  session_3_reveal_start_hour: FiClock,
  session_3_reveal_end_hour: FiClock
};

const settingLabels = {
  // Core settings
  number_base_price: 'Number Base Price (Z)',
  vote_cost: 'Vote Cost (Z)',
  current_period_id: 'Current Period ID',
  zynk_to_usd: 'Zynk to USD Rate',

  // Cron configuration
  total_digits: 'Total Digits',
  timezone: 'Timezone',
  cron_enabled: 'Cron Jobs Enabled',
  auto_reveal_enabled: 'Auto Reveal Enabled',

  // Prize multipliers
  exact_match_multiplier: 'Exact Match Prize %',
  near_match_multiplier: 'Near Match Prize %',
  vote_reward: 'Vote Reward (Z)',

  // Referral
  referral_commission_rate: 'Referral Commission Rate (%)',

  // Investment
  invest_enabled: 'Investments Enabled',
  invest_min_amount: 'Min Investment Amount',
  invest_max_amount: 'Max Investment Amount',
  invest_max_per_user: 'Max Total Per User',
  invest_base_rate_min: 'Base Rate Min (daily)',
  invest_base_rate_max: 'Base Rate Max (daily)',
  invest_early_withdraw_penalty: 'Early Withdraw Penalty',

  // Activity Feed
  activity_enabled: 'Activity Feed Enabled',
  activity_frequency_min: 'Min Interval (seconds)',
  activity_frequency_max: 'Max Interval (seconds)',
  activity_amount_digits_min: 'Min Amount Digits',
  activity_amount_digits_max: 'Max Amount Digits',
  activity_weight_vote: 'Vote Weight (%)',
  activity_weight_buy: 'Buy Weight (%)',
  activity_weight_sell: 'Sell Weight (%)',
  activity_weight_win: 'Win Weight (%)',
  activity_weight_zynk_buy: 'Zynk Buy Weight (%)',
  activity_weight_transfer: 'Transfer Weight (%)',
  activity_weight_withdrawal: 'Withdrawal Weight (%)',

  // Session 1
  session_1_generate_hour: 'Session 1 Generate Hour',
  session_1_reveal_start_hour: 'Session 1 Reveal Start',
  session_1_reveal_end_hour: 'Session 1 Reveal End',

  // Session 2
  session_2_generate_hour: 'Session 2 Generate Hour',
  session_2_reveal_start_hour: 'Session 2 Reveal Start',
  session_2_reveal_end_hour: 'Session 2 Reveal End',

  // Session 3
  session_3_generate_hour: 'Session 3 Generate Hour',
  session_3_reveal_start_hour: 'Session 3 Reveal Start',
  session_3_reveal_end_hour: 'Session 3 Reveal End'
};

// Group settings by category
const settingCategories = {
  'Core Settings': ['number_base_price', 'vote_cost', 'zynk_to_usd', 'current_period_id'],
  'Cron Configuration': ['cron_enabled', 'auto_reveal_enabled', 'total_digits', 'timezone'],
  'Prize Settings': ['exact_match_multiplier', 'near_match_multiplier', 'vote_reward'],
  'Referral Settings': ['referral_commission_rate'],
  'Investment Settings': ['invest_enabled', 'invest_min_amount', 'invest_max_amount', 'invest_max_per_user', 'invest_base_rate_min', 'invest_base_rate_max', 'invest_early_withdraw_penalty'],
  'Live Activity Feed': ['activity_enabled', 'activity_frequency_min', 'activity_frequency_max', 'activity_amount_digits_min', 'activity_amount_digits_max', 'activity_weight_vote', 'activity_weight_buy', 'activity_weight_sell', 'activity_weight_win', 'activity_weight_zynk_buy', 'activity_weight_transfer', 'activity_weight_withdrawal'],
  'Session 1 (Morning)': ['session_1_generate_hour', 'session_1_reveal_start_hour', 'session_1_reveal_end_hour'],
  'Session 2 (Evening)': ['session_2_generate_hour', 'session_2_reveal_start_hour', 'session_2_reveal_end_hour'],
  'Session 3 (Night)': ['session_3_generate_hour', 'session_3_reveal_start_hour', 'session_3_reveal_end_hour']
};

function AdminSettings() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editValues, setEditValues] = useState({});
  const [saving, setSaving] = useState({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await getAdminSettings();
      const settingsData = response.data.data || [];
      setSettings(settingsData);
      const values = {};
      settingsData.forEach(s => {
        values[s.setting_key] = s.setting_value;
      });
      setEditValues(values);
    } catch (error) {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (key) => {
    setSaving(prev => ({ ...prev, [key]: true }));
    try {
      const response = await updateSetting(key, editValues[key]);
      if (response.data.success) {
        toast.success('Setting updated');
        fetchSettings();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update setting');
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  };

  const hasChanged = (key) => {
    const original = settings.find(s => s.setting_key === key);
    return original && original.setting_value !== editValues[key];
  };

  const getSettingsByCategory = (categoryKeys) => {
    return settings.filter(s => categoryKeys.includes(s.setting_key));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-500">Configure lottery and cron settings</p>
      </div>

      {/* Settings by Category */}
      {Object.entries(settingCategories).map(([category, keys]) => {
        const categorySettings = getSettingsByCategory(keys);
        if (categorySettings.length === 0) return null;

        return (
          <div key={category} className="space-y-3">
            <h2 className="text-lg font-semibold text-white border-b border-dark-600 pb-2">{category}</h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-4 gap-3">
              {categorySettings.map((setting, i) => {
                const Icon = settingIcons[setting.setting_key] || FiSettings;
                const label = settingLabels[setting.setting_key] || setting.setting_key;
                const changed = hasChanged(setting.setting_key);
                const isSaving = saving[setting.setting_key];

                return (
                  <motion.div
                    key={setting.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="bg-dark-800 border border-dark-600 rounded-xl p-4"
                  >
                    <div className="flex flex-col sm:items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                          <Icon className="w-5 h-5 text-accent" />
                        </div>
                        <div>
                          <h3 className="font-medium text-white text-sm">{label}</h3>
                          <p className="text-xs text-gray-500">{setting.description || setting.setting_key}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editValues[setting.setting_key] || ''}
                          onChange={(e) => setEditValues(prev => ({
                            ...prev,
                            [setting.setting_key]: e.target.value
                          }))}
                          className={`w-40 px-3 py-2 rounded-lg bg-dark-700 border text-white text-sm placeholder-gray-500 focus:outline-none transition-colors ${
                            changed ? 'border-accent' : 'border-dark-500 focus:border-accent'
                          }`}
                        />
                        <motion.button
                          onClick={() => handleSave(setting.setting_key)}
                          disabled={!changed || isSaving}
                          className={`px-3 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-1.5 ${
                            changed
                              ? 'bg-accent text-dark-900 hover:bg-accent/90'
                              : 'bg-dark-700 text-gray-500 cursor-not-allowed'
                          }`}
                          whileHover={changed ? { scale: 1.02 } : {}}
                          whileTap={changed ? { scale: 0.98 } : {}}
                        >
                          {isSaving ? (
                            <div className="w-4 h-4 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <FiSave className="w-4 h-4" />
                          )}
                          <span>Save</span>
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Session Schedule Info */}
      <div className="bg-dark-800/50 border border-dark-600 rounded-xl p-5">
        <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
          <FiClock className="text-accent" />
          Session Schedule (IST Timezone)
        </h3>
        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          {[
            { session: 1, label: 'Morning', gen: editValues.session_1_generate_hour || '8', end: editValues.session_1_reveal_end_hour || '15' },
            { session: 2, label: 'Evening', gen: editValues.session_2_generate_hour || '15', end: editValues.session_2_reveal_end_hour || '23' },
            { session: 3, label: 'Night', gen: editValues.session_3_generate_hour || '23', end: editValues.session_3_reveal_end_hour || '6' }
          ].map(s => (
            <div key={s.session} className="p-4 bg-dark-700/50 rounded-lg">
              <p className="text-accent font-medium mb-2">Session {s.session} ({s.label})</p>
              <div className="space-y-1">
                <p className="text-gray-400 text-xs">Generate: <span className="text-white">{s.gen}:00</span></p>
                <p className="text-gray-400 text-xs">Complete: <span className="text-white">{s.end}:00</span></p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 p-4 bg-dark-700/50 rounded-lg">
          <p className="text-gray-400 mb-2">Digit Reveal Schedule (per session)</p>
          <p className="text-gray-500 text-xs mb-2">{editValues.total_digits || 7} digits revealed over {(editValues.total_digits || 7) - 1} hours (1 digit per hour)</p>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: parseInt(editValues.total_digits) || 7 }, (_, i) => i + 1).map(digit => (
              <div key={digit} className="px-3 py-1.5 bg-dark-600 rounded text-xs">
                <span className="text-accent font-medium">#{digit}</span>
                <span className="text-gray-400 ml-1">+{digit - 1}h</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Prize Distribution Info */}
      <div className="bg-dark-800/50 border border-dark-600 rounded-xl p-5">
        <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
          <FiPercent className="text-accent" />
          Prize Distribution
        </h3>
        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          <div className="p-4 bg-dark-700/50 rounded-lg text-center">
            <p className="text-gray-400 text-xs mb-1">Exact Match</p>
            <p className="text-accent text-2xl font-bold">{(parseFloat(editValues.exact_match_multiplier) * 100 || 40)}%</p>
            <p className="text-gray-500 text-xs">of pool</p>
          </div>
          <div className="p-4 bg-dark-700/50 rounded-lg text-center">
            <p className="text-gray-400 text-xs mb-1">Near Match (6 digits)</p>
            <p className="text-accent text-2xl font-bold">{(parseFloat(editValues.near_match_multiplier) * 100 || 10)}%</p>
            <p className="text-gray-500 text-xs">shared pool</p>
          </div>
          <div className="p-4 bg-dark-700/50 rounded-lg text-center">
            <p className="text-gray-400 text-xs mb-1">Vote Reward</p>
            <p className="text-accent text-2xl font-bold">{editValues.vote_reward || 10}Z</p>
            <p className="text-gray-500 text-xs">per correct vote</p>
          </div>
        </div>
      </div>

      {/* Dynamic Pricing Info */}
      <div className="bg-dark-800/50 border border-dark-600 rounded-xl p-5">
        <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
          <GiTwoCoins className="text-accent" />
          Dynamic Pricing Formula
        </h3>
        <div className="p-4 bg-dark-700/50 rounded-lg mb-4">
          <p className="text-gray-400 mb-2">Number Price Calculation</p>
          <code className="text-accent text-sm">Price = BasePrice x (RevealedDigits + 10)</code>
          <p className="text-gray-500 text-xs mt-2">Base Price: {editValues.number_base_price || 10}Z</p>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 text-xs">
          {Array.from({ length: (parseInt(editValues.total_digits) || 7) + 1 }, (_, i) => i).map(digits => (
            <div key={digits} className="p-2 bg-dark-600 rounded text-center">
              <p className="text-gray-500">{digits} digits</p>
              <p className="text-white font-medium">{(parseInt(editValues.number_base_price) || 10) * (digits + 10)}Z</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AdminSettings;
