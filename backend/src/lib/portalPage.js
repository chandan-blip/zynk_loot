'use strict';

// Renders the self-contained merchant portal page (login + transactions
// dashboard). Served by the backend on a merchant's portal subdomain, the same
// way landing pages are served. All logic is inline vanilla JS hitting the apex
// portal API (/api/portal/*). `apiBase` and `merchantName` are injected server-side.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPortalPage({ apiBase = '/api', merchantName = 'Merchant Portal' } = {}) {
  const API = JSON.stringify(String(apiBase).replace(/\/+$/, ''));
  const NAME = esc(merchantName);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${NAME} — Merchant Portal</title>
<style>
  :root { --bg:#0b0f17; --panel:#131a26; --panel2:#0f1622; --border:#243044; --text:#e6edf6; --muted:#8b97a8; --accent:#16d2a8; --accent2:#0fb894; --danger:#f87171; --green:#34d399; --amber:#fbbf24; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
  a { color:var(--accent); }
  .wrap { max-width:1080px; margin:0 auto; padding:20px; }
  .hidden { display:none !important; }
  .card { background:var(--panel); border:1px solid var(--border); border-radius:14px; padding:18px; }
  .muted { color:var(--muted); }
  .btn { background:var(--accent); color:#04211b; border:none; border-radius:10px; padding:10px 16px; font-weight:700; cursor:pointer; }
  .btn:hover { background:var(--accent2); }
  .btn.ghost { background:transparent; color:var(--text); border:1px solid var(--border); }
  input,select { width:100%; padding:10px 12px; background:var(--panel2); border:1px solid var(--border); border-radius:10px; color:var(--text); outline:none; }
  input:focus,select:focus { border-color:var(--accent); }
  label { display:block; font-size:12px; color:var(--muted); margin:12px 0 6px; }
  /* Login */
  .login-shell { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; }
  .login-box { width:100%; max-width:380px; }
  .brand { font-size:20px; font-weight:800; margin-bottom:4px; }
  /* Header */
  header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:18px; flex-wrap:wrap; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:16px; }
  .stat .n { font-size:24px; font-weight:800; }
  .stat .l { font-size:12px; color:var(--muted); }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th,td { text-align:left; padding:10px 12px; border-bottom:1px solid var(--border); }
  th { color:var(--muted); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
  .pill { display:inline-flex; align-items:center; gap:6px; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:600; }
  .pill.paid { background:rgba(52,211,153,.15); color:var(--green); }
  .pill.unpaid { background:rgba(251,191,36,.15); color:var(--amber); }
  .pill.failed { background:rgba(248,113,113,.15); color:var(--danger); }
  .toolbar { display:flex; gap:10px; align-items:center; margin-bottom:12px; flex-wrap:wrap; }
  .toolbar select { width:auto; }
  .err { color:var(--danger); font-size:13px; margin-top:10px; min-height:18px; }
  .mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; word-break:break-all; }
  .cred-row { display:flex; gap:8px; align-items:center; margin:8px 0; }
  .cred-row .mono { flex:1; background:var(--panel2); border:1px solid var(--border); border-radius:8px; padding:8px 10px; }
  .copy { cursor:pointer; padding:6px 10px; border:1px solid var(--border); border-radius:8px; background:transparent; color:var(--text); font-size:12px; }
  .pager { display:flex; gap:10px; align-items:center; justify-content:flex-end; margin-top:12px; }
  .section-title { font-size:15px; font-weight:700; margin:22px 0 10px; }
</style>
</head>
<body>

<!-- LOGIN -->
<div id="login" class="login-shell">
  <div class="login-box card">
    <div class="brand">${NAME}</div>
    <div class="muted" style="font-size:13px;">Merchant portal — sign in to view your transactions</div>
    <form id="loginForm">
      <label>Username</label>
      <input id="username" autocomplete="username" autocapitalize="none" />
      <label>Password</label>
      <input id="password" type="password" autocomplete="current-password" />
      <div class="err" id="loginErr"></div>
      <button class="btn" type="submit" style="width:100%; margin-top:14px;">Sign in</button>
    </form>
  </div>
</div>

<!-- DASHBOARD -->
<div id="dash" class="wrap hidden">
  <header>
    <div>
      <div class="brand" id="dashName">${NAME}</div>
      <div class="muted" id="dashSub" style="font-size:13px;"></div>
    </div>
    <button class="btn ghost" id="logoutBtn">Log out</button>
  </header>

  <div class="grid">
    <div class="card stat"><div class="n" id="stTotal">—</div><div class="l">Total orders</div></div>
    <div class="card stat"><div class="n" id="stPaid">—</div><div class="l">Paid orders</div></div>
    <div class="card stat"><div class="n" id="stAmount">—</div><div class="l">Paid amount</div></div>
  </div>

  <div class="card">
    <div class="toolbar">
      <strong style="margin-right:auto;">Transactions</strong>
      <select id="fStatus">
        <option value="">All status</option>
        <option value="1">Paid</option>
        <option value="0">Unpaid</option>
      </select>
      <button class="btn ghost" id="refreshBtn">Refresh</button>
    </div>
    <div style="overflow-x:auto;">
      <table>
        <thead><tr><th>Order ref</th><th>Gateway ID</th><th>Amount</th><th>Coin</th><th>Status</th><th>Date</th></tr></thead>
        <tbody id="txBody"><tr><td colspan="6" class="muted" style="padding:24px;text-align:center;">Loading…</td></tr></tbody>
      </table>
    </div>
    <div class="pager">
      <span class="muted" id="pageInfo"></span>
      <button class="btn ghost" id="prevBtn">Prev</button>
      <button class="btn ghost" id="nextBtn">Next</button>
    </div>
  </div>

  <div class="section-title">API credentials</div>
  <div class="card" id="credCard">
    <div class="muted" style="font-size:13px; margin-bottom:6px;">Use these to integrate your site with the gateway. Keep your secret private.</div>
    <label>API key</label>
    <div class="cred-row"><div class="mono" id="cKey">—</div><button class="copy" data-copy="cKey">Copy</button></div>
    <label>API secret</label>
    <div class="cred-row"><div class="mono" id="cSecret">••••••••</div><button class="copy" id="revealBtn">Reveal</button><button class="copy" data-copy="cSecret">Copy</button></div>
    <label>Payment endpoint</label>
    <div class="cred-row"><div class="mono" id="cEndpoint">—</div><button class="copy" data-copy="cEndpoint">Copy</button></div>
    <label>Signature algorithm</label>
    <div class="mono" id="cAlgo" style="background:var(--panel2);border:1px solid var(--border);border-radius:8px;padding:10px;"></div>
  </div>
</div>

<script>
(function(){
  var API = ${API};
  var MERCHANT_NAME = ${JSON.stringify(merchantName)};
  var TKEY = '_portal_token';
  var state = { page:1, status:'', secret:null, secretShown:false };

  function token(){ try { return localStorage.getItem(TKEY); } catch(e){ return null; } }
  function setToken(t){ try { t ? localStorage.setItem(TKEY,t) : localStorage.removeItem(TKEY); } catch(e){} }
  function $(id){ return document.getElementById(id); }

  function api(path, opts){
    opts = opts || {};
    var headers = opts.headers || {};
    var t = token();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return fetch(API + path, { method: opts.method || 'GET', headers: headers, body: opts.body })
      .then(function(r){
        if (r.status === 401 || r.status === 403) { logout(); throw new Error('unauthorized'); }
        return r.json().then(function(j){ return { ok:r.ok, body:j }; });
      });
  }

  function show(view){
    $('login').classList.toggle('hidden', view !== 'login');
    $('dash').classList.toggle('hidden', view !== 'dash');
  }
  function logout(){ setToken(null); show('login'); }

  // --- Login ---
  $('loginForm').addEventListener('submit', function(e){
    e.preventDefault();
    $('loginErr').textContent = '';
    var u = $('username').value.trim(), p = $('password').value;
    fetch(API + '/portal/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username:u, password:p })
    }).then(function(r){ return r.json(); }).then(function(j){
      if (j && j.success && j.data && j.data.token){
        setToken(j.data.token);
        if (j.data.merchant) $('dashSub').textContent = j.data.merchant.domain || '';
        boot();
      } else {
        $('loginErr').textContent = (j && j.message) || 'Login failed';
      }
    }).catch(function(){ $('loginErr').textContent = 'Login failed'; });
  });

  // --- Dashboard data ---
  function fmtAmount(a){ var n = Number(a); return isNaN(n) ? a : n.toLocaleString(undefined,{maximumFractionDigits:8}); }
  function statusPill(s){
    if (Number(s) === 1) return '<span class="pill paid">Paid</span>';
    if (Number(s) === 2) return '<span class="pill failed">Failed</span>';
    return '<span class="pill unpaid">Unpaid</span>';
  }
  function fmtDate(d){ try { return new Date(d).toLocaleString(); } catch(e){ return d; } }

  function loadSummary(){
    api('/portal/summary').then(function(res){
      var d = res.body.data || {};
      $('stTotal').textContent = d.total_orders || 0;
      $('stPaid').textContent = d.paid_orders || 0;
      var amt = (d.by_coin && d.by_coin.length)
        ? d.by_coin.map(function(c){ return fmtAmount(c.paid_amount) + ' ' + (c.coin||''); }).join(' · ')
        : fmtAmount(d.paid_amount || 0);
      $('stAmount').textContent = amt;
    }).catch(function(){});
  }

  function loadTx(){
    var q = '?page=' + state.page + (state.status !== '' ? '&status=' + state.status : '');
    $('txBody').innerHTML = '<tr><td colspan="6" class="muted" style="padding:24px;text-align:center;">Loading…</td></tr>';
    api('/portal/transactions' + q).then(function(res){
      var d = res.body.data || {}; var list = d.transactions || [];
      if (!list.length){
        $('txBody').innerHTML = '<tr><td colspan="6" class="muted" style="padding:24px;text-align:center;">No transactions yet.</td></tr>';
      } else {
        $('txBody').innerHTML = list.map(function(t){
          return '<tr>' +
            '<td class="mono">' + escapeHtml(t.client_unique_id || '—') + '</td>' +
            '<td class="mono">' + escapeHtml(t.okpay_order_id || '—') + '</td>' +
            '<td>' + fmtAmount(t.amount) + '</td>' +
            '<td>' + escapeHtml(t.coin || '—') + '</td>' +
            '<td>' + statusPill(t.status) + '</td>' +
            '<td class="muted">' + fmtDate(t.created_at) + '</td>' +
          '</tr>';
        }).join('');
      }
      var pg = d.pagination || { page:1, pages:1, total:0 };
      $('pageInfo').textContent = 'Page ' + pg.page + ' of ' + (pg.pages || 1) + ' · ' + (pg.total || 0) + ' total';
      $('prevBtn').disabled = pg.page <= 1;
      $('nextBtn').disabled = pg.page >= (pg.pages || 1);
    }).catch(function(){});
  }

  function loadCreds(){
    api('/portal/credentials').then(function(res){
      var d = res.body.data || {};
      state.secret = d.api_secret || '';
      $('cKey').textContent = d.api_key || '—';
      $('cEndpoint').textContent = d.payment_endpoint || '—';
      $('cAlgo').textContent = d.sign_algorithm || '';
    }).catch(function(){});
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }

  // --- Events ---
  $('logoutBtn').addEventListener('click', logout);
  $('refreshBtn').addEventListener('click', function(){ loadSummary(); loadTx(); });
  $('fStatus').addEventListener('change', function(){ state.status = this.value; state.page = 1; loadTx(); });
  $('prevBtn').addEventListener('click', function(){ if (state.page > 1){ state.page--; loadTx(); } });
  $('nextBtn').addEventListener('click', function(){ state.page++; loadTx(); });
  $('revealBtn').addEventListener('click', function(){
    state.secretShown = !state.secretShown;
    $('cSecret').textContent = state.secretShown ? (state.secret || '') : '••••••••';
    this.textContent = state.secretShown ? 'Hide' : 'Reveal';
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function(btn){
    btn.addEventListener('click', function(){
      var id = btn.getAttribute('data-copy');
      var val = id === 'cSecret' ? (state.secret || '') : $(id).textContent;
      try { navigator.clipboard.writeText(val); btn.textContent = 'Copied'; setTimeout(function(){ btn.textContent='Copy'; }, 1200); } catch(e){}
    });
  });

  function boot(){
    show('dash');
    loadSummary(); loadTx(); loadCreds();
    api('/portal/me').then(function(res){ var m = res.body.data; if (m){ $('dashName').textContent = m.name || MERCHANT_NAME; $('dashSub').textContent = m.domain || ''; } }).catch(function(){});
  }

  // Auto-resume if a token is present.
  if (token()) boot(); else show('login');
})();
</script>
</body>
</html>`;
}

module.exports = { renderPortalPage };
