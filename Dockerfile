# syntax=docker/dockerfile:1

# 第一阶段：builder 只负责安装依赖，最后不会直接运行服务。
FROM python:3.11-slim AS builder

# 让 Python 不生成 .pyc，容器日志也不要缓冲，方便学习和排错。
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# /app 是容器里的项目目录，后面的命令都在这里执行。
WORKDIR /app

# 用 pip 安装 uv；uv 再根据 pyproject.toml/uv.lock 安装项目依赖。
RUN pip install --no-cache-dir uv

# 先复制依赖清单，利用 Docker layer cache：代码改了但依赖没变时不用重装。
COPY pyproject.toml uv.lock ./

# 只安装生产依赖，不安装 pytest 等开发依赖。
RUN uv sync --frozen --no-dev --no-install-project

# 第二阶段：runtime 是真正运行 CLI/FastAPI 的轻量镜像。
FROM python:3.11-slim AS runtime

# 运行期同样保持日志实时输出；PATH 指向虚拟环境里的 python/命令。
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:${PATH}"

# 创建一个非 root 用户，避免应用进程拿到容器里的最高权限。
RUN useradd --create-home --shell /bin/sh appuser

# 应用目录。
WORKDIR /app

# 从 builder 复制已经安装好的虚拟环境。
COPY --from=builder /app/.venv /app/.venv

# 先创建 data 目录，后面才能把 schema.sql 放进去。
RUN mkdir -p /app/data

# 复制运行应用所需的源码和项目元数据。
COPY pyproject.toml ./
COPY src ./src
COPY data/schema.sql ./data/schema.sql

# 确保挂载 data volume 前目录存在，并把权限交给 appuser。
RUN chown -R appuser:appuser /app

# 切换到低权限用户运行。
USER appuser

# 默认跑 CLI；以后接 FastAPI 时可改成 uvicorn 入口。
CMD ["python", "-m", "src.main_cli"]
