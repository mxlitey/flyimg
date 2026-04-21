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

## 🚀 一键部署指南

> **只需 4 个 Secrets，Fork 后自动部署，无需本地安装任何工具。**

### 第一步：Fork 仓库

1. 点击本页面右上角的 **Fork** 按钮
2. 在弹出的页面中直接点击 **Create fork**
3. Fork 完成后，你将拥有一个属于自己的仓库副本

### 第二步：创建 Cloudflare 资源

#### 2.1 注册 Cloudflare 账号

如果你还没有 Cloudflare 账号，请前往 [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) 注册（免费）。

#### 2.2 创建 R2 存储桶并开启公共访问

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧菜单点击 **R2 对象存储**
3. 点击 **创建存储桶**，名称填写 `flyimg`，点击创建
4. 进入刚创建的存储桶 → **设置** 标签页
5. 找到 **公共访问** 部分，点击 **允许访问**
6. 选择 **R2.dev 子域名** 方式，点击 **激活**
7. 复制显示的公网地址（格式如 `https://pub-xxxx.r2.dev`），**保存好，后面要用**

> ⚠️ 如果提示需要验证域名，请按页面指引完成验证。

#### 2.3 获取 Account ID

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 点击任意一个域名进入详情页（如果没有域名，点击左侧 **Workers 和 Pages** 也能看到）
3. 右侧栏 **API** 区域可以找到 **Account ID**，复制保存

> 也可以直接在 URL 中找到：`https://dash.cloudflare.com/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` 其中那串就是 Account ID。

#### 2.4 创建 API Token

1. 前往 [https://dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. 点击 **创建令牌**
3. 选择 **自定义令牌** → **开始使用**
4. 配置如下：
   - **令牌名称**：`flyimg-deploy`（随便取）
   - **权限**：依次添加以下 5 项
     - `Account` / `Workers Scripts` / `编辑`
     - `Account` / `D1` / `编辑`
     - `Account` / `Workers R2 存储` / `编辑`
     - `Account` / `Cloudflare Pages` / `编辑`
     - `Account` / `账户设置` / `读取`
   - **账户资源**：选择 `所有账户` 或指定账户
   - **区域资源**：`所有区域`
5. 点击 **继续显示摘要** → **创建令牌**
6. **立即复制生成的令牌值**（只显示一次！）

#### 2.5 生成 CRON_SECRET

这是一个你自己设定的随机字符串，用于管理员鉴权和定时任务验证。可以用以下方式生成：

- 在浏览器控制台输入 `crypto.randomUUID()` 回车，复制结果
- 或使用任意密码生成器生成一个 32 位以上的随机字符串
- 或随便打一串字母数字组合，如 `my-s3cr3t-k3y-2024-flyimg`

### 第三步：配置 GitHub Secrets

1. 进入你 Fork 的仓库页面
2. 点击 **Settings**（设置）
3. 左侧菜单找到 **Secrets and variables** → **Actions**
4. 点击 **New repository secret**，依次添加以下 4 个密钥：

| Secret 名称 | 填写内容 | 获取方式 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | 第 2.4 步创建的 API Token | Cloudflare → Profile → API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | 第 2.3 步获取的 Account ID | Cloudflare Dashboard URL 或 API 页面 |
| `R2_PUBLIC_DOMAIN` | 第 2.2 步获取的 R2 公网地址 | Cloudflare → R2 → flyimg 存储桶 → 设置 → 公共访问 |
| `CRON_SECRET` | 第 2.5 步生成的随机字符串 | 自己生成 |

> 💡 每个 Secret 添加后值会被隐藏，这是正常的安全行为。如果填写错误，直接编辑覆盖即可。

### 第四步：触发部署

配置好 Secrets 后，部署会自动触发。你也可以手动触发：

**自动触发**：向 `main` 分支推送任何代码变更

**手动触发**：
1. 进入仓库 → **Actions** 标签页
2. 左侧选择 **Deploy to Cloudflare**
3. 点击右侧 **Run workflow** → **Run workflow**

### 第五步：查看部署状态

1. 进入仓库 → **Actions** 标签页
2. 点击最新的 workflow 运行记录
3. 查看每个步骤的执行状态（✅ 成功 / ❌ 失败）
4. 部署成功后，在运行记录底部的 **Summary** 区域可以看到所有访问地址

### 第六步：开始使用

部署成功后：

- **前端页面**：`https://flyimg.pages.dev`（或 Actions Summary 中显示的地址）
- **管理后台**：在前端页面点击"管理"按钮，输入你设置的 `CRON_SECRET`
- **快捷管理入口**：`https://flyimg.pages.dev/?token=你的CRON_SECRET`

### 可选配置：限流防护

建议在 Cloudflare Dashboard 中配置 Rate Limiting 防止滥用：

1. 进入 Cloudflare Dashboard → **WAF** → **Rate limiting rules**
2. 点击 **Create rule**
3. 配置：
   - **Rule name**：`flyimg-upload-limit`
   - **Field**：`URI Path`
   - **Operator**：`equals`
   - **Value**：`/api/upload`
   - **Rate**：10 requests per 1 minute
   - **Action**：Block
4. 点击 **Deploy**

---

## 部署问题排查

### ❌ 部署失败：Missing required GitHub Secrets

**原因**：未配置全部 4 个必需的 GitHub Secrets。

**解决**：按照上方"第三步"补全所有 Secrets，然后重新触发部署。

### ❌ 部署失败：Failed to create D1 database

**原因**：API Token 权限不足或 D1 服务未开通。

**解决**：
1. 确认 API Token 包含 `D1 编辑` 权限
2. 在 Cloudflare Dashboard 中手动进入 D1 页面确认服务已开通
3. 手动创建数据库：在 Dashboard → D1 → 创建数据库，名称填 `flyimg-db`

### ❌ 部署失败：wrangler deploy 报错

**可能原因**：
1. API Token 权限不足 → 检查是否包含 `Workers Scripts 编辑` 权限
2. Account ID 不正确 → 重新从 Dashboard 获取
3. R2 存储桶未创建 → 在 Dashboard 中手动创建名为 `flyimg` 的 R2 存储桶

### ❌ 前端页面打开但上传失败

**可能原因**：
1. R2 公共访问未开启 → 在 R2 存储桶设置中开启
2. `R2_PUBLIC_DOMAIN` 填写错误 → 确认格式为 `https://pub-xxxx.r2.dev`
3. Worker Secrets 未生效 → 在 Actions 中重新运行部署

### ❌ 管理后台提示"未授权"

**原因**：输入的 CRON_SECRET 与 GitHub Secret 中配置的不一致。

**解决**：确认使用的是你配置在 GitHub Secrets 中的 `CRON_SECRET` 值。

### ❌ 图片上传成功但无法访问

**原因**：R2 公共访问未正确配置。

**解决**：
1. 进入 R2 存储桶 → 设置 → 公共访问
2. 确认已激活 R2.dev 子域名访问
3. 检查 `R2_PUBLIC_DOMAIN` 是否以 `https://` 开头

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
- 一键清理过期文件
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

## 可选配置

### Worker 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `EXPIRE_HOURS` | `12` | 图片过期时间（小时） |
| `MAX_FILE_SIZE` | `20` | 单文件大小限制（MB） |
| `MAX_STORAGE_SIZE` | `1000` | 总存储上限（MB） |
| `ALLOWED_TYPES` | 常见图片MIME | 允许的 MIME 类型，逗号分隔 |
| `CORS_ALLOWED_ORIGINS` | `*` | 允许的跨域来源，逗号分隔 |

修改方式：编辑 `wrangler.toml` 中的 `[vars]` 部分，推送后自动部署生效。

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

可以，修改 `wrangler.toml` 中 `EXPIRE_HOURS` 的值即可。

### 3. 如何限制文件大小？

修改 `wrangler.toml` 中 `MAX_FILE_SIZE` 的值，单位 MB。

### 4. 图片直链是 R2 还是 Worker？

是 **R2 公网直链**，不经过 Worker，速度更快更省资源。

### 5. 国内网络无法上传怎么办？

本项目使用 Pages Functions 代理上传请求，前端无需直连 Worker，国内网络可正常使用。

### 6. MD5去重是如何工作的？

上传前前端计算文件 MD5 哈希，发送给 Worker。如果 D1 中已有相同哈希且未过期的记录，直接返回已有链接，不再重复上传。

### 7. 如何进入管理后台？

访问 `https://你的前端地址/?token=你的CRON_SECRET`，或在前端页面点击"管理"按钮输入密钥。

### 8. 如何配置限流？

使用 Cloudflare 原生 Rate Limiting 功能，在 Dashboard 的 WAF 中配置规则，详见上方"可选配置：限流防护"。

### 9. 部署后如何更新代码？

从上游仓库同步代码即可：在你的 Fork 仓库页面点击 **Sync fork** → **Update branch**，推送后自动触发部署。

### 10. 如何重新部署？

进入仓库 → **Actions** → **Deploy to Cloudflare** → **Run workflow**。

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
│       └── deploy.yml       # GitHub Actions 自动部署
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
