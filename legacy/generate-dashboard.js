#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');

const DB = '/Volumes/External HD/gitcode/personal-butler/data/butler.db';
const OUT = '/Volumes/External HD/.openclaw/canvas/butler/daily.html';

function q(sql) {
  try {
    const raw = execSync(`sqlite3 -json "${DB}" "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
    return raw && raw !== '[]' ? JSON.parse(raw) : [];
  } catch { return []; }
}

const dates = [];
for (let i = 0; i < 30; i++) {
  const d = new Date(); d.setDate(d.getDate() - i);
  dates.push(d.toISOString().slice(0, 10));
}

const allData = {};
for (const date of dates) {
  const expenses = q(`SELECT merchant, printf('%.2f', total_amount/100.0) as amount, category, pay_channel, pay_method, occurred_at FROM expenses WHERE date(occurred_at) = '${date}' AND deleted_at IS NULL ORDER BY occurred_at DESC`);
  const summary = q(`SELECT printf('%.2f', COALESCE(SUM(total_amount),0)/100.0) as total, COUNT(*) as count FROM expenses WHERE date(occurred_at) = '${date}' AND deleted_at IS NULL`);

  // Meals split by category
  const regularMeals = q(`SELECT m.meal_type, GROUP_CONCAT(mf.food_name, '、') as foods, m.total_calories as kcal FROM meals m LEFT JOIN meal_foods mf ON m.id = mf.meal_id WHERE m.date = '${date}' AND m.deleted_at IS NULL AND COALESCE(m.meal_category,'regular') = 'regular' GROUP BY m.id ORDER BY m.created_at`);
  const supplements = q(`SELECT m.meal_type, GROUP_CONCAT(mf.food_name, '、') as foods, m.total_calories as kcal FROM meals m LEFT JOIN meal_foods mf ON m.id = mf.meal_id WHERE m.date = '${date}' AND m.deleted_at IS NULL AND m.meal_category = 'supplement' GROUP BY m.id ORDER BY m.created_at`);
  const drinks = q(`SELECT m.meal_type, GROUP_CONCAT(mf.food_name, '、') as foods, m.total_calories as kcal FROM meals m LEFT JOIN meal_foods mf ON m.id = mf.meal_id WHERE m.date = '${date}' AND m.deleted_at IS NULL AND m.meal_category = 'drink' GROUP BY m.id ORDER BY m.created_at`);

  // Macros
  const macros = q(`SELECT COALESCE(SUM(mf.protein_g),0) as protein, COALESCE(SUM(mf.carbs_g),0) as carbs, COALESCE(SUM(mf.fat_g),0) as fat FROM meal_foods mf JOIN meals m ON mf.meal_id = m.id WHERE m.date = '${date}' AND m.deleted_at IS NULL`);

  const exercises = q(`SELECT exercise_type, duration_minutes, calories_burned, distance_km FROM exercise_logs WHERE date = '${date}' AND deleted_at IS NULL ORDER BY created_at`);
  const sleep = q(`SELECT sleep_start, sleep_end, duration_min, score FROM sleep_logs WHERE date = '${date}' AND deleted_at IS NULL`);

  // Water
  const water = q(`SELECT SUM(amount_ml) as total FROM water_logs WHERE date = '${date}' AND user_id = 'default'`);

  if (expenses.length || regularMeals.length || supplements.length || drinks.length || exercises.length || sleep.length || (water[0]?.total > 0)) {
    allData[date] = {
      expenses, regularMeals, supplements, drinks, exercises, sleep,
      expenseTotal: summary[0]?.total ?? '0.00',
      expenseCount: summary[0]?.count ?? 0,
      macros: macros[0] ?? { protein: 0, carbs: 0, fat: 0 },
      waterMl: water[0]?.total ?? 0,
    };
  }
}

const bodyProfile = q(`SELECT * FROM user_body_profile WHERE user_id = 'default'`);

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Personal Butler - Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'PingFang SC', sans-serif; background: #0f0f13; color: #e0e0e0; padding: 20px; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 1.4em; color: #fff; margin-bottom: 8px; }
  .date-nav { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
  .date-nav button { background: #2a2a35; border: 1px solid #3a3a45; color: #ccc; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 14px; }
  .date-nav button:hover { background: #3a3a45; }
  .date-nav input { background: #1a1a24; border: 1px solid #3a3a45; color: #fff; padding: 6px 12px; border-radius: 6px; font-size: 14px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  @media (max-width: 600px) { .grid, .grid3 { grid-template-columns: 1fr; } }
  .card { background: #1a1a24; border-radius: 12px; padding: 16px; border: 1px solid #2a2a35; }
  .card.full { grid-column: 1 / -1; }
  .card h2 { font-size: 1em; color: #888; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .stat { font-size: 2em; font-weight: 700; color: #fff; }
  .stat small { font-size: 0.4em; color: #666; margin-left: 4px; }
  .stat.sm { font-size: 1.4em; }
  .list { list-style: none; }
  .list li { padding: 8px 0; border-bottom: 1px solid #2a2a35; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; }
  .list li:last-child { border-bottom: none; }
  .label { color: #ccc; }
  .value { color: #fff; font-weight: 600; }
  .sub { color: #666; font-size: 0.85em; }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75em; margin-left: 6px; }
  .tag.food { background: #2d1f0f; color: #f0a030; }
  .tag.shop { background: #0f1f2d; color: #30a0f0; }
  .tag.transport { background: #1f0f2d; color: #a030f0; }
  .tag.utility { background: #0f2d1f; color: #30f0a0; }
  .tag.entertainment { background: #2d0f1f; color: #f030a0; }
  .tag.other { background: #1f1f1f; color: #888; }
  .tag.alipay { background: #1a2a3a; color: #1890ff; }
  .tag.wechat { background: #1a3a1a; color: #07c160; }
  .empty { color: #555; font-style: italic; padding: 12px 0; }
  .kcal { color: #f0a030; }
  .body-info { display: flex; gap: 12px; flex-wrap: wrap; }
  .body-info span { background: #2a2a35; padding: 4px 10px; border-radius: 6px; font-size: 0.85em; }
  .updated { color: #555; font-size: 0.8em; text-align: right; margin-top: 16px; }
  .water-bar { background: #1a2a3a; border-radius: 8px; height: 20px; margin-top: 8px; overflow: hidden; }
  .water-fill { background: linear-gradient(90deg, #1890ff, #36cfc9); height: 100%; border-radius: 8px; transition: width 0.3s; }
  .rings { display: flex; justify-content: space-around; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 8px; }
  .ring-item { text-align: center; }
  .ring-label { font-size: 0.8em; color: #888; margin-top: 6px; }
  .ring-value { font-size: 1.1em; font-weight: 700; color: #fff; }
  .ring-target { font-size: 0.75em; color: #555; }
  .supplement-alert { background: #2d2a0f; border: 1px solid #5a5020; border-radius: 8px; padding: 10px 14px; margin-top: 8px; color: #f0d030; font-size: 0.9em; }
</style>
</head>
<body>
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
<h1><a href="index.html" style="color:#fff;text-decoration:none;">Personal Butler</a></h1>
<button id="refreshBtn" onclick="refreshData()" style="background:#2a2a35;border:1px solid #3a3a45;color:#ccc;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:14px;">刷新数据</button>
</div>

${bodyProfile.length ? `<div class="card full" style="margin-bottom:16px"><h2>身体档案</h2><div class="body-info">
${bodyProfile[0].height_cm ? '<span>' + bodyProfile[0].height_cm + 'cm</span>' : ''}
${bodyProfile[0].weight_kg ? '<span>' + bodyProfile[0].weight_kg + 'kg</span>' : ''}
${bodyProfile[0].body_fat_pct ? '<span>体脂 ' + bodyProfile[0].body_fat_pct + '%</span>' : ''}
${bodyProfile[0].training_goal ? '<span>目标: ' + ({lose_fat:'减脂',build_muscle:'增肌',maintain:'维持',endurance:'耐力'}[bodyProfile[0].training_goal]||bodyProfile[0].training_goal) + '</span>' : ''}
${bodyProfile[0].activity_level ? '<span>活动量: ' + ({sedentary:'久坐',light:'轻度',moderate:'中等',active:'活跃',very_active:'高强度'}[bodyProfile[0].activity_level]||bodyProfile[0].activity_level) + '</span>' : ''}
</div></div>` : ''}

<div class="date-nav">
  <button onclick="changeDate(-1)">&lt;</button>
  <input type="date" id="dateInput">
  <button onclick="changeDate(1)">&gt;</button>
  <button onclick="showDate(today())">今天</button>
</div>

<div id="content"></div>
<div class="updated">Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}</div>

<script>
const DATA = ${JSON.stringify(allData)};
function today() { return new Date().toISOString().slice(0,10); }
function changeDate(d) { const i=document.getElementById('dateInput'); const dt=new Date(i.value); dt.setDate(dt.getDate()+d); showDate(dt.toISOString().slice(0,10)); }

function catTag(c) {
  const m={food_delivery:'food',food_ingredient:'food',shopping:'shop',transport:'transport',utility:'utility',entertainment:'entertainment'};
  const l={food_delivery:'餐饮',food_ingredient:'食材',shopping:'购物',transport:'交通',utility:'缴费',entertainment:'娱乐',other:'其他'};
  return '<span class="tag '+(m[c]||'other')+'">'+(l[c]||c)+'</span>';
}
function chTag(c) { if(!c) return ''; return '<span class="tag '+(c==='alipay'?'alipay':c==='wechat'?'wechat':'other')+'">'+(c==='alipay'?'支付宝':c==='wechat'?'微信':c)+'</span>'; }

function mealList(items, emptyMsg) {
  if (!items||!items.length) return '<li class="empty">'+emptyMsg+'</li>';
  return items.map(m => '<li><span style="min-width:70px;color:#aaa">'+m.meal_type+'</span><span class="label">'+(m.foods||'未记录')+'</span><span class="kcal">'+(m.kcal?m.kcal+'kcal':'')+'</span></li>').join('');
}

// Macro targets based on body profile
const MACRO_TARGETS = (function() {
  const bp = ${JSON.stringify(bodyProfile[0] ?? {})};
  const w = bp.weight_kg || 75;
  const goal = bp.training_goal || 'maintain';
  // Protein: 1.8g/kg for lose_fat/build_muscle, 1.2g/kg otherwise
  const protein = Math.round(w * (goal === 'lose_fat' || goal === 'build_muscle' ? 1.8 : 1.2));
  // Estimate TDEE ~2000kcal for moderate activity lose_fat
  const tdee = goal === 'lose_fat' ? 1800 : goal === 'build_muscle' ? 2500 : 2100;
  const proteinKcal = protein * 4;
  const fatKcal = tdee * 0.25;
  const fat = Math.round(fatKcal / 9);
  const carbKcal = tdee - proteinKcal - fatKcal;
  const carbs = Math.round(carbKcal / 4);
  return { protein, carbs, fat };
})();

function drawRing(current, target, color, label) {
  const pct = target > 0 ? current / target : 0;
  const displayPct = Math.min(pct, 1);
  const over = pct > 1;
  const r = 40, stroke = 8, cx = 50, cy = 50;
  const circumference = 2 * Math.PI * r;
  const dashLen = circumference * displayPct;
  const ringColor = over ? '#ff4444' : color;
  const remaining = Math.max(0, Math.round(target - current));
  const centerText = over ? '+' + Math.round(current - target) : remaining;
  const centerColor = over ? '#ff4444' : '#fff';
  const centerSuffix = over ? 'g 超标' : 'g';
  return '<div class="ring-item">'
    + '<svg width="100" height="100">'
    + '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="#2a2a35" stroke-width="'+stroke+'"/>'
    + '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+ringColor+'" stroke-width="'+stroke+'" stroke-linecap="round" stroke-dasharray="'+dashLen+' '+circumference+'" transform="rotate(-90 '+cx+' '+cy+')"/>'
    + '<text x="'+cx+'" y="'+(cy-6)+'" text-anchor="middle" fill="'+centerColor+'" font-size="15" font-weight="700">'+centerText+'</text>'
    + '<text x="'+cx+'" y="'+(cy+10)+'" text-anchor="middle" fill="#666" font-size="10">'+centerSuffix+'</text>'
    + '</svg>'
    + '<div class="ring-label">'+label+'</div>'
    + '<div class="ring-target">'+Math.round(current)+' / '+target+'g</div>'
    + '</div>';
}

function drawMacroRings(p, c, f, hasMeals) {
  let html = '<div class="rings">'
    + drawRing(p, MACRO_TARGETS.protein, '#36cfc9', '蛋白质')
    + drawRing(c, MACRO_TARGETS.carbs, '#ffd43b', '碳水')
    + drawRing(f, MACRO_TARGETS.fat, '#b37feb', '脂肪')
    + '</div>';
  if (p===0 && c===0 && f===0 && hasMeals) {
    html += '<div style="text-align:center;color:#666;font-size:0.85em;margin-top:8px;">餐食已记录，营养素数据待补充</div>';
  }
  return html;
}

function showDate(date) {
  document.getElementById('dateInput').value = date;
  const d = DATA[date] || { expenses:[], regularMeals:[], supplements:[], drinks:[], exercises:[], sleep:[], expenseTotal:'0.00', expenseCount:0, macros:{protein:0,carbs:0,fat:0}, waterMl:0 };

  let totalKcal=0; [...(d.regularMeals||[]),...(d.supplements||[]),...(d.drinks||[])].forEach(m=>totalKcal+=(m.kcal||0));
  let burnKcal=0; (d.exercises||[]).forEach(e=>burnKcal+=(e.calories_burned||0));

  let h = '';

  // Top stats
  h += '<div class="grid3">';
  h += '<div class="card" onclick="location.href=\\'finance.html\\'" style="cursor:pointer"><h2>💰 支出 <span style="margin-left:auto;color:#555;font-size:0.8em">&gt;</span></h2><div class="stat sm">'+(d.expenseTotal||'0.00')+'<small>元</small></div><div class="sub">'+(d.expenseCount?d.expenseCount+' 笔':'')+'</div></div>';
  h += '<div class="card" onclick="location.href=\\'diet.html\\'" style="cursor:pointer"><h2>🔥 热量 <span style="margin-left:auto;color:#555;font-size:0.8em">&gt;</span></h2><div class="stat sm">'+(totalKcal||'--')+'<small>kcal</small></div><div class="sub">'+(burnKcal?'消耗 '+burnKcal+' | 净 '+(totalKcal-burnKcal):'')+'</div></div>';
  h += '<div class="card"><h2>💧 饮水</h2><div class="stat sm">'+(d.waterMl||0)+'<small>ml</small></div><div class="water-bar"><div class="water-fill" style="width:'+Math.min(100,Math.round((d.waterMl||0)/2500*100))+'%"></div></div><div class="sub">目标 2500ml</div></div>';
  h += '</div>';

  // Meals by category
  h += '<div class="card full" style="margin-bottom:16px;cursor:pointer" onclick="location.href=\\'diet.html\\'"><h2>🍽 正餐 <span style="margin-left:auto;color:#555;font-size:0.8em">&gt;</span></h2><ul class="list">' + mealList(d.regularMeals, '暂无记录') + '</ul></div>';

  h += '<div class="grid">';
  h += '<div class="card"><h2>🧃 饮品</h2><ul class="list">' + mealList(d.drinks, '暂无') + '</ul></div>';
  h += '<div class="card"><h2>💊 健身品/补剂</h2><ul class="list">' + mealList(d.supplements, '暂无') + '</ul>';
  if (!(d.supplements&&d.supplements.length)) {
    h += '<div class="supplement-alert">今日未摄入补剂</div>';
  }
  h += '</div></div>';

  // Macros ring chart
  const mc = d.macros || {protein:0,carbs:0,fat:0};
  const hasMeals = (d.regularMeals&&d.regularMeals.length) || (d.supplements&&d.supplements.length) || (d.drinks&&d.drinks.length);
  h += '<div class="card full" style="margin-bottom:16px"><h2>📊 三大营养素</h2>' + drawMacroRings(mc.protein||0, mc.carbs||0, mc.fat||0, !!hasMeals) + '</div>';

  // Exercise + Sleep
  h += '<div class="grid"><div class="card" onclick="location.href=\\'fitness.html\\'" style="cursor:pointer"><h2>🏃 运动 <span style="margin-left:auto;color:#555;font-size:0.8em">&gt;</span></h2><ul class="list">';
  if (d.exercises&&d.exercises.length) { d.exercises.forEach(e=>{ h+='<li><span style="min-width:60px;color:#aaa">'+e.exercise_type+'</span><span class="label">'+e.duration_minutes+'分钟'+(e.distance_km?' '+e.distance_km+'km':'')+'</span><span class="kcal">'+(e.calories_burned||0)+'kcal</span></li>'; }); }
  else { h+='<li class="empty">暂无记录</li>'; }
  h += '</ul></div><div class="card" onclick="location.href=\\'fitness.html\\'" style="cursor:pointer"><h2>😴 睡眠 <span style="margin-left:auto;color:#555;font-size:0.8em">&gt;</span></h2>';
  if (d.sleep&&d.sleep.length) { const s=d.sleep[0]; const hh=Math.floor(s.duration_min/60),mm=s.duration_min%60; h+='<div class="stat sm">'+hh+'时'+mm+'分</div>'; }
  else { h+='<div class="empty">暂无记录</div>'; }
  h += '</div></div>';

  // Expense details
  h += '<div class="card full" style="margin-top:16px;cursor:pointer" onclick="location.href=\\'finance.html\\'"><h2>📋 消费明细 <span style="margin-left:auto;color:#555;font-size:0.8em">&gt;</span></h2><ul class="list">';
  if (d.expenses&&d.expenses.length) { d.expenses.forEach(e=>{ h+='<li><div><span class="label">'+e.merchant+'</span>'+catTag(e.category)+chTag(e.pay_channel)+'<div class="sub">'+(e.pay_method||'')+' '+e.occurred_at.slice(11,16)+'</div></div><span class="value">¥'+e.amount+'</span></li>'; }); }
  else { h+='<li class="empty">暂无记录</li>'; }
  h += '</ul></div>';

  document.getElementById('content').innerHTML = h;
}

async function refreshData() {
  const btn = document.getElementById('refreshBtn');
  btn.textContent = '刷新中...'; btn.disabled = true;
  try {
    await fetch('/refresh');
    location.reload();
  } catch(e) { btn.textContent = '刷新失败'; setTimeout(()=>{btn.textContent='刷新数据';btn.disabled=false;},2000); }
}
document.getElementById('dateInput').value = today();
showDate(today());
</script>
</body>
</html>`;

fs.writeFileSync(OUT, html);
console.log('Dashboard generated → ' + OUT);
