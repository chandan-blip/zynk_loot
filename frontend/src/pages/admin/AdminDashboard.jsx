import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FiUsers, FiGlobe, FiEye, FiMousePointer, FiClock,
  FiDownload, FiCheckCircle, FiAlertCircle, FiXCircle,
  FiActivity, FiSmartphone, FiMonitor, FiZap,
} from 'react-icons/fi';
import { GiTwoCoins } from 'react-icons/gi';
import CountUp from 'react-countup';
import toast from 'react-hot-toast';
import {
  adminGetWebsitesDashboard,
  adminGetDepositsDashboard,
  adminGetUsersDashboard,
  adminGetSiteTrafficDashboard,
} from '../../services/api';

const RANGES = [
  { key: 'today',     label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'lifetime',  label: 'Lifetime' },
];

function formatRelative(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

// Reusable compact stat tile — same style as Deposits panel.
function StatTile({ icon: Icon, iconColor, label, value, valueColor = 'text-white', sub, decimals = 0, prefix = '' }) {
  return (
    <div className="bg-dark-700/60 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500 mb-1">
        <Icon className={`w-3 h-3 ${iconColor}`} /> {label}
      </div>
      <p className={`text-2xl font-bold tabular-nums ${valueColor}`}>
        {prefix}<CountUp end={value || 0} duration={1} separator="," decimals={decimals} preserveValue />
      </p>
      {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function formatDuration(seconds) {
  if (!seconds || seconds < 1) return '0s';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hrs}h ${mins}m`;
}

function AdminDashboard() {
  const [range, setRange] = useState('today');

  const [trafficData, setTrafficData] = useState(null);
  const [trafficLoading, setTrafficLoading] = useState(true);

  const [usersData, setUsersData] = useState(null);
  const [usersLoading, setUsersLoading] = useState(true);

  const [depositsData, setDepositsData] = useState(null);
  const [depositsLoading, setDepositsLoading] = useState(true);

  const [sitesData, setSitesData] = useState(null);
  const [sitesLoading, setSitesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setTrafficLoading(true);
    setUsersLoading(true);
    setDepositsLoading(true);
    setSitesLoading(true);
    (async () => {
      try {
        const [trafficRes, usersRes, depRes, sitesRes] = await Promise.all([
          adminGetSiteTrafficDashboard(range),
          adminGetUsersDashboard(range),
          adminGetDepositsDashboard(range),
          adminGetWebsitesDashboard(range),
        ]);
        if (cancelled) return;
        setTrafficData(trafficRes.data?.data || null);
        setUsersData(usersRes.data?.data || null);
        setDepositsData(depRes.data?.data || null);
        setSitesData(sitesRes.data?.data || null);
      } catch (error) {
        if (!cancelled) toast.error('Failed to load dashboard stats');
      } finally {
        if (!cancelled) {
          setTrafficLoading(false);
          setUsersLoading(false);
          setDepositsLoading(false);
          setSitesLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [range]);

  // Live traffic auto-refresh every 15s (the rest of the dashboard doesn't need
  // this — main-site activity changes by the second, signups/deposits don't).
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const res = await adminGetSiteTrafficDashboard(range);
        setTrafficData(res.data?.data || null);
      } catch (_) { /* silent — keep the last good value */ }
    }, 15_000);
    return () => clearInterval(t);
  }, [range]);

  const sites = sitesData?.sites || [];

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-500 text-sm">Platform overview — pick a window to filter everything below</p>
      </div>

      {/* Top filter — controls Users, Deposits, and Websites panels */}
      <div className="sticky top-16 z-20 bg-dark-900/95 backdrop-blur-sm -mx-4 lg:-mx-6 px-4 lg:px-6 py-3 border-b border-dark-700">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider shrink-0">Range</p>
          <div className="flex gap-1 bg-dark-800 border border-dark-600 rounded-lg p-1 shrink-0">
            {RANGES.map(r => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`px-3 sm:px-4 py-1.5 rounded text-xs sm:text-sm font-semibold transition-colors ${
                  range === r.key
                    ? 'bg-accent text-dark-900'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Site Traffic panel — main app sessions/views/clicks for the window
          plus a live "active now" indicator that auto-refreshes every 15s. */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
              <FiActivity className="w-4 h-4 text-purple-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-white font-semibold">Site Traffic</h2>
              <p className="text-gray-500 text-xs">Main-site sessions, page views & engagement</p>
            </div>
          </div>
          {/* Live indicator — independent of the range filter */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 shrink-0">
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-75" />
              <span className="relative w-2 h-2 rounded-full bg-green-400" />
            </span>
            <span className="text-[11px] text-green-400 font-semibold tabular-nums">
              {trafficData?.live?.activeSessions || 0} live
            </span>
            {(trafficData?.live?.activeUsers || 0) > 0 && (
              <span className="text-[10px] text-gray-500">
                · {trafficData.live.activeUsers} users
              </span>
            )}
          </div>
        </div>
        {trafficLoading ? (
          <div className="py-6 flex justify-center">
            <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile
                icon={FiUsers}
                iconColor="text-purple-400"
                label="Sessions"
                value={trafficData?.sessions || 0}
                valueColor="text-purple-400"
                sub={`${(trafficData?.uniqueUsers || 0).toLocaleString()} unique users`}
              />
              <StatTile
                icon={FiEye}
                iconColor="text-blue-400"
                label="Page Views"
                value={trafficData?.pageViews || 0}
                valueColor="text-blue-400"
                sub={`${(trafficData?.totalEvents || 0).toLocaleString()} total events`}
              />
              <StatTile
                icon={FiMousePointer}
                iconColor="text-accent"
                label="Clicks"
                value={trafficData?.clicks || 0}
                valueColor="text-accent"
                sub={`${(trafficData?.gamePlays || 0).toLocaleString()} game plays`}
              />
              {/* Avg Duration uses a formatted string (e.g. "5m 32s"), so it
                  can't use the CountUp-based StatTile; render inline instead. */}
              <div className="bg-dark-700/60 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                  <FiClock className="w-3 h-3 text-amber-400" /> Avg Duration
                </div>
                <p className="text-2xl font-bold text-amber-400 tabular-nums">
                  {formatDuration(trafficData?.avgDuration || 0)}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {(trafficData?.logins || 0).toLocaleString()} logins
                </p>
              </div>
            </div>

            {/* Device breakdown bar */}
            {trafficData && (trafficData.sessions || 0) > 0 && (
              <div className="mt-3 pt-3 border-t border-dark-600">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Devices</p>
                <div className="flex items-center gap-3 flex-wrap text-xs">
                  <div className="flex items-center gap-1.5">
                    <FiSmartphone className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-gray-400">Mobile</span>
                    <span className="text-white font-semibold tabular-nums">{trafficData.devices.mobile.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <FiMonitor className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-gray-400">Desktop</span>
                    <span className="text-white font-semibold tabular-nums">{trafficData.devices.desktop.toLocaleString()}</span>
                  </div>
                  {trafficData.devices.tablet > 0 && (
                    <div className="flex items-center gap-1.5">
                      <FiZap className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-gray-400">Tablet</span>
                      <span className="text-white font-semibold tabular-nums">{trafficData.devices.tablet.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Users panel */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <FiUsers className="w-4 h-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-white font-semibold">Users</h2>
            <p className="text-gray-500 text-xs">
              {range === 'lifetime' ? 'All registered users' : `Signups for ${range}`}
            </p>
          </div>
        </div>
        {usersLoading ? (
          <div className="py-6 flex justify-center">
            <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StatTile
              icon={FiUsers}
              iconColor="text-blue-400"
              label="Total Users"
              value={usersData?.userCount || 0}
              valueColor="text-blue-400"
              sub={range === 'lifetime' ? 'Lifetime registrations' : `New signups ${range}`}
            />
            <StatTile
              icon={GiTwoCoins}
              iconColor="text-accent"
              label="User Balances"
              value={usersData?.totalBalance || 0}
              valueColor="text-accent"
              decimals={2}
              sub={range === 'lifetime' ? 'Sum of every user balance' : `Current balance of those signups`}
            />
          </div>
        )}
      </div>

      {/* Deposits panel */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
            <FiDownload className="w-4 h-4 text-green-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-white font-semibold">Deposits</h2>
            <p className="text-gray-500 text-xs">Zynk orders received & processed</p>
          </div>
        </div>
        {depositsLoading ? (
          <div className="py-6 flex justify-center">
            <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile
              icon={FiDownload}
              iconColor="text-blue-400"
              label="Total Count"
              value={depositsData?.totalCount || 0}
              sub="All orders in window"
            />
            <StatTile
              icon={FiCheckCircle}
              iconColor="text-green-400"
              label="Completed Sum"
              value={depositsData?.completedAmount || 0}
              valueColor="text-green-400"
              decimals={2}
              prefix="₹"
              sub={`${(depositsData?.completedCount || 0).toLocaleString()} approved · ${(depositsData?.zynkDelivered || 0).toLocaleString()} Z delivered`}
            />
            <StatTile
              icon={FiAlertCircle}
              iconColor="text-yellow-400"
              label="Pending"
              value={depositsData?.pendingCount || 0}
              valueColor="text-yellow-400"
              sub="Awaiting admin action"
            />
            <StatTile
              icon={FiXCircle}
              iconColor="text-red-400"
              label="Rejected"
              value={depositsData?.rejectedCount || 0}
              valueColor="text-red-400"
              sub="In window"
            />
          </div>
        )}
      </div>

      {/* Websites — one card per site */}
      <div className="flex items-center gap-2 min-w-0 pt-2">
        <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
          <FiGlobe className="w-4 h-4 text-accent" />
        </div>
        <div className="min-w-0">
          <h2 className="text-white font-semibold">Websites</h2>
          <p className="text-gray-500 text-xs">Visits & clicks per landing page</p>
        </div>
      </div>

      {sitesLoading ? (
        <div className="p-8 flex justify-center bg-dark-800 border border-dark-600 rounded-xl">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sites.length === 0 ? (
        <div className="p-8 text-center text-gray-500 text-sm bg-dark-800 border border-dark-600 rounded-xl">
          No websites yet. Create one from the Websites page.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sites.map((site, i) => {
            const isLive = site.is_active && site.status === 'published';
            return (
              <motion.div
                key={site.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-dark-800 border border-dark-600 rounded-xl p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${isLive ? 'bg-green-400' : 'bg-gray-500'}`} />
                      <p className="text-white font-semibold truncate">{site.title || `Site #${site.id}`}</p>
                    </div>
                    <p className="text-gray-500 text-xs font-mono truncate mt-0.5">
                      {site.sub_domain || site.domain || '—'}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded shrink-0 ${
                    isLive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {site.status || 'draft'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-dark-700/50 rounded-lg p-2.5 text-center">
                    <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                      <FiEye className="w-3 h-3 text-blue-400" /> Visits
                    </div>
                    <p className="text-lg font-bold text-blue-400 tabular-nums">{site.visits.toLocaleString()}</p>
                  </div>
                  <div className="bg-dark-700/50 rounded-lg p-2.5 text-center">
                    <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                      <FiMousePointer className="w-3 h-3 text-accent" /> Clicks
                    </div>
                    <p className="text-lg font-bold text-accent tabular-nums">{site.clicks.toLocaleString()}</p>
                  </div>
                  <div className="bg-dark-700/50 rounded-lg p-2.5 text-center">
                    <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                      <FiUsers className="w-3 h-3 text-amber-400" /> Sessions
                    </div>
                    <p className="text-lg font-bold text-amber-400 tabular-nums">{site.unique_sessions.toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-xs text-gray-500 pt-1 border-t border-dark-600">
                  <FiClock className="w-3 h-3" />
                  Last activity: <span className="text-gray-300">{formatRelative(site.last_event_at)}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
