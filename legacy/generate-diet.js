#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');

const DB = '/Volumes/External HD/gitcode/personal-butler/data/butler.db';
const OUT = '/Volumes/External HD/.openclaw/canvas/butler/diet.html';

function q(sql) {
  try {
    const escaped = sql.replace(/"/g, '\\"');
    const raw = execSync(`sqlite3 -json "${DB}" "${escaped}"`, { encoding: 'utf8' }).trim();
    return raw && raw !== '[]' ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

// ── Body profile ──────────────────────────────────────────────────────────────
const bodyProfile = q(`SELECT * FROM user_body_profile WHERE user_id = 'default'`)[0] || {};
const weightKg = parseFloat(bodyProfile.weight_kg) || 70;
const trainingGoal = bodyProfile.training_goal || '';
const proteinTarget = (trainingGoal === 'lose_fat' || trainingGoal === 'build_muscle')
  ? Math.round(weightKg * 1.8)
  : Math.round(weightKg * 1.2);

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDateStr(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function datesInMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const out = [];
  for (let i = 1; i <= days; i++) out.push(`${yearMonth}-${String(i).padStart(2, '0')}`);
  return out;
}

function monthsInYear(year) {
  const out = [];
  for (let m = 1; m <= 12; m++) out.push(`${year}-${String(m).padStart(2, '0')}`);
  return out;
}

// ── Day data (60 days window) ─────────────────────────────────────────────────
const dayData = {};
for (let i = -365; i <= 0; i++) {
  const date = getDateStr(i);
  const regularMeals = q(`SELECT m.id, m.meal_type,
    GROUP_CONCAT(mf.food_name, '、') AS foods,
    m.total_calories AS kcal
    FROM meals m LEFT JOIN meal_foods mf ON m.id = mf.meal_id
    WHERE m.date = '${date}' AND m.deleted_at IS NULL
    AND COALESCE(m.meal_category,'regular') = 'regular'
    GROUP BY m.id ORDER BY m.created_at`);
  const supplements = q(`SELECT m.id, m.meal_type,
    GROUP_CONCAT(mf.food_name, '、') AS foods,
    m.total_calories AS kcal
    FROM meals m LEFT JOIN meal_foods mf ON m.id = mf.meal_id
    WHERE m.date = '${date}' AND m.deleted_at IS NULL
    AND m.meal_category = 'supplement'
    GROUP BY m.id ORDER BY m.created_at`);
  const drinks = q(`SELECT m.id, m.meal_type,
    GROUP_CONCAT(mf.food_name, '、') AS foods,
    m.total_calories AS kcal
    FROM meals m LEFT JOIN meal_foods mf ON m.id = mf.meal_id
    WHERE m.date = '${date}' AND m.deleted_at IS NULL
    AND m.meal_category = 'drink'
    GROUP BY m.id ORDER BY m.created_at`);
  const macros = q(`SELECT
    COALESCE(SUM(mf.protein_g),0) AS protein,
    COALESCE(SUM(mf.carbs_g),0) AS carbs,
    COALESCE(SUM(mf.fat_g),0) AS fat
    FROM meal_foods mf
    JOIN meals m ON mf.meal_id = m.id
    WHERE m.date = '${date}' AND m.deleted_at IS NULL`)[0] || { protein: 0, carbs: 0, fat: 0 };
  const water = q(`SELECT COALESCE(SUM(amount_ml),0) AS total FROM water_logs WHERE date = '${date}' AND user_id = 'default'`)[0];
  const waterMl = water ? (water.total || 0) : 0;

  let totalKcal = 0;
  [...regularMeals, ...supplements, ...drinks].forEach(m => { totalKcal += (m.kcal || 0); });

  if (regularMeals.length || supplements.length || drinks.length || waterMl > 0) {
    dayData[date] = {
      regularMeals,
      supplements,
      drinks,
      macros: {
        protein: parseFloat(macros.protein) || 0,
        carbs: parseFloat(macros.carbs) || 0,
        fat: parseFloat(macros.fat) || 0,
      },
      waterMl,
      totalKcal,
    };
  }
}

// ── Month data ────────────────────────────────────────────────────────────────
// Precompute per-date aggregates for month/year views
const dailyAgg = {};
Object.entries(dayData).forEach(([date, d]) => {
  dailyAgg[date] = {
    totalKcal: d.totalKcal,
    protein: d.macros.protein,
    hasSupp: d.supplements.length > 0,
  };
});

// ── Year data: monthly averages ───────────────────────────────────────────────
const currentYear = new Date().getFullYear();
const yearMonthlyAvg = {};
monthsInYear(String(currentYear)).forEach(ym => {
  const dates = datesInMonth(ym).filter(d => dailyAgg[d]);
  if (dates.length === 0) {
    yearMonthlyAvg[ym] = { avgKcal: 0, days: 0 };
    return;
  }
  const totalKcal = dates.reduce((s, d) => s + (dailyAgg[d].totalKcal || 0), 0);
  yearMonthlyAvg[ym] = { avgKcal: Math.round(totalKcal / dates.length), days: dates.length };
});

// ── Generate HTML ─────────────────────────────────────────────────────────────
const today = getDateStr(0);
const currentYearMonth = today.slice(0, 7);

const goalLabel = { lose_fat: '减脂', build_muscle: '增肌', maintain: '维持', endurance: '耐力' }[trainingGoal] || trainingGoal;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>饮食营养详情 - Personal Butler</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'PingFang SC', sans-serif; background: #0f0f13; color: #e0e0e0; padding: 20px; max-width: 900px; margin: 0 auto; }

  /* Back link */
  .back-link { display: inline-flex; align-items: center; gap: 6px; color: #666; text-decoration: none; font-size: 0.9em; margin-bottom: 20px; transition: color 0.2s; }
  .back-link:hover { color: #aaa; }

  h1 { font-size: 1.4em; color: #fff; margin-bottom: 4px; }
  .page-sub { color: #555; font-size: 0.85em; margin-bottom: 20px; }

  /* View mode tabs */
  .tabs { display: flex; gap: 8px; margin-bottom: 20px; }
  .tab { padding: 8px 18px; border-radius: 8px; border: 1px solid #2a2a35; background: #1a1a24; color: #888; cursor: pointer; font-size: 0.9em; transition: all 0.2s; }
  .tab.active { background: #2a3a5a; border-color: #3a5a8a; color: #7bb3f0; }
  .tab:hover:not(.active) { background: #2a2a35; color: #ccc; }

  /* Navigation */
  .nav-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
  .nav-bar button { background: #2a2a35; border: 1px solid #3a3a45; color: #ccc; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 14px; }
  .nav-bar button:hover { background: #3a3a45; }
  .nav-bar input { background: #1a1a24; border: 1px solid #3a3a45; color: #fff; padding: 6px 12px; border-radius: 6px; font-size: 14px; }
  .nav-bar .today-btn { background: #2a3a5a; border-color: #3a5a8a; color: #7bb3f0; }

  /* Cards */
  .card { background: #1a1a24; border-radius: 12px; padding: 16px; border: 1px solid #2a2a35; margin-bottom: 16px; }
  .card-title { font-size: 0.95em; color: #888; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .card-title span { font-size: 1.1em; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  @media (max-width: 600px) { .grid2, .grid3 { grid-template-columns: 1fr; } }

  /* Stats */
  .stat-val { font-size: 1.8em; font-weight: 700; color: #fff; }
  .stat-val small { font-size: 0.42em; color: #666; margin-left: 4px; font-weight: 400; }
  .stat-sub { color: #666; font-size: 0.82em; margin-top: 4px; }

  /* Meal lists */
  .meal-list { list-style: none; }
  .meal-item { padding: 10px 0; border-bottom: 1px solid #2a2a35; display: flex; align-items: flex-start; gap: 10px; }
  .meal-item:last-child { border-bottom: none; }
  .meal-type-badge {
    display: inline-block; min-width: 52px; text-align: center;
    padding: 2px 8px; border-radius: 4px; font-size: 0.75em; white-space: nowrap;
    background: #252535; color: #aaa;
  }
  .meal-type-badge.breakfast { background: #2a1f0a; color: #f0a030; }
  .meal-type-badge.lunch    { background: #0a2a1a; color: #30d080; }
  .meal-type-badge.dinner   { background: #1a0a2a; color: #c060f0; }
  .meal-type-badge.snack    { background: #1a1f0a; color: #a0c030; }
  .meal-foods { color: #ccc; font-size: 0.9em; flex: 1; }
  .meal-kcal { color: #f0a030; font-size: 0.85em; white-space: nowrap; }
  .empty-msg { color: #555; font-style: italic; padding: 10px 0; font-size: 0.9em; }

  /* Water bar */
  .water-bar-wrap { margin-top: 10px; }
  .water-bar-bg { background: #1a2a3a; border-radius: 8px; height: 18px; overflow: hidden; }
  .water-bar-fill { background: linear-gradient(90deg, #1890ff, #36cfc9); height: 100%; border-radius: 8px; transition: width 0.4s; }
  .water-bar-label { display: flex; justify-content: space-between; font-size: 0.8em; color: #666; margin-top: 5px; }

  /* Supplement alert */
  .supp-alert { background: #2d2a0f; border: 1px solid #5a5020; border-radius: 8px; padding: 10px 14px; margin-top: 10px; color: #f0d030; font-size: 0.88em; }

  /* Macro pie */
  .pie-container { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; margin-top: 8px; }
  .pie-legend { list-style: none; }
  .pie-legend li { padding: 5px 0; font-size: 0.88em; display: flex; align-items: center; gap: 8px; }
  .pie-dot { width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0; }

  /* Progress bars (month view) */
  .prog-bar-wrap { margin-top: 6px; }
  .prog-bar-bg { background: #252535; border-radius: 6px; height: 14px; overflow: hidden; }
  .prog-bar-fill { height: 100%; border-radius: 6px; }

  /* SVG charts */
  .chart-wrap { overflow-x: auto; }
  svg.chart { display: block; }

  /* Highlighted days */
  .supp-day { fill: #2a3a1a; }
  .no-supp-day { fill: #1a1a24; }

  /* Footer */
  .page-footer { color: #444; font-size: 0.78em; text-align: right; margin-top: 24px; padding-top: 12px; border-top: 1px solid #2a2a35; }
</style>
</head>
<body>

<a href="index.html" class="back-link">&#8592; 返回首页</a>
<h1>饮食营养详情</h1>
<p class="page-sub">热量摄入 · 三大营养素 · 饮水 · 补剂</p>

<!-- Profile bar -->
${bodyProfile.weight_kg ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">
  ${bodyProfile.height_cm ? `<span style="background:#1a1a24;border:1px solid #2a2a35;border-radius:6px;padding:4px 12px;font-size:0.82em">${bodyProfile.height_cm} cm</span>` : ''}
  <span style="background:#1a1a24;border:1px solid #2a2a35;border-radius:6px;padding:4px 12px;font-size:0.82em">${bodyProfile.weight_kg} kg</span>
  ${bodyProfile.body_fat_pct ? `<span style="background:#1a1a24;border:1px solid #2a2a35;border-radius:6px;padding:4px 12px;font-size:0.82em">体脂 ${bodyProfile.body_fat_pct}%</span>` : ''}
  ${goalLabel ? `<span style="background:#1a2a1a;border:1px solid #2a3a2a;border-radius:6px;padding:4px 12px;font-size:0.82em;color:#60c060">目标: ${goalLabel}</span>` : ''}
  <span style="background:#1a1a2a;border:1px solid #2a2a3a;border-radius:6px;padding:4px 12px;font-size:0.82em;color:#7bb3f0">蛋白目标: ${proteinTarget}g/天</span>
</div>` : ''}

<!-- Tabs -->
<div class="tabs">
  <div class="tab active" id="tab-day" onclick="switchView('day')">日视图</div>
  <div class="tab" id="tab-month" onclick="switchView('month')">月视图</div>
  <div class="tab" id="tab-year" onclick="switchView('year')">年视图</div>
</div>

<!-- Nav bar -->
<div class="nav-bar" id="nav-bar">
  <button onclick="navPrev()">&#8249;</button>
  <input type="date" id="dateInput" value="${today}">
  <button onclick="navNext()">&#8250;</button>
  <button class="today-btn" onclick="navToday()">今天</button>
</div>

<div id="content"></div>

<div class="page-footer">Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}</div>

<script>
// ── Embedded data ─────────────────────────────────────────────────────────────
const DAY_DATA = ${JSON.stringify(dayData)};
const DAILY_AGG = ${JSON.stringify(dailyAgg)};
const YEAR_MONTHLY_AVG = ${JSON.stringify(yearMonthlyAvg)};
const PROTEIN_TARGET = ${proteinTarget};
const WEIGHT_KG = ${weightKg};
const TODAY = '${today}';
const CURRENT_YEAR = ${currentYear};
const CURRENT_YM = '${currentYearMonth}';

// ── State ─────────────────────────────────────────────────────────────────────
let viewMode = 'day';
let currentDate = TODAY;
let currentYM = CURRENT_YM;
let currentYear = CURRENT_YEAR;

// ── Utilities ─────────────────────────────────────────────────────────────────
function datesInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const out = [];
  for (let i = 1; i <= days; i++) out.push(ym + '-' + String(i).padStart(2, '0'));
  return out;
}

function monthsInYear(y) {
  const out = [];
  for (let m = 1; m <= 12; m++) out.push(y + '-' + String(m).padStart(2, '0'));
  return out;
}

function fmtDate(d) {
  // d = YYYY-MM-DD
  const [y, m, dd] = d.split('-');
  return y + '年' + parseInt(m) + '月' + parseInt(dd) + '日';
}

function mealTypeLabel(t) {
  return { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '零食' }[t] || t;
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchView(mode) {
  viewMode = mode;
  ['day', 'month', 'year'].forEach(v => {
    document.getElementById('tab-' + v).className = 'tab' + (v === mode ? ' active' : '');
  });
  const nb = document.getElementById('nav-bar');
  if (mode === 'day') {
    nb.style.display = 'flex';
    document.getElementById('dateInput').type = 'date';
    document.getElementById('dateInput').value = currentDate;
    renderDay(currentDate);
  } else if (mode === 'month') {
    nb.style.display = 'flex';
    document.getElementById('dateInput').type = 'month';
    document.getElementById('dateInput').value = currentYM;
    renderMonth(currentYM);
  } else {
    nb.style.display = 'none';
    renderYear(currentYear);
  }
}

function navPrev() {
  if (viewMode === 'day') {
    const d = new Date(currentDate); d.setDate(d.getDate() - 1);
    currentDate = d.toISOString().slice(0, 10);
    document.getElementById('dateInput').value = currentDate;
    renderDay(currentDate);
  } else if (viewMode === 'month') {
    const [y, m] = currentYM.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    currentYM = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    document.getElementById('dateInput').value = currentYM;
    renderMonth(currentYM);
  }
}

function navNext() {
  if (viewMode === 'day') {
    const d = new Date(currentDate); d.setDate(d.getDate() + 1);
    currentDate = d.toISOString().slice(0, 10);
    document.getElementById('dateInput').value = currentDate;
    renderDay(currentDate);
  } else if (viewMode === 'month') {
    const [y, m] = currentYM.split('-').map(Number);
    const d = new Date(y, m, 1);
    currentYM = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    document.getElementById('dateInput').value = currentYM;
    renderMonth(currentYM);
  }
}

function navToday() {
  if (viewMode === 'day') {
    currentDate = TODAY;
    document.getElementById('dateInput').value = currentDate;
    renderDay(currentDate);
  } else if (viewMode === 'month') {
    currentYM = CURRENT_YM;
    document.getElementById('dateInput').value = currentYM;
    renderMonth(currentYM);
  } else {
    currentYear = CURRENT_YEAR;
    renderYear(currentYear);
  }
}

document.getElementById('dateInput').addEventListener('change', function() {
  if (viewMode === 'day') { currentDate = this.value; renderDay(currentDate); }
  else if (viewMode === 'month') { currentYM = this.value; renderMonth(currentYM); }
});

// ── Pie chart (SVG) ───────────────────────────────────────────────────────────
function drawPie(p, c, f) {
  const total = p + c + f;
  if (total === 0) return '<div class="empty-msg">暂无营养数据</div>';
  const r = 48, cx = 58, cy = 58;

  function arc(startFrac, endFrac, color) {
    if (endFrac - startFrac >= 0.999) {
      return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + color + '"/>';
    }
    const s = startFrac * 2 * Math.PI - Math.PI / 2;
    const e = endFrac * 2 * Math.PI - Math.PI / 2;
    const large = (endFrac - startFrac > 0.5) ? 1 : 0;
    const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
    const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
    return '<path d="M' + cx + ',' + cy + ' L' + x1.toFixed(2) + ',' + y1.toFixed(2)
      + ' A' + r + ',' + r + ' 0 ' + large + ',1 ' + x2.toFixed(2) + ',' + y2.toFixed(2) + ' Z" fill="' + color + '"/>';
  }

  const pp = p / total, cp = c / total;
  let svg = '<svg width="116" height="116" style="flex-shrink:0"><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#252535"/>';
  svg += arc(0, pp, '#ff6b6b');
  svg += arc(pp, pp + cp, '#ffd43b');
  svg += arc(pp + cp, 1, '#69db7c');
  // Inner circle for donut effect
  svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.55) + '" fill="#1a1a24"/>';
  svg += '</svg>';

  const pKcal = Math.round(p * 4), cKcal = Math.round(c * 4), fKcal = Math.round(f * 9);
  const totalKcalMacro = pKcal + cKcal + fKcal;
  return '<div class="pie-container">' + svg
    + '<ul class="pie-legend">'
    + '<li><span class="pie-dot" style="background:#ff6b6b"></span>蛋白质 ' + p.toFixed(1) + 'g &nbsp;<span style="color:#666">' + pKcal + 'kcal · ' + Math.round(pp * 100) + '%</span></li>'
    + '<li><span class="pie-dot" style="background:#ffd43b"></span>碳水化合物 ' + c.toFixed(1) + 'g &nbsp;<span style="color:#666">' + cKcal + 'kcal · ' + Math.round(cp * 100) + '%</span></li>'
    + '<li><span class="pie-dot" style="background:#69db7c"></span>脂肪 ' + f.toFixed(1) + 'g &nbsp;<span style="color:#666">' + fKcal + 'kcal · ' + Math.round((f / total) * 100) + '%</span></li>'
    + (totalKcalMacro > 0 ? '<li style="margin-top:6px;border-top:1px solid #2a2a35;padding-top:6px;color:#888">来自营养素 ' + totalKcalMacro + ' kcal</li>' : '')
    + '</ul></div>';
}

// ── Meal section builder ──────────────────────────────────────────────────────
function mealSection(meals, emptyMsg) {
  if (!meals || !meals.length) return '<li class="empty-msg">' + emptyMsg + '</li>';
  return meals.map(m => {
    const badge = mealTypeLabel(m.meal_type);
    const cls = m.meal_type || 'snack';
    return '<li class="meal-item">'
      + '<span class="meal-type-badge ' + cls + '">' + badge + '</span>'
      + '<span class="meal-foods">' + (m.foods || '（未记录食物）') + '</span>'
      + (m.kcal ? '<span class="meal-kcal">' + m.kcal + ' kcal</span>' : '')
      + '</li>';
  }).join('');
}

// ── Day view ──────────────────────────────────────────────────────────────────
function renderDay(date) {
  const d = DAY_DATA[date] || {
    regularMeals: [], supplements: [], drinks: [],
    macros: { protein: 0, carbs: 0, fat: 0 }, waterMl: 0, totalKcal: 0,
  };
  const waterPct = Math.min(100, Math.round((d.waterMl || 0) / 2500 * 100));
  const mc = d.macros || { protein: 0, carbs: 0, fat: 0 };

  let h = '';

  // Top stats row
  h += '<div class="grid3">';
  h += '<div class="card">'
    + '<div class="card-title"><span>🔥</span> 总热量</div>'
    + '<div class="stat-val">' + (d.totalKcal || 0) + '<small>kcal</small></div>'
    + '</div>';
  h += '<div class="card">'
    + '<div class="card-title"><span>💧</span> 饮水量</div>'
    + '<div class="stat-val">' + (d.waterMl || 0) + '<small>ml</small></div>'
    + '<div class="water-bar-wrap">'
    + '<div class="water-bar-bg"><div class="water-bar-fill" style="width:' + waterPct + '%"></div></div>'
    + '<div class="water-bar-label"><span>' + waterPct + '%</span><span>目标 2500ml</span></div>'
    + '</div>'
    + '</div>';
  h += '<div class="card">'
    + '<div class="card-title"><span>🥩</span> 蛋白质</div>'
    + '<div class="stat-val">' + mc.protein.toFixed(1) + '<small>g</small></div>'
    + '<div class="stat-sub">目标 ' + PROTEIN_TARGET + 'g'
    + (mc.protein > 0 ? '（' + Math.round(mc.protein / PROTEIN_TARGET * 100) + '%）' : '') + '</div>'
    + '</div>';
  h += '</div>';

  // Regular meals
  h += '<div class="card">'
    + '<div class="card-title"><span>🍽</span> 正餐</div>'
    + '<ul class="meal-list">' + mealSection(d.regularMeals, '今日暂无正餐记录') + '</ul>'
    + '</div>';

  // Drinks + Supplements
  h += '<div class="grid2">';
  h += '<div class="card">'
    + '<div class="card-title"><span>🧃</span> 饮品</div>'
    + '<ul class="meal-list">' + mealSection(d.drinks, '暂无') + '</ul>'
    + '</div>';
  h += '<div class="card">'
    + '<div class="card-title"><span>💊</span> 补剂</div>'
    + '<ul class="meal-list">' + mealSection(d.supplements, '暂无') + '</ul>'
    + ((!d.supplements || !d.supplements.length) ? '<div class="supp-alert">⚠️ 今日未摄入补剂，记得按时补充！</div>' : '')
    + '</div>';
  h += '</div>';

  // Macro pie
  h += '<div class="card">'
    + '<div class="card-title"><span>📊</span> 三大营养素比例</div>'
    + drawPie(mc.protein, mc.carbs, mc.fat)
    + '</div>';

  document.getElementById('content').innerHTML = h;
}

// ── Month view ────────────────────────────────────────────────────────────────
function renderMonth(ym) {
  const dates = datesInMonth(ym);
  const [y, m] = ym.split('-').map(Number);
  const monthLabel = y + '年' + m + '月';

  // Aggregate
  const calData = dates.map(d => (DAILY_AGG[d] || {}).totalKcal || 0);
  const proteinData = dates.map(d => (DAILY_AGG[d] || {}).protein || 0);
  const suppDays = dates.filter(d => (DAILY_AGG[d] || {}).hasSupp);
  const recordedDays = dates.filter(d => DAILY_AGG[d]);

  const avgKcal = recordedDays.length
    ? Math.round(recordedDays.reduce((s, d) => s + (DAILY_AGG[d].totalKcal || 0), 0) / recordedDays.length)
    : 0;
  const avgProtein = recordedDays.length
    ? (recordedDays.reduce((s, d) => s + (DAILY_AGG[d].protein || 0), 0) / recordedDays.length).toFixed(1)
    : 0;

  let h = '';

  // Month summary cards
  h += '<div class="grid3">';
  h += '<div class="card"><div class="card-title"><span>📆</span> 记录天数</div>'
    + '<div class="stat-val">' + recordedDays.length + '<small>/' + dates.length + '天</small></div></div>';
  h += '<div class="card"><div class="card-title"><span>🔥</span> 日均热量</div>'
    + '<div class="stat-val">' + (avgKcal || '--') + '<small>kcal</small></div></div>';
  h += '<div class="card"><div class="card-title"><span>🥩</span> 日均蛋白质</div>'
    + '<div class="stat-val">' + (avgProtein || '--') + '<small>g</small></div>'
    + '<div class="stat-sub">目标 ' + PROTEIN_TARGET + 'g'
    + (avgProtein > 0 ? '（' + Math.round(avgProtein / PROTEIN_TARGET * 100) + '%）' : '') + '</div>'
    + '</div>';
  h += '</div>';

  // Protein progress vs target
  h += '<div class="card"><div class="card-title"><span>🥩</span> 日均蛋白质 vs 目标</div>';
  const protPct = Math.min(100, Math.round(avgProtein / PROTEIN_TARGET * 100));
  const protColor = protPct >= 100 ? '#69db7c' : protPct >= 70 ? '#ffd43b' : '#ff6b6b';
  h += '<div style="margin-bottom:6px;font-size:0.88em;color:#aaa">'
    + avgProtein + 'g / ' + PROTEIN_TARGET + 'g 目标</div>';
  h += '<div class="prog-bar-wrap"><div class="prog-bar-bg"><div class="prog-bar-fill" style="width:' + protPct + '%;background:' + protColor + '"></div></div></div>';
  h += '<div style="font-size:0.82em;color:#666;margin-top:5px">' + protPct + '% 达成率</div></div>';

  // Supplement days highlight
  h += '<div class="card"><div class="card-title"><span>💊</span> 本月补剂摄入</div>';
  h += '<div style="font-size:0.88em;color:#aaa;margin-bottom:10px">'
    + suppDays.length + ' / ' + recordedDays.length + ' 个记录日有补剂记录</div>';
  // Mini calendar grid
  h += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;font-size:0.75em">';
  const weekdays = ['日','一','二','三','四','五','六'];
  weekdays.forEach(w => { h += '<div style="text-align:center;color:#555;padding:2px">' + w + '</div>'; });
  // leading blank cells
  const firstWeekday = new Date(y, m - 1, 1).getDay();
  for (let i = 0; i < firstWeekday; i++) h += '<div></div>';
  dates.forEach(date => {
    const dd = parseInt(date.split('-')[2]);
    const agg = DAILY_AGG[date];
    let bg = '#1a1a24', color = '#555', border = '1px solid #2a2a35';
    if (agg) {
      if (agg.hasSupp) { bg = '#1a3a1a'; color = '#60d060'; border = '1px solid #2a5a2a'; }
      else { bg = '#2a2a35'; color = '#aaa'; border = '1px solid #3a3a45'; }
    }
    h += '<div style="text-align:center;padding:4px 2px;border-radius:4px;background:' + bg + ';color:' + color + ';border:' + border + '">' + dd + '</div>';
  });
  h += '</div></div>';

  // Line chart: daily calories
  h += '<div class="card"><div class="card-title"><span>📈</span> 每日热量折线图</div>';
  h += drawLineChart(dates, calData, monthLabel);
  h += '</div>';

  document.getElementById('content').innerHTML = h;
}

function drawLineChart(dates, values, label) {
  const w = 840, h = 180, padL = 48, padR = 16, padT = 16, padB = 32;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const maxVal = Math.max(...values, 1);
  const n = dates.length;

  function xPos(i) { return padL + (i / (n - 1 || 1)) * innerW; }
  function yPos(v) { return padT + (1 - v / maxVal) * innerH; }

  // Grid lines
  let svg = '<div class="chart-wrap"><svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;max-width:' + w + 'px;height:auto">';
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const gy = padT + (i / gridLines) * innerH;
    const gv = Math.round(maxVal * (1 - i / gridLines));
    svg += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (w - padR) + '" y2="' + gy.toFixed(1) + '" stroke="#2a2a35" stroke-width="1"/>';
    svg += '<text x="' + (padL - 6) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end" font-size="10" fill="#555">' + gv + '</text>';
  }

  // Area fill
  if (n > 1) {
    let areaPath = 'M' + xPos(0).toFixed(1) + ',' + padT + innerH;
    values.forEach((v, i) => { areaPath += ' L' + xPos(i).toFixed(1) + ',' + yPos(v).toFixed(1); });
    areaPath += ' L' + xPos(n - 1).toFixed(1) + ',' + (padT + innerH) + ' Z';
    svg += '<path d="' + areaPath + '" fill="url(#lineGrad)" opacity="0.3"/>';
    svg += '<defs><linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7bb3f0"/><stop offset="100%" stop-color="#7bb3f0" stop-opacity="0"/></linearGradient></defs>';

    // Line
    let linePath = '';
    values.forEach((v, i) => {
      linePath += (i === 0 ? 'M' : 'L') + xPos(i).toFixed(1) + ',' + yPos(v).toFixed(1) + ' ';
    });
    svg += '<path d="' + linePath + '" fill="none" stroke="#7bb3f0" stroke-width="2"/>';
  }

  // Dots and x-axis labels
  const showLabel = n <= 31;
  values.forEach((v, i) => {
    const x = xPos(i), y = yPos(v);
    if (v > 0) svg += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3" fill="#7bb3f0"/>';
    if (showLabel && (n <= 15 || i % 3 === 0)) {
      svg += '<text x="' + x.toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle" font-size="9" fill="#555">' + parseInt(dates[i].split('-')[2]) + '</text>';
    }
  });

  svg += '</svg></div>';
  return svg;
}

// ── Year view ─────────────────────────────────────────────────────────────────
function renderYear(year) {
  const months = monthsInYear(String(year));
  const avgKcals = months.map(ym => (YEAR_MONTHLY_AVG[ym] || {}).avgKcal || 0);
  const days = months.map(ym => (YEAR_MONTHLY_AVG[ym] || {}).days || 0);

  const maxKcal = Math.max(...avgKcals, 1);
  const monthLabels = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

  let h = '<div class="card"><div class="card-title"><span>📊</span> ' + year + '年 月均热量摄入</div>';

  // Bar chart
  const cw = 840, ch = 220, padL = 52, padR = 16, padT = 20, padB = 36;
  const innerW = cw - padL - padR;
  const innerH = ch - padT - padB;
  const barW = Math.floor(innerW / 12 * 0.6);
  const barGap = innerW / 12;

  let svg = '<div class="chart-wrap"><svg class="chart" viewBox="0 0 ' + cw + ' ' + ch + '" style="width:100%;max-width:' + cw + 'px;height:auto">';

  // Grid lines
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const gy = padT + (i / gridLines) * innerH;
    const gv = Math.round(maxKcal * (1 - i / gridLines));
    svg += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (cw - padR) + '" y2="' + gy.toFixed(1) + '" stroke="#2a2a35" stroke-width="1"/>';
    svg += '<text x="' + (padL - 6) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end" font-size="10" fill="#555">' + gv + '</text>';
  }

  // Bars
  avgKcals.forEach((v, i) => {
    const x = padL + i * barGap + (barGap - barW) / 2;
    const barH = v > 0 ? (v / maxKcal) * innerH : 0;
    const y = padT + innerH - barH;
    const hasData = days[i] > 0;
    const color = hasData ? '#7bb3f0' : '#2a2a35';
    svg += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW + '" height="' + barH.toFixed(1) + '" rx="3" fill="' + color + '"/>';
    if (v > 0) {
      svg += '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" text-anchor="middle" font-size="9" fill="#7bb3f0">' + v + '</text>';
    }
    svg += '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (ch - 8) + '" text-anchor="middle" font-size="10" fill="#666">' + monthLabels[i] + '</text>';
    if (hasData) {
      svg += '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (ch - 20) + '" text-anchor="middle" font-size="8" fill="#444">' + days[i] + '天</text>';
    }
  });

  svg += '</svg></div>';
  h += svg + '</div>';

  // Year summary table
  h += '<div class="card"><div class="card-title"><span>📋</span> 月度明细</div>';
  h += '<table style="width:100%;border-collapse:collapse;font-size:0.88em">';
  h += '<thead><tr style="color:#555;border-bottom:1px solid #2a2a35">'
    + '<th style="text-align:left;padding:6px 8px">月份</th>'
    + '<th style="text-align:right;padding:6px 8px">记录天数</th>'
    + '<th style="text-align:right;padding:6px 8px">日均热量</th>'
    + '</tr></thead><tbody>';
  months.forEach((ym, i) => {
    const d = days[i];
    const v = avgKcals[i];
    const [yr, mo] = ym.split('-');
    const barPct = maxKcal > 0 ? Math.round(v / maxKcal * 100) : 0;
    h += '<tr style="border-bottom:1px solid #1a1a24">'
      + '<td style="padding:8px 8px;color:#ccc">' + parseInt(mo) + '月</td>'
      + '<td style="text-align:right;padding:8px;color:#888">' + (d > 0 ? d + '天' : '--') + '</td>'
      + '<td style="text-align:right;padding:8px">'
      + (v > 0 ? '<span style="color:#7bb3f0">' + v + ' kcal</span>' : '<span style="color:#333">--</span>')
      + '</td>'
      + '</tr>';
  });
  h += '</tbody></table></div>';

  document.getElementById('content').innerHTML = h;
}

// ── Init ──────────────────────────────────────────────────────────────────────
renderDay(currentDate);
</script>
</body>
</html>`;

fs.writeFileSync(OUT, html);
console.log('Diet page generated → ' + OUT);
