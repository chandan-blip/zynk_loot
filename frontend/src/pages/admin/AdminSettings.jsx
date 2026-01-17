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
  current_period_id: FiSettings
};

const settingLabels = {
  number_base_price: 'Number Base Price',
  vote_cost: 'Vote Cost',
  generate_time: 'Generate Time (8 PM)',
  result_time: 'Result Time (9 PM)',
  prize_pool_percentage: 'Prize Pool %',
  current_period_id: 'Current Period ID'
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
    <div className="space-y-6">
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

      {/* Info */}
      <div className="bg-dark-800/50 border border-dark-600 rounded-xl p-5">
        <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
          <FiClock className="text-accent" />
          Timing Info
        </h3>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="p-4 bg-dark-700/50 rounded-lg">
            <p className="text-gray-400 mb-1">Draw Generation</p>
            <p className="text-white font-medium">8:00 PM (20:00) IST</p>
            <p className="text-gray-500 text-xs mt-1">New number generated, first digit revealed immediately</p>
          </div>
          <div className="p-4 bg-dark-700/50 rounded-lg">
            <p className="text-gray-400 mb-1">Result Reveal</p>
            <p className="text-white font-medium">9:00 PM (21:00) IST</p>
            <p className="text-gray-500 text-xs mt-1">All 7 digits revealed, winners processed</p>
          </div>
        </div>
        <div className="mt-4 p-4 bg-dark-700/50 rounded-lg">
          <p className="text-gray-400 mb-1">Digit Reveal Schedule</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {[
              { digit: 1, time: '8:00 PM' },
              { digit: 2, time: '8:10 PM' },
              { digit: 3, time: '8:20 PM' },
              { digit: 4, time: '8:30 PM' },
              { digit: 5, time: '8:40 PM' },
              { digit: 6, time: '8:50 PM' },
              { digit: 7, time: '9:00 PM' },
            ].map(item => (
              <div key={item.digit} className="px-3 py-1.5 bg-dark-600 rounded text-xs">
                <span className="text-accent font-medium">#{item.digit}</span>
                <span className="text-gray-400 ml-1">{item.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminSettings;
