# Docker 部署指南

> 写给几乎没有项目经验的自己看的，解释每一步为什么这么做。

---

## 一、先搞懂几个概念

### 什么是 Docker？

想象你有一个**透明的盒子**：

- 你把程序和它需要的所有东西（数据库、配置、依赖）打包放进盒子里
- 盒子里的东西和你 Mac 系统**完全隔离**，互不干扰
- 想用就启动盒子，不想用就关掉，删掉盒子系统还是干干净净的

**不用 Docker 的话：** 你直接在 Mac 上装 PostgreSQL，它会往系统里塞一堆文件、后台服务、配置。卸载不干净，版本冲突，搞坏了还影响系统。

**用 Docker 的话：** PostgreSQL 跑在盒子里，你的 Mac 系统完全不知道它的存在。不想要了？删掉盒子就行。

### 关键术语（只需要知道这四个）

| 术语 | 类比 | 说明 |
|------|------|------|
| **镜像 (Image)** | 安装光盘 | 一个打包好的程序模板，比如 `postgres:17` |
| **容器 (Container)** | 运行中的虚拟机 | 从镜像启动的一个实例，真正干活的 |
| **卷 (Volume)** | U 盘 | 数据存储，容器删了数据还在 |
| **docker-compose** | 批量启动脚本 | 一个文件定义多个容器，一键全部启动 |

### 为什么个人管家项目要用 Docker？

现在项目用的是 SQLite（一个文件就是一个数据库），简单但有局限：

| | SQLite | PostgreSQL (Docker) |
|---|--------|-------------------|
| 安装 | 不需要 | 需要（但 Docker 一键搞定） |
| 并发 | 单写入，多 Agent 会打架 | 多 Agent 同时读写没问题 |
| 数据类型 | 很基础 | JSON、数组、全文搜索都支持 |
| 备份恢复 | 手动拷文件 | 专业的备份工具 |
| 未来扩展 | 到头了 | 随便加功能 |

**结论：** 现在用 SQLite 开发没问题，但三个 Agent（记账、健康、资产）同时工作时，PostgreSQL 更稳。Docker 让你随时可以切换，不用纠结。

---

## 二、安装 OrbStack（Docker 的轻量替代品）

### 为什么用 OrbStack 而不是 Docker Desktop？

| | Docker Desktop | OrbStack |
|---|---------------|----------|
| 内存占用 | 2-4 GB | 几百 MB |
| 启动速度 | 慢 | 几秒 |
| 价格 | 个人免费，商业收费 | 个人免费 |
| Mac 适配 | 一般 | 专为 Mac 优化 |

你的 Mac Mini 只有 16GB 内存，省着点用，所以选 OrbStack。

### 安装步骤

```bash
# 1. 确认有 Homebrew（Mac 的包管理器）
brew --version

# 如果没有 Homebrew，先装它：
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. 安装 OrbStack
brew install orbstack

# 3. 打开 OrbStack（首次需要点一下同意条款）
open -a OrbStack

# 4. 验证安装成功
docker --version
docker compose version
```

### 把 Docker 数据指向外置盘

OrbStack 默认把数据存在系统盘。我们要改到外置盘，省内置盘空间。

```bash
# 数据目录已经创建好了
# 位置：/Volumes/External HD/docker-data/
```

**在 OrbStack 里设置：**

1. 点击菜单栏的 OrbStack 图标
2. 打开 Settings（设置）
3. 找到 "Data location" 或 "Disk image location"
4. 改为 `/Volumes/External HD/docker-data/`
5. 保存，OrbStack 会自动迁移数据

> **注意：** 改完之后，外置盘必须一直插着。拔掉外置盘 = Docker 用不了。
> 你的 Mac Mini 是台式机，外置盘一直连着，所以没问题。

---

## 三、启动 PostgreSQL

### 创建 docker-compose.yml

在项目根目录创建这个文件：

```yaml
# /Volumes/External HD/personal-butler/docker-compose.yml
#
# 这个文件告诉 Docker：启动哪些服务、用什么配置
# 运行 docker compose up -d 就会按这个文件把所有服务拉起来

services:
  # --- 数据库 ---
  postgres:
    image: postgres:17           # 使用 PostgreSQL 17 官方镜像
    container_name: butler-db    # 给容器起个名字，方便管理
    restart: unless-stopped      # 崩溃了自动重启，手动停止则不重启
    ports:
      - "5432:5432"              # 左边是 Mac 端口，右边是容器端口
                                 # 你的代码连 localhost:5432 就能访问
    environment:
      POSTGRES_USER: butler          # 数据库用户名
      POSTGRES_PASSWORD: butler123   # 数据库密码（正式环境要换强密码）
      POSTGRES_DB: butler_db         # 自动创建这个数据库
      TZ: Asia/Shanghai              # 时区
    volumes:
      - pgdata:/var/lib/postgresql/data    # 数据持久化（见下方解释）

# --- 数据卷 ---
# 为什么需要 volumes？
# 容器就像一个临时的盒子，删掉盒子里面的东西就没了。
# volume 相当于把数据存到盒子外面的 U 盘上。
# 这样就算删掉容器重建，数据还在。
volumes:
  pgdata:
    driver: local
```

### 启动

```bash
# 进入项目目录
cd "/Volumes/External HD/personal-butler"

# 启动（-d 表示后台运行，不占终端）
docker compose up -d

# 看看是否跑起来了
docker compose ps
```

正常的话你会看到 `butler-db` 状态是 `running`。

### 连接测试

```bash
# 方法 1：用 docker 自带的客户端连进去
docker exec -it butler-db psql -U butler -d butler_db

# 进去之后试试：
# \l          -- 列出所有数据库
# \dt         -- 列出所有表（现在是空的）
# \q          -- 退出

# 方法 2：如果装了 psql 客户端
psql -h localhost -U butler -d butler_db
```

---

## 四、日常使用命令（只需要记这几个）

```bash
# === 启动/停止 ===
docker compose up -d          # 启动所有服务
docker compose down           # 停止所有服务（数据不丢）
docker compose restart        # 重启

# === 查看状态 ===
docker compose ps             # 看哪些在跑
docker compose logs           # 看日志（出问题时用）
docker compose logs -f        # 实时跟踪日志（Ctrl+C 退出）

# === 进入数据库 ===
docker exec -it butler-db psql -U butler -d butler_db

# === 清理（谨慎使用） ===
docker compose down -v        # 停止 + 删除数据（⚠️ 数据全没）
docker system prune           # 清理不用的镜像，回收磁盘空间
```

---

## 五、数据备份与恢复

数据是最重要的，学会备份。

```bash
# 备份（导出一个 SQL 文件）
docker exec butler-db pg_dump -U butler butler_db > backup_$(date +%Y%m%d).sql

# 恢复（从备份文件导入）
cat backup_20260410.sql | docker exec -i butler-db psql -U butler -d butler_db
```

建议：每周手动备份一次，后面可以写个自动脚本。

---

## 六、项目目录结构（现在的样子）

```
/Volumes/External HD/
├── docker-data/                  ← Docker 数据（镜像、卷）
│   └── (OrbStack 自动管理)
│
└── personal-butler/              ← 你的项目代码
    ├── docker-compose.yml        ← Docker 编排文件（要创建）
    ├── data/
    │   └── schema.sql            ← 数据库表结构（已有，需要转 PostgreSQL 语法）
    ├── docs/                     ← 文档
    ├── bookkeeper/               ← 记账 Agent
    ├── intake-tracker/           ← 健康追踪 Agent
    └── asset-manager/            ← 资产管理 Agent
```

---

## 七、常见问题

### Q: 外置盘断开了怎么办？

Docker 会报错停止工作。重新插上外置盘，运行 `docker compose up -d` 就恢复了。数据不会丢。

### Q: Mac Mini 重启后 Docker 还在吗？

OrbStack 设置了开机自启的话，重启后自动恢复。容器我们配了 `restart: unless-stopped`，也会自动重启。

### Q: 之前的 SQLite schema.sql 还能用吗？

大部分能用，但有些语法要小改。比如：
- SQLite 的 `INTEGER PRIMARY KEY` → PostgreSQL 用 `SERIAL PRIMARY KEY`
- SQLite 的 `datetime('now')` → PostgreSQL 用 `NOW()`

到时候迁移的时候我帮你改。

### Q: 以后想加别的服务怎么办？

在 `docker-compose.yml` 里加就行。比如以后要加 Redis：

```yaml
services:
  postgres:
    # ... 已有的配置

  redis:
    image: redis:7
    container_name: butler-redis
    ports:
      - "6379:6379"
```

然后 `docker compose up -d`，新服务就跑起来了。这就是 Docker 的好处 — 加东西跟搭积木一样。

---

## 八、下一步

1. **安装 OrbStack** — 按第二节步骤操作
2. **配置数据目录到外置盘** — 按第二节最后的设置操作
3. **创建 docker-compose.yml** — 复制第三节的内容到项目根目录
4. **启动 PostgreSQL** — `docker compose up -d`
5. **迁移 schema.sql** — 把 SQLite 语法改成 PostgreSQL 语法
