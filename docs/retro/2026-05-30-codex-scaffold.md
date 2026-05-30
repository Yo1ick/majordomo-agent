# 2026-05-30 Codex Phase 1 Scaffold 踩坑复盘

本复盘记录 Codex 在 `phase1/scaffold` 分支搭建 Phase 1 Week 1 脚手架时遇到的卡点、误判和需要自行拍板的地方。目的不是证明流程顺利，而是把下次负责人亲手做时最可能撞上的坑提前暴露出来。

## 1. Docker build 无法验证

**现象**：执行 `docker compose build` 时失败，PowerShell 报错：`docker : The term 'docker' is not recognized as the name of a cmdlet, function, script file, or operable program.`。

**根因**：当前 Windows 开发环境没有安装 Docker CLI，或者 Docker Desktop 没有加入 PATH。也就是说，本次 Dockerfile 和 `docker-compose.yml` 虽然已按预期写好，但没有真正经过镜像构建验证。

**解决**：未解决/已绕过。记录了失败原因，并继续完成 Python 侧测试、CLI smoke test 和文档。Docker 配置保持为代码审查级别，不能视为已构建通过。

**下次**：开始容器化任务前先运行 `docker --version` 和 `docker compose version`。如果命令不存在，先安装 Docker Desktop 并确认 Docker daemon 已启动，再写 Dockerfile 或 compose。

## 2. 仓库目录和 clone 状态需要先确认

**现象**：任务要求“请先 git clone 到本机”，但进入 `E:\Study\project\majordomo-agent` 后，目录为空且 `git status` 报 `fatal: not a git repository`。

**根因**：用户给的是目标工作目录，不是已经 clone 好的仓库。若不检查就直接 `uv init`，会在非仓库目录里生成孤立项目，后续分支、提交都会错位。

**解决**：先确认目录为空，再在当前目录执行 `git clone https://github.com/Yo1ick/majordomo-agent.git .`，随后从 `main` 新建 `phase1/scaffold` 分支。

**下次**：拿到开发路径后，第一步固定执行 `Get-Location`、`git status --short --branch`、`rg --files`。只有确认是目标仓库后再初始化依赖或写文件。

## 3. 文档编码显示不友好

**现象**：PowerShell 读取 README 和部分中文 docs 时出现乱码，例如中文被显示成 `涓汉` 这类内容。

**根因**：终端编码和文件编码显示不匹配。文档本身仍可用于判断目录结构和阶段目标，但不适合逐字引用。

**解决**：只从文档中提取结构性信息，例如已有 `legacy/`、`data/schema.sql`、`docs/architecture-v1.md`，没有改动旧文档中的业务描述。

**下次**：如果要大段编辑中文文档，先确认文件编码和编辑器显示。可以用支持 UTF-8 的编辑环境查看，避免在乱码基础上做内容改写。

## 4. uv 初始化和 Python 版本有隐性偏差

**现象**：执行 `uv init --bare --python 3.11` 后，`uv add` 创建虚拟环境时实际使用了本机 `E:\env\Miniconda3\python.exe`，版本是 Python 3.12.7。

**根因**：`pyproject.toml` 的 `requires-python = ">=3.11"` 允许 3.12；本机 uv 选择了可用解释器。任务要求 Python 3.11，但当前环境没有强制锁到 3.11。

**解决**：保留 `requires-python = ">=3.11"`，因为代码兼容 3.11，测试在 3.12 通过。未进一步安装或切换 3.11 解释器。

**下次**：如果必须严格 3.11，应在任务开始前运行 `uv python install 3.11`，再用 `uv venv --python 3.11` 或确认 `uv run python --version` 是 3.11。

## 5. pytest 一开始找不到 `src`

**现象**：第一次运行 `uv run pytest` 时，三个测试文件全部 collection error：`ModuleNotFoundError: No module named 'src'`。

**根因**：项目采用根目录下的 `src/` 作为普通包目录，但没有安装项目包，也没有在 pytest 配置中加入项目根目录到 import path。

**解决**：在 `pyproject.toml` 增加 pytest 配置：`pythonpath = ["."]`，同时配置 `testpaths`、coverage 参数。

**下次**：Python 项目初始化时就决定导入策略。要么用标准 package layout 并安装项目，要么显式配置 pytest 的 `pythonpath`，不要等测试收集阶段再发现。

## 6. pytest-cov 覆盖率一开始不达标

**现象**：第一轮业务测试都通过，但 coverage 只有约 66%，低于 `--cov-fail-under=80`。

**根因**：本次创建了 `database.py`、`main_cli.py` 等脚手架文件，但初始测试只覆盖了 model/router/core。coverage 会统计整个 `src`，未覆盖文件直接拉低总覆盖率。

**解决**：补了小而聚焦的测试：`test_database.py` 验证表查询示例，`test_main_cli.py` mock `input/print` 验证 CLI 循环，`test_core.py` 覆盖默认 echo core。最终覆盖率稳定在 90% 左右。

**下次**：配置 coverage fail-under 前，先列出本次会新增哪些模块。每个新增模块至少写一个 smoke test，避免为了达标后补“凑数测试”。

## 7. `.env` 污染了测试

**现象**：为了尝试 Docker compose，复制了 `.env.example` 到 `.env`。随后 `test_load_providers_builds_openai_compatible_provider_map` 失败，期望 `WIN_LAN_IP=192.168.1.8`，实际读取到了 `.env` 里的 `192.168.1.100`。

**根因**：`pydantic-settings` 默认会读取 `.env`。测试中虽然显式传了部分字段，但没有禁用 env file，导致本地环境配置影响单测结果。

**解决**：在测试构造 `Settings` 时传入 `_env_file=None`，并显式设置 `WIN_OLLAMA_BASE_URL=None`，保证测试不受本地 `.env` 影响。

**下次**：所有配置类测试都要 hermetic。测试默认禁用 `.env`，需要验证 env 行为时再单独写一个明确读取 env 的测试。

## 8. mock OpenAI 客户端需要模拟链式结构

**现象**：`ModelClient.chat()` 内部要调用 `client.chat.completions.create(...)`，测试不能依赖真实 LLM server，但也不能只 mock 一个普通函数。

**根因**：OpenAI Python SDK 的对象结构是嵌套的，返回值也有 `choices[0].message.content` 这种形状。若 mock 太简单，测试不能验证真实调用路径；若直接 patch 全局 `openai.OpenAI`，测试会脆弱。

**解决**：给 `ModelClient` 注入 `client_factory`，测试里实现 `FakeOpenAI`、`FakeChat`、`FakeCompletions`、`FakeCompletion`。这样既验证了 `base_url/api_key/model/messages`，又完全不访问网络。

**下次**：设计外部 SDK 封装时，优先把 factory/client 作为可注入依赖。mock 要模拟“本项目实际使用的最小协议”，不要模拟整个 SDK。

## 9. model.py 的消息类型一开始只支持文本

**现象**：最初 `ChatMessage = dict[str, str]`，表示 `content` 只能是字符串。后续 Mac 端验证补充说明 Gemma 4 E4B 是多模态模型，未来饮食拍照也会走同一个 `/v1/chat/completions`。

**根因**：第一版只按 Week 1 “先做文本 chat”实现，没有提前把 OpenAI-compatible 多模态 message parts 纳入类型边界。

**解决**：把 `ChatMessage` 放宽为 `dict[str, MessageContent]`，其中 `MessageContent = str | list[ContentPart]`。当前实现仍只发送文本，但 docstring 和 TODO 已明确后续要补更精确的 TypedDict 和测试。

**下次**：即使本期不实现多模态，只要模型本身是 VLM，抽象层类型就应提前承认多模态输入，避免后面改公共接口。

## 10. MLX 服务端口和服务名发生返工

**现象**：第一版按提示词写了 `mlx_lm.server` 和 `http://localhost:8000/v1`。后来收到 Mac 端真机验证补充：Gemma 4 E4B 用 `mlx_vlm.server`，端口是 8080。

**根因**：原始提示词把 MLX server 泛称为 `mlx_lm.server`，但实际模型是多模态 Gemma 4 E4B，需要 mlx-vlm。端口也以真机验证为准。

**解决**：把 `.env.example`、`src/config.py`、`docs/docker-guide.md`、`docker-compose.yml` 注释和测试断言全部从 8000 改为 8080，并记录 Mac 启动命令：`mlx_vlm.server --model mlx-community/gemma-4-e4b-it-4bit --port 8080`。

**下次**：模型服务配置要以真机启动命令为单一事实来源。写 `.env.example` 前先确认 provider、模型名、端口和容器访问地址。

## 11. Provider 配置有几处需要自行假设

**现象**：提示词要求支持 `mac-mlx`、`win-ollama`、`cloud`，但没有完全规定每个 provider 的 api_key 默认值、`WIN_LAN_IP` 和 `WIN_OLLAMA_BASE_URL` 谁优先、cloud 默认模型是什么。

**根因**：这是脚手架阶段，真实部署配置还未固定。为了让代码和测试可运行，需要做保守默认值。

**解决**：做了这些假设：本地 provider 的 api_key 用占位值 `local-dev-key` / `ollama-dev-key`；`WIN_OLLAMA_BASE_URL` 显式设置时优先，否则从 `WIN_LAN_IP` 拼出 `http://<LAN_IP>:11434/v1`；cloud 默认模型用 `gpt-4o-mini`，真实值由 `.env` 覆盖。

**下次**：配置项最好在任务描述中给出优先级和默认值。尤其是“完整 URL”和“LAN IP 拼 URL”同时存在时，要提前定义覆盖规则。

## 12. Router 关键词规则是拍板出来的

**现象**：测试要求 `"30块" -> finance`、`"吃了" -> diet`、`"跑了5公里" -> fitness`，但没有规定更多关键词、优先级、一个句子同时命中多个 intent 时怎么办。

**根因**：Week 1 只要求关键词 stub，真正的多 intent 路由是后续阶段问题。为了让 router 可测试，必须先选择简单确定性规则。

**解决**：采用 finance -> diet -> fitness 的顺序匹配，命中第一个就返回；未知消息返回 `echo`。关键词覆盖了金额、吃饭、运动的常见短语。

**下次**：如果要支持“一句话触发多个 agent”，Router 的返回值应从单个 `Intent` 改成 `list[Intent]` 或路由计划对象。这个接口选择应在 Week 2 前确认。

## 13. BaseAgent 接口形状需要自行定义

**现象**：提示词只说 `BaseAgent` 定义 `handle(intent, text)` 接口，并写一个 echo 实现，没有规定是否传 model、database、context、用户信息或返回结构化结果。

**根因**：脚手架阶段还不实现业务 agent，接口只能取最小可用边界。如果设计太复杂，会提前绑定未确定的业务形状。

**解决**：定义 `BaseAgent.handle(intent: Intent, text: str) -> str`。`EchoAgent` 可选注入 `model`；不注入时返回 deterministic echo，方便 CLI 无模型运行。

**下次**：进入真实 finance/diet/fitness 前，需要重新审查 agent 返回值是否仍应是字符串。若要支持确认流、数据库写入结果、跨 agent event，可能需要结构化 response。

## 14. core 默认是否调用真实模型需要取舍

**现象**：任务说 `uv run python -m src.main_cli` 能起 CLI，model 用 mock 或指向某 provider。但 CLI 运行时没有测试环境的 mock，也不一定有真实 LLM server。

**根因**：脚手架既要展示 model 抽象，又不能强依赖外部服务。若默认 core 直接创建 `ModelClient`，用户没起 MLX/Ollama 时 CLI 第一条消息就会报连接错误。

**解决**：默认 `build_default_core()` 使用无模型的 `EchoAgent`，保证 CLI 可用。`ModelClient` 单独完整实现并通过 mock 测试验证。

**下次**：CLI 最好支持显式模式，例如 `--use-model` 或 env `ENABLE_MODEL=true`。默认离线 echo，真机联调时再打开模型。

## 15. Docker 文档需要从旧 PostgreSQL 方向改回来

**现象**：仓库已有 `docs/docker-guide.md`，内容主要讲 PostgreSQL、OrbStack 和旧部署思路，与本次 SQLite + 应用容器不一致。

**根因**：项目路线曾经考虑过 PostgreSQL/Docker 数据库服务，但本次任务明确要求复用 SQLite schema，compose 里只有 `butler-app`。

**解决**：重写 Docker 指南，聚焦 Phase 1 应用容器、`.env`、`host.docker.internal`、SQLite volume 和 Mac 端 `mlx_vlm.server`。

**下次**：修改已有文档前先判断是“增量补充”还是“替换旧方案”。如果旧文档仍有历史价值，可以另存 archive，避免读者混淆当前部署路径。

## 16. 文件路径要求本身有歧义

**现象**：本次复盘任务里给的输出路径是 `docs/retro/2026-05-30-codex-scaffold.mds/retro/`，看起来像 `.md`、`docs/retro/` 和说明文字粘在了一起。

**根因**：提示词路径存在排版错误。如果严格按这个字符串创建，会变成奇怪的目录或无效文件名，不符合“新建复盘文档”的意图。

**解决**：按明显意图创建 `docs/retro/2026-05-30-codex-scaffold.md`。

**下次**：文档类任务最好给出可复制的精确路径，并用反引号包起来。遇到路径歧义时，优先选择项目内已有命名习惯和最小惊讶原则。

## 17. git 提交拆分需要边做边规划

**现象**：任务要求 conventional commits 且分多个原子 commit。实际开发过程中，依赖、测试、实现、Docker 文档是交错出现的。

**根因**：TDD 和脚手架实现天然会来回修改同一批文件；如果最后不整理 staging，很容易一个大 commit 把所有内容混在一起。

**解决**：最终拆成 `chore: initialize uv python project`、`test: cover phase 1 scaffold contracts`、`feat: add phase 1 application scaffold`、`chore: add docker app container`、`chore: align mlx vlm provider defaults`。每次 commit 前用 `git status` 和 `git diff --check` 检查。

**下次**：一开始就按“依赖/测试/实现/容器/修正”五类来维护 mental staging，避免收尾时费力拆分。

## 一句话总结

这次脚手架最大的风险不是 Python 代码本身，而是外部运行环境和模型服务事实源不稳定：Docker 没法本机验证、MLX 服务名和端口后来返工、`.env` 还会污染测试。

## 给项目负责人的建议

如果你自己来搭，最该提前准备三件事：第一，先把 Docker Desktop、uv、Python 3.11、Git 都验证好，别等写完 Dockerfile 才发现不能 build；第二，把 Mac 端真实模型启动命令、端口、base_url、容器访问地址写成一张配置表，再开始写 `.env.example`；第三，测试配置层时一定禁用真实 `.env`，否则本机状态会悄悄改变单测结果。

接口上要克制：Week 1 只需要稳定的 `core -> router -> agent -> model` 边界，不要急着实现 finance/diet/fitness 业务。但也要提前承认 Gemma 4 E4B 是 VLM，`model.py` 的 message 类型不要只锁死成文本字符串。
