-- Personal Butler System - Database Schema
-- 修复记录：
--   2026-04-06 修复 meal_foods/nutrition_daily 营养素字段精度（INTEGER → REAL）
--   2026-04-06 修复 family_monthly_expense 视图 GROUP BY 错误
--   2026-04-06 新增 exercise_logs / sleep_logs 表，支持识图录入；nutrition_daily 新增运动卡路里汇总字段

PRAGMA journal_mode = DELETE;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;
PRAGMA foreign_keys = ON;

-- ============================================================
-- 记账模块
-- ============================================================

CREATE TABLE IF NOT EXISTS expenses (
    id           TEXT PRIMARY KEY,                        -- UUID v4
    user_id      TEXT NOT NULL,                           -- Feishu open_id
    merchant     TEXT NOT NULL,
    total_amount INTEGER NOT NULL,                        -- 分
    category     TEXT CHECK(category IN (
                     'food_delivery','food_ingredient','transport',
                     'shopping','utility','entertainment','other'
                 )),
    source       TEXT CHECK(source IN ('image_ocr','manual','import')),
    occurred_at  TEXT NOT NULL,                           -- ISO 8601
    pay_channel  TEXT,                                     -- alipay/wechat/cash/bank
    pay_method   TEXT,                                     -- 具体卡：招商银行信用卡(0280)
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at   TEXT                                     -- NULL = 有效
);

CREATE TABLE IF NOT EXISTS expense_items (
    id               TEXT PRIMARY KEY,
    expense_id       TEXT NOT NULL REFERENCES expenses(id),
    name             TEXT NOT NULL,
    amount           INTEGER NOT NULL,                    -- 分
    quantity         INTEGER DEFAULT 1,
    category         TEXT CHECK(category IN (
                         'food_delivery','food_ingredient','consumable',
                         'electronics','other'
                     )),
    synced_to_health INTEGER NOT NULL DEFAULT 0,
    synced_to_asset  INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 健康模块
-- ============================================================

CREATE TABLE IF NOT EXISTS meals (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL,
    date           TEXT NOT NULL,                         -- YYYY-MM-DD
    meal_type      TEXT NOT NULL CHECK(meal_type IN ('breakfast','lunch','dinner','snack')),
    source         TEXT CHECK(source IN ('sync_from_bookkeeper','image','manual')),
    dedup_key      TEXT UNIQUE,
    total_calories INTEGER,
    confirmed      INTEGER NOT NULL DEFAULT 0,
    photo_path     TEXT,                                    -- 饮食照片路径（相对于 data/photos/）
    note           TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at     TEXT
);

CREATE TABLE IF NOT EXISTS meal_foods (
    id         TEXT PRIMARY KEY,
    meal_id    TEXT NOT NULL REFERENCES meals(id),
    food_name  TEXT NOT NULL,
    amount_g   REAL,           -- FIX: INTEGER → REAL，支持 0.5g 精度
    calories   INTEGER,        -- kcal，整数足够
    protein_g  REAL,           -- FIX: INTEGER → REAL
    carbs_g    REAL,           -- FIX: INTEGER → REAL
    fat_g      REAL,           -- FIX: INTEGER → REAL
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS nutrition_daily (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL,
    date              TEXT NOT NULL UNIQUE,                 -- YYYY-MM-DD
    total_calories    INTEGER NOT NULL DEFAULT 0,           -- 摄入热量 kcal
    total_protein_g   REAL NOT NULL DEFAULT 0,              -- FIX: INTEGER → REAL
    total_carbs_g     REAL NOT NULL DEFAULT 0,              -- FIX: INTEGER → REAL
    total_fat_g       REAL NOT NULL DEFAULT 0,              -- FIX: INTEGER → REAL
    meal_count        INTEGER NOT NULL DEFAULT 0,
    exercise_kcal     INTEGER NOT NULL DEFAULT 0,           -- 当日运动消耗 kcal（汇总自 exercise_logs）
    net_calories      INTEGER GENERATED ALWAYS AS (total_calories - exercise_kcal) VIRTUAL,
    updated_at        TEXT
);

CREATE TABLE IF NOT EXISTS exercise_logs (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL,
    date             TEXT NOT NULL,                         -- YYYY-MM-DD
    exercise_type    TEXT NOT NULL,                         -- running / cycling / swimming / gym / walk / other
    duration_minutes INTEGER,                               -- 时长（分钟）
    calories_burned  INTEGER,                               -- 消耗热量 kcal
    distance_km      REAL,                                  -- 距离（跑步/骑行/游泳，可选）
    source           TEXT CHECK(source IN ('image_ocr','manual')),
    raw_image_text   TEXT,                                  -- OCR 识别的原始文字，便于复核
    note             TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at       TEXT
);

CREATE TABLE IF NOT EXISTS sleep_logs (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL,
    date           TEXT NOT NULL UNIQUE,                    -- YYYY-MM-DD（以起床当天为准）
    sleep_start    TEXT,                                    -- ISO 8601，入睡时间
    sleep_end      TEXT,                                    -- ISO 8601，起床时间
    duration_min   INTEGER,                                 -- 实际睡眠时长（分钟）
    deep_sleep_min INTEGER,                                 -- 深睡时长（可选，手表数据）
    rem_sleep_min  INTEGER,                                 -- REM 时长（可选）
    score          INTEGER,                                 -- 睡眠评分 0-100（部分设备提供）
    source         TEXT CHECK(source IN ('image_ocr','manual')),
    raw_image_text TEXT,                                    -- OCR 原始文字
    note           TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at     TEXT
);

-- ============================================================
-- 资产模块
-- ============================================================

CREATE TABLE IF NOT EXISTS assets (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL,
    name           TEXT NOT NULL,
    type           TEXT NOT NULL CHECK(type IN (
                       'cash','investment','property',
                       'ingredient','consumable','electronics','other'
                   )),
    current_amount INTEGER,    -- 分，适用于 cash/investment/property
    quantity       REAL,       -- 数量，适用于 ingredient/consumable/electronics
    unit           TEXT,       -- pcs/g/kg/ml
    location       TEXT,
    note           TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at     TEXT,
    -- 确保金融资产有金额、实物资产有数量
    CHECK (
        (type IN ('cash','investment','property') AND current_amount IS NOT NULL) OR
        (type IN ('ingredient','consumable','electronics') AND quantity IS NOT NULL) OR
        type = 'other'
    )
);

CREATE TABLE IF NOT EXISTS liabilities (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL,
    name             TEXT NOT NULL,
    type             TEXT NOT NULL CHECK(type IN ('mortgage','installment','credit_card','other')),
    total_amount     INTEGER NOT NULL,
    remaining_amount INTEGER NOT NULL,
    monthly_payment  INTEGER,
    due_date         TEXT,                                -- DD
    next_due_date    TEXT,                                -- YYYY-MM-DD
    interest_rate    INTEGER,                             -- 基点，4500 = 4.5%
    start_date       TEXT,
    end_date         TEXT,
    status           TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','closed')),
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at       TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    name         TEXT NOT NULL,
    type         TEXT NOT NULL CHECK(type IN ('wechat','alipay','bank','cash','investment')),
    balance      INTEGER NOT NULL,                        -- 分
    is_active    INTEGER NOT NULL DEFAULT 1,
    last_updated TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 食材成分库（尤诺维护，记录饮食时自动匹配）
-- ============================================================

CREATE TABLE IF NOT EXISTS food_library (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL UNIQUE,
    brand        TEXT,                                      -- 品牌
    serving_size REAL NOT NULL,                             -- 每份量
    serving_unit TEXT NOT NULL DEFAULT 'g',                 -- g/ml/勺/片
    calories     INTEGER NOT NULL,                          -- 每份 kcal
    protein_g    REAL NOT NULL DEFAULT 0,
    carbs_g      REAL NOT NULL DEFAULT 0,
    fat_g        REAL NOT NULL DEFAULT 0,
    fiber_g      REAL,
    sodium_mg    REAL,
    note         TEXT,                                      -- 备注
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_food_library_name ON food_library(name);

-- ============================================================
-- 用户身体档案（饮食助手和健身助手共用）
-- ============================================================

CREATE TABLE IF NOT EXISTS user_body_profile (
    user_id        TEXT PRIMARY KEY DEFAULT 'default',
    gender         TEXT CHECK(gender IN ('male','female')),
    birth_date     TEXT,                                    -- YYYY-MM-DD
    height_cm      REAL,
    weight_kg      REAL,
    body_fat_pct   REAL,                                    -- 体脂率
    muscle_mass_kg REAL,                                    -- 肌肉量
    bmr_kcal       INTEGER,                                 -- 基础代谢
    activity_level TEXT CHECK(activity_level IN ('sedentary','light','moderate','active','very_active')),
    training_goal  TEXT CHECK(training_goal IN ('lose_fat','maintain','build_muscle','endurance')),
    dietary_notes  TEXT,                                    -- 饮食备注（过敏、忌口等）
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 系统模块
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_events (
    id           TEXT PRIMARY KEY,
    message_id   TEXT UNIQUE NOT NULL,
    user_id      TEXT NOT NULL,
    from_agent   TEXT NOT NULL CHECK(from_agent IN ('finance','diet','fitness')),
    to_agent     TEXT NOT NULL CHECK(to_agent IN ('finance','diet','fitness')),
    event_type   TEXT NOT NULL CHECK(event_type IN ('food_purchased','asset_purchased','ingredient_used')),
    payload      TEXT NOT NULL,                           -- JSON
    status       TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','failed','dead')),
    retry_count  INTEGER NOT NULL DEFAULT 0,
    next_retry_at TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    delivered_at TEXT
);

CREATE TABLE IF NOT EXISTS pending_confirmations (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL,
    source_agent      TEXT NOT NULL,
    confirmation_type TEXT NOT NULL CHECK(confirmation_type IN ('meal_confirm','asset_update','expense_categorize')),
    payload           TEXT NOT NULL,                      -- JSON
    feishu_message_id TEXT,
    status            TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected','expired')),
    expires_at        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at       TEXT
);

-- ============================================================
-- 多用户 / 家庭支持
-- ============================================================

CREATE TABLE IF NOT EXISTS family_members (
    id         TEXT PRIMARY KEY,
    family_id  TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    nickname   TEXT,
    role       TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','member')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(family_id, user_id)
);

-- FIX: 原 GROUP BY e.occurred_at 改为按月聚合
CREATE VIEW IF NOT EXISTS family_monthly_expense AS
SELECT
    fm.family_id,
    strftime('%Y-%m', e.occurred_at)   AS month,
    SUM(e.total_amount)                AS total_amount,
    GROUP_CONCAT(DISTINCT e.user_id)   AS members
FROM expenses e
JOIN family_members fm ON e.user_id = fm.user_id
WHERE e.deleted_at IS NULL
GROUP BY fm.family_id, strftime('%Y-%m', e.occurred_at);

-- ============================================================
-- 索引
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_expenses_user_date    ON expenses(user_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_meals_user_date        ON meals(user_id, date);
CREATE INDEX IF NOT EXISTS idx_nutrition_user_date    ON nutrition_daily(user_id, date);
CREATE INDEX IF NOT EXISTS idx_assets_user_type       ON assets(user_id, type);
CREATE INDEX IF NOT EXISTS idx_agent_events_status    ON agent_events(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_confirmations_status   ON pending_confirmations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_exercise_user_date     ON exercise_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_sleep_user_date        ON sleep_logs(user_id, date);
