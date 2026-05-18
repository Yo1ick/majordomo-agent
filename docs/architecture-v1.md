# Personal Butler 架构设计

## 目录结构

```
personal-butler/
├── src/
│   ├── main.py                — 启动入口（FastAPI 服务，接收飞书 webhook）
│   ├── router.py              — 意图识别，把消息分发给对应 Agent
│   ├── model.py               — 统一的模型调用层（小米 API / 百炼 API）
│   ├── database.py            — SQLite 数据库读写
│   ├── agents/
│   │   ├── base.py            — Agent 基类（定义所有 Agent 共有的行为）
│   │   ├── ???.py             — 汇总 Agent（每日数据核对，你来起名）
│   │   ├── finance/
│   │   │   ├── agent.py       — 记账 Agent（继承 base）
│   │   │   ├── tools.py       — 记账工具（写 expenses 表，查账目）
│   │   │   └── soul.md        — 远坂凛人格设定
│   │   ├── diet/
│   │   │   ├── agent.py       — 饮食 Agent（继承 base）
│   │   │   ├── tools.py       — 饮食工具（写 meals 表，查食材库）
│   │   │   └── soul.md        — 尤诺人格设定
│   │   └── fitness/
│   │       ├── agent.py       — 健身 Agent（继承 base）
│   │       ├── tools.py       — 健身工具（写 exercise/sleep 表）
│   │       └── soul.md        — 奥古斯塔人格设定
│   └── tools/
│       └── common.py          — 公共工具（agent 间通讯，网页信息收集）
├── data/
│   ├── butler.db              — SQLite 数据库
│   └── schema.sql             — 数据库表结构
├── docs/
│   └── ...                    — 文档
└── requirements.txt           — Python 依赖
```

## 消息流程

```
用户（飞书）
  ↓
main.py（FastAPI 接收 webhook）
  ↓
router.py（意图识别：这条消息该给谁？）
  ↓
  ├── finance agent — "午饭花了30" → 记一笔支出
  ├── diet agent    — "午饭吃了麻辣烫" → 记一顿饭 + 查营养
  └── fitness agent — "今天跑了5公里" → 记一次运动
        ↓
  agent 调用 tools（写数据库 / 查数据）
        ↓
  agent 调用 model.py（让大模型生成回复）
        ↓
  返回结果给用户（通过飞书）
```

## 技术栈

| 组件 | 选型 | 为什么选它 |
|------|------|-----------|
| Web 框架 | FastAPI | 原生异步，自带类型校验，LLM 领域主流 |
| 数据库 | SQLite | 单用户不需要数据库服务器，数据存本地保证隐私 |
| 大模型 API | 小米 mimo / 阿里百炼 | 免费额度，中文能力好 |
| 消息入口 | 飞书 webhook | 已有飞书 bot，日常使用方便 |

## 待定问题

- [ ] 汇总 Agent 叫什么名字？什么时候触发？（定时？用户主动问？）
- [ ] 一条消息同时涉及两个 Agent 怎么办？（"午饭30块吃了麻辣烫" = 记账 + 记饮食）
- [ ] 飞书 webhook 怎么接？需要公网地址吗？还是用飞书的长连接方案？
