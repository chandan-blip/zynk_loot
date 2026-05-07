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

// Auto-injected snippet: persists a session id, fires `visit` on load, and a `click`
// for every <a>/<button>/[data-track] interaction. Uses sendBeacon so it survives unload.
// Content-Type is text/plain (not application/json) so the cross-origin POST from
// sub.APP_DOMAIN → APP_DOMAIN/api stays a CORS-simple request and skips preflight.
// The /track handler reads the raw body and JSON.parses it.
const buildTrackingScript = (websiteId, apiBase) => {
  const safeBase = String(apiBase || '/api').replace(/<\/script/gi, '<\\/script');
  return `<script>(function(){try{
var WID=${websiteId};
var API=${JSON.stringify(safeBase)};
var SK='_loot_sid';
var sid=null;try{sid=localStorage.getItem(SK);if(!sid){sid='s_'+Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem(SK,sid);}}catch(e){}
function send(type,target){
  var payload=JSON.stringify({websiteId:WID,type:type,target:target||null,referrer:document.referrer||null,sessionId:sid});
  var url=API+'/websites/track';
  try{
    if(navigator.sendBeacon){navigator.sendBeacon(url,new Blob([payload],{type:'text/plain'}));return;}
  }catch(e){}
  try{fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},body:payload,keepalive:true});}catch(e){}
}
send('visit');
document.addEventListener('click',function(ev){
  var el=ev.target;
  while(el && el!==document){
    if(el.tagName==='A'||el.tagName==='BUTTON'||el.hasAttribute('data-track')){
      var t=el.getAttribute('data-track')||el.getAttribute('href')||el.textContent||el.tagName;
      send('click',String(t).slice(0,500));
      return;
    }
    el=el.parentNode;
  }
},true);
}catch(e){}})();</script>`;
};

const injectTracker = (html, websiteId, apiBase) => {
  const snippet = buildTrackingScript(websiteId, apiBase);
  if (!html) return snippet;
  const idx = html.toLowerCase().lastIndexOf('</body>');
  if (idx === -1) return html + snippet;
  return html.slice(0, idx) + snippet + html.slice(idx);
};

// Decide what API base the served page should call. Prefer an explicit override,
// otherwise derive from APP_DOMAIN, otherwise fall back to relative /api (works
// when serving via /sites/:sub on the same host).
const apiBaseFor = (req) => {
  if (process.env.PUBLIC_API_URL) return process.env.PUBLIC_API_URL;
  const appDomain = getAppDomain(req);
  if (appDomain) {
    const proto = req.protocol || 'http';
    return `${proto}://${appDomain}/api`;
  }
  return '/api';
};

const sendTrackedHtml = (res, html) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader(
    'Content-Security-Policy',
    "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'; img-src * data: blob:; font-src * data:; connect-src *;"
  );
  res.send(html);
};

// Middleware: if Host is sub.APP_DOMAIN and site is published, serve HTML directly.
const subdomainMiddleware = async (req, res, next) => {
  try {
    if (req.path.startsWith('/api') || req.path.startsWith('/sites/')) return next();
    const appDomain = getAppDomain(req);
    const sub = extractSubdomain(req.headers.host, appDomain);
    if (!sub) return next();
    const [rows] = await db.pool.query(
      `SELECT id, content FROM websites WHERE sub_domain = ? AND status = 'published' AND is_active = 1 LIMIT 1`,
      [sub]
    );
    if (!rows.length) return next();
    const html = injectTracker(rows[0].content, rows[0].id, apiBaseFor(req));
    return sendTrackedHtml(res, html);
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
      `SELECT id, content FROM websites WHERE sub_domain = ? AND status = 'published' AND is_active = 1 LIMIT 1`,
      [sub]
    );
    if (!rows.length) return res.status(404).send('Not found');
    const html = injectTracker(rows[0].content, rows[0].id, apiBaseFor(req));
    sendTrackedHtml(res, html);
  } catch (error) {
    console.error('Site by path error:', error);
    res.status(500).send('Server error');
  }
};

module.exports = { subdomainMiddleware, siteByPathHandler };
