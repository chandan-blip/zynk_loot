import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiX, FiCheck, FiEye, FiEyeOff, FiUpload, FiImage, FiCopy } from 'react-icons/fi';
import {
  adminGetBanners,
  adminCreateBanner,
  adminUpdateBanner,
  adminDeleteBanner,
  adminUploadBannerImage,
} from '../../services/api';

const emptyForm = { title: '', image_url: '', link_url: '', sort_order: 0, is_active: true };

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB

export default function AdminBanners() {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminGetBanners();
      setBanners(res.data?.data || []);
    } catch {
      toast.error('Failed to load banners');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const startEdit = (banner) => {
    setEditing(banner.id);
    setForm({
      title: banner.title || '',
      image_url: banner.image_url || '',
      link_url: banner.link_url || '',
      sort_order: banner.sort_order || 0,
      is_active: !!banner.is_active,
    });
    setShowForm(true);
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error('Image must be under 5 MB');
      return;
    }
    setUploading(true);
    try {
      const res = await adminUploadBannerImage(file);
      const url = res.data?.data?.url;
      if (!url) throw new Error('No URL returned');
      setForm((f) => ({ ...f, image_url: url }));
      toast.success('Image uploaded');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const copyUrl = async (url) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('URL copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.image_url) {
      toast.error('Please upload an image or paste an image URL');
      return;
    }
    try {
      if (editing) {
        await adminUpdateBanner(editing, form);
        toast.success('Updated');
      } else {
        await adminCreateBanner(form);
        toast.success('Created');
      }
      setShowForm(false);
      load();
    } catch {
      toast.error('Save failed');
    }
  };

  const toggleActive = async (banner) => {
    try {
      await adminUpdateBanner(banner.id, { is_active: !banner.is_active });
      load();
    } catch { toast.error('Update failed'); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this banner?')) return;
    try {
      await adminDeleteBanner(id);
      toast.success('Deleted');
      load();
    } catch { toast.error('Delete failed'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white">Home Banners</h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">Banner carousel shown at the top of the home page (auto-loops, swipeable)</p>
        </div>
        <button
          onClick={startCreate}
          className="shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 bg-accent text-dark-900 font-semibold rounded-lg hover:opacity-90 text-sm sm:text-base"
        >
          <FiPlus className="w-4 h-4" /> <span className="hidden xs:inline">Add Banner</span><span className="xs:hidden">Add</span>
        </button>
      </div>

      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : banners.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No banners yet. Add one to make it appear on the home page.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-dark-700/50">
              <tr className="text-left text-gray-400">
                <th className="px-4 py-3">Preview</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Link</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {banners.map((banner) => (
                <tr key={banner.id} className="border-t border-dark-600">
                  <td className="px-4 py-3">
                    <div className="w-32 h-16 rounded-lg bg-dark-700 border border-dark-600 overflow-hidden flex items-center justify-center">
                      {banner.image_url ? (
                        <img src={banner.image_url} alt={banner.title || 'banner'} className="w-full h-full object-cover" />
                      ) : (
                        <FiImage className="w-5 h-5 text-gray-500" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white font-medium">{banner.title || <span className="text-gray-500">—</span>}</td>
                  <td className="px-4 py-3 text-gray-400 max-w-xs truncate">
                    {banner.link_url ? (
                      <a href={banner.link_url} target="_blank" rel="noreferrer" className="hover:text-accent">{banner.link_url}</a>
                    ) : <span className="text-gray-500">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{banner.sort_order}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(banner)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${banner.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}
                    >
                      {banner.is_active ? <FiEye className="w-3 h-3" /> : <FiEyeOff className="w-3 h-3" />}
                      {banner.is_active ? 'Active' : 'Hidden'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => copyUrl(banner.image_url)}
                        title="Copy image URL"
                        disabled={!banner.image_url || banner.image_url.startsWith('data:')}
                        className="p-2 text-gray-400 hover:text-accent rounded hover:bg-dark-600 disabled:opacity-30 disabled:hover:text-gray-400"
                      >
                        <FiCopy className="w-4 h-4" />
                      </button>
                      <button onClick={() => startEdit(banner)} className="p-2 text-gray-400 hover:text-white rounded hover:bg-dark-600">
                        <FiEdit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => remove(banner.id)} className="p-2 text-gray-400 hover:text-red-400 rounded hover:bg-dark-600">
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-dark-800 border border-dark-600 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">{editing ? 'Edit Banner' : 'Add Banner'}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 text-gray-400 hover:text-white rounded hover:bg-dark-700">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Title (optional)</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Diwali Bonanza"
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Banner Image</label>
                <div className="space-y-2">
                  {form.image_url && (
                    <div className="rounded-lg bg-dark-700 border border-dark-600 overflow-hidden">
                      <img src={form.image_url} alt="preview" className="w-full max-h-44 object-cover" />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFile(e.target.files?.[0])}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-dark-700 border border-dark-600 rounded-lg text-white hover:bg-dark-600 disabled:opacity-50"
                    >
                      <FiUpload className="w-4 h-4" />
                      {uploading ? 'Reading…' : (form.image_url ? 'Replace Image' : 'Upload Image')}
                    </button>
                    {form.image_url && (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, image_url: '' })}
                        className="px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-gray-400 hover:text-red-400"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <input
                    type="url"
                    value={form.image_url.startsWith('data:') ? '' : form.image_url}
                    onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                    placeholder="…or paste image URL (https://…)"
                    className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-xs focus:outline-none focus:border-accent"
                  />
                  <p className="text-[11px] text-gray-500">Max 5 MB. Recommended ratio 16:7 (e.g. 1600×700).</p>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Link URL (optional)</label>
                <input
                  type="url"
                  value={form.link_url}
                  onChange={(e) => setForm({ ...form, link_url: e.target.value })}
                  placeholder="/games/lottery or https://…"
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
                <FiCheck className="w-4 h-4" /> {editing ? 'Save Changes' : 'Create Banner'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
