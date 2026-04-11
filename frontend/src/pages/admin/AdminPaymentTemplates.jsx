import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiImage, FiRefreshCw, FiSmartphone, FiSave, FiSettings } from 'react-icons/fi';
import toast from 'react-hot-toast';
import {
  listPaymentTemplates,
  previewPaymentTemplate,
  previewPaymentTemplatePng,
  getPaymentDetails,
  savePaymentDetails,
} from '../../services/api';

function PaymentDetailsEditor({ onSaved }) {
  const [schema, setSchema] = useState([]);
  const [config, setConfig] = useState({});
  const [defaults, setDefaults] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await getPaymentDetails();
        if (res.data.success) {
          setSchema(res.data.data.schema || []);
          setConfig(res.data.data.config || {});
          setDefaults(res.data.data.defaults || {});
        }
      } catch (err) {
        toast.error('Failed to load payment details');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleChange = (key, value) => setConfig(c => ({ ...c, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePaymentDetails(config);
      toast.success('Payment details saved — reload preview to see changes');
      onSaved?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleResetField = (key) => {
    setConfig(c => ({ ...c, [key]: defaults[key] || '' }));
  };

  if (loading) {
    return (
      <div className="bg-dark-800 border border-dark-600 rounded-lg p-4">
        <div className="text-gray-500">Loading details…</div>
      </div>
    );
  }

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FiSettings className="w-5 h-5 text-accent" />
          <div>
            <h2 className="font-bold text-white">Dynamic Details</h2>
            <p className="text-xs text-gray-500">
              Values used across all payment templates. Stored in <code className="text-accent">settings.payment_template_details</code>.
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/90 text-dark-900 text-sm font-bold rounded-lg disabled:opacity-50"
        >
          <FiSave className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {schema.map(field => (
          <div key={field.key}>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">
              {field.label}
            </label>
            <div className="flex gap-2">
              <input
                value={config[field.key] ?? ''}
                onChange={(e) => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="flex-1 bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-accent outline-none"
              />
              <button
                onClick={() => handleResetField(field.key)}
                title="Reset to default"
                className="px-2 py-2 bg-dark-700 hover:bg-dark-600 text-gray-400 hover:text-white rounded-lg border border-dark-600 text-xs"
              >
                ↺
              </button>
            </div>
            <div className="text-[10px] text-gray-600 mt-1 font-mono">
              default: {defaults[field.key]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminPaymentTemplates() {
  const [platforms, setPlatforms] = useState([]);
  const [selected, setSelected] = useState(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [pngBase64, setPngBase64] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await listPaymentTemplates();
        if (res.data.success) {
          const list = res.data.data.platforms || [];
          setPlatforms(list);
          if (list.length) setSelected(list[0]);
        }
      } catch (err) {
        toast.error('Failed to list templates');
      }
    })();
  }, []);

  const loadPreview = useCallback(async (platform) => {
    if (!platform) return;
    setLoading(true);
    setPngBase64(null);
    try {
      const res = await previewPaymentTemplate(platform, { json_data: { platform } });
      if (res.data.success) setPreviewHtml(res.data.data.html);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Preview failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) loadPreview(selected);
  }, [selected, loadPreview]);

  const handleRenderPng = async () => {
    if (!selected) return;
    setRendering(true);
    setPngBase64(null);
    const toastId = toast.loading('Rendering PNG via puppeteer…');
    try {
      const res = await previewPaymentTemplatePng(selected, { json_data: { platform: selected } });
      if (res.data.success) {
        setPngBase64(res.data.data.pngBase64);
        toast.success('PNG rendered', { id: toastId });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'PNG render failed', { id: toastId });
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Payment Templates Preview</h1>
        <p className="text-sm text-gray-500 mt-1">
          Edit the HTML files in <code className="text-accent">backend/src/services/paymentTemplates/</code>,
          save your changes, then click <b>Reload</b> here to see the updated preview. The file is re-read
          from disk each time, so changes appear immediately without restarting the backend.
        </p>
      </div>

      <PaymentDetailsEditor onSaved={() => selected && loadPreview(selected)} />

      {/* Platform tabs */}
      <div className="flex flex-wrap gap-2">
        {platforms.map(p => (
          <button
            key={p}
            onClick={() => setSelected(p)}
            className={`px-4 py-2 rounded-lg border text-sm font-bold uppercase tracking-wide transition-colors ${
              selected === p
                ? 'bg-accent text-dark-900 border-accent'
                : 'bg-dark-800 text-gray-400 border-dark-600 hover:border-accent/50 hover:text-white'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="bg-dark-800 border border-dark-600 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600 bg-dark-900/50">
          <div className="flex items-center gap-2 text-sm text-white">
            <FiSmartphone className="w-4 h-4 text-accent" />
            <span className="font-bold">{selected ? `${selected}.html` : 'Select a platform'}</span>
            <span className="text-xs text-gray-500 ml-2">400 × 870 · mobile ratio</span>
          </div>
          <div className="flex gap-2">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => loadPreview(selected)}
              disabled={loading || !selected}
              className="flex items-center gap-1 px-3 py-2 bg-dark-700 hover:bg-dark-600 text-gray-300 text-sm rounded border border-dark-600 disabled:opacity-40"
            >
              <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Reload
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleRenderPng}
              disabled={rendering || !selected}
              className="flex items-center gap-1 px-3 py-2 bg-accent hover:bg-accent/90 text-dark-900 text-sm font-bold rounded disabled:opacity-40"
            >
              <FiImage className={`w-4 h-4 ${rendering ? 'animate-pulse' : ''}`} />
              {rendering ? 'Rendering…' : 'Render PNG'}
            </motion.button>
          </div>
        </div>

        <div className="p-6 bg-[#0a0a14] flex items-start justify-center overflow-auto min-h-[900px]">
          {!selected ? (
            <div className="text-gray-500 mt-20">No template selected</div>
          ) : pngBase64 ? (
            <div>
              <img
                src={`data:image/png;base64,${pngBase64}`}
                alt="Rendered PNG"
                className="border border-dark-600 rounded-[2rem] shadow-2xl"
                style={{ width: 402, height: 887 }}
              />
              <div className="text-xs text-gray-500 mt-2 text-center">
                ↑ Exact PNG that will be sent to Telegram
              </div>
            </div>
          ) : (
            <div>
              <iframe
                title="preview"
                srcDoc={previewHtml}
                className="border border-dark-600 bg-white rounded-[2rem] shadow-2xl"
                style={{ width: 402, height: 887 }}
              />
              <div className="text-xs text-gray-500 mt-2 text-center">
                Live HTML preview (reads from disk each reload)
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="text-xs text-gray-500 bg-dark-800 border border-dark-600 rounded-lg p-3">
        <b className="text-gray-400">Available variables:</b>{' '}
        <code className="text-accent">
          {`{{name}} {{nameInitial}} {{amount}} {{amountFormatted}} {{platform}} {{utr}} {{txnId}} {{refId}} {{orderId}} {{bankLast4}} {{date}} {{time}} {{periodId}}`}
        </code>
      </div>
    </div>
  );
}

export default AdminPaymentTemplates;
