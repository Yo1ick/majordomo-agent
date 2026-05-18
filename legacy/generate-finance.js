#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');

const DB = '/Volumes/External HD/gitcode/personal-butler/data/butler.db';
const OUT = '/Volumes/External HD/.openclaw/canvas/butler/finance.html';

function q(sql) {
  try {
    const raw = execSync(`sqlite3 -json "${DB}" "${sql.replace(/"/g, '\\"')}"`, {
      encoding: 'utf8',
    }).trim();
    return raw && raw !== '[]' ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ── Day-level data: last 90 days ──────────────────────────────────────────────
const dayRows = q(`
  SELECT
    date(occurred_at) AS d,
    id, merchant,
    total_amount,
    COALESCE(category,'other') AS category,
    COALESCE(pay_channel,'') AS pay_channel,
    COALESCE(pay_method,'') AS pay_method,
    occurred_at
  FROM expenses
  WHERE deleted_at IS NULL
    AND date(occurred_at) >= date('now','-90 days')
  ORDER BY occurred_at DESC
`);

// Group by day → { [date]: expense[] }
const dayMap = {};
for (const row of dayRows) {
  if (!dayMap[row.d]) dayMap[row.d] = [];
  dayMap[row.d].push(row);
}

// ── Month-level data ──────────────────────────────────────────────────────────
// Daily totals per month (for bar chart) — last 12 months
const monthDailyRows = q(`
  SELECT
    strftime('%Y-%m', occurred_at) AS month,
    date(occurred_at) AS d,
    SUM(total_amount) AS total
  FROM expenses
  WHERE deleted_at IS NULL
    AND occurred_at >= date('now','start of month','-11 months')
  GROUP BY month, d
  ORDER BY d
`);

// Category breakdown per month
const monthCatRows = q(`
  SELECT
    strftime('%Y-%m', occurred_at) AS month,
    COALESCE(category,'other') AS category,
    SUM(total_amount) AS total
  FROM expenses
  WHERE deleted_at IS NULL
    AND occurred_at >= date('now','start of month','-11 months')
  GROUP BY month, category
  ORDER BY month, total DESC
`);

// Channel breakdown per month
const monthChanRows = q(`
  SELECT
    strftime('%Y-%m', occurred_at) AS month,
    COALESCE(pay_channel,'other') AS pay_channel,
    SUM(total_amount) AS total
  FROM expenses
  WHERE deleted_at IS NULL
    AND occurred_at >= date('now','start of month','-11 months')
  GROUP BY month, pay_channel
`);

// Month summary (total + count)
const monthSummaryRows = q(`
  SELECT
    strftime('%Y-%m', occurred_at) AS month,
    SUM(total_amount) AS total,
    COUNT(*) AS cnt
  FROM expenses
  WHERE deleted_at IS NULL
    AND occurred_at >= date('now','start of month','-11 months')
  GROUP BY month
  ORDER BY month
`);

// Build month map
function buildMonthMap() {
  const months = {};

  // Summaries
  for (const r of monthSummaryRows) {
    months[r.month] = { total: r.total, cnt: r.cnt, daily: [], cats: [], channels: [] };
  }

  // Daily series
  for (const r of monthDailyRows) {
    if (!months[r.month]) months[r.month] = { total: 0, cnt: 0, daily: [], cats: [], channels: [] };
    months[r.month].daily.push({ d: r.d, total: r.total });
  }

  // Categories
  for (const r of monthCatRows) {
    if (!months[r.month]) months[r.month] = { total: 0, cnt: 0, daily: [], cats: [], channels: [] };
    months[r.month].cats.push({ category: r.category, total: r.total });
  }

  // Channels
  for (const r of monthChanRows) {
    if (!months[r.month]) months[r.month] = { total: 0, cnt: 0, daily: [], cats: [], channels: [] };
    months[r.month].channels.push({ channel: r.pay_channel, total: r.total });
  }

  return months;
}

const monthMap = buildMonthMap();

// ── Year-level data ───────────────────────────────────────────────────────────
const yearMonthlyRows = q(`
  SELECT
    strftime('%Y', occurred_at) AS year,
    strftime('%Y-%m', occurred_at) AS month,
    SUM(total_amount) AS total,
    COUNT(*) AS cnt
  FROM expenses
  WHERE deleted_at IS NULL
  GROUP BY year, month
  ORDER BY month
`);

const yearMap = {};
for (const r of yearMonthlyRows) {
  if (!yearMap[r.year]) yearMap[r.year] = [];
  yearMap[r.year].push({ month: r.month, total: r.total, cnt: r.cnt });
}

// ── Available periods ─────────────────────────────────────────────────────────
const availableMonths = Object.keys(monthMap).sort();
const availableYears = Object.keys(yearMap).sort();

const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

// ── HTML ──────────────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>财务报表 - Personal Butler</title>
<style>
/* ── Reset & Base ─────────────────────────────────────────────────────── */
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, 'PingFang SC', sans-serif;
  background: #0f0f13; color: #e0e0e0;
  padding: 20px; max-width: 960px; margin: 0 auto;
}
a { color: #888; text-decoration: none; }
a:hover { color: #ccc; }

/* ── Header ───────────────────────────────────────────────────────────── */
.header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
.header h1 { font-size: 1.4em; color: #fff; }
.back-link { font-size: 0.9em; color: #666; }
.back-link:hover { color: #aaa; }
.generated { color: #444; font-size: 0.78em; margin-left: auto; }

/* ── View Tabs ────────────────────────────────────────────────────────── */
.tabs { display: flex; gap: 4px; margin-bottom: 20px; background: #1a1a24; border: 1px solid #2a2a35; border-radius: 10px; padding: 4px; width: fit-content; }
.tab-btn {
  padding: 8px 24px; border-radius: 7px; border: none;
  background: transparent; color: #888; cursor: pointer;
  font-size: 14px; font-family: inherit; transition: all 0.2s;
}
.tab-btn.active { background: #2a2a35; color: #fff; }
.tab-btn:hover:not(.active) { color: #ccc; }

/* ── Nav Controls ─────────────────────────────────────────────────────── */
.nav-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
.nav-btn {
  background: #2a2a35; border: 1px solid #3a3a45; color: #ccc;
  padding: 6px 14px; border-radius: 6px; cursor: pointer;
  font-size: 14px; font-family: inherit;
}
.nav-btn:hover { background: #3a3a45; }
.nav-label { color: #fff; font-size: 1em; font-weight: 600; min-width: 100px; text-align: center; }
.period-select {
  background: #1a1a24; border: 1px solid #3a3a45; color: #fff;
  padding: 6px 12px; border-radius: 6px; font-size: 14px;
  font-family: inherit; cursor: pointer;
}
.today-btn { margin-left: 4px; }
input[type="date"] {
  background: #1a1a24; border: 1px solid #3a3a45; color: #fff;
  padding: 6px 12px; border-radius: 6px; font-size: 14px;
}

/* ── Cards ────────────────────────────────────────────────────────────── */
.card {
  background: #1a1a24; border: 1px solid #2a2a35;
  border-radius: 12px; padding: 16px; margin-bottom: 16px;
}
.card h2 { font-size: 0.95em; color: #888; margin-bottom: 14px; }
.card-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px; }
.stat-card {
  background: #1a1a24; border: 1px solid #2a2a35;
  border-radius: 12px; padding: 14px 16px;
}
.stat-card .label { font-size: 0.82em; color: #777; margin-bottom: 6px; }
.stat-card .value { font-size: 1.6em; font-weight: 700; color: #fff; }
.stat-card .value small { font-size: 0.45em; color: #666; margin-left: 3px; }
.stat-card .sub { font-size: 0.8em; color: #555; margin-top: 4px; }

/* ── List ─────────────────────────────────────────────────────────────── */
.expense-list { list-style: none; }
.expense-list li {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 0; border-bottom: 1px solid #2a2a35; flex-wrap: wrap; gap: 6px;
}
.expense-list li:last-child { border-bottom: none; }
.exp-left { display: flex; flex-direction: column; gap: 3px; }
.exp-merchant { color: #ddd; font-size: 0.95em; }
.exp-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.exp-time { color: #555; font-size: 0.8em; }
.exp-method { color: #555; font-size: 0.8em; }
.exp-amount { color: #fff; font-weight: 700; font-size: 1em; white-space: nowrap; }
.empty { color: #555; font-style: italic; padding: 12px 0; text-align: center; }

/* ── Tags ─────────────────────────────────────────────────────────────── */
.tag {
  display: inline-block; padding: 2px 7px; border-radius: 4px;
  font-size: 0.73em; white-space: nowrap;
}
.tag.food_delivery, .tag.food_ingredient { background: #2d1f0f; color: #f0a030; }
.tag.shopping      { background: #0f1f2d; color: #30a0f0; }
.tag.transport     { background: #1f0f2d; color: #a030f0; }
.tag.utility       { background: #0f2d1f; color: #30f0a0; }
.tag.entertainment { background: #2d0f1f; color: #f030a0; }
.tag.other         { background: #1f1f1f; color: #888; }
.tag.alipay        { background: #1a2a3a; color: #1890ff; }
.tag.wechat        { background: #1a3a1a; color: #07c160; }

/* ── Bar Chart ────────────────────────────────────────────────────────── */
.bar-chart { overflow-x: auto; }
.bar-chart-inner { display: flex; align-items: flex-end; gap: 4px; min-height: 120px; padding-bottom: 24px; position: relative; }
.bar-wrap { display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 20px; }
.bar {
  width: 100%; border-radius: 3px 3px 0 0;
  background: linear-gradient(180deg, #4a90d9, #1890ff);
  min-height: 2px; cursor: pointer; transition: opacity 0.15s;
  position: relative;
}
.bar:hover { opacity: 0.8; }
.bar-tooltip {
  display: none; position: absolute; bottom: calc(100% + 4px); left: 50%;
  transform: translateX(-50%); background: #2a2a35; color: #fff;
  font-size: 11px; padding: 3px 7px; border-radius: 4px; white-space: nowrap;
  pointer-events: none; z-index: 10;
}
.bar:hover .bar-tooltip { display: block; }
.bar-day { font-size: 0.65em; color: #555; margin-top: 4px; white-space: nowrap; }
.bar-day.today { color: #1890ff; font-weight: 600; }

/* ── SVG Pie ──────────────────────────────────────────────────────────── */
.pie-wrap { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
.pie-legend { list-style: none; }
.pie-legend li { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 0.88em; }
.pie-dot { width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0; }
.pie-legend .pct { color: #888; font-size: 0.85em; margin-left: 4px; }

/* ── Channel Bar ──────────────────────────────────────────────────────── */
.channel-bar { margin-top: 8px; }
.channel-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.channel-label { width: 50px; font-size: 0.82em; }
.channel-label.alipay { color: #1890ff; }
.channel-label.wechat { color: #07c160; }
.channel-track { flex: 1; height: 10px; background: #2a2a35; border-radius: 5px; overflow: hidden; }
.channel-fill { height: 100%; border-radius: 5px; }
.channel-fill.alipay { background: #1890ff; }
.channel-fill.wechat { background: #07c160; }
.channel-amount { font-size: 0.82em; color: #aaa; white-space: nowrap; }

/* ── Year trend (SVG line) ────────────────────────────────────────────── */
.trend-svg { width: 100%; overflow: visible; }

/* ── Misc ─────────────────────────────────────────────────────────────── */
.section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 600px) { .section-grid { grid-template-columns: 1fr; } }
.footer { color: #444; font-size: 0.78em; text-align: right; margin-top: 20px; }
.hidden { display: none; }
</style>
</head>
<body>

<div class="header">
  <a class="back-link" href="index.html">← 返回</a>
  <h1>💰 财务报表</h1>
  <span class="generated">Generated: ${generatedAt}</span>
</div>

<!-- View Tabs -->
<div class="tabs">
  <button class="tab-btn active" id="tab-day"   onclick="switchView('day')">日</button>
  <button class="tab-btn"        id="tab-month" onclick="switchView('month')">月</button>
  <button class="tab-btn"        id="tab-year"  onclick="switchView('year')">年</button>
</div>

<!-- ── Day View ─────────────────────────────────────────────────────────────── -->
<div id="view-day">
  <div class="nav-bar">
    <button class="nav-btn" onclick="dayNav(-1)">&#8249;</button>
    <input type="date" id="dayPicker">
    <button class="nav-btn" onclick="dayNav(1)">&#8250;</button>
    <button class="nav-btn today-btn" onclick="dayGoto(todayStr())">今天</button>
  </div>
  <div id="day-content"></div>
</div>

<!-- ── Month View ────────────────────────────────────────────────────────────── -->
<div id="view-month" class="hidden">
  <div class="nav-bar">
    <button class="nav-btn" onclick="monthNav(-1)">&#8249;</button>
    <span class="nav-label" id="month-label"></span>
    <button class="nav-btn" onclick="monthNav(1)">&#8250;</button>
    <select class="period-select" id="monthSelect" onchange="monthGoto(this.value)">
      ${availableMonths.map(m => `<option value="${m}">${m}</option>`).join('\n      ')}
    </select>
  </div>
  <div id="month-content"></div>
</div>

<!-- ── Year View ─────────────────────────────────────────────────────────────── -->
<div id="view-year" class="hidden">
  <div class="nav-bar">
    <button class="nav-btn" onclick="yearNav(-1)">&#8249;</button>
    <span class="nav-label" id="year-label"></span>
    <button class="nav-btn" onclick="yearNav(1)">&#8250;</button>
    <select class="period-select" id="yearSelect" onchange="yearGoto(this.value)">
      ${availableYears.map(y => `<option value="${y}">${y}</option>`).join('\n      ')}
    </select>
  </div>
  <div id="year-content"></div>
</div>

<div class="footer">数据来源: butler.db &nbsp;|&nbsp; 金额单位: 元</div>

<script>
// ── Embedded data ───────────────────────────────────────────────────────────
const DAY_MAP   = ${JSON.stringify(dayMap)};
const MONTH_MAP = ${JSON.stringify(monthMap)};
const YEAR_MAP  = ${JSON.stringify(yearMap)};

const AVAILABLE_MONTHS = ${JSON.stringify(availableMonths)};
const AVAILABLE_YEARS  = ${JSON.stringify(availableYears)};

// ── State ───────────────────────────────────────────────────────────────────
let currentView  = 'day';
let currentDay   = todayStr();
let currentMonth = latestMonth();
let currentYear  = latestYear();

// ── Utils ───────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }
function latestMonth() { return AVAILABLE_MONTHS.length ? AVAILABLE_MONTHS[AVAILABLE_MONTHS.length - 1] : ''; }
function latestYear()  { return AVAILABLE_YEARS.length  ? AVAILABLE_YEARS[AVAILABLE_YEARS.length - 1]   : ''; }
function yuan(cents) { return (cents / 100).toFixed(2); }
function fmtYuan(cents) { return '¥' + yuan(cents); }

const CAT_LABEL = {
  food_delivery: '外卖', food_ingredient: '食材',
  shopping: '购物', transport: '交通',
  utility: '缴费', entertainment: '娱乐', other: '其他',
};
const CAT_COLOR = {
  food_delivery: '#f0a030', food_ingredient: '#f0a030',
  shopping: '#30a0f0', transport: '#a030f0',
  utility: '#30f0a0', entertainment: '#f030a0', other: '#888',
};

function catTag(c) {
  return '<span class="tag ' + (c||'other') + '">' + (CAT_LABEL[c]||c||'其他') + '</span>';
}
function chanTag(c) {
  if (!c) return '';
  const label = c === 'alipay' ? '支付宝' : c === 'wechat' ? '微信' : c;
  return '<span class="tag ' + c + '">' + label + '</span>';
}

// ── View switching ──────────────────────────────────────────────────────────
function switchView(v) {
  currentView = v;
  ['day','month','year'].forEach(n => {
    document.getElementById('view-' + n).classList.toggle('hidden', n !== v);
    document.getElementById('tab-' + n).classList.toggle('active', n === v);
  });
  if (v === 'day')   renderDay(currentDay);
  if (v === 'month') renderMonth(currentMonth);
  if (v === 'year')  renderYear(currentYear);
}

// ── Day view ────────────────────────────────────────────────────────────────
function dayNav(d) {
  const dt = new Date(currentDay + 'T00:00:00');
  dt.setDate(dt.getDate() + d);
  dayGoto(dt.toISOString().slice(0, 10));
}
function dayGoto(date) {
  currentDay = date;
  document.getElementById('dayPicker').value = date;
  renderDay(date);
}
document.getElementById('dayPicker').addEventListener('change', function() {
  dayGoto(this.value);
});

function renderDay(date) {
  const expenses = DAY_MAP[date] || [];
  const total = expenses.reduce((s, e) => s + e.total_amount, 0);
  const cnt   = expenses.length;

  let h = '';

  // Stat cards
  h += '<div class="card-row">';
  h += '<div class="stat-card"><div class="label">当日支出</div><div class="value">' + yuan(total) + '<small>元</small></div><div class="sub">' + cnt + ' 笔消费</div></div>';

  // Category breakdown (inline)
  const catTotals = {};
  expenses.forEach(e => { catTotals[e.category] = (catTotals[e.category]||0) + e.total_amount; });
  const topCat = Object.entries(catTotals).sort((a,b) => b[1]-a[1])[0];
  h += '<div class="stat-card"><div class="label">最多消费类型</div><div class="value" style="font-size:1.1em;padding-top:4px">' + (topCat ? (CAT_LABEL[topCat[0]]||topCat[0]) + ' ' + fmtYuan(topCat[1]) : '--') + '</div></div>';

  // Channel split
  const chanTotals = {};
  expenses.forEach(e => { if(e.pay_channel) chanTotals[e.pay_channel] = (chanTotals[e.pay_channel]||0) + e.total_amount; });
  const ali = chanTotals['alipay']||0, wx = chanTotals['wechat']||0;
  h += '<div class="stat-card"><div class="label">支付渠道</div>';
  if (ali||wx) {
    h += '<div style="margin-top:6px">' + channelBar(ali, wx) + '</div>';
  } else {
    h += '<div class="value" style="font-size:1em">--</div>';
  }
  h += '</div>';
  h += '</div>';

  // Expense list
  h += '<div class="card"><h2>消费明细</h2>';
  if (expenses.length) {
    h += '<ul class="expense-list">';
    expenses.forEach(e => {
      const time = (e.occurred_at||'').slice(11, 16);
      h += '<li>';
      h += '<div class="exp-left">';
      h += '<span class="exp-merchant">' + escHtml(e.merchant) + '</span>';
      h += '<div class="exp-meta">' + catTag(e.category) + chanTag(e.pay_channel);
      if (e.pay_method) h += '<span class="exp-method">' + escHtml(e.pay_method) + '</span>';
      if (time) h += '<span class="exp-time">' + time + '</span>';
      h += '</div></div>';
      h += '<span class="exp-amount">' + fmtYuan(e.total_amount) + '</span>';
      h += '</li>';
    });
    h += '</ul>';
  } else {
    h += '<div class="empty">暂无消费记录</div>';
  }
  h += '</div>';

  document.getElementById('day-content').innerHTML = h;
}

// ── Month view ──────────────────────────────────────────────────────────────
function monthNav(d) {
  const idx = AVAILABLE_MONTHS.indexOf(currentMonth);
  const next = idx + d;
  if (next >= 0 && next < AVAILABLE_MONTHS.length) monthGoto(AVAILABLE_MONTHS[next]);
}
function monthGoto(m) {
  currentMonth = m;
  document.getElementById('month-label').textContent = m;
  document.getElementById('monthSelect').value = m;
  renderMonth(m);
}

function renderMonth(m) {
  const data = MONTH_MAP[m] || { total: 0, cnt: 0, daily: [], cats: [], channels: [] };

  let h = '';

  // Summary stats
  const avgPerDay = data.daily.length ? Math.round(data.total / data.daily.length) : 0;
  h += '<div class="card-row">';
  h += '<div class="stat-card"><div class="label">月度总支出</div><div class="value">' + yuan(data.total) + '<small>元</small></div><div class="sub">' + data.cnt + ' 笔</div></div>';
  h += '<div class="stat-card"><div class="label">日均消费</div><div class="value">' + yuan(avgPerDay) + '<small>元</small></div></div>';
  h += '<div class="stat-card"><div class="label">消费天数</div><div class="value">' + data.daily.length + '<small>天</small></div></div>';
  h += '</div>';

  // Daily bar chart
  h += '<div class="card"><h2>每日支出趋势</h2>';
  h += renderBarChart(m, data.daily);
  h += '</div>';

  // Category + Channel
  h += '<div class="section-grid">';

  // Category pie
  h += '<div class="card"><h2>分类占比</h2>';
  h += renderCatPie(data.cats, data.total);
  h += '</div>';

  // Channel breakdown
  h += '<div class="card"><h2>支付渠道</h2>';
  const ali  = (data.channels.find(c => c.channel==='alipay') || {total:0}).total;
  const wx   = (data.channels.find(c => c.channel==='wechat') || {total:0}).total;
  const chanTotal = ali + wx;
  if (chanTotal > 0) {
    h += channelBar(ali, wx);
    h += '<div style="margin-top:12px;font-size:0.85em;color:#888">';
    h += '支付宝 ' + fmtYuan(ali) + ' (' + pct(ali, chanTotal) + '%) &nbsp;|&nbsp; 微信 ' + fmtYuan(wx) + ' (' + pct(wx, chanTotal) + '%)';
    h += '</div>';
  } else {
    h += '<div class="empty">暂无数据</div>';
  }
  h += '</div>';

  h += '</div>'; // section-grid

  document.getElementById('month-content').innerHTML = h;
}

function renderBarChart(month, dailyData) {
  if (!dailyData.length) return '<div class="empty">暂无数据</div>';

  const maxTotal = Math.max(...dailyData.map(d => d.total));
  const today = todayStr();

  // Fill all days in the month
  const [y, mo] = month.split('-').map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  const dailyMap = {};
  dailyData.forEach(d => { dailyMap[d.d] = d.total; });

  let bars = '';
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = month + '-' + String(day).padStart(2,'0');
    const total   = dailyMap[dateStr] || 0;
    const heightPct = maxTotal > 0 ? Math.max(2, Math.round(total / maxTotal * 100)) : 2;
    const isToday = dateStr === today;
    const color = total > 0
      ? (isToday ? 'background:linear-gradient(180deg,#6ab4ff,#1890ff)' : 'background:linear-gradient(180deg,#4a90d9,#1890ff)')
      : 'background:#2a2a35';
    bars += '<div class="bar-wrap">';
    bars += '<div class="bar" style="height:' + heightPct + '%;' + color + '">';
    if (total > 0) bars += '<div class="bar-tooltip">' + dateStr.slice(5) + '<br>' + fmtYuan(total) + '</div>';
    bars += '</div>';
    bars += '<div class="bar-day' + (isToday?' today':'') + '">' + day + '</div>';
    bars += '</div>';
  }

  return '<div class="bar-chart"><div class="bar-chart-inner" style="height:160px">' + bars + '</div></div>';
}

function renderCatPie(cats, totalAmt) {
  if (!cats.length || totalAmt === 0) return '<div class="empty">暂无数据</div>';

  const cx = 70, cy = 70, r = 55;
  let svgPaths = '';
  let legendItems = '';
  let startAngle = -Math.PI / 2;

  cats.forEach(item => {
    const frac = item.total / totalAmt;
    const endAngle = startAngle + frac * 2 * Math.PI;
    const color = CAT_COLOR[item.category] || '#888';

    if (frac >= 0.9999) {
      svgPaths += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + color + '"/>';
    } else {
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const large = frac > 0.5 ? 1 : 0;
      svgPaths += '<path d="M' + cx + ',' + cy + ' L' + x1.toFixed(2) + ',' + y1.toFixed(2)
        + ' A' + r + ',' + r + ' 0 ' + large + ',1 ' + x2.toFixed(2) + ',' + y2.toFixed(2)
        + ' Z" fill="' + color + '"/>';
    }
    startAngle = endAngle;

    legendItems += '<li>'
      + '<span class="pie-dot" style="background:' + color + '"></span>'
      + '<span>' + (CAT_LABEL[item.category]||item.category) + '</span>'
      + '<span style="color:#aaa;margin-left:4px">' + fmtYuan(item.total) + '</span>'
      + '<span class="pct">(' + pct(item.total, totalAmt) + '%)</span>'
      + '</li>';
  });

  const svg = '<svg width="140" height="140" viewBox="0 0 140 140"><g>' + svgPaths + '</g>'
    + '<circle cx="' + cx + '" cy="' + cy + '" r="28" fill="#1a1a24"/></svg>';

  return '<div class="pie-wrap">' + svg + '<ul class="pie-legend">' + legendItems + '</ul></div>';
}

function channelBar(ali, wx) {
  const total = ali + wx;
  if (!total) return '';
  const aliPct = Math.round(ali / total * 100);
  const wxPct  = 100 - aliPct;
  return '<div class="channel-bar">'
    + '<div class="channel-row"><span class="channel-label alipay">支付宝</span>'
    + '<div class="channel-track"><div class="channel-fill alipay" style="width:' + aliPct + '%"></div></div>'
    + '<span class="channel-amount">' + fmtYuan(ali) + '</span></div>'
    + '<div class="channel-row"><span class="channel-label wechat">微信</span>'
    + '<div class="channel-track"><div class="channel-fill wechat" style="width:' + wxPct + '%"></div></div>'
    + '<span class="channel-amount">' + fmtYuan(wx) + '</span></div>'
    + '</div>';
}

// ── Year view ───────────────────────────────────────────────────────────────
function yearNav(d) {
  const idx = AVAILABLE_YEARS.indexOf(currentYear);
  const next = idx + d;
  if (next >= 0 && next < AVAILABLE_YEARS.length) yearGoto(AVAILABLE_YEARS[next]);
}
function yearGoto(y) {
  currentYear = y;
  document.getElementById('year-label').textContent = y;
  document.getElementById('yearSelect').value = y;
  renderYear(y);
}

function renderYear(y) {
  const months = YEAR_MAP[y] || [];

  let h = '';

  const totalAmt = months.reduce((s, m) => s + m.total, 0);
  const totalCnt = months.reduce((s, m) => s + m.cnt, 0);
  const maxMonth = months.reduce((a, b) => b.total > a.total ? b : a, { total: 0, month: '--' });

  h += '<div class="card-row">';
  h += '<div class="stat-card"><div class="label">年度总支出</div><div class="value">' + yuan(totalAmt) + '<small>元</small></div><div class="sub">' + totalCnt + ' 笔</div></div>';
  h += '<div class="stat-card"><div class="label">月均支出</div><div class="value">' + (months.length ? yuan(Math.round(totalAmt/months.length)) : '0.00') + '<small>元</small></div></div>';
  h += '<div class="stat-card"><div class="label">最高月份</div><div class="value" style="font-size:0.95em">' + (maxMonth.month||'--') + '</div><div class="sub">' + fmtYuan(maxMonth.total) + '</div></div>';
  h += '</div>';

  // Line chart
  h += '<div class="card"><h2>月度支出趋势</h2>';
  h += renderYearLine(y, months);
  h += '</div>';

  // Monthly table
  h += '<div class="card"><h2>月度明细</h2>';
  if (months.length) {
    h += '<ul class="expense-list">';
    [...months].reverse().forEach(m => {
      h += '<li>'
        + '<span style="color:#aaa;min-width:80px">' + m.month + '</span>'
        + '<span style="color:#888;font-size:0.85em">' + m.cnt + ' 笔</span>'
        + '<span class="exp-amount">' + fmtYuan(m.total) + '</span>'
        + '</li>';
    });
    h += '</ul>';
  } else {
    h += '<div class="empty">暂无数据</div>';
  }
  h += '</div>';

  document.getElementById('year-content').innerHTML = h;
}

function renderYearLine(year, months) {
  if (!months.length) return '<div class="empty">暂无数据</div>';

  const W = 800, H = 160, PL = 10, PR = 10, PT = 20, PB = 30;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;

  // Fill all 12 months
  const allMonths = Array.from({length: 12}, (_, i) => {
    const mo = String(i+1).padStart(2,'0');
    const key = year + '-' + mo;
    const found = months.find(m => m.month === key);
    return { month: key, total: found ? found.total : 0 };
  });

  const maxVal = Math.max(...allMonths.map(m => m.total), 1);

  // Build points
  const points = allMonths.map((m, i) => {
    const x = PL + (i / 11) * chartW;
    const y = PT + chartH - (m.total / maxVal) * chartH;
    return { x, y, m };
  });

  const polyline = points.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');

  // Area fill
  const areaPoints = [PL + ',' + (PT + chartH)]
    + ' ' + polyline + ' '
    + (PL + chartW) + ',' + (PT + chartH);

  // Gridlines (3 lines at 25%, 50%, 75%)
  let gridLines = '';
  [0.25, 0.5, 0.75, 1].forEach(f => {
    const gy = PT + chartH - f * chartH;
    const val = Math.round(maxVal * f / 100) / 100; // yuan
    gridLines += '<line x1="' + PL + '" y1="' + gy.toFixed(1) + '" x2="' + (PL+chartW) + '" y2="' + gy.toFixed(1) + '" stroke="#2a2a35" stroke-width="1"/>';
    gridLines += '<text x="' + (PL+chartW+4) + '" y="' + (gy+4).toFixed(1) + '" fill="#555" font-size="9">' + (maxVal*f/100).toFixed(0) + '</text>';
  });

  // Month labels
  const moLabels = ['1','2','3','4','5','6','7','8','9','10','11','12'];
  let xLabels = '';
  points.forEach((p, i) => {
    xLabels += '<text x="' + p.x.toFixed(1) + '" y="' + (PT+chartH+16) + '" text-anchor="middle" fill="#555" font-size="10">' + moLabels[i] + '</text>';
  });

  // Dots
  let dots = '';
  points.forEach(p => {
    if (p.m.total > 0) {
      dots += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4" fill="#1890ff" stroke="#0f0f13" stroke-width="2"/>';
    }
  });

  const svg = '<svg class="trend-svg" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">'
    + gridLines
    + '<polygon points="' + areaPoints + '" fill="rgba(24,144,255,0.1)"/>'
    + '<polyline points="' + polyline + '" fill="none" stroke="#1890ff" stroke-width="2" stroke-linejoin="round"/>'
    + dots
    + xLabels
    + '</svg>';

  return svg;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function pct(part, total) { return total ? Math.round(part / total * 100) : 0; }
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ─────────────────────────────────────────────────────────────────────
(function init() {
  currentDay   = todayStr();
  currentMonth = latestMonth();
  currentYear  = latestYear();

  document.getElementById('dayPicker').value = currentDay;
  if (currentMonth) {
    document.getElementById('month-label').textContent = currentMonth;
    document.getElementById('monthSelect').value = currentMonth;
  }
  if (currentYear) {
    document.getElementById('year-label').textContent = currentYear;
    document.getElementById('yearSelect').value = currentYear;
  }

  renderDay(currentDay);
})();
</script>
</body>
</html>`;

fs.writeFileSync(OUT, html);
console.log('Finance page generated → ' + OUT);
