import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiSettings, FiSave, FiClock, FiDollarSign, FiPercent } from 'react-icons/fi';
import { GiTwoCoins } from 'react-icons/gi';
import toast from 'react-hot-toast';
import { getAdminSettings, updateSetting } from '../../services/api';

const settingIcons = {
  number_base_price: GiTwoCoins,
  vote_cost: FiDollarSign,
  generate_time: FiClock,
  result_time: FiClock,
  prize_pool_percentage: FiPercent,
  current_period_id: FiSettings,
  price_multiplier_offset: GiTwoCoins,
  vote_reward: GiTwoCoins
};

const settingLabels = {
  number_base_price: 'Number Base Price (Z)',
  vote_cost: 'Vote Cost',
  generate_time: 'Generate Time',
  result_time: 'Result Time',
  prize_pool_percentage: 'Prize Pool %',
  current_period_id: 'Current Period ID',
  price_multiplier_offset: 'Price Multiplier Offset',
  vote_reward: 'Vote Reward (Z)'
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
      // Initialize edit values
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-500">Configure lottery settings</p>
      </div>

      {/* Settings Grid */}
      <div className="grid gap-4">
        {settings.map((setting, i) => {
          const Icon = settingIcons[setting.setting_key] || FiSettings;
          const label = settingLabels[setting.setting_key] || setting.setting_key;
          const changed = hasChanged(setting.setting_key);
          const isSaving = saving[setting.setting_key];

          return (
            <motion.div
              key={setting.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-dark-800 border border-dark-600 rounded-xl p-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Icon className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{label}</h3>
                    <p className="text-sm text-gray-500">{setting.description || setting.setting_key}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={editValues[setting.setting_key] || ''}
                    onChange={(e) => setEditValues(prev => ({
                      ...prev,
                      [setting.setting_key]: e.target.value
                    }))}
                    className={`w-48 px-4 py-2.5 rounded-lg bg-dark-700 border text-white placeholder-gray-500 focus:outline-none transition-colors ${
                      changed ? 'border-accent' : 'border-dark-500 focus:border-accent'
                    }`}
                  />
                  <motion.button
                    onClick={() => handleSave(setting.setting_key)}
                    disabled={!changed || isSaving}
                    className={`px-4 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 ${
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

      {/* Session Schedule Info */}
      <div className="bg-dark-800/50 border border-dark-600 rounded-xl p-5">
        <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
          <FiClock className="text-accent" />
          Session Schedule (3 Sessions Daily)
        </h3>
        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          {[
            { session: 1, generate: '02:00', result: '08:00', label: 'Morning' },
            { session: 2, generate: '10:00', result: '16:00', label: 'Afternoon' },
            { session: 3, generate: '18:00', result: '00:00', label: 'Night' }
          ].map(s => (
            <div key={s.session} className="p-4 bg-dark-700/50 rounded-lg">
              <p className="text-accent font-medium mb-2">Session {s.session} ({s.label})</p>
              <div className="space-y-1">
                <p className="text-gray-400 text-xs">Generate: <span className="text-white">{s.generate}</span></p>
                <p className="text-gray-400 text-xs">Result: <span className="text-white">{s.result}</span></p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 p-4 bg-dark-700/50 rounded-lg">
          <p className="text-gray-400 mb-2">Digit Reveal Schedule (per session)</p>
          <p className="text-gray-500 text-xs mb-2">7 digits revealed over 6 hours (1 digit per hour)</p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map(digit => (
              <div key={digit} className="px-3 py-1.5 bg-dark-600 rounded text-xs">
                <span className="text-accent font-medium">#{digit}</span>
                <span className="text-gray-400 ml-1">+{digit - 1}h</span>
              </div>
            ))}
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
          <code className="text-accent text-sm">Price = BasePrice × (RevealedDigits + 10)</code>
          <p className="text-gray-500 text-xs mt-2">Numbers without owner use dynamic price based on revealed digits</p>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 text-xs">
          {[0, 1, 2, 3, 4, 5, 6, 7].map(digits => (
            <div key={digits} className="p-2 bg-dark-600 rounded text-center">
              <p className="text-gray-500">{digits} digits</p>
              <p className="text-white font-medium">{10 * (digits + 10)}Z</p>
            </div>
          ))}
        </div>
      </div>

      {/* Multiplier Returns Info */}
      <div className="bg-dark-800/50 border border-dark-600 rounded-xl p-5">
        <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
          <FiPercent className="text-accent" />
          Win Multipliers
        </h3>
        <p className="text-gray-500 text-xs mb-3">Return multipliers based on matching digits from the winning number</p>
        <div className="grid grid-cols-7 gap-2 text-xs">
          {[
            { digits: 1, mult: '2x' },
            { digits: 2, mult: '4x' },
            { digits: 3, mult: '7x' },
            { digits: 4, mult: '14x' },
            { digits: 5, mult: '21x' },
            { digits: 6, mult: '35x' },
            { digits: 7, mult: '49x' }
          ].map(item => (
            <div key={item.digits} className="p-2 bg-dark-600 rounded text-center">
              <p className="text-gray-500">{item.digits} match</p>
              <p className="text-accent font-bold">{item.mult}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Vote System Info */}
      <div className="bg-dark-800/50 border border-dark-600 rounded-xl p-5">
        <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
          <FiSettings className="text-accent" />
          Vote System
        </h3>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="p-4 bg-dark-700/50 rounded-lg">
            <p className="text-gray-400 mb-1">Vote Rules</p>
            <ul className="text-gray-500 text-xs space-y-1">
              <li>• One vote per user per number</li>
              <li>• Users can vote/unvote (toggle)</li>
              <li>• Voting is free (prediction only)</li>
            </ul>
          </div>
          <div className="p-4 bg-dark-700/50 rounded-lg">
            <p className="text-gray-400 mb-1">Vote Rewards</p>
            <ul className="text-gray-500 text-xs space-y-1">
              <li>• Correct prediction: <span className="text-accent">10Z reward</span></li>
              <li>• Rewards paid when draw completes</li>
              <li>• Visible in user's My Votes tab</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminSettings;
