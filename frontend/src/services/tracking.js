import api from './api';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

function getDeviceInfo() {
  const ua = navigator.userAgent;
  let deviceType = 'desktop';
  if (/Mobi|Android/i.test(ua)) deviceType = 'mobile';
  else if (/Tablet|iPad/i.test(ua)) deviceType = 'tablet';

  let browser = 'unknown';
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Edg\//.test(ua)) browser = 'Edge';

  let os = 'unknown';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS/.test(ua)) os = 'macOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad/.test(ua)) os = 'iOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  const screenResolution = `${screen.width}x${screen.height}`;
  return { deviceType, browser, os, screenResolution };
}

class TrackingClient {
  constructor() {
    this.sessionId = null;
    this.userId = null;
    this.eventQueue = [];
    this.flushTimer = null;
    this.currentPage = null;
    this.pageEnteredAt = null;
    this.maxScrollDepth = 0;
    this.sessionStartTime = null;
    this.isInitialized = false;
  }

  init(userId = null) {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this.userId = userId;

    // Reuse session from same tab, or create new
    this.sessionId = sessionStorage.getItem('loot_session_id');
    if (!this.sessionId) {
      this.sessionId = generateId();
      sessionStorage.setItem('loot_session_id', this.sessionId);
    }

    this.sessionStartTime = Date.now();
    this._startSession();
    this._startAutoFlush();
    this._setupListeners();
  }

  // ── Fire-and-forget helpers ──

  _fire(fn) {
    // All tracking is async & non-blocking — errors are silently swallowed
    try { fn().catch(() => {}); } catch (e) { /* ignore */ }
  }

  _startSession() {
    const device = getDeviceInfo();
    this._fire(() =>
      api.post('/tracking/session/start', {
        sessionId: this.sessionId,
        ...device,
      })
    );
  }

  _setupListeners() {
    // Scroll tracking (throttled)
    let scrollTick = false;
    const onScroll = () => {
      if (scrollTick) return;
      scrollTick = true;
      requestAnimationFrame(() => {
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (docHeight > 0) {
          const depth = Math.round((window.scrollY / docHeight) * 100);
          if (depth > this.maxScrollDepth) this.maxScrollDepth = depth;
        }
        scrollTick = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    // Click tracking (delegated)
    const onClick = (e) => {
      const el = e.target.closest('a, button, [data-track]');
      if (!el) return;
      const tag = el.tagName.toLowerCase();
      const text = (el.textContent || '').trim().slice(0, 50);
      const trackId = el.getAttribute('data-track') || null;
      const href = el.getAttribute('href') || null;

      this._queueEvent('click', {
        tag,
        text,
        trackId,
        href,
      });
    };
    document.addEventListener('click', onClick, true);

    // Flush on visibility hidden & beforeunload
    const onVisChange = () => {
      if (document.visibilityState === 'hidden') this.flush();
    };
    document.addEventListener('visibilitychange', onVisChange);

    const onUnload = () => {
      this._recordPageLeave();
      const duration = Math.round((Date.now() - this.sessionStartTime) / 1000);
      const payload = JSON.stringify({ sessionId: this.sessionId, duration });
      // sendBeacon for reliable delivery on page close
      navigator.sendBeacon?.('/api/tracking/session/end', new Blob([payload], { type: 'application/json' }));
      this._flushSync();
    };
    window.addEventListener('beforeunload', onUnload);

    this._cleanup = () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('beforeunload', onUnload);
    };
  }

  // ── Page tracking ──

  trackPageView(route) {
    if (route === this.currentPage) return;
    this._recordPageLeave();

    this.currentPage = route;
    this.pageEnteredAt = Date.now();
    this.maxScrollDepth = 0;

    this._queueEvent('page_view', { route });
  }

  _recordPageLeave() {
    if (!this.currentPage || !this.pageEnteredAt) return;
    const duration = Math.round((Date.now() - this.pageEnteredAt) / 1000);
    this._queueEvent('page_leave', {
      route: this.currentPage,
      duration,
      scrollDepth: this.maxScrollDepth,
    });
  }

  // ── User association ──

  setUser(userId) {
    this.userId = userId;
    if (this.sessionId) {
      this._fire(() =>
        api.post('/tracking/session/start', {
          sessionId: this.sessionId,
          ...getDeviceInfo(),
        })
      );
    }
  }

  clearUser() {
    this.userId = null;
  }

  // ── Event queue ──

  _queueEvent(type, data) {
    this.eventQueue.push({
      type,
      data,
      page: this.currentPage,
      timestamp: Date.now(),
      userId: this.userId,
      sessionId: this.sessionId,
    });

    // Auto flush if queue grows large
    if (this.eventQueue.length >= 50) this.flush();
  }

  trackCustomEvent(type, data) {
    this._queueEvent(type, data);
  }

  // ── Flushing ──

  _startAutoFlush() {
    this.flushTimer = setInterval(() => this.flush(), 30000);
  }

  flush() {
    if (this.eventQueue.length === 0) return;
    const batch = this.eventQueue.splice(0, 100);
    this._fire(() =>
      api.post('/tracking/events', {
        events: batch,
        sessionId: this.sessionId,
      })
    );
  }

  _flushSync() {
    if (this.eventQueue.length === 0) return;
    const batch = this.eventQueue.splice(0, 100);
    const payload = JSON.stringify({ events: batch, sessionId: this.sessionId });
    navigator.sendBeacon?.('/api/tracking/events', new Blob([payload], { type: 'application/json' }));
  }

  // ── Cleanup ──

  destroy() {
    this._recordPageLeave();
    this.flush();
    if (this.flushTimer) clearInterval(this.flushTimer);
    this._cleanup?.();
    this.isInitialized = false;
  }
}

export const trackingClient = new TrackingClient();
export default trackingClient;
