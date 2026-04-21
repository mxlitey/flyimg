# Flyimg · 瞬传・瞬用

**基于 Cloudflare Workers + R2 + D1 实现的极简临时图床**

瞬传・瞬用 · 自动过期 · 全球加速 · 无感上传 · 免费额度友好

---

## 项目介绍

Flyimg（瞬传・瞬用）是一款前后端分离、无服务器、零成本的临时图片托管服务。

图片上传后会在设定时间自动清理，充分利用 Cloudflare 免费额度，适合个人日常贴图、论坛外链、临时分享等场景。

### 核心亮点

- 🚀 **Pages代理上传**：前端通过 Pages Functions 代理访问 Worker API，国内网络稳定可用
- 🔍 **MD5智能去重**：上传前计算文件MD5指纹，相同文件直接返回已有链接，避免重复上传
- 🗄️ **D1数据库驱动**：使用 Cloudflare D1 存储文件元数据，查询高效、清理精准
- 👤 **用户标识系统**：通过 user_tag 标识用户，支持查看个人已上传的未过期图片
- 🛡️ **管理后台**：基于 CRON_SECRET 鉴权，查看所有文件、删除文件、一键清理过期文件
- 🕒 **自动过期清理**：Cron 定时批量删除，支持自定义过期时间
- 🎨 **明暗双主题**：自动适配系统主题，支持手动切换
- 📱 **全响应式**：拖拽上传 / Ctrl+V 粘贴 / 点击上传 三端友好
- 💰 **完全免费**：依赖 Cloudflare 免费层，日常使用几乎不产生费用

---

## 架构设计

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   用户浏览器  │────▶│  Cloudflare Pages │────▶│   Worker    │
│  (前端页面)   │◀────│  (静态资源+代理)   │◀────│  (API服务)  │
└─────────────┘     └──────────────────┘     └──────┬──────┘
                                                     │
                                              ┌──────┴──────┐
                                              │             │
                                         ┌────▼───┐   ┌────▼───┐
                                         │  R2存储  │   │  D1数据库 │
                                         │ (图片文件)│   │ (文件元数据)│
                                         └────────┘   └────────┘
```

- **前端**：纯静态 HTML + Pages Functions → 部署在 Cloudflare Pages
- **代理**：Pages Functions `/api/*` → 代理请求至 Worker，解决国内网络连通性
- **后端**：Cloudflare Worker → 仅提供 API 服务
- **存储**：Cloudflare R2 → 公网直链输出，cacheControl 12小时
- **数据库**：Cloudflare D1 → 存储文件元数据，驱动查询与清理
- **清理**：Cron 定时触发 → 每小时基于 D1 查询批量删除过期文件

---

## 功能详情

### 上传功能

- 支持 JPG、PNG、GIF、WebP、SVG 格式
- 单文件最大 20MB（可配置）
- 上传前自动计算 MD5 指纹，相同文件秒传
- 可选填 user_tag 标识，关联用户
- 上传后生成直链、Markdown、HTML 三种格式

### 用户文件查看

- 访问 `https://前端地址/[user_tag]` 查看个人图片
- 仅显示未过期图片，用户仅有查看权限
- 支持复制图片链接

### 管理后台

- 通过 URL 参数 `?token=CRON_SECRET` 进入管理页面
- 查看所有文件（含已过期但尚未清理的，红色标识）
- 删除任意文件
- 一键清理所有过期文件
- 统计总文件数、已过期数、有效文件数

### 权限体系

| 角色 | 访问方式 | 权限 |
|------|---------|------|
| 普通用户 | 免登录 | 上传图片、通过 user_tag 查看自己的未过期图片 |
| 管理员 | URL token 参数 | 查看所有图片（含过期）、删除文件、清理过期文件 |

---

## API 文档

### 上传图片

```
POST /upload
Content-Type: multipart/form-data

参数：
  file     - 图片文件（必需）
  user_tag - 用户标识（可选，默认 anonymous）
  md5      - 文件MD5哈希（可选，用于去重）

响应：
{
  "success": true,
  "url": "https://r2-domain/filename.jpg",
  "markdown": "![图片](url)",
  "html": "<img src=\"url\" alt=\"flyimg\">",
  "expireAt": "2025-01-01T12:00:00.000Z",
  "expireHours": 12,
  "cached": false
}
```

### 查询用户图片

```
GET /my-images?user_tag=xxx

响应：
{
  "success": true,
  "images": [
    {
      "filename": "abc123.jpg",
      "url": "https://r2-domain/abc123.jpg",
      "size": 102400,
      "expire_at": "2025-01-01T12:00:00.000Z",
      "created_at": "2025-01-01T00:00:00.000Z",
      "expired": false
    }
  ]
}
```

### 查询所有图片（管理员）

```
GET /all-images
Header: X-Cron-Secret: <CRON_SECRET>

响应：
{
  "success": true,
  "images": [
    {
      "filename": "abc123.jpg",
      "url": "https://r2-domain/abc123.jpg",
      "size": 102400,
      "user_tag": "user1",
      "expire_at": "2025-01-01T12:00:00.000Z",
      "created_at": "2025-01-01T00:00:00.000Z",
      "expired": false
    }
  ]
}
```

### 删除文件（管理员）

```
POST /delete
Header: X-Cron-Secret: <CRON_SECRET>
Content-Type: application/json

Body: { "filename": "abc123.jpg" }

响应：
{ "success": true, "message": "文件已删除" }
```

### 清理过期文件（管理员）

```
POST /clean
Header: X-Cron-Secret: <CRON_SECRET>

响应：
{ "success": true, "message": "清理完成，删除了N张过期图片" }
```

### 存储统计

```
GET /stats

响应：
{
  "success": true,
  "totalFiles": 42,
  "totalSize": 10485760,
  "formattedSize": "10 MB",
  "maxStorageSize": 1073741824,
  "maxStorageFormatted": "1 GB",
  "usagePercent": 1,
  "isFull": false
}
```

---

## 一键部署

### 1. 准备工作

- 注册 [Cloudflare 账号](https://dash.cloudflare.com/)
- 创建一个 **R2 存储桶**，开启公共访问，获取公网域名
- 创建一个 **D1 数据库**

### 2. 部署后端（Worker）

#### 必需环境变量/密钥

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `R2_PUBLIC_DOMAIN` | R2 公网访问域名 | `https://pub-xxxx.r2.dev` |
| `CRON_SECRET` | 管理员鉴权密钥 + Cron清理密钥 | `a1b2c3d4e5f6` |

#### 可选环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `EXPIRE_HOURS` | `12` | 图片过期时间（小时） |
| `MAX_FILE_SIZE` | `20` | 单文件大小限制（MB） |
| `MAX_STORAGE_SIZE` | `1000` | 总存储上限（MB） |
| `ALLOWED_TYPES` | 常见图片MIME | 允许的 MIME 类型，逗号分隔 |
| `CORS_ALLOWED_ORIGINS` | `*` | 允许的跨域来源，逗号分隔 |

#### D1 数据库配置

1. 创建 D1 数据库：

```bash
wrangler d1 create flyimg-db
```

2. 将返回的 `database_id` 填入 `wrangler.toml`

3. 执行数据库迁移：

```bash
wrangler d1 execute flyimg-db --file=migrations/0001_init.sql --remote
```

#### R2 绑定

Worker → 设置 → 变量 → R2 存储桶绑定

添加绑定：**变量名 = R2_BUCKET** → 选择你的桶

#### Cron 触发器

Worker → 触发器 → 添加 Cron 触发器

表达式：`0 */1 * * *`（每小时执行一次过期清理）

### 3. 部署前端（Pages）

1. Fork 本项目
2. 新建 Pages 项目 → 连接 Git
3. 构建目录：`frontend`
4. 构建命令：**留空**
5. 设置 Pages 环境变量 `WORKER_API_URL` 为你的 Worker 地址

### 4. 配置限流（Cloudflare 原生 Rate Limiting）

在 Cloudflare Dashboard 中配置 WAF Rate Limiting 规则：

- **路径**：`/api/upload`
- **请求频率**：建议 10次/分钟
- **动作**：Block
- **超时**：60秒

此方案替代了 Worker 内部限流，性能更好且不占用 Worker CPU 时间。

---

## 数据库结构

### images 表

| 字段 | 类型 | 说明 |
|------|------|------|
| `filename` | TEXT PRIMARY KEY | 文件名（MD5哈希或时间戳随机名） |
| `url` | TEXT NOT NULL | R2 公网直链 |
| `size` | INTEGER NOT NULL | 文件大小（字节） |
| `user_tag` | TEXT NOT NULL DEFAULT 'anonymous' | 用户标识 |
| `expire_at` | TEXT NOT NULL | 过期时间（ISO 8601） |
| `created_at` | TEXT NOT NULL | 创建时间（ISO 8601） |

### 索引

| 索引名 | 字段 | 用途 |
|--------|------|------|
| `idx_images_user_tag` | `user_tag` | 用户图片查询 |
| `idx_images_expire_at` | `expire_at` | 过期文件清理 |

---

## 免费额度说明（Cloudflare）

### Workers 免费计划

- 每日请求数：**100,000**
- 每请求 CPU 时间：**10ms**

### R2 免费计划

- 存储：**10GB**
- A 类操作：100 万次 / 月
- B 类操作：1000 万次 / 月
- **出口流量完全免费**

### D1 免费计划

- 存储：**5GB**
- 行读取：5百万 / 天
- 行写入：100,000 / 天

本架构下：
- 图片不走 Worker
- 前端不走 Worker
- 仅 API 请求走 Worker（通过 Pages 代理）
- **日常使用几乎永远用不完免费额度**

---

## 工作机制

1. **上传**：前端计算 MD5 → Pages Function 代理 → Worker 校验 → 存入 R2 + D1
2. **去重**：MD5 命中已有且未过期记录 → 直接返回链接，跳过上传
3. **访问**：直接返回 R2 公网直链，cacheControl 12小时
4. **查询**：通过 D1 数据库按 user_tag 查询，仅返回未过期记录
5. **清理**：Cron 每小时查询 D1 中过期记录 → 删除 R2 文件 + D1 记录
6. **管理**：X-Cron-Secret 鉴权 → 查看全部/删除/清理

---

## 常见问题

### 1. 图片过期后多久删除？

最多延迟 **1 小时**（由 Cron 决定），不影响使用。

### 2. 可以自定义过期时间吗？

可以，修改环境变量 `EXPIRE_HOURS` 即可。

### 3. 如何限制文件大小？

修改 `MAX_FILE_SIZE`，单位 MB。

### 4. 图片直链是 R2 还是 Worker？

是 **R2 公网直链**，不经过 Worker，速度更快更省资源。

### 5. 国内网络无法上传怎么办？

本项目使用 Pages Functions 代理上传请求，前端无需直连 Worker，国内网络可正常使用。

### 6. MD5去重是如何工作的？

上传前前端计算文件 MD5 哈希，发送给 Worker。如果 D1 中已有相同哈希且未过期的记录，直接返回已有链接，不再重复上传。

### 7. 如何进入管理后台？

访问 `https://你的前端地址/?token=你的CRON_SECRET`，或在前端页面点击"管理"按钮输入密钥。

### 8. 如何配置限流？

使用 Cloudflare 原生 Rate Limiting 功能，在 Dashboard 的 WAF 中配置规则，无需在代码中实现。

---

## 项目结构

```
flyimg/
├── frontend/                # 前端静态资源
│   ├── index.html           # 主页面（上传+用户图片+管理后台）
│   ├── config.js            # 前端配置（API地址、显示参数）
│   ├── favicon.png          # 网站图标
│   ├── _redirects           # Pages 路由规则（SPA支持）
│   └── functions/           # Pages Functions
│       └── api/
│           └── [[path]].js  # API代理（转发请求至Worker）
├── worker.js                # Worker 后端 API
├── migrations/              # D1 数据库迁移
│   └── 0001_init.sql        # 初始化表结构
├── wrangler.toml            # Worker 配置
├── .github/
│   └── workflows/
│       └── deploy.yml       # GitHub Actions 部署
└── README.md
```

---

## 许可证

MIT License

---

## 贡献

欢迎提交 Issue 与 PR。

---

## 支持

如果你觉得这个项目有用，请点个 Star ⭐
