import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  FiPlus, FiEdit2, FiTrash2, FiX, FiCheck, FiCopy, FiEye, FiEyeOff,
  FiRefreshCw, FiKey, FiExternalLink, FiAlertTriangle, FiChevronDown, FiChevronUp, FiSend,
  FiActivity, FiDollarSign,
} from 'react-icons/fi';
import {
  adminGetGatewayConfig,
  adminGetGatewayBalance,
  adminCreateGatewayTestPayment,
  adminGetGatewayMerchants,
  adminCreateGatewayMerchant,
  adminUpdateGatewayMerchant,
  adminDeleteGatewayMerchant,
  adminRotateGatewaySecret,
  adminSetGatewayPortalPassword,
  adminGetGatewayOrders,
  adminResendGatewayOrder,
} from '../../services/api';

const emptyForm = {
  name: '', domain: '', callback_url: '', currency: 'USDT',
  portal_subdomain: '', portal_username: '', portal_enabled: false, is_active: true,
};

const COINS = ['USDT', 'TRX'];

const copy = (text, label = 'Copied') => {
  if (!text) return;
  try { navigator.clipboard.writeText(text); toast.success(label); }
  catch { toast.error('Copy failed'); }
};

const statusLabel = (s) => (Number(s) === 1 ? 'Paid' : Number(s) === 2 ? 'Failed' : 'Unpaid');
const statusClass = (s) => (Number(s) === 1
  ? 'bg-green-500/20 text-green-400'
  : Number(s) === 2 ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400');

export default function AdminGateway() {
  const [config, setConfig] = useState(null);
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [revealed, setRevealed] = useState({}); // merchantId -> bool
  const [newlyCreated, setNewlyCreated] = useState(null); // {api_key, api_secret} after create

  const [showOrders, setShowOrders] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [balance, setBalance] = useState(null);   // { usdt, trx, cny } when checked
  const [checkingBalance, setCheckingBalance] = useState(false);

  const checkBalance = async () => {
    setCheckingBalance(true);
    try {
      const res = await adminGetGatewayBalance();
      setBalance(res.data?.data || {});
      toast.success('Connected to OkPay');
    } catch (err) {
      setBalance(null);
      toast.error(err?.response?.data?.message || 'Could not reach OkPay');
    } finally {
      setCheckingBalance(false);
    }
  };

  // Test payment generator
  const [testForm, setTestForm] = useState({ amount: '10', coin: 'USDT', merchant_id: '', name: '' });
  const [testResult, setTestResult] = useState(null);
  const [generating, setGenerating] = useState(false);

  const generateTest = async (e) => {

    e.preventDefault();
    const amt = Number(testForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Enter a valid amount'); return; }
    setGenerating(true);
    setTestResult(null);
    try {
      const payload = { amount: amt, coin: testForm.coin, name: testForm.name || undefined };

    //       console.log("Calling test link", payload);
    // return;
      if (testForm.merchant_id) payload.merchant_id = Number(testForm.merchant_id);
      const res = await adminCreateGatewayTestPayment(payload);
      setTestResult(res.data?.data || null);
      toast.success('Payment link generated');
      if (res.data?.data?.recorded) loadOrders();
    } catch (err) {
      const msg = err?.response?.data?.message
        || (err?.response ? `Failed (HTTP ${err.response.status})` : 'Could not reach the server');
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const okpayReady = config ? config.okpay_configured : true;

  // When a merchant is picked for the test, default the coin to its currency.
  const onTestMerchantChange = (id) => {
    const m = merchants.find((x) => String(x.id) === String(id));
    setTestForm((f) => ({ ...f, merchant_id: id, coin: m?.currency || f.coin }));
  };

  const appDomain = config?.app_domain;

  const load = async () => {
    setLoading(true);
    try {
      const [cfg, list] = await Promise.all([
        adminGetGatewayConfig().catch(() => null),
        adminGetGatewayMerchants(),
      ]);
      if (cfg) setConfig(cfg.data?.data || null);
      setMerchants(list.data?.data || []);
    } catch {
      toast.error('Failed to load gateway');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      const res = await adminGetGatewayOrders({ limit: 30 });
      setOrders(res.data?.data?.orders || []);
    } catch { toast.error('Failed to load orders'); }
    finally { setOrdersLoading(false); }
  };
  const toggleOrders = () => {
    const next = !showOrders;
    setShowOrders(next);
    if (next && orders.length === 0) loadOrders();
  };

  const startCreate = () => { setEditing(null); setForm(emptyForm); setNewlyCreated(null); setShowForm(true); };
  const startEdit = (m) => {
    setEditing(m.id);
    setNewlyCreated(null);
    setForm({
      name: m.name || '', domain: m.domain || '', callback_url: m.callback_url || '',
      currency: m.currency || 'USDT',
      portal_subdomain: m.portal_subdomain || '', portal_username: m.portal_username || '',
      portal_enabled: !!m.portal_enabled, is_active: !!m.is_active,
    });
    setShowForm(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    try {
      if (editing) {
        await adminUpdateGatewayMerchant(editing, form);
        toast.success('Saved');
        setShowForm(false);
      } else {
        const res = await adminCreateGatewayMerchant(form);
        const m = res.data?.data;
        toast.success('Domain added');
        // Surface the freshly-issued credentials prominently.
        setNewlyCreated(m ? { api_key: m.api_key, api_secret: m.api_secret } : null);
        setEditing(m?.id || null);
      }
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Save failed');
    }
  };

  const rotateSecret = async (m) => {
    if (!confirm(`Rotate the API secret for "${m.name}"? Their current secret stops working immediately.`)) return;
    try {
      const res = await adminRotateGatewaySecret(m.id);
      toast.success('Secret rotated');
      copy(res.data?.data?.api_secret, 'New secret copied');
      load();
    } catch { toast.error('Rotate failed'); }
  };

  const setPassword = async (m) => {
    const pw = prompt(`Set portal password for "${m.name}" (min 6 chars):`);
    if (pw == null) return;
    if (pw.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    try {
      await adminSetGatewayPortalPassword(m.id, pw);
      toast.success('Portal password set');
      load();
    } catch (err) { toast.error(err?.response?.data?.message || 'Failed to set password'); }
  };

  const toggleActive = async (m) => {
    try { await adminUpdateGatewayMerchant(m.id, { is_active: !m.is_active }); load(); }
    catch { toast.error('Update failed'); }
  };

  const remove = async (m) => {
    if (!confirm(`Delete "${m.name}"? This removes their keys and all their order records.`)) return;
    try { await adminDeleteGatewayMerchant(m.id); toast.success('Deleted'); load(); }
    catch { toast.error('Delete failed'); }
  };

  const resend = async (o) => {
    try {
      const res = await adminResendGatewayOrder(o.id);
      if (res.data?.data?.delivered) toast.success('Delivered to merchant');
      else toast.error(`Merchant returned ${res.data?.data?.http_status || 'no response'}`);
      loadOrders();
    } catch { toast.error('Resend failed'); }
  };

  const portalUrl = (m) => (m.portal_subdomain && appDomain)
    ? `https://${m.portal_subdomain}.${appDomain}` : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white">Payment Gateway</h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">
            Register client domains that pay through your bridge. Each gets API keys + an optional self-serve portal.
          </p>
        </div>
        <button onClick={startCreate}
          className="shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 bg-accent text-dark-900 font-semibold rounded-lg hover:opacity-90 text-sm sm:text-base">
          <FiPlus className="w-4 h-4" /> <span>Add Domain</span>
        </button>
      </div>

      {/* Config banner: what to register at OkPay */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 space-y-3">
        {config && !config.okpay_configured && (
          <div className="flex items-center gap-2 text-amber-400 text-sm">
            <FiAlertTriangle className="w-4 h-4 shrink-0" />
            OkPay credentials are not set on the server. Set <code className="mono text-xs">OKPAY_MERCHANT_ID</code> and <code className="mono text-xs">OKPAY_MERCHANT_TOKEN</code> in the server .env, then restart.
          </div>
        )}
        <div>
          <div className="text-xs text-gray-400 mb-1">Register this single callback URL at OkPay (it serves every domain below):</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-gray-200 bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 break-all">
              {config?.callback_url || '—'}
            </code>
            <button onClick={() => copy(config?.callback_url, 'Callback URL copied')}
              className="p-2 text-gray-400 hover:text-white rounded hover:bg-dark-600"><FiCopy className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Main OkPay wallet — live balance + connection check */}
        <div className="pt-3 border-t border-dark-600">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-gray-400">Your main OkPay wallet (all client payments settle here)</div>
            <button onClick={checkBalance} disabled={checkingBalance}
              className="flex items-center gap-2 px-3 py-1.5 bg-dark-700 border border-dark-600 rounded-lg text-sm text-white hover:bg-dark-600 disabled:opacity-50">
              <FiActivity className={`w-4 h-4 ${checkingBalance ? 'animate-pulse' : ''}`} />
              {checkingBalance ? 'Checking…' : (balance ? 'Refresh balance' : 'Check balance')}
            </button>
          </div>
          {balance && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              {['usdt', 'trx', 'cny'].map((c) => (
                <div key={c} className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2">
                  <div className="text-[11px] text-gray-500 uppercase tracking-wide">{c}</div>
                  <div className="text-white font-semibold flex items-center gap-1">
                    <FiDollarSign className="w-3.5 h-3.5 text-accent" />
                    {balance[c] != null ? balance[c] : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Merchants table */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : merchants.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No domains yet. Add one to issue API keys.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-dark-700/50">
                <tr className="text-left text-gray-400">
                  <th className="px-4 py-3">Name / Domain</th>
                  <th className="px-4 py-3">API key</th>
                  <th className="px-4 py-3">API secret</th>
                  <th className="px-4 py-3">Portal</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {merchants.map((m) => (
                  <tr key={m.id} className="border-t border-dark-600 align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{m.name}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent/15 text-accent">{m.currency || 'USDT'}</span>
                      </div>
                      <div className="text-gray-500 text-xs">{m.domain || '—'}</div>
                      {m.callback_url && <div className="text-gray-500 text-[11px] mt-1 max-w-[220px] truncate">→ {m.callback_url}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <code className="text-xs text-gray-300 break-all max-w-[160px]">{m.api_key}</code>
                        <button onClick={() => copy(m.api_key, 'API key copied')} className="p-1 text-gray-500 hover:text-white"><FiCopy className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <code className="text-xs text-gray-300 break-all max-w-[160px]">
                          {revealed[m.id] ? m.api_secret : '•'.repeat(16)}
                        </code>
                        <button onClick={() => setRevealed((r) => ({ ...r, [m.id]: !r[m.id] }))} className="p-1 text-gray-500 hover:text-white">
                          {revealed[m.id] ? <FiEyeOff className="w-3.5 h-3.5" /> : <FiEye className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => copy(m.api_secret, 'API secret copied')} className="p-1 text-gray-500 hover:text-white"><FiCopy className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {m.portal_subdomain ? (
                        <div className="space-y-1">
                          {portalUrl(m) ? (
                            <a href={portalUrl(m)} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline flex items-center gap-1">
                              {m.portal_subdomain}.{appDomain} <FiExternalLink className="w-3 h-3" />
                            </a>
                          ) : <div className="text-xs text-gray-300">{m.portal_subdomain}</div>}
                          <div className="text-[11px] text-gray-500">
                            {m.portal_username || 'no user'} · {m.portal_enabled ? <span className="text-green-400">enabled</span> : 'disabled'} · {m.has_portal_password ? 'pw set' : <span className="text-amber-400">no pw</span>}
                          </div>
                        </div>
                      ) : <span className="text-gray-600 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleActive(m)}
                        className={`px-2 py-1 rounded text-xs ${m.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                        {m.is_active ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button title="Edit" onClick={() => startEdit(m)} className="p-2 text-gray-400 hover:text-white rounded hover:bg-dark-600"><FiEdit2 className="w-4 h-4" /></button>
                        <button title="Set portal password" onClick={() => setPassword(m)} className="p-2 text-gray-400 hover:text-white rounded hover:bg-dark-600"><FiKey className="w-4 h-4" /></button>
                        <button title="Rotate secret" onClick={() => rotateSecret(m)} className="p-2 text-gray-400 hover:text-amber-400 rounded hover:bg-dark-600"><FiRefreshCw className="w-4 h-4" /></button>
                        <button title="Delete" onClick={() => remove(m)} className="p-2 text-gray-400 hover:text-red-400 rounded hover:bg-dark-600"><FiTrash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent orders (collapsible) */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <button onClick={toggleOrders} className="w-full flex items-center justify-between px-4 py-3 text-left">
          <span className="text-white font-semibold text-sm">Recent gateway orders</span>
          {showOrders ? <FiChevronUp className="w-4 h-4 text-gray-400" /> : <FiChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
        {showOrders && (
          <div className="border-t border-dark-600">
            {ordersLoading ? (
              <div className="p-6 text-center text-gray-500 text-sm">Loading…</div>
            ) : orders.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">No orders yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[760px]">
                  <thead className="bg-dark-700/50">
                    <tr className="text-left text-gray-400">
                      <th className="px-4 py-2">Merchant</th>
                      <th className="px-4 py-2">Order ref</th>
                      <th className="px-4 py-2">Amount</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Forwarded</th>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className="border-t border-dark-600">
                        <td className="px-4 py-2 text-gray-200">{o.merchant_name || `#${o.merchant_id}`}</td>
                        <td className="px-4 py-2"><code className="text-xs text-gray-400">{o.client_unique_id || '—'}</code></td>
                        <td className="px-4 py-2 text-gray-300">{o.amount} {o.coin}</td>
                        <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-xs ${statusClass(o.status)}`}>{statusLabel(o.status)}</span></td>
                        <td className="px-4 py-2 text-xs">
                          {o.forwarded ? <span className="text-green-400">yes</span> : <span className="text-gray-500">no{o.forward_attempts ? ` (${o.forward_attempts}×, ${o.last_forward_code || 'err'})` : ''}</span>}
                        </td>
                        <td className="px-4 py-2 text-gray-500 text-xs">{new Date(o.created_at).toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">
                          <button onClick={() => resend(o)} title="Resend callback to merchant" className="p-1.5 text-gray-400 hover:text-accent rounded hover:bg-dark-600"><FiSend className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Test payment generator */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <FiDollarSign className="w-4 h-4 text-accent" />
          <h2 className="text-white font-semibold text-sm">Generate a test payment</h2>
        </div>
        <p className="text-xs text-gray-500 mb-3">Creates a real OkPay payment link. Pick a domain to run it through the full bridge (the order is recorded and the paid callback is forwarded to that client), or leave blank for a raw link.</p>
        <form onSubmit={generateTest} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Amount</label>
            <input type="number" step="any" min="0" value={testForm.amount}
              onChange={(e) => setTestForm({ ...testForm, amount: e.target.value })}
              className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Coin</label>
            <select value={testForm.coin} onChange={(e) => setTestForm({ ...testForm, coin: e.target.value })}
              className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-accent">
              {COINS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">As domain (optional)</label>
            <select value={testForm.merchant_id} onChange={(e) => onTestMerchantChange(e.target.value)}
              className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-accent">
              <option value="">— raw link —</option>
              {merchants.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <button type="submit" disabled={generating || !okpayReady}
            className="flex items-center justify-center gap-2 py-2 px-4 bg-accent text-dark-900 font-semibold rounded-lg hover:opacity-90 disabled:opacity-50">
            <FiActivity className={`w-4 h-4 ${generating ? 'animate-pulse' : ''}`} />
            {generating ? 'Generating…' : 'Generate link'}
          </button>
        </form>
        {!okpayReady && (
          <p className="text-[11px] text-amber-400 mt-2">Set OKPAY_MERCHANT_ID and OKPAY_MERCHANT_TOKEN on the server (and restart) before generating a link.</p>
        )}

        {testResult && (
          <div className="mt-3 p-3 rounded-lg bg-dark-700 border border-dark-600">
            <div className="text-xs text-gray-400 mb-1">
              Payment link · {testResult.amount} {testResult.coin}
              {testResult.recorded ? ' · recorded under selected domain' : ' · raw (callback not forwarded)'}
            </div>
            <div className="flex items-center gap-2">
              <a href={testResult.pay_url} target="_blank" rel="noreferrer" className="flex-1 text-xs text-accent break-all hover:underline">{testResult.pay_url}</a>
              <button onClick={() => copy(testResult.pay_url, 'Link copied')} className="p-2 text-gray-400 hover:text-white rounded hover:bg-dark-600"><FiCopy className="w-4 h-4" /></button>
              <a href={testResult.pay_url} target="_blank" rel="noreferrer" className="p-2 text-gray-400 hover:text-white rounded hover:bg-dark-600"><FiExternalLink className="w-4 h-4" /></a>
            </div>
          </div>
        )}
      </div>

      {/* Integration help */}
      <details className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 text-sm text-gray-300">
        <summary className="cursor-pointer text-white font-semibold">Integration (for client sites)</summary>
        <div className="mt-3 space-y-2 text-xs text-gray-400">
          <p>Clients POST to <code className="text-gray-200">{config?.callback_url?.replace('/okpay/callback', '/payment') || '/api/gateway/payment'}</code> with: <code>api_key, amount, coin (USDT|TRX), unique_id, return_url, sign</code>.</p>
          <p><strong className="text-gray-200">Signature:</strong> <code>sign = HMAC_SHA256(api_secret, canonical)</code> where <code>canonical</code> = the params (excluding empty values and <code>sign</code>) sorted by key ascending and joined as <code>key=value&amp;key=value</code>. Send the lowercase hex digest as <code>sign</code>.</p>
          <p>We reply with <code>pay_url</code>. When the payment completes we POST the same-signed notification to the domain's callback URL (<code>unique_id, order_id, amount, coin, status, type, sign</code>) — verify it with the same HMAC scheme.</p>
        </div>
      </details>

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-dark-800 border border-dark-600 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">{editing ? 'Edit Domain' : 'Add Domain'}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 text-gray-400 hover:text-white rounded hover:bg-dark-700"><FiX className="w-5 h-5" /></button>
            </div>

            {newlyCreated && (
              <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-xs space-y-2">
                <div className="text-green-400 font-semibold">Credentials issued — share these with the client:</div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 w-20">API key</span>
                  <code className="flex-1 text-gray-200 break-all">{newlyCreated.api_key}</code>
                  <button onClick={() => copy(newlyCreated.api_key, 'API key copied')} className="p-1 text-gray-400 hover:text-white"><FiCopy className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 w-20">API secret</span>
                  <code className="flex-1 text-gray-200 break-all">{newlyCreated.api_secret}</code>
                  <button onClick={() => copy(newlyCreated.api_secret, 'API secret copied')} className="p-1 text-gray-400 hover:text-white"><FiCopy className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )}

            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Name *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Acme Casino" className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Domain (reference)</label>
                <input type="text" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })}
                  placeholder="acme.com" className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Callback URL (where we forward paid notifications)</label>
                <input type="url" value={form.callback_url} onChange={(e) => setForm({ ...form, callback_url: e.target.value })}
                  placeholder="https://acme.com/payments/gateway-callback" className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Currency (default coin for this client)</label>
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-accent">
                  {COINS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <p className="text-[11px] text-gray-500 mt-1">Used when the client doesn't specify a coin per payment.</p>
              </div>

              <div className="pt-2 border-t border-dark-600">
                <div className="text-xs text-gray-300 font-semibold mb-2">Merchant portal (optional)</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Subdomain</label>
                    <input type="text" value={form.portal_subdomain}
                      onChange={(e) => setForm({ ...form, portal_subdomain: e.target.value.toLowerCase() })}
                      placeholder="acme" className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Login username</label>
                    <input type="text" value={form.portal_username}
                      onChange={(e) => setForm({ ...form, portal_username: e.target.value.toLowerCase() })}
                      placeholder="acme" className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-accent" />
                  </div>
                </div>
                {form.portal_subdomain && appDomain && (
                  <p className="text-[11px] text-gray-500 mt-1">Portal URL: <span className="text-accent">https://{form.portal_subdomain}.{appDomain}</span></p>
                )}
                <label className="flex items-center gap-2 text-sm text-gray-300 mt-2">
                  <input type="checkbox" checked={form.portal_enabled} onChange={(e) => setForm({ ...form, portal_enabled: e.target.checked })} className="w-4 h-4" />
                  Portal enabled
                </label>
                {editing && (
                  <p className="text-[11px] text-gray-500 mt-1">Use the key icon in the table to set/reset the portal password.</p>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4" />
                Active (can create payments)
              </label>

              <button type="submit" className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent text-dark-900 font-semibold rounded-lg hover:opacity-90">
                <FiCheck className="w-4 h-4" /> {editing ? 'Save Changes' : 'Add Domain'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
