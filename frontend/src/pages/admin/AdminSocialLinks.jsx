import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiX, FiCheck, FiEye, FiEyeOff } from 'react-icons/fi';
import {
  adminGetSocialLinks,
  adminCreateSocialLink,
  adminUpdateSocialLink,
  adminDeleteSocialLink,
} from '../../services/api';
import { ICON_OPTIONS } from '../../components/FloatingSocialIcons';

const emptyForm = { name: '', icon: 'telegram', url: '', color: '', sort_order: 0, is_active: true };

export default function AdminSocialLinks() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminGetSocialLinks();
      setLinks(res.data?.data || []);
    } catch {
      toast.error('Failed to load links');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const startEdit = (link) => {
    setEditing(link.id);
    setForm({
      name: link.name,
      icon: link.icon,
      url: link.url,
      color: link.color || '',
      sort_order: link.sort_order || 0,
      is_active: !!link.is_active,
    });
    setShowForm(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.url) {
      toast.error('Name and URL are required');
      return;
    }
    try {
      if (editing) {
        await adminUpdateSocialLink(editing, form);
        toast.success('Updated');
      } else {
        await adminCreateSocialLink(form);
        toast.success('Created');
      }
      setShowForm(false);
      load();
    } catch {
      toast.error('Save failed');
    }
  };

  const toggleActive = async (link) => {
    try {
      await adminUpdateSocialLink(link.id, { is_active: !link.is_active });
      load();
    } catch { toast.error('Update failed'); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this link?')) return;
    try {
      await adminDeleteSocialLink(id);
      toast.success('Deleted');
      load();
    } catch { toast.error('Delete failed'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Floating Social Links</h1>
          <p className="text-gray-400 text-sm mt-1">Icons shown on the home page (draggable & clickable for users)</p>
        </div>
        <button
          onClick={startCreate}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-dark-900 font-semibold rounded-lg hover:opacity-90"
        >
          <FiPlus className="w-4 h-4" /> Add Link
        </button>
      </div>

      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : links.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No social links yet. Add one to make it appear on the home page.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-dark-700/50">
              <tr className="text-left text-gray-400">
                <th className="px-4 py-3">Icon</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">URL</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => {
                const meta = ICON_OPTIONS.find(o => o.value === link.icon) || ICON_OPTIONS[0];
                const Icon = meta.Icon;
                return (
                  <tr key={link.id} className="border-t border-dark-600">
                    <td className="px-4 py-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white"
                        style={{ backgroundColor: link.color || meta.color }}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white font-medium">{link.name}</td>
                    <td className="px-4 py-3 text-gray-400 max-w-xs truncate">
                      <a href={link.url} target="_blank" rel="noreferrer" className="hover:text-accent">{link.url}</a>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{link.sort_order}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(link)}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${link.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}
                      >
                        {link.is_active ? <FiEye className="w-3 h-3" /> : <FiEyeOff className="w-3 h-3" />}
                        {link.is_active ? 'Active' : 'Hidden'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => startEdit(link)} className="p-2 text-gray-400 hover:text-white rounded hover:bg-dark-600">
                          <FiEdit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => remove(link.id)} className="p-2 text-gray-400 hover:text-red-400 rounded hover:bg-dark-600">
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-dark-800 border border-dark-600 rounded-2xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">{editing ? 'Edit Link' : 'Add Link'}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 text-gray-400 hover:text-white rounded hover:bg-dark-700">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Telegram Channel"
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Icon</label>
                <select
                  value={form.icon}
                  onChange={(e) => setForm({ ...form, icon: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-accent"
                >
                  {ICON_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">URL</label>
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://t.me/yourchannel"
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-accent"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Color (optional)</label>
                  <input
                    type="text"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    placeholder="#229ED9"
                    className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                Active (visible on home page)
              </label>
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent text-dark-900 font-semibold rounded-lg hover:opacity-90"
              >
                <FiCheck className="w-4 h-4" /> {editing ? 'Save Changes' : 'Create Link'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
