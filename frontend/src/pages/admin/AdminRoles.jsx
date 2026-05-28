import { useState, useEffect, useCallback } from 'react';
import { FiShield, FiPlus, FiEdit2, FiTrash2, FiCheck, FiX, FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import useStore from '../../store/useStore';
import {
  getAdminRoles, getAdminRoleModules, createAdminRole, updateAdminRole,
  deleteAdminRole, getRoleAdmins, assignAdminRole,
} from '../../services/api';

function AdminRoles() {
  usePageTitle('Roles & Access');
  const { user } = useStore();
  const canManage = !!user?.isSuper;

  const [roles, setRoles] = useState([]);
  const [modules, setModules] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { id, name, permissions:Set }
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, m, a] = await Promise.all([getAdminRoles(), getAdminRoleModules(), getRoleAdmins()]);
      setRoles(r.data?.data || []);
      setModules(m.data?.data || []);
      setAdmins(a.data?.data || []);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => setEditing({ id: null, name: '', permissions: new Set() });
  const openEdit = (role) => setEditing({ id: role.id, name: role.name, permissions: new Set(role.permissions || []) });
  const closeEditor = () => setEditing(null);

  const togglePerm = (key) => {
    setEditing((prev) => {
      const next = new Set(prev.permissions);
      next.has(key) ? next.delete(key) : next.add(key);
      return { ...prev, permissions: next };
    });
  };

  const save = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) { toast.error('Role name is required'); return; }
    const perms = [...editing.permissions];
    setSaving(true);
    try {
      if (editing.id) await updateAdminRole(editing.id, name, perms);
      else await createAdminRole(name, perms);
      toast.success(editing.id ? 'Role updated' : 'Role created');
      closeEditor();
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to save role');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (role) => {
    if (!window.confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    try {
      await deleteAdminRole(role.id);
      toast.success('Role deleted');
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to delete role');
    }
  };

  const assign = async (userId, value) => {
    const adminRoleId = value === '' ? null : parseInt(value, 10);
    try {
      await assignAdminRole(userId, adminRoleId);
      toast.success('Role assigned');
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to assign role');
      load(); // revert the optimistic select value
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <FiShield className="text-accent" /> Roles &amp; Access
          </h1>
          <p className="text-xs text-gray-400 mt-1 max-w-xl">
            Create roles, choose which admin modules each can access, and assign a role to
            each admin. Super Admins always have full access.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-md bg-dark-800 border border-dark-600 text-xs text-gray-300 hover:text-white">
            <FiRefreshCw className="w-4 h-4" /> Reload
          </button>
          {canManage && (
            <button onClick={openNew} className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent text-dark-900 text-xs font-black hover:brightness-95">
              <FiPlus className="w-4 h-4" /> New role
            </button>
          )}
        </div>
      </div>

      {!canManage && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2 text-xs text-amber-300">
          You can view roles but only a Super Admin can create, edit, delete, or assign them.
        </div>
      )}

      {loading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : (
        <>
          {/* Roles list */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {roles.map((role) => (
              <div key={role.id} className="bg-dark-800 border border-dark-600 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white truncate">{role.name}</span>
                      {role.isSystem && (
                        <span className="px-2 py-0.5 rounded-full bg-accent/20 text-accent text-[9px] font-black uppercase">Super</span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {role.userCount} admin{role.userCount === 1 ? '' : 's'} ·{' '}
                      {role.isSystem ? 'all modules' : `${(role.permissions || []).length} module${(role.permissions || []).length === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  {canManage && !role.isSystem && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEdit(role)} className="p-1.5 rounded-md bg-dark-900 border border-dark-600 text-gray-300 hover:text-white" title="Edit">
                        <FiEdit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => remove(role)} className="p-1.5 rounded-md bg-dark-900 border border-dark-600 text-red-400 hover:text-red-300" title="Delete">
                        <FiTrash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {!role.isSystem && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {(role.permissions || []).length === 0 ? (
                      <span className="text-[11px] text-gray-600">No modules</span>
                    ) : (
                      (role.permissions || []).map((p) => {
                        const label = (modules.find((m) => m.key === p) || {}).label || p;
                        return <span key={p} className="px-2 py-0.5 rounded bg-dark-900 border border-dark-600 text-[10px] text-gray-300">{label}</span>;
                      })
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Admin assignment */}
          <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
            <h2 className="text-sm font-bold text-white mb-3">Admin users</h2>
            <div className="space-y-2">
              {admins.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 py-2 border-b border-dark-600/40 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{a.username}</p>
                    <p className="text-[11px] text-gray-500 truncate">{a.email}</p>
                  </div>
                  <select
                    value={a.adminRoleId ?? ''}
                    disabled={!canManage}
                    onChange={(e) => assign(a.id, e.target.value)}
                    className="bg-dark-900 border border-dark-600 rounded-md px-2 py-1.5 text-xs text-white focus:border-accent disabled:opacity-50"
                  >
                    <option value="">— No role —</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              ))}
              {admins.length === 0 && <p className="text-xs text-gray-500">No admin users found.</p>}
            </div>
          </div>
        </>
      )}

      {/* Editor modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={closeEditor}>
          <div className="bg-dark-800 border border-dark-600 rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-white">{editing.id ? 'Edit role' : 'New role'}</h3>
              <button onClick={closeEditor} className="p-1.5 text-gray-400 hover:text-white"><FiX className="w-5 h-5" /></button>
            </div>

            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Role name</label>
            <input
              value={editing.name}
              onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Finance, Support"
              className="w-full bg-dark-900 border border-dark-600 rounded-md p-2 text-sm text-white focus:border-accent mb-4"
            />

            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Accessible modules</label>
            <div className="grid grid-cols-2 gap-1.5">
              {modules.map((m) => {
                const checked = editing.permissions.has(m.key);
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => togglePerm(m.key)}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium border text-left transition-all ${
                      checked ? 'bg-accent/15 border-accent text-white' : 'bg-dark-900 border-dark-600 text-gray-400 hover:text-white'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${checked ? 'bg-accent text-dark-900' : 'border border-dark-500'}`}>
                      {checked && <FiCheck className="w-3 h-3" />}
                    </span>
                    {m.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={closeEditor} className="px-4 py-2 rounded-lg bg-dark-900 border border-dark-600 text-sm text-gray-300 hover:text-white">Cancel</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-accent text-dark-900 text-sm font-black disabled:opacity-50 hover:brightness-95">
                {saving ? 'Saving…' : editing.id ? 'Save changes' : 'Create role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminRoles;
