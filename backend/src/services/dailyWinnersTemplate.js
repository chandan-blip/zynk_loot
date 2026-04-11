function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatINR(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

const PLATFORM_COLORS = {
  paytm: '#00BAF2',
  phonepe: '#5F259F',
  gpay: '#34A853',
  fampay: '#FFD600',
  naviupi: '#0078FF',
};

class DailyWinnersTemplate {
  static render({ winners, draw }) {
    const totalPayout = winners.reduce((sum, w) => sum + Number(w.amount), 0);
    const date = new Date().toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });

    const rows = winners
      .map((w, i) => {
        const data = w.json_data || {};
        const platform = (data.platform || 'upi').toLowerCase();
        const color = PLATFORM_COLORS[platform] || '#888';
        const txnRef = data.utr || data.txnId || data.refId || '';
        return `
          <div class="row">
            <div class="rank">#${i + 1}</div>
            <div class="col name">
              <div class="pname">${escapeHtml(w.name)}</div>
              <div class="tref">${escapeHtml(txnRef)}</div>
            </div>
            <div class="platform" style="background:${color}">${escapeHtml(platform.toUpperCase())}</div>
            <div class="amount">${formatINR(w.amount)}</div>
          </div>`;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; }
  body { width: 900px; background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 100%); color: #fff; padding: 48px; }
  .header { text-align: center; margin-bottom: 32px; }
  .logo { font-size: 48px; font-weight: 900; letter-spacing: 2px; background: linear-gradient(90deg, #FFD700, #FFA500); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .tag { font-size: 18px; color: #9ca3af; margin-top: 8px; letter-spacing: 1px; }
  .meta { display: flex; justify-content: space-between; align-items: center; margin: 24px 0; padding: 16px 24px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,215,0,0.2); border-radius: 12px; }
  .meta .label { font-size: 13px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; }
  .meta .value { font-size: 20px; font-weight: 700; color: #FFD700; margin-top: 4px; }
  .list { background: rgba(255,255,255,0.03); border-radius: 16px; padding: 16px; }
  .row { display: flex; align-items: center; gap: 16px; padding: 16px; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .row:last-child { border-bottom: none; }
  .rank { font-size: 20px; font-weight: 800; color: #FFD700; width: 50px; }
  .col { flex: 1; }
  .pname { font-size: 18px; font-weight: 700; }
  .tref { font-size: 12px; color: #6b7280; font-family: monospace; margin-top: 2px; }
  .platform { font-size: 11px; font-weight: 800; padding: 6px 12px; border-radius: 6px; color: #fff; letter-spacing: 1px; }
  .amount { font-size: 22px; font-weight: 900; color: #10b981; min-width: 140px; text-align: right; }
  .footer { text-align: center; margin-top: 32px; color: #6b7280; font-size: 14px; }
  .footer strong { color: #FFD700; }
</style>
</head>
<body>
  <div class="header">
    <div class="logo">LOOT MARKET</div>
    <div class="tag">TODAY'S WINNERS</div>
  </div>
  <div class="meta">
    <div>
      <div class="label">Draw</div>
      <div class="value">#${escapeHtml(draw.period_id || '')}</div>
    </div>
    <div>
      <div class="label">Date</div>
      <div class="value">${escapeHtml(date)}</div>
    </div>
    <div>
      <div class="label">Total Payout</div>
      <div class="value">${formatINR(totalPayout)}</div>
    </div>
  </div>
  <div class="list">
    ${rows}
  </div>
  <div class="footer">
    Play & Win at <strong>lootmarket.store</strong>
  </div>
</body>
</html>`;
  }
}

module.exports = DailyWinnersTemplate;
