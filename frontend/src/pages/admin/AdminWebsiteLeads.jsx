import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { FiTrash2, FiSearch, FiX, FiEye, FiRefreshCw, FiChevronLeft, FiChevronRight, FiMail, FiPhone, FiGlobe } from 'react-icons/fi';
import { adminGetWebsiteLeads, adminDeleteWebsiteLead } from '../../services/api';

const PAGE_SIZE = 25;

function formatDate(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

function originHost(origin) {
  if (!origin) return '—';
  try {
    return new URL(origin).hostname;
  } catch {
    return origin;
  }
}

export default function AdminWebsiteLeads() {
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [originFilter, setOriginFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [originInput, setOriginInput] = useState('');
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminGetWebsiteLeads({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        search: search || undefined,
        origin: originFilter || undefined,
      });
      setLeads(res.data?.data || []);
      setTotal(res.data?.total || 0);
    } catch {
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [page, search, originFilter]);

  useEffect(() => { load(); }, [load]);

  const applyFilters = (e) => {
    e.preventDefault();
    setPage(0);
    setSearch(searchInput.trim());
    setOriginFilter(originInput.trim());
  };

  const clearFilters = () => {
    setSearchInput('');
    setOriginInput('');
    setSearch('');
    setOriginFilter('');
    setPage(0);
  };

  const remove = async (id) => {
    if (!confirm('Delete this lead?')) return;
    try {
      await adminDeleteWebsiteLead(id);
      toast.success('Deleted');
      load();
    } catch {
      toast.error('Delete failed');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Website Leads</h1>
          <p className="text-gray-400 text-sm mt-1">
            Form submissions captured via <code className="text-accent">/api/enroll</code> from your sites
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Total: <span className="text-white font-semibold">{total}</span></span>
          <button
            onClick={load}
            className="p-2 text-gray-400 hover:text-white rounded hover:bg-dark-700"
            title="Refresh"
          >
            <FiRefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <form onSubmit={applyFilters} className="bg-dark-800 border border-dark-600 rounded-xl p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, email, phone…"
            className="w-full pl-9 pr-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <FiGlobe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={originInput}
            onChange={(e) => setOriginInput(e.target.value)}
            placeholder="Filter by origin (e.g. landing.example.com)"
            className="w-full pl-9 pr-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-accent text-dark-900 font-semibold rounded-lg hover:opacity-90 text-sm"
        >
          Apply
        </button>
        {(search || originFilter) && (
          <button
            type="button"
            onClick={clearFilters}
            className="px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-gray-300 hover:text-white text-sm"
          >
            Clear
          </button>
        )}
      </form>

      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : leads.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No leads yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-dark-700/50">
                <tr className="text-left text-gray-400">
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Origin</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-t border-dark-600 hover:bg-dark-700/30">
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{formatDate(lead.created_at)}</td>
                    <td className="px-4 py-3">
                      {lead.origin ? (
                        <a href={lead.origin} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                          {originHost(lead.origin)}
                        </a>
                      ) : <span className="text-gray-500">—</span>}
                    </td>
                    <td className="px-4 py-3 text-white">{lead.name || <span className="text-gray-500">—</span>}</td>
                    <td className="px-4 py-3 text-gray-300">
                      {lead.email ? (
                        <a href={`mailto:${lead.email}`} className="hover:text-accent flex items-center gap-1">
                          <FiMail className="w-3 h-3" /> {lead.email}
                        </a>
                      ) : <span className="text-gray-500">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {lead.phone ? (
                        <a href={`tel:${lead.phone}`} className="hover:text-accent flex items-center gap-1">
                          <FiPhone className="w-3 h-3" /> {lead.phone}
                        </a>
                      ) : <span className="text-gray-500">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400 max-w-xs truncate">
                      {lead.message || <span className="text-gray-500">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setViewing(lead)}
                          className="p-2 text-gray-400 hover:text-white rounded hover:bg-dark-600"
                          title="View payload"
                        >
                          <FiEye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => remove(lead.id)}
                          className="p-2 text-gray-400 hover:text-red-400 rounded hover:bg-dark-600"
                          title="Delete"
                        >
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

        {!loading && leads.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-dark-600 text-sm">
            <span className="text-gray-400">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-2 text-gray-400 hover:text-white rounded hover:bg-dark-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <FiChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-2 text-gray-400 hover:text-white rounded hover:bg-dark-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <FiChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {viewing && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setViewing(null)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-dark-800 border border-dark-600 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Lead #{viewing.id}</h2>
              <button onClick={() => setViewing(null)} className="p-2 text-gray-400 hover:text-white rounded hover:bg-dark-700">
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-4">
              <Field label="Submitted" value={formatDate(viewing.created_at)} />
              <Field label="Origin" value={viewing.origin} />
              <Field label="Referer" value={viewing.referer} />
              <Field label="Name" value={viewing.name} />
              <Field label="Email" value={viewing.email} />
              <Field label="Phone" value={viewing.phone} />
              <Field label="IP Address" value={viewing.ip_address} />
              <Field label="User Agent" value={viewing.user_agent} className="sm:col-span-2" />
              {viewing.message && <Field label="Message" value={viewing.message} className="sm:col-span-2" />}
            </dl>

            <div>
              <p className="text-xs text-gray-400 mb-1">Raw Payload</p>
              <pre className="bg-dark-900 border border-dark-600 rounded-lg p-3 text-xs text-gray-300 overflow-x-auto max-h-72">
                {(() => {
                  try {
                    const obj = typeof viewing.payload === 'string' ? JSON.parse(viewing.payload) : viewing.payload;
                    return JSON.stringify(obj, null, 2);
                  } catch {
                    return String(viewing.payload || '');
                  }
                })()}
              </pre>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, className = '' }) {
  return (
    <div className={className}>
      <dt className="text-xs text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="text-gray-200 break-words">{value || <span className="text-gray-500">—</span>}</dd>
    </div>
  );
}
