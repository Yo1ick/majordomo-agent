#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');

const DB = '/Volumes/External HD/gitcode/personal-butler/data/butler.db';
const OUT = '/Volumes/External HD/.openclaw/canvas/butler/fitness.html';

function q(sql) {
  try {
    const escaped = sql.replace(/"/g, '\\"');
    const raw = execSync(`sqlite3 -json "${DB}" "${escaped}"`, { encoding: 'utf8' }).trim();
    return raw && raw !== '[]' ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

// ── Collect body profile ──────────────────────────────────────────────────────
const bodyProfile = q(`SELECT * FROM user_body_profile WHERE user_id = 'default'`)[0] || null;

// ── Collect last 365 days of exercise data ────────────────────────────────────
const exerciseAll = q(`
  SELECT date, exercise_type, duration_minutes, calories_burned, distance_km
  FROM exercise_logs
  WHERE deleted_at IS NULL
  ORDER BY date DESC
`);

// ── Collect last 365 days of sleep data ──────────────────────────────────────
const sleepAll = q(`
  SELECT date, sleep_start, sleep_end, duration_min, deep_sleep_min, rem_sleep_min, score
  FROM sleep_logs
  WHERE deleted_at IS NULL
  ORDER BY date DESC
`);

// ── Pre-aggregate by date ─────────────────────────────────────────────────────
const exerciseByDate = {};
for (const r of exerciseAll) {
  if (!exerciseByDate[r.date]) exerciseByDate[r.date] = [];
  exerciseByDate[r.date].push(r);
}

const sleepByDate = {};
for (const r of sleepAll) {
  if (!sleepByDate[r.date]) sleepByDate[r.date] = [];
  sleepByDate[r.date].push(r);
}

// ── Aggregate by month ────────────────────────────────────────────────────────
const exerciseByMonth = {};
for (const r of exerciseAll) {
  const month = r.date.slice(0, 7);
  if (!exerciseByMonth[month]) {
    exerciseByMonth[month] = { totalMinutes: 0, totalCalories: 0, count: 0, types: {} };
  }
  exerciseByMonth[month].totalMinutes += r.duration_minutes || 0;
  exerciseByMonth[month].totalCalories += r.calories_burned || 0;
  exerciseByMonth[month].count += 1;
  const t = r.exercise_type || 'other';
  exerciseByMonth[month].types[t] = (exerciseByMonth[month].types[t] || 0) + 1;
}

const sleepByMonth = {};
for (const r of sleepAll) {
  const month = r.date.slice(0, 7);
  if (!sleepByMonth[month]) sleepByMonth[month] = { totalMin: 0, count: 0 };
  sleepByMonth[month].totalMin += r.duration_min || 0;
  sleepByMonth[month].count += 1;
}

// ── Generated timestamp ───────────────────────────────────────────────────────
const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

// ── Build the HTML ────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>健身详情 · Personal Butler</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'PingFang SC', sans-serif; background: #0f0f13; color: #e0e0e0; padding: 20px; max-width: 960px; margin: 0 auto; }

  /* ── Navigation ── */
  .back-link { display: inline-flex; align-items: center; gap: 8px; color: #888; text-decoration: none; font-size: 0.9em; margin-bottom: 20px; padding: 6px 12px; background: #1a1a24; border: 1px solid #2a2a35; border-radius: 8px; }
  .back-link:hover { color: #ccc; background: #2a2a35; }
  h1 { font-size: 1.5em; color: #fff; margin-bottom: 4px; }
  .page-sub { color: #666; font-size: 0.9em; margin-bottom: 20px; }

  /* ── View mode tabs ── */
  .view-tabs { display: flex; gap: 8px; margin-bottom: 24px; }
  .view-tab { padding: 8px 20px; border-radius: 8px; border: 1px solid #2a2a35; background: #1a1a24; color: #888; cursor: pointer; font-size: 0.9em; transition: all 0.2s; }
  .view-tab.active { background: #2d4a2d; border-color: #3a6b3a; color: #6cdb6c; }
  .view-tab:hover:not(.active) { background: #2a2a35; color: #ccc; }

  /* ── Date navigation ── */
  .date-nav { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
  .date-nav button { background: #2a2a35; border: 1px solid #3a3a45; color: #ccc; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 14px; }
  .date-nav button:hover { background: #3a3a45; }
  .date-nav input { background: #1a1a24; border: 1px solid #3a3a45; color: #fff; padding: 6px 12px; border-radius: 6px; font-size: 14px; }
  .date-nav .date-label { color: #ccc; font-size: 1em; font-weight: 600; min-width: 120px; text-align: center; }

  /* ── Cards ── */
  .card { background: #1a1a24; border-radius: 12px; padding: 16px; border: 1px solid #2a2a35; }
  .card-title { font-size: 0.9em; color: #888; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .grid { display: grid; gap: 16px; margin-bottom: 16px; }
  .grid-2 { grid-template-columns: 1fr 1fr; }
  .grid-3 { grid-template-columns: 1fr 1fr 1fr; }
  .grid-full { grid-column: 1 / -1; }
  @media (max-width: 640px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }

  /* ── Stat numbers ── */
  .big-stat { font-size: 2.2em; font-weight: 700; color: #fff; }
  .big-stat small { font-size: 0.4em; color: #666; margin-left: 4px; }
  .mid-stat { font-size: 1.5em; font-weight: 700; color: #fff; }
  .stat-sub { color: #666; font-size: 0.82em; margin-top: 4px; }

  /* ── Lists ── */
  .item-list { list-style: none; }
  .item-list li { padding: 10px 0; border-bottom: 1px solid #2a2a35; display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .item-list li:last-child { border-bottom: none; }
  .item-label { color: #ccc; }
  .item-value { color: #fff; font-weight: 600; }
  .item-sub { color: #666; font-size: 0.82em; }
  .empty-state { color: #555; font-style: italic; padding: 16px 0; text-align: center; }

  /* ── Exercise type tags ── */
  .ex-tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.78em; font-weight: 600; }
  .ex-running    { background: #2d1a0f; color: #f07030; }
  .ex-cycling    { background: #1a2d0f; color: #70c030; }
  .ex-swimming   { background: #0f1a2d; color: #3090f0; }
  .ex-gym        { background: #2d0f2d; color: #c030f0; }
  .ex-walk       { background: #1a2a1a; color: #60b060; }
  .ex-other      { background: #2a2a2a; color: #888; }

  /* ── Calendar heatmap ── */
  .heatmap-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-top: 8px; }
  .heatmap-header { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 4px; }
  .heatmap-header span { text-align: center; font-size: 0.72em; color: #666; }
  .heat-cell { aspect-ratio: 1; border-radius: 4px; background: #1a1a24; border: 1px solid #2a2a35; position: relative; cursor: default; }
  .heat-0 { background: #1a1a24; }
  .heat-1 { background: #1a3320; }
  .heat-2 { background: #1d5228; }
  .heat-3 { background: #22702f; }
  .heat-4 { background: #28a038; }
  .heat-day-label { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); font-size: 0.65em; color: #666; pointer-events: none; }
  .heat-today { border-color: #6cdb6c !important; }

  /* ── SVG charts ── */
  .chart-wrap { width: 100%; overflow: hidden; }
  svg text { font-family: -apple-system, 'PingFang SC', sans-serif; }

  /* ── Sleep score badge ── */
  .sleep-score { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 50%; font-weight: 700; font-size: 1em; }
  .score-good  { background: #1a3320; color: #6cdb6c; }
  .score-ok    { background: #2d2a0f; color: #f0c030; }
  .score-poor  { background: #2d1a0f; color: #f07030; }

  /* ── Body profile pills ── */
  .profile-pills { display: flex; gap: 10px; flex-wrap: wrap; }
  .profile-pill { background: #2a2a35; padding: 6px 14px; border-radius: 20px; font-size: 0.85em; color: #ccc; }
  .profile-pill strong { color: #fff; }

  /* ── Footer ── */
  .footer { color: #444; font-size: 0.75em; text-align: right; margin-top: 24px; }

  /* ── Pie chart ── */
  .pie-wrap { display: flex; align-items: center; gap: 20px; margin-top: 8px; flex-wrap: wrap; }
  .pie-legend { list-style: none; }
  .pie-legend li { padding: 4px 0; font-size: 0.88em; display: flex; align-items: center; gap: 8px; color: #ccc; }
  .pie-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }

  /* ── Month stats bar ── */
  .month-stats { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 16px; }
  .month-stat-item { display: flex; flex-direction: column; }
  .month-stat-label { color: #666; font-size: 0.78em; margin-bottom: 2px; }
  .month-stat-value { color: #fff; font-size: 1.4em; font-weight: 700; }
  .month-stat-unit { color: #666; font-size: 0.7em; margin-left: 2px; }

  /* ── Tooltip ── */
  .tooltip { display: none; position: fixed; background: #2a2a35; border: 1px solid #3a3a45; border-radius: 8px; padding: 8px 12px; font-size: 0.82em; color: #ddd; pointer-events: none; z-index: 999; }
</style>
</head>
<body>

<a class="back-link" href="index.html">← 返回主页</a>
<h1>健身详情</h1>
<p class="page-sub">运动记录 · 睡眠分析 · 身体数据</p>

<div class="view-tabs">
  <button class="view-tab active" onclick="switchView('day')" id="tab-day">日视图</button>
  <button class="view-tab" onclick="switchView('month')" id="tab-month">月视图</button>
  <button class="view-tab" onclick="switchView('year')" id="tab-year">年视图</button>
</div>

<!-- ══════════════════════ DAY VIEW ══════════════════════ -->
<div id="view-day">
  <div class="date-nav">
    <button onclick="dayNav(-1)">&#8249;</button>
    <input type="date" id="day-input" onchange="renderDay(this.value)">
    <button onclick="dayNav(1)">&#8250;</button>
    <button onclick="renderDay(todayStr())">今天</button>
  </div>

  <div id="day-content"></div>
</div>

<!-- ══════════════════════ MONTH VIEW ══════════════════════ -->
<div id="view-month" style="display:none">
  <div class="date-nav">
    <button onclick="monthNav(-1)">&#8249;</button>
    <span class="date-label" id="month-label"></span>
    <button onclick="monthNav(1)">&#8250;</button>
  </div>

  <div id="month-content"></div>
</div>

<!-- ══════════════════════ YEAR VIEW ══════════════════════ -->
<div id="view-year" style="display:none">
  <div class="date-nav">
    <button onclick="yearNav(-1)">&#8249;</button>
    <span class="date-label" id="year-label"></span>
    <button onclick="yearNav(1)">&#8250;</button>
  </div>

  <div id="year-content"></div>
</div>

<div class="tooltip" id="tooltip"></div>
<div class="footer">Generated: ${generatedAt}</div>

<script>
// ── Embedded data ─────────────────────────────────────────────────────────────
const EXERCISE_BY_DATE  = ${JSON.stringify(exerciseByDate)};
const SLEEP_BY_DATE     = ${JSON.stringify(sleepByDate)};
const EXERCISE_BY_MONTH = ${JSON.stringify(exerciseByMonth)};
const SLEEP_BY_MONTH    = ${JSON.stringify(sleepByMonth)};
const BODY_PROFILE      = ${JSON.stringify(bodyProfile)};

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }
function fmtHM(min) {
  if (!min) return '--';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? h + '时' + (m ? m + '分' : '') : m + '分';
}
function fmtTime(t) {
  if (!t) return '';
  return t.length >= 16 ? t.slice(11, 16) : t.slice(0, 5);
}

const EX_LABELS = { running:'跑步', cycling:'骑行', swimming:'游泳', gym:'健身房', walk:'步行', other:'其他' };
const EX_COLORS = { running:'#f07030', cycling:'#70c030', swimming:'#3090f0', gym:'#c030f0', walk:'#60b060', other:'#888888' };

function exLabel(t) { return EX_LABELS[t] || t; }
function exColor(t) { return EX_COLORS[t] || '#888'; }
function exClass(t) { return 'ex-' + (EX_LABELS[t] ? t : 'other'); }

function scoreClass(s) {
  if (!s) return '';
  if (s >= 80) return 'score-good';
  if (s >= 60) return 'score-ok';
  return 'score-poor';
}

const GOAL_LABELS = { lose_fat:'减脂', build_muscle:'增肌', maintain:'维持', endurance:'耐力训练' };
const ACTIVITY_LABELS = { sedentary:'久坐', light:'轻量', moderate:'中等', active:'活跃', very_active:'高强度' };

// ── Current state ─────────────────────────────────────────────────────────────
let currentDay   = todayStr();
let currentMonth = todayStr().slice(0, 7);
let currentYear  = new Date().getFullYear();

// ── View switcher ─────────────────────────────────────────────────────────────
function switchView(v) {
  ['day', 'month', 'year'].forEach(name => {
    document.getElementById('view-' + name).style.display = v === name ? '' : 'none';
    document.getElementById('tab-' + name).classList.toggle('active', v === name);
  });
  if (v === 'day')   renderDay(currentDay);
  if (v === 'month') renderMonth(currentMonth);
  if (v === 'year')  renderYear(currentYear);
}

// ═══════════════════════════════════════════════════════════════════════════════
// DAY VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function dayNav(d) {
  const dt = new Date(currentDay + 'T12:00:00');
  dt.setDate(dt.getDate() + d);
  renderDay(dt.toISOString().slice(0, 10));
}

function renderDay(date) {
  currentDay = date;
  document.getElementById('day-input').value = date;

  const exercises = EXERCISE_BY_DATE[date] || [];
  const sleepArr  = SLEEP_BY_DATE[date] || [];
  const sleep     = sleepArr[0] || null;

  let totalMin = 0, totalCal = 0, totalDist = 0;
  exercises.forEach(e => {
    totalMin  += e.duration_minutes || 0;
    totalCal  += e.calories_burned  || 0;
    totalDist += e.distance_km      || 0;
  });

  let h = '';

  // Top stats
  h += '<div class="grid grid-3" style="margin-bottom:16px">';
  h += '<div class="card"><div class="card-title">运动时长</div><div class="big-stat">' + (totalMin ? fmtHM(totalMin) : '--') + '</div></div>';
  h += '<div class="card"><div class="card-title">消耗热量</div><div class="big-stat">' + (totalCal || '--') + '<small>' + (totalCal ? 'kcal' : '') + '</small></div></div>';
  h += '<div class="card"><div class="card-title">运动距离</div><div class="big-stat">' + (totalDist ? totalDist.toFixed(1) : '--') + '<small>' + (totalDist ? 'km' : '') + '</small></div></div>';
  h += '</div>';

  // Exercise list
  h += '<div class="grid" style="margin-bottom:16px"><div class="card">';
  h += '<div class="card-title">🏃 运动记录</div>';
  if (exercises.length) {
    h += '<ul class="item-list">';
    exercises.forEach(e => {
      h += '<li>';
      h += '<div><span class="ex-tag ' + exClass(e.exercise_type) + '">' + exLabel(e.exercise_type) + '</span></div>';
      h += '<div style="flex:1;text-align:center"><span class="item-label">' + (e.duration_minutes || '--') + ' 分钟</span>';
      if (e.distance_km) h += '<span class="item-sub" style="margin-left:8px">' + e.distance_km + ' km</span>';
      h += '</div>';
      h += '<div class="item-value" style="color:#f07030">' + (e.calories_burned || '--') + '<span style="color:#666;font-weight:400;font-size:0.8em"> kcal</span></div>';
      h += '</li>';
    });
    h += '</ul>';
  } else {
    h += '<div class="empty-state">今日暂无运动记录</div>';
  }
  h += '</div></div>';

  // Sleep card
  h += '<div class="grid grid-2" style="margin-bottom:16px">';
  h += '<div class="card"><div class="card-title">😴 睡眠</div>';
  if (sleep) {
    const hh = Math.floor((sleep.duration_min || 0) / 60);
    const mm = (sleep.duration_min || 0) % 60;
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">';
    h += '<div class="mid-stat">' + (sleep.duration_min ? hh + '时' + (mm ? mm + '分' : '') : '--') + '</div>';
    if (sleep.score) h += '<div class="sleep-score ' + scoreClass(sleep.score) + '">' + sleep.score + '</div>';
    h += '</div>';
    if (sleep.sleep_start || sleep.sleep_end) {
      h += '<div class="stat-sub">';
      if (sleep.sleep_start) h += '入睡 ' + fmtTime(sleep.sleep_start);
      if (sleep.sleep_end)   h += '　起床 ' + fmtTime(sleep.sleep_end);
      h += '</div>';
    }
    if (sleep.deep_sleep_min || sleep.rem_sleep_min) {
      h += '<div class="stat-sub" style="margin-top:6px">';
      if (sleep.deep_sleep_min) h += '深睡 ' + fmtHM(sleep.deep_sleep_min) + '　';
      if (sleep.rem_sleep_min)  h += 'REM ' + fmtHM(sleep.rem_sleep_min);
      h += '</div>';
    }
  } else {
    h += '<div class="empty-state">今日暂无睡眠记录</div>';
  }
  h += '</div>';

  // Body profile card
  h += '<div class="card"><div class="card-title">🧬 身体档案</div>';
  if (BODY_PROFILE) {
    const bp = BODY_PROFILE;
    h += '<div class="profile-pills">';
    if (bp.height_cm)    h += '<div class="profile-pill"><strong>' + bp.height_cm + '</strong> cm</div>';
    if (bp.weight_kg)    h += '<div class="profile-pill"><strong>' + bp.weight_kg + '</strong> kg</div>';
    if (bp.body_fat_pct) h += '<div class="profile-pill">体脂 <strong>' + bp.body_fat_pct + '</strong>%</div>';
    if (bp.training_goal)  h += '<div class="profile-pill">目标 <strong>' + (GOAL_LABELS[bp.training_goal] || bp.training_goal) + '</strong></div>';
    if (bp.activity_level) h += '<div class="profile-pill">活动量 <strong>' + (ACTIVITY_LABELS[bp.activity_level] || bp.activity_level) + '</strong></div>';
    h += '</div>';
  } else {
    h += '<div class="empty-state">暂无档案数据</div>';
  }
  h += '</div>';
  h += '</div>';

  document.getElementById('day-content').innerHTML = h;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MONTH VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function monthNav(d) {
  const [y, m] = currentMonth.split('-').map(Number);
  let nm = m + d, ny = y;
  if (nm > 12) { nm = 1; ny++; }
  if (nm < 1)  { nm = 12; ny--; }
  renderMonth(ny + '-' + String(nm).padStart(2, '0'));
}

function renderMonth(ym) {
  currentMonth = ym;
  const [year, mon] = ym.split('-').map(Number);
  document.getElementById('month-label').textContent = year + '年' + mon + '月';

  const exMonth = EXERCISE_BY_MONTH[ym] || { totalMinutes: 0, totalCalories: 0, count: 0, types: {} };
  const slMonth = SLEEP_BY_MONTH[ym]    || { totalMin: 0, count: 0 };

  let h = '';

  // Month stats bar
  h += '<div class="card" style="margin-bottom:16px"><div class="card-title">本月汇总</div>';
  h += '<div class="month-stats">';
  h += '<div class="month-stat-item"><div class="month-stat-label">运动次数</div><div class="month-stat-value">' + exMonth.count + '<span class="month-stat-unit">次</span></div></div>';
  h += '<div class="month-stat-item"><div class="month-stat-label">运动时长</div><div class="month-stat-value">' + Math.round(exMonth.totalMinutes / 60 * 10) / 10 + '<span class="month-stat-unit">h</span></div></div>';
  h += '<div class="month-stat-item"><div class="month-stat-label">总消耗</div><div class="month-stat-value">' + exMonth.totalCalories + '<span class="month-stat-unit">kcal</span></div></div>';
  h += '<div class="month-stat-item"><div class="month-stat-label">平均睡眠</div><div class="month-stat-value">' + (slMonth.count ? Math.round(slMonth.totalMin / slMonth.count / 60 * 10) / 10 : '--') + '<span class="month-stat-unit">h</span></div></div>';
  h += '</div></div>';

  // Calendar heatmap
  h += '<div class="card" style="margin-bottom:16px">';
  h += '<div class="card-title">🗓 运动日历</div>';
  h += buildCalendarHeatmap(year, mon);
  h += '</div>';

  // Sleep trend + pie side by side
  h += '<div class="grid grid-2" style="margin-bottom:16px">';

  // Sleep trend SVG
  h += '<div class="card"><div class="card-title">😴 本月睡眠时长趋势</div>';
  h += buildSleepTrendSVG(year, mon);
  h += '</div>';

  // Exercise type pie
  h += '<div class="card"><div class="card-title">🏋️ 运动类型分布</div>';
  h += buildExPieSVG(exMonth.types);
  h += '</div>';

  h += '</div>';

  document.getElementById('month-content').innerHTML = h;
}

function buildCalendarHeatmap(year, mon) {
  const today = todayStr();
  const daysInMonth = new Date(year, mon, 0).getDate();
  const firstDay = new Date(year, mon - 1, 1).getDay(); // 0=Sun

  // Find max activity for relative coloring
  let maxMin = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = year + '-' + String(mon).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const exs = EXERCISE_BY_DATE[dt] || [];
    const mins = exs.reduce((s, e) => s + (e.duration_minutes || 0), 0);
    if (mins > maxMin) maxMin = mins;
  }
  if (maxMin === 0) maxMin = 60;

  let out = '<div class="heatmap-header">';
  ['日','一','二','三','四','五','六'].forEach(d => { out += '<span>' + d + '</span>'; });
  out += '</div><div class="heatmap-grid">';

  // Padding cells before first day
  for (let i = 0; i < firstDay; i++) {
    out += '<div class="heat-cell" style="background:transparent;border-color:transparent"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dt = year + '-' + String(mon).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const exs = EXERCISE_BY_DATE[dt] || [];
    const mins = exs.reduce((s, e) => s + (e.duration_minutes || 0), 0);
    const level = mins === 0 ? 0 : mins < maxMin * 0.25 ? 1 : mins < maxMin * 0.5 ? 2 : mins < maxMin * 0.75 ? 3 : 4;
    const isToday = dt === today;
    const types = exs.map(e => exLabel(e.exercise_type)).join(', ') || '无记录';
    const tip = d + '日: ' + (mins ? fmtHM(mins) + ' ' + types : '无记录');
    out += '<div class="heat-cell heat-' + level + (isToday ? ' heat-today' : '') + '" title="' + tip + '">';
    out += '<span class="heat-day-label">' + d + '</span>';
    out += '</div>';
  }

  out += '</div>';
  return out;
}

function buildSleepTrendSVG(year, mon) {
  const daysInMonth = new Date(year, mon, 0).getDate();
  const W = 280, H = 100, PAD = { top: 12, right: 12, bottom: 20, left: 28 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const points = [];
  let hasData = false;
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = year + '-' + String(mon).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const sl = SLEEP_BY_DATE[dt];
    const min = sl && sl[0] ? (sl[0].duration_min || 0) : 0;
    if (min > 0) hasData = true;
    points.push(min / 60);
  }

  if (!hasData) {
    return '<div class="empty-state" style="height:80px;display:flex;align-items:center;justify-content:center">暂无数据</div>';
  }

  const maxH = Math.max(...points, 10);
  const minH = 0;

  const toX = i => PAD.left + (i / (daysInMonth - 1)) * chartW;
  const toY = v => PAD.top + chartH - ((v - minH) / (maxH - minH)) * chartH;

  const nonZero = points.filter(v => v > 0);
  const avgH = nonZero.length ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;

  let path = '';
  let first = true;
  for (let i = 0; i < daysInMonth; i++) {
    if (points[i] > 0) {
      path += (first ? 'M' : 'L') + toX(i).toFixed(1) + ',' + toY(points[i]).toFixed(1) + ' ';
      first = false;
    }
  }

  const yAvg = toY(avgH).toFixed(1);

  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart-wrap">';
  // Grid lines
  svg += '<line x1="' + PAD.left + '" y1="' + PAD.top + '" x2="' + PAD.left + '" y2="' + (PAD.top + chartH) + '" stroke="#2a2a35" stroke-width="1"/>';
  svg += '<line x1="' + PAD.left + '" y1="' + (PAD.top + chartH) + '" x2="' + (PAD.left + chartW) + '" y2="' + (PAD.top + chartH) + '" stroke="#2a2a35" stroke-width="1"/>';
  // Avg line
  svg += '<line x1="' + PAD.left + '" y1="' + yAvg + '" x2="' + (PAD.left + chartW) + '" y2="' + yAvg + '" stroke="#3a5a3a" stroke-width="1" stroke-dasharray="4,3"/>';
  svg += '<text x="' + (PAD.left + chartW + 2) + '" y="' + (parseFloat(yAvg) + 4) + '" font-size="9" fill="#555">' + avgH.toFixed(1) + 'h</text>';
  // Y labels
  svg += '<text x="' + (PAD.left - 4) + '" y="' + (PAD.top + 4) + '" text-anchor="end" font-size="9" fill="#555">' + Math.round(maxH) + 'h</text>';
  // Line
  if (path) {
    svg += '<path d="' + path.trim() + '" fill="none" stroke="#3090f0" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    // Dots
    for (let i = 0; i < daysInMonth; i++) {
      if (points[i] > 0) {
        svg += '<circle cx="' + toX(i).toFixed(1) + '" cy="' + toY(points[i]).toFixed(1) + '" r="2.5" fill="#3090f0"/>';
      }
    }
  }
  // X label: 1st and last day
  svg += '<text x="' + PAD.left + '" y="' + (H - 4) + '" text-anchor="middle" font-size="9" fill="#555">1</text>';
  svg += '<text x="' + (PAD.left + chartW) + '" y="' + (H - 4) + '" text-anchor="middle" font-size="9" fill="#555">' + daysInMonth + '</text>';

  svg += '</svg>';
  return svg;
}

function buildExPieSVG(types) {
  const entries = Object.entries(types);
  if (!entries.length) return '<div class="empty-state">暂无运动记录</div>';

  const total = entries.reduce((s, [, v]) => s + v, 0);
  const CX = 55, CY = 55, R = 45;

  let svgPaths = '';
  let startAngle = -Math.PI / 2;
  entries.forEach(([type, count]) => {
    const frac = count / total;
    const endAngle = startAngle + frac * 2 * Math.PI;
    if (frac >= 1) {
      svgPaths += '<circle cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="' + exColor(type) + '"/>';
    } else {
      const x1 = CX + R * Math.cos(startAngle);
      const y1 = CY + R * Math.sin(startAngle);
      const x2 = CX + R * Math.cos(endAngle);
      const y2 = CY + R * Math.sin(endAngle);
      const large = frac > 0.5 ? 1 : 0;
      svgPaths += '<path d="M' + CX + ',' + CY + ' L' + x1.toFixed(2) + ',' + y1.toFixed(2)
        + ' A' + R + ',' + R + ' 0 ' + large + ',1 ' + x2.toFixed(2) + ',' + y2.toFixed(2)
        + ' Z" fill="' + exColor(type) + '"/>';
    }
    startAngle = endAngle;
  });

  let legend = '';
  entries.forEach(([type, count]) => {
    const pct = Math.round(count / total * 100);
    legend += '<li><span class="pie-dot" style="background:' + exColor(type) + '"></span>'
      + exLabel(type) + ' <span style="color:#888">' + count + '次 ' + pct + '%</span></li>';
  });

  return '<div class="pie-wrap">'
    + '<svg viewBox="0 0 110 110" width="110" height="110">' + svgPaths + '</svg>'
    + '<ul class="pie-legend">' + legend + '</ul></div>';
}

// ═══════════════════════════════════════════════════════════════════════════════
// YEAR VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function yearNav(d) {
  renderYear(currentYear + d);
}

function renderYear(year) {
  currentYear = year;
  document.getElementById('year-label').textContent = year + '年';

  let h = '';

  // Monthly exercise hours bar chart
  h += '<div class="card" style="margin-bottom:16px">';
  h += '<div class="card-title">🏃 月度运动时长 (小时)</div>';
  h += buildYearExerciseBarSVG(year);
  h += '</div>';

  // Monthly avg sleep line chart
  h += '<div class="card" style="margin-bottom:16px">';
  h += '<div class="card-title">😴 月度平均睡眠时长 (小时)</div>';
  h += buildYearSleepLineSVG(year);
  h += '</div>';

  document.getElementById('year-content').innerHTML = h;
}

function buildYearExerciseBarSVG(year) {
  const months = Array.from({length: 12}, (_, i) => {
    const ym = year + '-' + String(i + 1).padStart(2, '0');
    const em = EXERCISE_BY_MONTH[ym];
    return em ? Math.round(em.totalMinutes / 60 * 10) / 10 : 0;
  });

  const W = 560, H = 160;
  const PAD = { top: 16, right: 16, bottom: 28, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const maxVal = Math.max(...months, 1);
  const barW = chartW / 12;

  const MON = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart-wrap">';
  // Axes
  svg += '<line x1="' + PAD.left + '" y1="' + PAD.top + '" x2="' + PAD.left + '" y2="' + (PAD.top + chartH) + '" stroke="#2a2a35" stroke-width="1"/>';
  svg += '<line x1="' + PAD.left + '" y1="' + (PAD.top + chartH) + '" x2="' + (PAD.left + chartW) + '" y2="' + (PAD.top + chartH) + '" stroke="#2a2a35" stroke-width="1"/>';

  // Y grid lines
  const yTicks = [0.25, 0.5, 0.75, 1.0];
  yTicks.forEach(t => {
    const yv = PAD.top + chartH - t * chartH;
    svg += '<line x1="' + PAD.left + '" y1="' + yv.toFixed(1) + '" x2="' + (PAD.left + chartW) + '" y2="' + yv.toFixed(1) + '" stroke="#1e1e28" stroke-width="1"/>';
    svg += '<text x="' + (PAD.left - 4) + '" y="' + (yv + 4).toFixed(1) + '" text-anchor="end" font-size="9" fill="#555">' + Math.round(maxVal * t) + '</text>';
  });
  svg += '<text x="' + (PAD.left - 4) + '" y="' + (PAD.top + 4) + '" text-anchor="end" font-size="9" fill="#555">' + Math.round(maxVal) + '</text>';

  months.forEach((val, i) => {
    const bh = val > 0 ? Math.max((val / maxVal) * chartH, 3) : 0;
    const bx = PAD.left + i * barW + barW * 0.15;
    const by = PAD.top + chartH - bh;
    const bw = barW * 0.7;
    const isCurrentMonth = (new Date().getFullYear() === year) && (new Date().getMonth() === i);
    const color = isCurrentMonth ? '#4cdb4c' : '#28a038';

    if (val > 0) {
      svg += '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + color + '" rx="3"/>';
      if (bh > 14) {
        svg += '<text x="' + (bx + bw / 2).toFixed(1) + '" y="' + (by + 11).toFixed(1) + '" text-anchor="middle" font-size="8" fill="#0f0f13">' + val + '</text>';
      }
    }
    // X label
    svg += '<text x="' + (bx + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9" fill="#666">' + MON[i] + '</text>';
  });

  svg += '</svg>';
  return svg;
}

function buildYearSleepLineSVG(year) {
  const months = Array.from({length: 12}, (_, i) => {
    const ym = year + '-' + String(i + 1).padStart(2, '0');
    const sm = SLEEP_BY_MONTH[ym];
    return sm && sm.count ? Math.round(sm.totalMin / sm.count / 60 * 10) / 10 : 0;
  });

  const W = 560, H = 140;
  const PAD = { top: 16, right: 16, bottom: 28, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const nonZero = months.filter(v => v > 0);
  if (!nonZero.length) {
    return '<div class="empty-state" style="height:100px;display:flex;align-items:center;justify-content:center">暂无数据</div>';
  }

  const maxVal = Math.max(...months, 10);
  const minVal = 0;

  const MON = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const toX = i => PAD.left + (i / 11) * chartW;
  const toY = v => PAD.top + chartH - ((v - minVal) / (maxVal - minVal)) * chartH;

  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart-wrap">';
  // Axes
  svg += '<line x1="' + PAD.left + '" y1="' + PAD.top + '" x2="' + PAD.left + '" y2="' + (PAD.top + chartH) + '" stroke="#2a2a35" stroke-width="1"/>';
  svg += '<line x1="' + PAD.left + '" y1="' + (PAD.top + chartH) + '" x2="' + (PAD.left + chartW) + '" y2="' + (PAD.top + chartH) + '" stroke="#2a2a35" stroke-width="1"/>';

  // Reference line at 8h
  const y8 = toY(8);
  if (y8 >= PAD.top && y8 <= PAD.top + chartH) {
    svg += '<line x1="' + PAD.left + '" y1="' + y8.toFixed(1) + '" x2="' + (PAD.left + chartW) + '" y2="' + y8.toFixed(1) + '" stroke="#3a5a3a" stroke-width="1" stroke-dasharray="4,3"/>';
    svg += '<text x="' + (PAD.left + chartW + 2) + '" y="' + (y8 + 4).toFixed(1) + '" font-size="9" fill="#555">8h</text>';
  }

  // Y labels
  svg += '<text x="' + (PAD.left - 4) + '" y="' + (PAD.top + 4) + '" text-anchor="end" font-size="9" fill="#555">' + Math.round(maxVal) + 'h</text>';

  // Build path
  let pathD = '';
  let first = true;
  months.forEach((val, i) => {
    if (val > 0) {
      const px = toX(i).toFixed(1), py = toY(val).toFixed(1);
      pathD += (first ? 'M' : 'L') + px + ',' + py + ' ';
      first = false;
    }
  });

  if (pathD) {
    svg += '<path d="' + pathD.trim() + '" fill="none" stroke="#3090f0" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    months.forEach((val, i) => {
      if (val > 0) {
        const px = toX(i), py = toY(val);
        svg += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="3.5" fill="#3090f0"/>';
        svg += '<text x="' + px.toFixed(1) + '" y="' + (py - 7).toFixed(1) + '" text-anchor="middle" font-size="9" fill="#3090f0">' + val + '</text>';
      }
    });
  }

  // X labels
  MON.forEach((label, i) => {
    svg += '<text x="' + toX(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9" fill="#666">' + label + '</text>';
  });

  svg += '</svg>';
  return svg;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
renderDay(todayStr());
</script>
</body>
</html>`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('Fitness page generated → ' + OUT);
