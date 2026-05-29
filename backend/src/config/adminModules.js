// Single source of truth for admin "modules" used by the role-based access
// control (RBAC) system. Each module is a unit an admin role can be granted.
//
//  - `key`      stable identifier stored in admin_roles.permissions
//  - `label`    human label shown in the Roles UI
//  - `prefixes` route paths (relative to the /api/admin mount, or the admin
//               sub-paths of support/notifications) that the module governs.
//
// Backend enforcement (admin.js) maps an incoming request path to a module via
// longest-prefix match and checks the caller's permissions. The frontend nav
// (`AdminLayout.jsx`) and the Roles page reference the same keys, so module
// names never drift between layers.
//
// NOTE: order is also the display order in the Roles checkbox grid.

const ADMIN_MODULES = [
  { key: 'dashboard',         label: 'Dashboard',         prefixes: ['/dashboard', '/platform-metrics', '/site-traffic'] },
  { key: 'draws',             label: 'Draws',             prefixes: ['/draws', '/numbers'] },
  { key: 'winners',           label: 'Winners',           prefixes: ['/winners'] },
  { key: 'daily-winners',     label: 'Daily Winners',     prefixes: ['/daily-winners'] },
  { key: 'payment-templates', label: 'Payment Templates', prefixes: ['/payment-accounts', '/payment-settings'] },
  { key: 'prediction',        label: 'Prediction',        prefixes: ['/predictions'] },
  { key: 'custom-prediction', label: 'Custom Prediction', prefixes: ['/predictions/custom'] },
  { key: 'smm-queue',         label: 'SMM Queue',         prefixes: ['/smm-queue'] },
  { key: 'users',             label: 'Users',             prefixes: ['/users'] },
  { key: 'packages',          label: 'Packages',          prefixes: ['/packages'] },
  { key: 'orders',            label: 'Orders',            prefixes: ['/orders'] },
  { key: 'payments',          label: 'Payments',          prefixes: ['/payments'] },
  { key: 'deposits',          label: 'Deposits',          prefixes: ['/deposits'] },
  { key: 'withdrawals',       label: 'Withdrawals',       prefixes: ['/withdrawals'] },
  { key: 'support',           label: 'Support',           prefixes: ['/support'] },
  { key: 'investments',       label: 'Investments',       prefixes: ['/investments', '/investment-tiers', '/investment-settings', '/investment-stats'] },
  { key: 'notifications',     label: 'Notifications',     prefixes: ['/notifications'] },
  { key: 'analytics',         label: 'Analytics',         prefixes: ['/analytics', '/tracking', '/transactions'] },
  { key: 'social-links',      label: 'Social Links',      prefixes: ['/social-links'] },
  { key: 'banners',           label: 'Banners',           prefixes: ['/banners'] },
  { key: 'third-party',       label: 'Third Party Games', prefixes: ['/third-party'] },
  { key: 'websites',          label: 'Websites',          prefixes: ['/websites'] },
  { key: 'website-leads',     label: 'Website Leads',     prefixes: ['/website-leads'] },
  { key: 'settings',          label: 'Settings',          prefixes: ['/settings', '/cron-config', '/cron-status', '/jobs'] },
  { key: 'roles',             label: 'Roles & Access',    prefixes: ['/roles'] },
];

// All valid module keys (used to validate role.permissions on save).
const ALL_MODULE_KEYS = ADMIN_MODULES.map((m) => m.key);

// Wildcard permission — a role holding this can access everything. Super Admin
// is seeded with ["*"].
const WILDCARD = '*';

// Flatten (prefix → module key) and sort by prefix length DESC so the most
// specific prefix wins (e.g. '/predictions/custom' before '/predictions').
const PREFIX_MAP = ADMIN_MODULES
  .flatMap((m) => m.prefixes.map((p) => ({ prefix: p, key: m.key })))
  .sort((a, b) => b.prefix.length - a.prefix.length);

// Does `path` fall under `prefix` on a path boundary? ('/users' matches
// '/users' and '/users/5' but not '/users-export'.)
function pathStartsWith(path, prefix) {
  return path === prefix || path.startsWith(prefix + '/');
}

// Return the module key governing `path`, or null when nothing maps (callers
// treat null as "no module gate" → allowed).
function moduleForPath(path) {
  if (!path) return null;
  // Strip any trailing query just in case; Express req.path has none.
  const clean = path.split('?')[0];
  for (const { prefix, key } of PREFIX_MAP) {
    if (pathStartsWith(clean, prefix)) return key;
  }
  return null;
}

// Does this user have access to `moduleKey`? Super admins (wildcard / system
// role) always pass.
function hasModule(user, moduleKey) {
  if (!user) return false;
  if (user.is_super) return true;
  const perms = user.permissions || [];
  return perms.includes(WILDCARD) || perms.includes(moduleKey);
}

module.exports = {
  ADMIN_MODULES,
  ALL_MODULE_KEYS,
  WILDCARD,
  moduleForPath,
  hasModule,
};
