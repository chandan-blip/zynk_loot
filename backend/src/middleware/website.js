const db = require('../config/database');

const getAppDomain = (req) => (process.env.APP_DOMAIN || '').toLowerCase() || null;

const extractSubdomain = (host, appDomain) => {
  if (!host) return null;
  const h = host.split(':')[0].toLowerCase();
  if (appDomain && h.endsWith(`.${appDomain}`)) {
    const sub = h.slice(0, -appDomain.length - 1);
    if (!sub || sub === 'www' || sub === 'api' || sub === 'admin') return null;
    return sub;
  }
  return null;
};

// Middleware: if Host is sub.APP_DOMAIN and site is published, serve HTML directly.
const subdomainMiddleware = async (req, res, next) => {
  try {
    if (req.path.startsWith('/api') || req.path.startsWith('/sites/')) return next();
    const appDomain = getAppDomain(req);
    const sub = extractSubdomain(req.headers.host, appDomain);
    if (!sub) return next();
    const [rows] = await db.pool.query(
      `SELECT content FROM websites WHERE sub_domain = ? AND status = 'published' AND is_active = 1 LIMIT 1`,
      [sub]
    );
    if (!rows.length) return next();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Content-Security-Policy',
      "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'; img-src * data: blob:; font-src * data:;"
    );
    return res.send(rows[0].content);
  } catch (error) {
    console.error('Subdomain middleware error:', error);
    return next();
  }
};

// GET /sites/:sub — direct path-based serving for testing without wildcard DNS
const siteByPathHandler = async (req, res) => {
  try {
    const sub = String(req.params.sub || '').trim().toLowerCase();
    if (!sub) return res.status(404).send('Not found');
    const [rows] = await db.pool.query(
      `SELECT content FROM websites WHERE sub_domain = ? AND status = 'published' AND is_active = 1 LIMIT 1`,
      [sub]
    );
    if (!rows.length) return res.status(404).send('Not found');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Content-Security-Policy',
      "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'; img-src * data: blob:; font-src * data:;"
    );
    res.send(rows[0].content);
  } catch (error) {
    console.error('Site by path error:', error);
    res.status(500).send('Server error');
  }
};

module.exports = { subdomainMiddleware, siteByPathHandler };
