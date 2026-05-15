// Global in-flight request counter. The axios interceptors call `inc()` when
// a request starts and `dec()` when it settles (success or error). The
// RouteLoader subscribes so the branded overlay can stay visible until the
// burst of fetches a freshly-mounted page kicks off has settled.

let pending = 0;
const listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try { fn(pending); } catch (_) { /* listener errors must not break the chain */ }
  }
}

export function inc() {
  pending += 1;
  notify();
}

export function dec() {
  pending = Math.max(0, pending - 1);
  notify();
}

export function getPending() {
  return pending;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Force-reset — only used on route change so a stale request hanging in
// flight from the previous page doesn't keep the overlay stuck forever.
export function reset() {
  if (pending === 0) return;
  pending = 0;
  notify();
}
