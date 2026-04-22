<div align="center">
  <img src="frontend/favicon.png" alt="Flyimg Logo" width="80" height="80">
  <h1>Flyimg · 瞬传・瞬用</h1>
  <p>基于 Cloudflare Workers + R2 + D1 的极简临时图床</p>
  <p>自动过期 · 全球加速 · 免费额度友好</p>
</div>

***

## ✨ 功能特性

- 🚀 **一键部署**：Fork + 配置 Secrets，全自动部署到 Cloudflare
- 📤 **直连上传**：前端直连 Worker API，架构简洁、延迟低
- 👤 **用户标识**：通过用户名区分，支持查看个人上传的文件
- 🛡️ **管理后台**：CRON\_SECRET 鉴权，查看/删除/批量操作/按用户筛选
- 🕒 **自动清理**：Cron 定时删除过期文件，支持自定义过期时间
- 🎨 **明暗主题**：自动适配系统主题，支持手动切换
- 📱 **全响应式**：拖拽 / Ctrl+V 粘贴 / 点击上传
- 💰 **完全免费**：依赖 Cloudflare 免费额度，日常使用零成本

***

## 🚀 一键部署

> **只需 5 个 Secrets，Fork 后自动部署，无需本地安装任何工具。**

### 第一步：Fork 仓库

1. 点击本页面右上角 **Fork**
2. 直接点击 **Create fork**

### 第二步：准备 Cloudflare 资源

#### 2.1 注册 Cloudflare

前往 <https://dash.cloudflare.com/sign-up> 注册（免费）。

#### 2.2 创建 R2 存储桶

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧菜单 → **R2 对象存储** → **创建存储桶**
3. 名称填 `flyimg`，点击创建
4. 进入存储桶 → **设置** → **公共访问** → **允许访问**
5. 选择 **R2.dev 子域名** → **激活**
6. 复制公网地址（如 `https://pub-xxxx.r2.dev`），**后面要用**

#### 2.3 获取 Account ID

在 Dashboard 点击任意域名（或左侧 **Workers 和 Pages**），右侧 **API** 区域可找到 **Account ID**。

> 也可从 URL 获取：`https://dash.cloudflare.com/xxxxxxxx` 其中 `xxxxxxxx` 就是 Account ID。

#### 2.4 创建 API Token

1. 前往 <https://dash.cloudflare.com/profile/api-tokens>
2. **创建令牌** → **自定义令牌** → **开始使用**
3. 配置：

| 项目 | 设置 |
|------|------|
| 令牌名称 | `flyimg-deploy`（随意） |
| 权限 1 | `Account` / `Workers Scripts` / `编辑` |
| 权限 2 | `Account` / `D1` / `编辑` |
| 权限 3 | `Account` / `Workers R2 存储` / `编辑` |
| 权限 4 | `Account` / `Cloudflare Pages` / `编辑` |
| 权限 5 | `Account` / `账户设置` / `读取` |
| 账户资源 | 所有账户 或 指定账户 |
| 区域资源 | 所有区域 |

4. 点击 **继续显示摘要** → **创建令牌** → **立即复制**（只显示一次！）

#### 2.5 生成 CRON\_SECRET

自己设定一个随机字符串，用于管理员鉴权。生成方式：

- 浏览器控制台输入 `crypto.randomUUID()` 回车
- 或任意密码生成器生成 32 位以上随机字符串
- 或随便打一串，如 `my-s3cr3t-k3y-2024-flyimg`

### 第三步：配置 GitHub Secrets

1. 进入你 Fork 的仓库 → **Settings** → **Secrets and variables** → **Actions**
2. 点击 **New repository secret**，添加以下 **5 个必填**密钥：

| Secret 名称 | 填什么 | 从哪来 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | API Token | 第 2.4 步 |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID | 第 2.3 步 |
| `R2_PUBLIC_DOMAIN` | R2 公网地址 | 第 2.2 步 |
| `CRON_SECRET` | 管理密钥 | 第 2.5 步 |
| `WORKER_URL` | Worker 访问地址 | 部署后获取（见下方） |

> ⚠️ `WORKER_URL` 需要部署后才能获取。先填一个占位值（如 `https://placeholder.workers.dev`），部署成功后再修改为实际地址。

**可选配置**（不设置则使用默认值）：

| Secret 名称 | 默认值 | 说明 |
|---|---|---|
| `EXPIRE_HOURS` | `12` | 文件过期时间（小时） |
| `MAX_FILE_SIZE` | `20` | 单文件大小限制（MB） |
| `MAX_STORAGE_SIZE` | `1000` | 总存储上限（MB） |
| `ALLOWED_TYPES` | `image/jpeg,image/png,image/gif,image/webp,image/svg+xml` | 允许的 MIME 类型，逗号分隔 |
| `CORS_ALLOWED_ORIGINS` | `*`（允许所有） | 允许的跨域来源，逗号分隔 |

<details>
<summary>📋 ALLOWED_TYPES 常用 MIME 类型参考</summary>

**图片**：
- `image/jpeg` — JPG
- `image/png` — PNG
- `image/gif` — GIF
- `image/webp` — WebP
- `image/svg+xml` — SVG
- `image/bmp` — BMP
- `image/x-icon` — ICO

**音频**：
- `audio/mpeg` — MP3
- `audio/wav` — WAV
- `audio/ogg` — OGG
- `audio/mp4` — M4A
- `audio/aac` — AAC

**视频**：
- `video/mp4` — MP4
- `video/webm` — WebM
- `video/quicktime` — MOV
- `video/x-msvideo` — AVI

**示例**：同时允许图片和视频 → `image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm`

</details>

### 第四步：触发部署

配置好 Secrets 后，部署会自动触发。也可手动触发：

1. 仓库 → **Actions** → **Deploy to Cloudflare** → **Run workflow**

### 第五步：获取 Worker URL 并更新 Secret

1. 部署成功后，进入 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers 和 Pages**
2. 点击 `flyimg-worker` → 在详情页复制访问地址（如 `https://flyimg-worker.你的子域名.workers.dev`）
3. 回到 GitHub 仓库 → **Settings** → **Secrets** → 更新 `WORKER_URL` 为实际地址
4. 再次触发部署（**Actions** → **Run workflow**）

### 第六步：开始使用

- **前端页面**：Actions Summary 中显示的 Pages 地址
- **管理后台**：点击前端页面"管理"按钮，输入 `CRON_SECRET`

***

## 🌐 为 Worker 添加自定义域名

部署完成后，如果你想用自定义域名（如 `https://img.example.com`）替代默认的 `workers.dev` 地址：

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧菜单 → **Workers 和 Pages** → 点击 `flyimg-worker`
3. 点击 **设置** → **域和路由** → **添加** → **自定义域**
4. 输入你的域名（如 `img.example.com`），Cloudflare 会自动配置 DNS
5. 等待 SSL 证书签发（通常几分钟）
6. 更新 GitHub Secret `WORKER_URL` 为自定义域名地址
7. 重新触发部署

> 💡 域名必须已托管在 Cloudflare（即域名的 DNS 由 Cloudflare 管理）。

***

## 📡 API 文档

所有 API 的 Base URL 为你的 Worker 地址（如 `https://flyimg-worker.xxx.workers.dev`）。

### 上传文件

```bash
curl -X POST https://your-worker.workers.dev/upload \
  -F "file=@/path/to/image.jpg" \
  -F "user_tag=myname"
```

**参数**：

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `file` | File | ✅ | 要上传的文件 |
| `user_tag` | String | ❌ | 用户名，默认 `default` |

**响应**：

```json
{
  "success": true,
  "url": "https://pub-xxx.r2.dev/1234567890-abc.jpg",
  "markdown": "![图片](https://pub-xxx.r2.dev/1234567890-abc.jpg)",
  "html": "<img src=\"https://pub-xxx.r2.dev/1234567890-abc.jpg\" alt=\"flyimg\">",
  "expireAt": "2025-01-02T00:00:00.000Z",
  "expireHours": 12
}
```

### 查询用户文件

```bash
curl https://your-worker.workers.dev/my-images?user_tag=myname
```

**响应**：

```json
{
  "success": true,
  "images": [
    {
      "filename": "1234567890-abc.jpg",
      "url": "https://pub-xxx.r2.dev/1234567890-abc.jpg",
      "size": 1048576,
      "expire_at": "2025-01-02T00:00:00.000Z",
      "created_at": "2025-01-01T12:00:00.000Z",
      "expired": false
    }
  ]
}
```

### 查询所有文件（管理员）

```bash
curl https://your-worker.workers.dev/all-images \
  -H "X-Cron-Secret: your-cron-secret"
```

### 删除文件（管理员）

```bash
curl -X POST https://your-worker.workers.dev/delete \
  -H "X-Cron-Secret: your-cron-secret" \
  -H "Content-Type: application/json" \
  -d '{"filename": "1234567890-abc.jpg"}'
```

**响应**：`{"success": true, "message": "文件已删除"}`

### 清理过期文件（管理员）

```bash
curl -X POST https://your-worker.workers.dev/clean \
  -H "X-Cron-Secret: your-cron-secret"
```

**响应**：`{"success": true, "message": "清理完成，删除了3张过期图片"}`

### 存储统计

```bash
curl https://your-worker.workers.dev/stats
```

**响应**：

```json
{
  "success": true,
  "totalFiles": 42,
  "totalSize": 10485760,
  "formattedSize": "10 MB",
  "maxStorageSize": 1048576000,
  "maxStorageFormatted": "1000 MB",
  "usagePercent": 1,
  "isFull": false
}
```

***

## ⚙️ 配置说明

所有配置通过 GitHub Secrets 设置，部署时自动生效。未设置时使用默认值。

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `EXPIRE_HOURS` | `12` | 文件过期时间（小时），同时决定 R2 缓存的 max-age |
| `MAX_FILE_SIZE` | `20` | 单文件大小限制（MB） |
| `MAX_STORAGE_SIZE` | `1000` | 总存储上限（MB） |
| `ALLOWED_TYPES` | `image/jpeg,image/png,image/gif,image/webp,image/svg+xml` | 允许的 MIME 类型，逗号分隔 |
| `CORS_ALLOWED_ORIGINS` | `*` | 允许的跨域来源，逗号分隔 |

### R2 缓存联动

上传文件的 `cacheControl` 根据过期时间自动设置：

| EXPIRE\_HOURS | cacheControl |
|---|---|
| 4 | `public, max-age=14400` |
| 12 | `public, max-age=43200` |
| 24 | `public, max-age=86400` |

***

## 🏗️ 架构

```
浏览器 ──直连──▶ Worker (API) ──▶ R2 (文件存储)
                     │
                     └──▶ D1 (元数据)
```

- **前端**：Cloudflare Pages 托管静态 HTML
- **API**：Cloudflare Worker，CORS 允许跨域
- **存储**：R2 公网直链输出，不经过 Worker
- **数据库**：D1 存储元数据，驱动查询与清理
- **清理**：Cron 每小时删除过期记录和对应 R2 文件

***

## 💰 免费额度

| 服务 | 免费额度 | 本项目用量 |
|------|---------|-----------|
| Workers | 100,000 请求/天 | 仅 API 请求 |
| R2 | 10GB 存储 + 出口免费 | 图片直链不走 Worker |
| D1 | 5GB 存储 + 5M 读/天 | 元数据查询 |
| Pages | 500 次构建/月 | 部署时构建 |

**日常使用几乎用不完免费额度。**

***

## 🔧 常见问题

### 图片过期后多久删除？

最多延迟 **1 小时**（Cron 每小时执行一次）。

### 如何自定义过期时间？

设置 GitHub Secret `EXPIRE_HOURS`，单位为小时。

### 图片直链经过 Worker 吗？

**不经过**。直链是 R2 公网地址，速度更快、不消耗 Worker 请求额度。

### 如何进入管理后台？

点击前端页面"管理"按钮，输入 `CRON_SECRET`。也可通过 URL `?token=你的CRON_SECRET` 直接进入。

### 如何给 Worker 绑定自定义域名？

见上方 [🌐 为 Worker 添加自定义域名](#-为-worker-添加自定义域名)。

### 部署后如何更新代码？

Fork 仓库页面 → **Sync fork** → **Update branch**，推送后自动触发部署。

### 如何重新部署？

仓库 → **Actions** → **Deploy to Cloudflare** → **Run workflow**。

### 部署失败怎么办？

1. 确认 5 个必填 Secrets 都已正确配置
2. 确认 API Token 权限包含 Workers、D1、R2、Pages 的编辑权限
3. 确认 R2 存储桶 `flyimg` 已创建并开启公共访问
4. 查看 Actions 日志中的错误信息

### 上传成功但图片无法访问？

1. 确认 R2 存储桶已开启公共访问
2. 确认 `R2_PUBLIC_DOMAIN` 以 `https://` 开头
3. 在 R2 存储桶中确认文件已存在

***

## 📁 项目结构

```
flyimg/
├── frontend/
│   ├── index.html        # 主页面
│   ├── config.js         # 前端配置（部署时自动生成）
│   ├── favicon.png       # 图标
│   └── _redirects        # Pages 路由规则
├── worker.js             # Worker 后端 API
├── migrations/
│   └── 0001_init.sql     # D1 初始化
├── wrangler.toml         # Worker 配置
├── .github/workflows/
│   └── deploy.yml        # 自动部署
└── README.md
```

***

## 许可证

MIT License

***

如果你觉得这个项目有用，请点个 Star ⭐
