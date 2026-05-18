#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');

const DB = '/Volumes/External HD/gitcode/personal-butler/data/butler.db';
const OUT = '/Volumes/External HD/.openclaw/canvas/butler/assets.html';

function q(sql) {
  try {
    const raw = execSync(`sqlite3 -json "${DB}" "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
    return raw && raw !== '[]' ? JSON.parse(raw) : [];
  } catch { return []; }
}

// Financial assets: cash / investment / property
const financialAssets = q(`SELECT id, name, type, current_amount, note, location FROM assets WHERE deleted_at IS NULL AND type IN ('cash','investment','property') ORDER BY type, current_amount DESC`);

// Physical assets: ingredient / consumable / electronics
const physicalAssets = q(`SELECT id, name, type, quantity, unit, location, note FROM assets WHERE deleted_at IS NULL AND type IN ('ingredient','consumable','electronics','other') ORDER BY type, name`);

// Accounts
const accounts = q(`SELECT id, name, type, balance, last_updated FROM accounts WHERE is_active = 1 ORDER BY type, balance DESC`);

// Liabilities
const liabilities = q(`SELECT id, name, type, total_amount, remaining_amount, monthly_payment, due_date, next_due_date, interest_rate, status FROM liabilities WHERE deleted_at IS NULL AND status != 'closed' ORDER BY type, next_due_date`);

// Compute totals
const totalAccountBalance = accounts.reduce((s, a) => s + (a.balance || 0), 0);
const totalFinancialAssets = financialAssets.reduce((s, a) => s + (a.current_amount || 0), 0);
const totalAssets = totalAccountBalance + totalFinancialAssets;
const totalLiabilities = liabilities.reduce((s, l) => s + (l.remaining_amount || 0), 0);
const netWorth = totalAssets - totalLiabilities;

// Pie chart data: group by type (cash includes accounts)
const cashTotal = accounts.filter(a => ['wechat','alipay','cash'].includes(a.type)).reduce((s, a) => s + a.balance, 0)
  + financialAssets.filter(a => a.type === 'cash').reduce((s, a) => s + a.current_amount, 0);
const investmentTotal = accounts.filter(a => a.type === 'investment').reduce((s, a) => s + a.balance, 0)
  + financialAssets.filter(a => a.type === 'investment').reduce((s, a) => s + a.current_amount, 0);
const propertyTotal = financialAssets.filter(a => a.type === 'property').reduce((s, a) => s + a.current_amount, 0);
const bankTotal = accounts.filter(a => a.type === 'bank').reduce((s, a) => s + a.balance, 0);

const pieData = [
  { label: '现金/移动支付', value: cashTotal, color: '#4ade80' },
  { label: '银行存款', value: bankTotal, color: '#60a5fa' },
  { label: '投资', value: investmentTotal, color: '#f59e0b' },
  { label: '房产', value: propertyTotal, color: '#a78bfa' },
].filter(p => p.value > 0);

const today = new Date().toISOString().slice(0, 10);

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>资产总览 - Personal Butler</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'PingFang SC', sans-serif; background: #0f0f13; color: #e0e0e0; padding: 20px; max-width: 960px; margin: 0 auto; }

  .back-link { display: inline-flex; align-items: center; gap: 6px; color: #666; text-decoration: none; font-size: 0.9em; margin-bottom: 20px; }
  .back-link:hover { color: #aaa; }

  h1 { font-size: 1.4em; color: #fff; margin-bottom: 20px; }

  /* Net worth hero card */
  .hero-card { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); border: 1px solid #2a2a50; border-radius: 16px; padding: 28px 32px; margin-bottom: 24px; }
  .hero-card .label { font-size: 0.85em; color: #888; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
  .hero-card .net-worth { font-size: 3em; font-weight: 700; color: #fff; letter-spacing: -0.02em; }
  .hero-card .net-worth.negative { color: #f87171; }
  .hero-card .net-worth .unit { font-size: 0.45em; font-weight: 400; color: #888; margin-right: 4px; }
  .hero-summary { display: flex; gap: 32px; margin-top: 16px; flex-wrap: wrap; }
  .hero-summary .item { }
  .hero-summary .item .s-label { font-size: 0.8em; color: #666; margin-bottom: 4px; }
  .hero-summary .item .s-value { font-size: 1.1em; font-weight: 600; }
  .hero-summary .item .s-value.green { color: #4ade80; }
  .hero-summary .item .s-value.red { color: #f87171; }

  /* Section titles */
  .section-title { font-size: 0.9em; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.06em; margin: 24px 0 12px; display: flex; align-items: center; gap: 8px; }
  .section-title::after { content: ''; flex: 1; height: 1px; background: #2a2a35; }

  /* Cards grid */
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 640px) { .grid2 { grid-template-columns: 1fr; } }

  .card { background: #1a1a24; border-radius: 12px; padding: 16px; border: 1px solid #2a2a35; }

  /* Account / liability rows */
  .item-row { display: flex; justify-content: space-between; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid #2a2a35; }
  .item-row:last-child { border-bottom: none; }
  .item-left { flex: 1; min-width: 0; }
  .item-name { font-size: 0.95em; color: #e0e0e0; font-weight: 500; }
  .item-sub { font-size: 0.8em; color: #666; margin-top: 3px; }
  .item-right { text-align: right; flex-shrink: 0; margin-left: 12px; }
  .item-amount { font-size: 1em; font-weight: 600; color: #fff; }
  .item-amount.red { color: #f87171; }
  .item-amount.green { color: #4ade80; }

  /* Badges */
  .badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 0.72em; font-weight: 500; margin-left: 6px; vertical-align: middle; }
  .badge.wechat { background: #1a3a1a; color: #07c160; }
  .badge.alipay { background: #1a2a3a; color: #1890ff; }
  .badge.bank { background: #2a1f1a; color: #f59e0b; }
  .badge.cash { background: #1f2a1a; color: #86efac; }
  .badge.investment { background: #1f1a3a; color: #c084fc; }
  .badge.mortgage { background: #3a1a1a; color: #fca5a5; }
  .badge.installment { background: #3a2a1a; color: #fdba74; }
  .badge.credit_card { background: #2a1a3a; color: #d8b4fe; }
  .badge.other { background: #2a2a2a; color: #9ca3af; }

  /* Warning states */
  .warn-red { border-color: #7f1d1d !important; background: #1f0d0d !important; }
  .warn-yellow { border-color: #713f12 !important; background: #1a1400 !important; }
  .warn-badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 0.72em; margin-left: 6px; }
  .warn-badge.red { background: #7f1d1d; color: #fca5a5; }
  .warn-badge.yellow { background: #713f12; color: #fde68a; }

  /* Physical items */
  .phys-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
  .phys-item { background: #1a1a24; border: 1px solid #2a2a35; border-radius: 10px; padding: 12px 14px; }
  .phys-item.warn-yellow { border-color: #713f12; background: #1a1400; }
  .phys-name { font-size: 0.9em; color: #e0e0e0; font-weight: 500; margin-bottom: 4px; }
  .phys-qty { font-size: 1.4em; font-weight: 700; color: #fff; }
  .phys-qty .phys-unit { font-size: 0.55em; font-weight: 400; color: #888; margin-left: 3px; }
  .phys-loc { font-size: 0.78em; color: #555; margin-top: 4px; }
  .phys-type-badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 0.72em; margin-bottom: 6px; }
  .phys-type-badge.ingredient { background: #1a2a1a; color: #86efac; }
  .phys-type-badge.consumable { background: #1a2a3a; color: #93c5fd; }
  .phys-type-badge.electronics { background: #2a1a3a; color: #c084fc; }
  .phys-type-badge.other { background: #2a2a2a; color: #9ca3af; }

  /* Pie chart */
  .pie-wrap { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; }
  .pie-legend { list-style: none; flex: 1; min-width: 160px; }
  .pie-legend li { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid #2a2a35; font-size: 0.88em; }
  .pie-legend li:last-child { border-bottom: none; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .legend-label { color: #ccc; flex: 1; }
  .legend-pct { color: #888; font-size: 0.9em; margin-right: 4px; }
  .legend-val { color: #fff; font-weight: 600; }

  .empty-hint { color: #555; font-style: italic; font-size: 0.9em; padding: 12px 0; }
  .updated { color: #444; font-size: 0.78em; text-align: right; margin-top: 28px; }
</style>
</head>
<body>

<a class="back-link" href="index.html">← 返回主页</a>
<h1>资产总览</h1>

<script>
const ACCOUNTS = ${JSON.stringify(accounts)};
const FINANCIAL_ASSETS = ${JSON.stringify(financialAssets)};
const PHYSICAL_ASSETS = ${JSON.stringify(physicalAssets)};
const LIABILITIES = ${JSON.stringify(liabilities)};
const PIE_DATA = ${JSON.stringify(pieData)};
const TOTALS = {
  assets: ${totalAssets},
  liabilities: ${totalLiabilities},
  netWorth: ${netWorth},
};
const TODAY = '${today}';

document.addEventListener('DOMContentLoaded', function() {

function yuan(cents) {
  return (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date(TODAY);
  return Math.ceil((d - now) / 86400000);
}

function typeBadge(type, map) {
  const cls = type || 'other';
  return '<span class="badge ' + cls + '">' + (map[type] || type) + '</span>';
}

// ---- NET WORTH HERO ----
(function renderHero() {
  const nw = TOTALS.netWorth;
  const sign = nw >= 0 ? '' : '-';
  const absNw = Math.abs(nw);
  const cls = nw >= 0 ? '' : ' negative';
  document.getElementById('hero').innerHTML =
    '<div class="label">净资产</div>' +
    '<div class="net-worth' + cls + '"><span class="unit">¥</span>' + sign + yuan(absNw) + '</div>' +
    '<div class="hero-summary">' +
    '<div class="item"><div class="s-label">总资产</div><div class="s-value green">¥' + yuan(TOTALS.assets) + '</div></div>' +
    '<div class="item"><div class="s-label">总负债</div><div class="s-value red">¥' + yuan(TOTALS.liabilities) + '</div></div>' +
    '</div>';
})();

// ---- ACCOUNTS ----
(function renderAccounts() {
  const typeMap = { wechat: '微信', alipay: '支付宝', bank: '银行卡', cash: '现金', investment: '投资账户' };
  const el = document.getElementById('accounts-list');
  if (!ACCOUNTS.length && !FINANCIAL_ASSETS.length) {
    el.innerHTML = '<p class="empty-hint">暂无数据</p>'; return;
  }

  let html = '';
  // Accounts
  for (const a of ACCOUNTS) {
    const updated = a.last_updated ? a.last_updated.slice(0, 10) : '';
    html += '<div class="item-row">' +
      '<div class="item-left"><div class="item-name">' + a.name + typeBadge(a.type, typeMap) + '</div>' +
      (updated ? '<div class="item-sub">更新于 ' + updated + '</div>' : '') +
      '</div>' +
      '<div class="item-right"><div class="item-amount">¥' + yuan(a.balance) + '</div></div>' +
      '</div>';
  }
  // Financial assets (cash/investment/property not in accounts)
  const faTypeMap = { cash: '现金资产', investment: '投资资产', property: '房产' };
  for (const fa of FINANCIAL_ASSETS) {
    html += '<div class="item-row">' +
      '<div class="item-left"><div class="item-name">' + fa.name + typeBadge(fa.type, faTypeMap) + '</div>' +
      (fa.location ? '<div class="item-sub">' + fa.location + '</div>' : '') +
      '</div>' +
      '<div class="item-right"><div class="item-amount">¥' + yuan(fa.current_amount) + '</div></div>' +
      '</div>';
  }
  el.innerHTML = html || '<p class="empty-hint">暂无数据</p>';
})();

// ---- LIABILITIES ----
(function renderLiabilities() {
  const typeMap = { mortgage: '房贷', installment: '分期', credit_card: '信用卡', other: '其他' };
  const el = document.getElementById('liabilities-list');
  if (!LIABILITIES.length) {
    el.innerHTML = '<p class="empty-hint">暂无负债数据</p>'; return;
  }
  let html = '';
  for (const l of LIABILITIES) {
    const days = daysUntil(l.next_due_date);
    const isDue = days !== null && days <= 7;
    const rateStr = l.interest_rate ? (l.interest_rate / 100).toFixed(2) + '%' : null;
    const warnHtml = isDue
      ? '<span class="warn-badge red">⚠ ' + (days <= 0 ? '已逾期' : days + '天后到期') + '</span>'
      : '';
    html += '<div class="item-row' + (isDue ? ' warn-red' : '') + '">' +
      '<div class="item-left">' +
      '<div class="item-name">' + l.name + typeBadge(l.type, typeMap) + warnHtml + '</div>' +
      '<div class="item-sub">' +
      (l.next_due_date ? '下次还款: ' + l.next_due_date : '') +
      (l.monthly_payment ? ' · 月供 ¥' + yuan(l.monthly_payment) : '') +
      (rateStr ? ' · 利率 ' + rateStr : '') +
      '</div>' +
      '</div>' +
      '<div class="item-right"><div class="item-amount red">¥' + yuan(l.remaining_amount) + '</div><div class="item-sub">共 ¥' + yuan(l.total_amount) + '</div></div>' +
      '</div>';
  }
  el.innerHTML = html;
})();

// ---- PHYSICAL ASSETS ----
(function renderPhysical() {
  const typeMap = { ingredient: '食材', consumable: '消耗品', electronics: '电子产品', other: '其他' };
  const el = document.getElementById('physical-list');
  if (!PHYSICAL_ASSETS.length) {
    el.innerHTML = '<p class="empty-hint">暂无实物资产数据</p>'; return;
  }
  let html = '';
  for (const p of PHYSICAL_ASSETS) {
    const isLow = p.quantity !== null && p.quantity <= 2;
    const warnBadge = isLow ? '<span class="warn-badge yellow">库存不足</span>' : '';
    html += '<div class="phys-item' + (isLow ? ' warn-yellow' : '') + '">' +
      '<div class="phys-type-badge ' + (p.type || 'other') + '">' + (typeMap[p.type] || p.type) + '</div>' +
      '<div class="phys-name">' + p.name + warnBadge + '</div>' +
      '<div class="phys-qty">' + (p.quantity !== null ? p.quantity : '--') + '<span class="phys-unit">' + (p.unit || '') + '</span></div>' +
      (p.location ? '<div class="phys-loc">' + p.location + '</div>' : '') +
      '</div>';
  }
  el.innerHTML = html;
})();

// ---- PIE CHART ----
(function renderPie() {
  const el = document.getElementById('pie-area');
  if (!PIE_DATA.length) {
    el.innerHTML = '<p class="empty-hint">暂无资产分布数据</p>'; return;
  }
  const total = PIE_DATA.reduce((s, p) => s + p.value, 0);
  if (total === 0) { el.innerHTML = '<p class="empty-hint">暂无资产分布数据</p>'; return; }

  const SIZE = 140, CX = 70, CY = 70, R = 58, HOLE = 30;

  function polarToXY(angle, radius) {
    return [CX + radius * Math.cos(angle - Math.PI / 2), CY + radius * Math.sin(angle - Math.PI / 2)];
  }

  function donutSlice(startAngle, endAngle, color) {
    const fullCircle = (endAngle - startAngle) >= 2 * Math.PI - 0.001;
    if (fullCircle) {
      return '<circle cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="' + color + '"/>' +
             '<circle cx="' + CX + '" cy="' + CY + '" r="' + HOLE + '" fill="#0f0f13"/>';
    }
    const [x1, y1] = polarToXY(startAngle, R);
    const [x2, y2] = polarToXY(endAngle, R);
    const [x3, y3] = polarToXY(endAngle, HOLE);
    const [x4, y4] = polarToXY(startAngle, HOLE);
    const large = (endAngle - startAngle > Math.PI) ? 1 : 0;
    return '<path d="M' + x1.toFixed(2) + ',' + y1.toFixed(2) +
      ' A' + R + ',' + R + ' 0 ' + large + ',1 ' + x2.toFixed(2) + ',' + y2.toFixed(2) +
      ' L' + x3.toFixed(2) + ',' + y3.toFixed(2) +
      ' A' + HOLE + ',' + HOLE + ' 0 ' + large + ',0 ' + x4.toFixed(2) + ',' + y4.toFixed(2) +
      ' Z" fill="' + color + '"/>';
  }

  let angle = 0;
  let slices = '';
  const GAP = 0.02;
  for (const item of PIE_DATA) {
    const sweep = (item.value / total) * 2 * Math.PI;
    slices += donutSlice(angle + GAP / 2, angle + sweep - GAP / 2, item.color);
    angle += sweep;
  }

  const svg = '<svg width="' + SIZE + '" height="' + SIZE + '" viewBox="0 0 ' + SIZE + ' ' + SIZE + '">' + slices + '</svg>';

  let legendHtml = '';
  for (const item of PIE_DATA) {
    const pct = Math.round(item.value / total * 100);
    legendHtml += '<li><span class="legend-dot" style="background:' + item.color + '"></span>' +
      '<span class="legend-label">' + item.label + '</span>' +
      '<span class="legend-pct">' + pct + '%</span>' +
      '<span class="legend-val">¥' + yuan(item.value) + '</span></li>';
  }

  el.innerHTML = '<div class="pie-wrap">' + svg + '<ul class="pie-legend">' + legendHtml + '</ul></div>';
})();

}); // end DOMContentLoaded
</script>

<!-- NET WORTH HERO -->
<div class="hero-card" id="hero"></div>

<!-- PIE CHART -->
<div class="section-title">资产配置</div>
<div class="card" id="pie-area"></div>

<!-- FINANCIAL ACCOUNTS -->
<div class="section-title">金融账户 / 资产</div>
<div class="card" id="accounts-list"></div>

<!-- LIABILITIES -->
<div class="section-title">负债</div>
<div class="card" id="liabilities-list"></div>

<!-- PHYSICAL INVENTORY -->
<div class="section-title">实物库存</div>
<div class="phys-grid" id="physical-list"></div>

<div class="updated">Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}</div>
</body>
</html>`;

fs.writeFileSync(OUT, html);
console.log('Assets page generated → ' + OUT);
