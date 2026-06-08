# Personal Butler — Roadmap v3

**Last updated:** 2026-05-17
**Project type:** 个人项目 / 长期 OSS
**Architecture status:** 见 `架构.md`(v1) / `docs/架构方案v2.md`(v2)
**Pace:** **不冲 MVP**。慢炖,质量 > 速度。

---

## 🎯 项目定位

Personal Butler 是 **一石二鸟项目**:
1. **个人用** —— 真实日常使用(饮食 / 财务 / 健身 / 知识),保证 dogfooding 反馈
2. **深入实践** —— 借真实场景学透 3 个有挑战、含金量高的工程技术

3 个学习中心(也是 3 个 phase 的主线):

- 🧠 **本地模型微调**(LoRA + MLX + Qwen3.5-4B)
- ⚡ **KV cache 优化**(persistent cache / sharing / pruning)
- 🤖 **Multi-agent 协同**(显式 orchestrator + 跨 agent 通讯 + skill 积累)

---

## 📊 现状(2026-05-17)

### ✅ 已有
- `agents/{diet,finance,fitness}/` 三个领域 agent 雏形(JS)
- SQLite database (`butler.db`) + schema
- Dashboard 生成器 (`generate-{diet,finance,fitness,assets,dashboard}.js`)
- 架构文档 v1 + v2

### ❌ 缺失
- 不是 git 仓库 (今晚 fix)
- 没有 README (今晚 fix)
- 飞书 webhook 没接
- LLM 调用层在 JS 里(`generate-*.js`),没抽象出 `model.py`
- mimo API 还在用(打算换 MLX 本地)
- 无统一的 router / orchestrator (intent 识别还没做)
- 无显式多 agent 协同(目前是各 agent 独立)

### 🟡 待迁移
- JS → Python (架构 v2 已规划,但没开始)
- mimo → MLX + Qwen3.5-4B 本地

---

## 🗺 Roadmap

### Phase 0: 准备阶段 (本周末 + 工作日空隙)

**目标**: 把项目状态稳住,搭好后续 phase 的基础设施。

| Task | 内容 | 时长 | Ship date |
|---|---|---|---|
| 0.1 | `git init` + 写 `.gitignore` + 首次 commit | 30 min | 今晚 |
| 0.2 | 写 README.md (项目愿景 + 现状 + 怎么跑) | 1h | 今晚 |
| 0.3 | 决定 monorepo 还是 split repo (Python + JS 共处?) | 30 min | 今晚讨论 |
| 0.4 | 现有 JS 代码归类到 `legacy/` 目录, 标 deprecated | 30 min | 这周 |
| 0.5 | 创建 GitHub 私有仓库(先 private,phase 1 末 public) | 15 min | 今晚 |
| 0.6 | 现有 schema.sql + butler.db 备份到 `data/snapshots/` | 30 min | 这周 |

**Phase 0 Definition of Done**: git 仓库 + README + 决策清晰; legacy 代码隔离不阻塞新代码.

---

### Phase 1: Multi-agent Orchestrator + 本地模型集成 (5/19 – 6/15, ~4 周)

**主线技术**: Multi-agent 显式架构 + MLX 本地推理

**目标**: 把 3 个 ad-hoc agent 升级为**显式 orchestrator + 专家 agent + 跨 agent 通讯**, 同时把 LLM 从云端 mimo 换成本地 MLX + Qwen3.5-4B.

#### 1.1 基础设施 (Week 1)
- Python 项目结构 (FastAPI + uv): `src/main.py`, `src/router.py`, `src/model.py`, `src/database.py`
- `model.py` 抽象层: 同时支持 MLX 本地 / 阿里百炼 / OpenAI compatible
- 飞书 webhook 接入 (可选 v0: CLI 输入代替)
- 旧 SQLite schema 兼容,数据迁移 0 风险

#### 1.2 显式 Orchestrator (Week 2)
- `Router` 类: intent 识别(用 LLM zero-shot or 关键词 hybrid)
- `BaseAgent` 抽象: 每个领域 agent 继承,共享 prompt / tool 接口
- Agent 间通讯协议: 一条消息触发多个 agent 时怎么协调(例: "午饭 30 块吃了麻辣烫" → finance + diet)
- 灵魂(人格设定)系统: `agents/*/soul.md` 注入 system prompt

#### 1.3 三个领域 agent 重写 (Week 3)
- `agents/finance/`(远坂凛) —— 记账 + 查账
- `agents/diet/`(尤诺) —— 记饮食 + 营养查询
- `agents/fitness/`(奥古斯塔) —— 记运动 + 睡眠
- 每个 agent 用 BaseAgent + tools.py + soul.md 三件套

#### 1.4 本地模型集成 (Week 4)
- MLX + Qwen3.5-4B inference 接入 `model.py`
- 默认本地路由 + 高复杂度任务 fallback 云端
- 性能基准: 本地 vs 云端的 latency / 成本 / 准确度对比表

**Phase 1 DoD**:
- ✅ 显式 Router → BaseAgent → Tools → Model 流程跑通
- ✅ 至少 1 个 agent 完全用本地 MLX 推理
- ✅ 飞书 webhook(或 CLI)能 end-to-end 触发
- ✅ 有 5+ 个真实日常使用 case 验证 (你自己每天用)
- ✅ Benchmark 表(本地 vs 云端)写进 README

**Phase 1 技术产出**:
- Multi-agent orchestrator 设计 + LLM 本地化推理(MLX/Qwen)
- Intent-based 路由 + agent 间协同协议
- 本地 vs 云端 LLM benchmark

---

### Phase 2: 本地模型微调 (6/16 – 7/15, ~4 周)

**主线技术**: LoRA fine-tuning on Qwen3.5-4B

**目标**: 用你自己 Personal Butler 积累的数据微调本地模型,让它**更懂你的习惯 / 表达 / 偏好**.

#### 2.1 数据准备
- 从 `butler.db` 导出对话日志(去敏)
- 标注: 哪些回复你满意 / 改过 / 不满意
- 构建 LoRA 训练集(prompt-completion 对)

#### 2.2 LoRA 训练 pipeline
- MLX + LoRA adapter (apple/ml-lora-mlx 或 hugging face PEFT 等)
- 训练参数实验: rank / alpha / target modules / learning rate
- 训练日志 + loss curve 可视化

#### 2.3 评估
- Eval set: 你历史满意的 10 个对话 + 满意 ground truth
- 微调前 vs 微调后对比(BLEU / 人工 5 分制 / latency)
- A/B 在 Personal Butler 跑两版,选自己更喜欢的

#### 2.4 部署
- LoRA adapter 加载到 inference (model.py 加 adapter 选项)
- 版本管理 `data/lora_adapters/v0.1/`, v0.2/ ...

**Phase 2 DoD**:
- ✅ 至少 2 个版本 LoRA adapter 训练完
- ✅ Eval 显示微调版相对原版有可测量改善
- ✅ Personal Butler 实际在用微调版

**Phase 2 技术产出**:
- 用自有数据 LoRA 微调 Qwen3.5-4B 本地模型, 量化评估前后效果
- 构建 fine-tuning data pipeline + eval harness
- 端到端的微调闭环(数据→训练→评估→部署), 工程难度高

---

### Phase 3: KV cache 优化 (7/16 – 8/15, ~4 周)

**主线技术**: KV cache persistent / sharing / pruning

**目标**: 让本地 inference 在保持质量的前提下显著提速(latency p95 降 30%+).

#### 3.1 Persistent KV cache
- Session 间持久化 KV cache(相同 system prompt 不重算)
- 启动加速: cold start → warm cache

#### 3.2 KV cache sharing
- 多 agent 共享 system prompt 前缀的 KV cache
- 减少 prefix prefill 时间

#### 3.3 KV cache pruning / eviction
- 长 context 下的内存压力管理
- 老 cache 何时 evict 的策略

#### 3.4 Benchmarking
- Tokens/sec / latency p50/p95/p99 / memory footprint
- 优化前后对比表 / 可视化曲线

**Phase 3 DoD**:
- ✅ 至少 2 项 KV cache 优化落地
- ✅ Benchmark 表写进 README
- ✅ 实际使用感受可见提升

**Phase 3 技术产出**:
- MLX KV cache 持久化 + 共享 + pruning 优化
- LLM 推理性能优化, latency p95 优化 X%
- 深入 LLM inference internals, 工程难度高

---

### Phase 4+ : 视野(还没排, 可选)

| Phase | 主题 | 备注 |
|---|---|---|
| 4 | 视频学习管道 | 把 YouTube / B 站学习视频 → 转脚本 → 提取 skill 给 butler 用 |
| 5 | Skill 蒸馏 | distillery 项目从 Personal Butler 抽出来 OSS |
| 6 | iOS app | 飞书替换为原生 app(可选) |
| 7 | 知识图谱 | personal knowledge graph (你看过的书/文章/电影) |
| 8 | RAG over 个人文档 | 笔记 / 邮件 / 文档 RAG |

---

## 🤔 待定问题(决策记录在 docs/decisions/)

- [ ] **monorepo vs split**: Python 新代码和 JS legacy 在同一仓库, 还是分? (今晚定)
- [ ] **飞书还是 CLI 起步**: v0 用 CLI 跑通流程再接飞书? (推荐: CLI 起)
- [ ] **OSS 时机**: 什么时候 public? Phase 1 末? Phase 2 末? (我建议: Phase 1 末 + 隐去个人数据)
- [ ] **数据隐私**: 用户数据(饮食 / 财务)如何处理 OSS public 后? (建议: 数据完全 .gitignore, 只发代码 + sample 数据)
- [ ] **汇总 agent**: 是否需要一个"统筹 agent" 跨 3 个领域综合分析? (原架构里就有这个 placeholder)

---

## 💡 哲学

- **不冲 MVP** —— 这是长期项目, 每 phase 独立有意义
- **每 phase 一个技术中心** —— 学透一个, 再下一个
- **dogfooding 优先** —— 你每天用, 才知道哪好哪坏
- **可沉淀** —— 每 phase 完都留下 1-2 个能讲清楚的具体技术点
- **慢炖** —— 长线推进, 不抢占其他事的资源, 一点点炖出来

---

## 📚 学习资源(per phase)

### Phase 1 (Multi-agent + MLX)
- Anthropic Claude Agent SDK 文档(multi-agent patterns)
- Microsoft AutoGen 论文 + 仓库
- Apple MLX 文档 + examples
- mlx-lm 仓库 quickstart

### Phase 2 (Fine-tuning)
- LoRA 原论文 (Hu et al. 2021)
- Apple ML LoRA MLX 教程
- HuggingFace PEFT 文档

### Phase 3 (KV cache)
- Flash-Attention KV cache 设计
- vLLM PagedAttention 论文
- MLX KV cache 实现源码

---

## 🔗 相关项目

- [`market-intel`](https://github.com/Yo1ick/market-intel) —— 投资分析助手, 独立主项目, 不变
- distillery (TBD) —— 从 Personal Butler 抽出的 procedural memory OSS, Phase 5 启动
