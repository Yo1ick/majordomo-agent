# Fix: 饮食记录纠正方案

> 状态：待实现  
> 发现日期：2026-04-13  
> 关联文件：`~/.openclaw/extensions/openclaw-plugin-butler/src/tools.ts`

---

## 问题

用户通过图片记录午餐，尤诺识别错误（红烧肉 → 实际是兰花干+大排+手枪鸡腿）。用户纠正后，尤诺再次调用 `butler_record_meal`，被 dedup 拦截返回"跳过重复"，DB 未更新。尤诺却回复"已更正 ✅"（幻觉）。

### 根因

`tools.ts:265-270`：

```typescript
const dup = query(
  `SELECT id FROM meals WHERE meal_type = ? AND date = ? 
   AND deleted_at IS NULL AND created_at > datetime('now', '-5 minutes')`,
  [p.meal_type, date]
);
if (dup.length) return `已记录过：${date} ${p.meal_type}（跳过重复）`;
```

- 只有 INSERT，没有 UPDATE
- dedup 直接跳过，不提供修改入口
- `confirmed` 字段写死为 1，草稿确认流程形同虚设

---

## 方案

### Phase 1：能改（最小修复）

**改 `butler_record_meal` 的 dedup 行为**：检测到重复时 UPDATE 而非跳过。

```typescript
case 'butler_record_meal': {
  const date = (p.date as string) ?? today();
  const cal = (p.total_calories as number) ?? 0;
  const mealCat = (p.meal_category as string) ?? 'regular';

  // 检查是否已有同餐次记录（不限 5 分钟）
  const existing = query(
    `SELECT id FROM meals WHERE meal_type = ? AND date = ? AND deleted_at IS NULL`,
    [p.meal_type, date]
  );

  let mealId: string;
  if (existing.length) {
    // UPDATE 已有记录
    mealId = existing[0].id as string;
    run(
      `UPDATE meals SET total_calories = ?, meal_category = ?, source = 'manual'
       WHERE id = ?`,
      [cal, mealCat, mealId]
    );
    // 清空旧的 meal_foods，重新写入
    run(`DELETE FROM meal_foods WHERE meal_id = ?`, [mealId]);
  } else {
    // INSERT 新记录
    mealId = uuid();
    run(
      `INSERT INTO meals (id, user_id, date, meal_type, source, total_calories, confirmed, meal_category)
       VALUES (?, 'default', ?, ?, 'manual', ?, 1, ?)`,
      [mealId, date, p.meal_type, cal, mealCat]
    );
  }

  const foods = (p.foods as string).split(/[,，、]/).map(f => f.trim()).filter(Boolean);
  for (const food of foods) {
    run(
      `INSERT INTO meal_foods (id, meal_id, food_name, calories) VALUES (?, ?, ?, NULL)`,
      [uuid(), mealId, food]
    );
  }

  const verb = existing.length ? '已更新' : '已记录';
  return `${verb}：${p.meal_type}（${foods.join('、')}）${cal ? ` 约 ${cal}kcal` : ''}`;
}
```

**新增 `butler_update_meal` 工具**：允许 agent 按 meal_id 精确修改单项食物。

```typescript
{
  name: 'butler_update_meal',
  description: '修改已记录的一餐。可更新食物列表、热量、营养素。',
  parameters: {
    meal_type: { type: 'string', description: '餐次：breakfast、lunch、dinner、snack' },
    date: { type: 'string', description: '日期 YYYY-MM-DD，默认今天' },
    foods: { type: 'string', description: '更正后的完整食物列表' },
    total_calories: { type: 'number', description: '更正后的总热量' },
  },
  required: ['meal_type', 'foods'],
}
```

handler 逻辑：查到对应 meal → DELETE 旧 meal_foods → INSERT 新的。找不到则返回明确错误而非静默。

### Phase 2：草稿确认流

改动点：

1. **`butler_record_meal` 改为写草稿**：`confirmed = 0`
2. **新增 `butler_confirm_meal`**：用户说"没问题"后调用，`SET confirmed = 1`
3. **tool 返回值带引导语**：

```
[草稿] 午餐：白米饭、兰花干、大排、手枪鸡腿、青菜 约810kcal
有错的话告诉我，确认后我再正式记录。
```

4. **dashboard 查询过滤**：`WHERE confirmed = 1`（现有查询不受影响，因为现在全是 1）
5. **SKILL.md 更新**：告知 agent "记录后等用户确认，不要自动 confirm"

### Phase 3：记忆纠正

让 agent 记住用户的纠正偏好：

1. **workspace-yuno/MEMORY.md** 加结构化纠正记录：

```markdown
## 饮食识别纠正
- 2026-04-13: 图片里红色块状 ≠ 红烧肉，是兰花干（豆腐干）
- 手枪鸡腿默认去皮（Master 不吃皮）
```

2. **butler-diet SKILL.md** 加指引：

```markdown
## 纠正处理
用户纠正食物识别时：
1. 调用 butler_update_meal 修正数据库
2. 将纠正写入 MEMORY.md（供下次识别参考）
3. 回复时承认错误，不要说"已更正"除非 tool 返回成功
```

---

## 改动文件清单

| Phase | 文件 | 改动 |
|-------|------|------|
| 1 | `openclaw-plugin-butler/src/tools.ts` | 改 `butler_record_meal` dedup 逻辑 + 新增 `butler_update_meal` |
| 2 | `openclaw-plugin-butler/src/tools.ts` | 新增 `butler_confirm_meal` + 改默认 confirmed=0 |
| 2 | `~/.openclaw/skills/butler-diet/SKILL.md` | 加草稿确认流程说明 |
| 3 | `~/.openclaw/workspace-yuno/MEMORY.md` | 加纠正记录区 |
| 3 | `~/.openclaw/skills/butler-diet/SKILL.md` | 加纠正处理指引 |

## 注意

- Phase 1 是最小修复，解决"改不了"的问题
- Phase 2 改变用户交互模式，需要同步改所有使用 butler-diet 的 agent（尤诺、奥古斯塔等）
- Phase 3 依赖 agent 自觉写 memory，可能需要 hook 强制执行
