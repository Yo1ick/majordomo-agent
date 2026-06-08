# majordomo-agent

> 个人 Multi-Agent 生活管家 —— 多 agent 协同 + 本地模型微调 + KV cache 优化
>
> **Codename 家令**(Majordomo: 意大利贵族家庭的首席管家, 统筹其他仆人)
>
> 隐形 multi-agent (用户视角 = 1 个 chat, 后台 orchestrator 路由), 不依赖 LangChain / LangGraph 类框架。

## 🎯 项目定位

**一石二鸟项目**:
1. **个人用** —— 真实日常使用(饮食 / 财务 / 健身 / 知识), 保证 dogfooding 反馈
2. **深入实践** —— 借真实场景学透 3 个有挑战、含金量高的工程技术

3 个学习中心(也是 3 个 phase 的主线):

- 🤖 **Multi-agent 协同** —— orchestrator + specialists + 跨 agent 通讯
- 🧠 **本地模型微调** —— LoRA + MLX + Qwen3.5-4B
- ⚡ **KV cache 优化** —— persistent / sharing / pruning

## 🏗 架构 (planned)

```
用户(飞书 / CLI)
    ↓
┌──────────────────────────────────────────┐
│  Orchestrator(意图识别 + 路由)            │
│      ├── Diet agent      (尤诺 灵魂)      │
│      ├── Finance agent   (远坂凛 灵魂)    │
│      └── Fitness agent   (奥古斯塔 灵魂)  │
│      ↓                                    │
│  Tools: write/query SQLite, 查营养, ...   │
│      ↓                                    │
│  Model layer: MLX 本地 / 云端 fallback    │
└──────────────────────────────────────────┘
                ↓
        SQLite (data/butler.db)
```

**关键设计**: 用户**只面对 1 个对话界面**, 多 agent 是后台架构. **不切 agent, 不选 agent**.

## 📊 现状

**当前 (2026-05-18)**: 项目处于 **Phase 0 (准备阶段)**.

- ✅ 历史 JS 实现保留在 `legacy/`(diet/finance/fitness 数据生成器 + dashboard)
- ✅ SQLite database (`data/butler.db`) + schema 保留
- ✅ Roadmap v3 已规划(见 [docs/ROADMAP.md](docs/ROADMAP.md))
- 🚧 Python 重写 + multi-agent 架构 (Phase 1, 5/19-6/15)
- 🚧 飞书 webhook 接入
- 🚧 MLX + Qwen3.5-4B 本地推理集成

## 🛠 技术栈 (planned)

- **语言**: Python 3.12+ (uv 管理依赖)
- **Web 框架**: FastAPI
- **本地推理**: MLX + Qwen3.5-4B
- **云端 fallback**: dashscope qwen / OpenAI compatible
- **存储**: SQLite (隐私: 数据本地)
- **消息入口**: 飞书 webhook (CLI 起步)
- **测试**: pytest + Mock LLM

## 🗺 Roadmap 摘要

详见 [docs/ROADMAP.md](docs/ROADMAP.md).

| Phase | 时长 | 主线技术 |
|---|---|---|
| **0** 准备 | 本周 | 仓库 + README + legacy 隔离 |
| **1** Multi-agent + 本地模型 | 5/19-6/15 | Orchestrator + 3 specialists + MLX 集成 |
| **2** 微调 | 6/16-7/15 | LoRA on Qwen3.5-4B |
| **3** KV cache 优化 | 7/16-8/15 | Persistent + shared + pruning |
| 4+ | 视野 | 视频学习管道 / Skill 蒸馏 / RAG over 个人文档 |

## 哲学

- **不冲 MVP** —— 长期项目, 每 phase 独立有意义
- **每 phase 一个技术中心** —— 学透一个, 再下一个
- **dogfooding 优先** —— 每天用, 才知道哪好哪坏
- **可沉淀** —— 每 phase 完都留下 1-2 个能讲清楚的具体技术点
- **慢炖** —— 长线推进, 不抢占其他事的资源, 一点点炖出来

## 📂 项目结构

```
majordomo-agent/
├── README.md               # 本文件
├── .gitignore              # 项目数据 (butler.db / photos / 模型) 不入 git
├── docs/
│   ├── ROADMAP.md          # 详细 Roadmap (5 phase)
│   ├── architecture-v1.md  # 早期 JS 时代架构(参考)
│   └── ...                 # 其他设计文档
├── agents/                 # (将重写为 Python)
│   ├── diet/               # 饮食 agent (尤诺)
│   ├── finance/            # 财务 agent (远坂凛)
│   └── fitness/            # 健身 agent (奥古斯塔)
├── data/                   # SQLite + 用户数据 (gitignored)
├── legacy/                 # 早期 JS 实现 (deprecated)
└── (src/, tests/, scripts/ 在 Phase 1 创建)
```

## 🔒 数据隐私

- ✅ `butler.db` 及所有用户数据 `.gitignore`
- ✅ 模型权重 / LoRA adapter `.gitignore`
- ✅ 公开仓库**仅含代码 + 架构 + sample 数据**, 不含个人记录
- ✅ 本地优先: SQLite + MLX 推理, **数据不出本机**

## 📜 License

MIT (TBD —— 公开前确认)
