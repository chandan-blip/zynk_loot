// Frontend mirror of the backend RBAC check (backend/src/config/adminModules.js
// → hasModule). The user object comes from the auth store and carries
// `isSuper` and `permissions` (array of module keys, or ['*'] for full access).
export function hasModule(user, moduleKey) {
  if (!user) return false;
  if (user.isSuper) return true;
  const perms = user.permissions || [];
  return perms.includes('*') || perms.includes(moduleKey);
}
