import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiX, FiCheck, FiGlobe, FiEye, FiEyeOff, FiExternalLink, FiPlay, FiRefreshCw, FiCode } from 'react-icons/fi';
import CodeMirror from '@uiw/react-codemirror';
import { html as cmHtml } from '@codemirror/lang-html';
import { css as cmCss } from '@codemirror/lang-css';
import { javascript as cmJs } from '@codemirror/lang-javascript';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import {
  adminGetWebsites,
  adminGetWebsite,
  adminCreateWebsite,
  adminUpdateWebsite,
  adminPublishWebsite,
  adminUnpublishWebsite,
  adminDeleteWebsite,
} from '../../services/api';

const emptyForm = {
  title: '',
  sub_domain: '',
  domain: '',
  html: '<section style="padding:40px;text-align:center">\n  <h1>Hello World</h1>\n  <p>Edit this landing page on the left.</p>\n  <button id="cta">Click me</button>\n</section>',
  css: 'body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;background:#0a0e13;color:#fff;margin:0}\nh1{color:#00d4aa}\nbutton{padding:10px 20px;background:#00d4aa;color:#0a0e13;border:0;border-radius:8px;cursor:pointer;font-weight:600}',
  js: "document.getElementById('cta')?.addEventListener('click',()=>alert('Hi from your landing page!'));",
  status: 'draft',
  is_active: true,
};

const LANG_EXT = {
  html: () => cmHtml({ matchClosingTags: true, autoCloseTags: true }),
  css: () => cmCss(),
  js: () => cmJs(),
};

const PRETTIER_PARSER = { html: 'html', css: 'css', js: 'babel' };

const formatCode = async (code, lang) => {
  const prettier = await import('prettier/standalone');
  const parsers = [];
  if (lang === 'html') parsers.push(import('prettier/plugins/html'));
  if (lang === 'css') parsers.push(import('prettier/plugins/postcss'));
  if (lang === 'js') {
    parsers.push(import('prettier/plugins/babel'));
    parsers.push(import('prettier/plugins/estree'));
  }
  const plugins = (await Promise.all(parsers)).map((m) => m.default || m);
  return prettier.format(code || '', {
    parser: PRETTIER_PARSER[lang],
    plugins,
    tabWidth: 2,
    printWidth: 100,
    singleQuote: false,
  });
};

const buildPreview = ({ html, css, js, title }) => `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${(title || 'Preview').replace(/</g, '&lt;')}</title>
<style>${css || ''}</style></head>
<body>${html || ''}<script>${js || ''}<\/script></body></html>`;

export default function AdminWebsites() {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState('html');
  const [previewKey, setPreviewKey] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const iframeRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminGetWebsites();
      setSites(res.data?.data || []);
    } catch {
      toast.error('Failed to load websites');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const previewDoc = useMemo(() => buildPreview(form), [form]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setTimeout(() => setPreviewKey(k => k + 1), 500);
    return () => clearTimeout(t);
  }, [previewDoc, autoRefresh]);

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setActiveTab('html');
    setShowForm(true);
  };

  const startEdit = async (site) => {
    try {
      const res = await adminGetWebsite(site.id);
      const data = res.data?.data;
      if (!data) return;
      setEditing(site.id);
      setForm({
        title: data.title || '',
        sub_domain: data.sub_domain || '',
        domain: data.domain || '',
        html: data.html || '',
        css: data.css || '',
        js: data.js || '',
        status: data.status || 'draft',
        is_active: !!data.is_active,
      });
      setActiveTab('html');
      setShowForm(true);
    } catch {
      toast.error('Failed to load website');
    }
  };

  const submit = async (e, publish = false) => {
    e?.preventDefault?.();
    if (!form.title || !form.sub_domain) {
      toast.error('Title and sub-domain are required');
      return;
    }
    const payload = { ...form, status: publish ? 'published' : form.status };
    try {
      if (editing) {
        await adminUpdateWebsite(editing, payload);
        if (publish) await adminPublishWebsite(editing);
        toast.success(publish ? 'Published' : 'Saved');
      } else {
        const res = await adminCreateWebsite(payload);
        const newId = res.data?.data?.id;
        if (publish && newId) await adminPublishWebsite(newId);
        toast.success(publish ? 'Published' : 'Created');
      }
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Save failed');
    }
  };

  const publish = async (site) => {
    try {
      const res = await adminPublishWebsite(site.id);
      const url = res.data?.data?.url;
      toast.success(url ? `Published at ${url}` : 'Published');
      load();
    } catch { toast.error('Publish failed'); }
  };

  const unpublish = async (site) => {
    try {
      await adminUnpublishWebsite(site.id);
      toast.success('Unpublished');
      load();
    } catch { toast.error('Failed'); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this website?')) return;
    try {
      await adminDeleteWebsite(id);
      toast.success('Deleted');
      load();
    } catch { toast.error('Delete failed'); }
  };

  const appDomain = import.meta.env.VITE_APP_DOMAIN || window.location.hostname;

  const publishedUrl = (site) => {
    const base = site.domain || appDomain;
    return `${window.location.protocol}//${site.sub_domain}.${base}`;
  };

  const pathUrl = (site) => `${window.location.protocol}//${window.location.host}/sites/${site.sub_domain}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Websites</h1>
          <p className="text-gray-400 text-sm mt-1">Create landing pages. Publish to expose at <code className="text-accent">sub-domain.{appDomain}</code></p>
        </div>
        <button
          onClick={startCreate}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-dark-900 font-semibold rounded-lg hover:opacity-90"
        >
          <FiPlus className="w-4 h-4" /> New Website
        </button>
      </div>

      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : sites.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No websites yet. Create your first landing page.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-dark-700/50">
              <tr className="text-left text-gray-400">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Sub-domain</th>
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr key={site.id} className="border-t border-dark-600">
                  <td className="px-4 py-3 text-white font-medium">{site.title}</td>
                  <td className="px-4 py-3 text-gray-300">
                    <div className="flex items-center gap-2">
                      <FiGlobe className="w-3 h-3 text-gray-500" />
                      {site.sub_domain}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{site.domain || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${site.status === 'published' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      {site.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {site.is_active
                      ? <FiEye className="w-4 h-4 text-green-400" />
                      : <FiEyeOff className="w-4 h-4 text-gray-500" />}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {site.status === 'published' && (
                        <>
                          <a
                            href={publishedUrl(site)} target="_blank" rel="noreferrer"
                            className="p-2 text-gray-400 hover:text-accent rounded hover:bg-dark-600"
                            title={publishedUrl(site)}
                          >
                            <FiExternalLink className="w-4 h-4" />
                          </a>
                          <button
                            onClick={() => unpublish(site)}
                            className="p-2 text-gray-400 hover:text-yellow-400 rounded hover:bg-dark-600"
                            title="Unpublish"
                          >
                            <FiEyeOff className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {site.status !== 'published' && (
                        <button
                          onClick={() => publish(site)}
                          className="p-2 text-gray-400 hover:text-green-400 rounded hover:bg-dark-600"
                          title="Publish"
                        >
                          <FiPlay className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => startEdit(site)} className="p-2 text-gray-400 hover:text-white rounded hover:bg-dark-600">
                        <FiEdit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => remove(site.id)} className="p-2 text-gray-400 hover:text-red-400 rounded hover:bg-dark-600">
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-stretch justify-center p-2" onClick={() => setShowForm(false)}>
          <motion.div
            initial={{ scale: 0.97, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-[1400px] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-dark-600">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-white">{editing ? 'Edit Website' : 'New Website'}</h2>
                <span className={`px-2 py-0.5 rounded text-xs ${form.status === 'published' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                  {form.status}
                </span>
              </div>
              <button onClick={() => setShowForm(false)} className="p-2 text-gray-400 hover:text-white rounded hover:bg-dark-700">
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 border-b border-dark-600">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Landing Page"
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Sub-domain</label>
                <input
                  type="text"
                  value={form.sub_domain}
                  onChange={(e) => setForm({ ...form, sub_domain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  placeholder="promo"
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Domain (optional)</label>
                <input
                  type="text"
                  value={form.domain}
                  onChange={(e) => setForm({ ...form, domain: e.target.value })}
                  placeholder={appDomain}
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex items-end gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="w-4 h-4"
                  />
                  Active
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="w-4 h-4"
                  />
                  Auto-refresh
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 flex-1 min-h-[60vh]">
              {/* Left: Code Editor */}
              <div className="flex flex-col border-r border-dark-600 min-h-0">
                <div className="flex items-center justify-between px-2 py-2 bg-dark-700/50 border-b border-dark-600">
                  <div className="flex gap-1">
                    {['html', 'css', 'js'].map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={`px-3 py-1.5 text-xs font-mono rounded ${activeTab === tab ? 'bg-accent text-dark-900 font-bold' : 'text-gray-400 hover:text-white hover:bg-dark-600'}`}
                      >
                        {tab.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const formatted = await formatCode(form[activeTab], activeTab);
                        setForm((f) => ({ ...f, [activeTab]: formatted }));
                        toast.success('Formatted');
                      } catch (err) {
                        toast.error(err?.message ? `Format failed: ${err.message.split('\n')[0]}` : 'Format failed');
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white rounded hover:bg-dark-600"
                    title="Format with Prettier"
                  >
                    <FiCode className="w-3 h-3" /> Format
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-auto">
                  <CodeMirror
                    value={form[activeTab]}
                    onChange={(value) => setForm((f) => ({ ...f, [activeTab]: value }))}
                    height="100%"
                    theme={vscodeDark}
                    extensions={[LANG_EXT[activeTab]()]}
                    basicSetup={{
                      lineNumbers: true,
                      foldGutter: true,
                      highlightActiveLine: true,
                      autocompletion: true,
                      bracketMatching: true,
                      closeBrackets: true,
                      indentOnInput: true,
                    }}
                    style={{ height: '100%', fontSize: '13px' }}
                  />
                </div>
              </div>

              {/* Right: Live Preview */}
              <div className="flex flex-col">
                <div className="flex items-center justify-between px-2 py-2 bg-dark-700/50 border-b border-dark-600">
                  <span className="text-xs text-gray-400 font-mono">live preview</span>
                  <button
                    type="button"
                    onClick={() => setPreviewKey(k => k + 1)}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white rounded hover:bg-dark-600"
                  >
                    <FiRefreshCw className="w-3 h-3" /> Refresh
                  </button>
                </div>
                <iframe
                  key={previewKey}
                  ref={iframeRef}
                  title="preview"
                  srcDoc={previewDoc}
                  sandbox="allow-scripts allow-forms allow-modals allow-same-origin"
                  className="flex-1 w-full bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t border-dark-600">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-gray-300 hover:text-white rounded-lg hover:bg-dark-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={(e) => submit(e, false)}
                className="px-4 py-2 bg-dark-600 text-white font-semibold rounded-lg hover:bg-dark-500 flex items-center gap-2"
              >
                <FiCheck className="w-4 h-4" /> Save Draft
              </button>
              <button
                type="button"
                onClick={(e) => submit(e, true)}
                className="px-4 py-2 bg-accent text-dark-900 font-semibold rounded-lg hover:opacity-90 flex items-center gap-2"
              >
                <FiPlay className="w-4 h-4" /> Save & Publish
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
