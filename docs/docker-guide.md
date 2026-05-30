# Docker Guide for Phase 1

这份说明只覆盖 Phase 1 Week 1 的应用容器。MLX / Ollama 推理服务仍然跑在宿主机或局域网机器上，不由 `docker-compose.yml` 启动。

## 1. 为什么 compose 里只有 butler-app

当前项目有三层：

- `butler-app`：Python 应用，包含 CLI、router、core、model 抽象层。
- MLX server：生产目标是在 Mac Mini 裸机上跑 `mlx_lm.server`，它需要直接使用 Mac 的硬件能力。
- Ollama：可以跑在 Windows 或局域网其他机器上，通过 LAN IP 访问。

因此 compose 只管理应用容器。模型服务独立运行，应用通过 OpenAI-compatible HTTP API 调它们。

## 2. 准备 .env

先从模板复制一份真实配置：

```bash
cp .env.example .env
```

本机直接运行 Python 时，Mac MLX 可以用：

```env
MAC_MLX_BASE_URL=http://localhost:8000/v1
```

应用跑在 Docker 容器里时，容器里的 `localhost` 指的是容器自己，不是 Mac 宿主机。所以要改成：

```env
MAC_MLX_BASE_URL=http://host.docker.internal:8000/v1
```

如果要访问 Windows 上的 Ollama，把 `WIN_LAN_IP` 或 `WIN_OLLAMA_BASE_URL` 改成那台机器的局域网地址：

```env
WIN_LAN_IP=192.168.1.100
WIN_OLLAMA_BASE_URL=http://192.168.1.100:11434/v1
```

真实 `.env` 已在 `.gitignore` 中，不要提交。

## 3. 本地运行

安装依赖并跑测试：

```bash
uv sync
uv run pytest
```

启动 CLI：

```bash
uv run python -m src.main_cli
```

当前 CLI 默认使用 echo stub，不依赖真实 LLM server。输入 `exit` 或 `quit` 退出。

## 4. Docker 构建和运行

构建镜像：

```bash
docker compose build
```

交互式启动 CLI：

```bash
docker compose run --rm butler-app
```

查看容器配置：

```bash
docker compose config
```

## 5. SQLite 数据持久化

`docker-compose.yml` 里有这一行：

```yaml
volumes:
  - ./data:/app/data
```

意思是：容器里的 `/app/data` 映射到宿主机项目目录的 `data/`。容器删除后，SQLite 文件仍然留在宿主机。`data/*.db` 已被 gitignore 排除，避免提交个人数据。

## 6. 常见问题

`host.docker.internal` 是什么？

这是 Docker 提供的特殊主机名，让容器能访问宿主机。对本项目来说，它用于容器访问 Mac 裸机上的 `mlx_lm.server`。

为什么不把 MLX / Ollama 写成 compose service？

因为它们不是这个应用的普通依赖服务。MLX 要贴近 Mac 硬件运行；Ollama 可能在 Windows 或另一台机器上。把它们独立出来，部署边界更清楚。
