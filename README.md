<div align="center">
  <img src="frontend/favicon.png" alt="Flyimg Logo" width="80" height="80">
  <h1>Flyimg · 瞬传・瞬用</h1>
  <p>基于 Cloudflare Workers + Assets + R2 + D1 的极简临时资源存储</p>
  <p>自动过期 · 全球加速 · 免费额度友好</p>
</div>

***

## ✨ 功能特性

- 🚀 **一键部署**：Fork + 配置 Secrets，全自动部署到 Cloudflare
- 📦 **统一架构**：Workers + Assets 单一部署，前后端同域
- 📤 **直连上传**：前端直连 Worker API，架构简洁、延迟低
- 👤 **用户标识**：通过用户名区分，支持查看个人上传的文件
- 🔄 **资源续期**：支持为资源续期延长过期时间，可配置续期次数和时长
- 🛡️ **管理后台**：CRON_SECRET 鉴权，查看/删除/续期/批量操作/按用户筛选
- 🕒 **自动清理**：Cron 定时删除过期文件，支持自定义过期时间
- 🎨 **明暗主题**：自动适配系统主题，支持手动切换
- 📱 **全响应式**：拖拽 / Ctrl+V 粘贴 / 点击上传
- 💰 **完全免费**：依赖 Cloudflare 免费额度，日常使用零成本

***

## 🚀 一键部署

> **只需 4 个 Secrets，Fork 后自动部署，无需本地安装任何工具。**

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
| 权限 4 | `Account` / `账户设置` / `读取` |
| 账户资源 | 所有账户 或 指定账户 |
| 区域资源 | 所有区域 |

4. 点击 **继续显示摘要** → **创建令牌** → **立即复制**（只显示一次！）

#### 2.5 生成 CRON_SECRET

自己设定一个随机字符串，用于管理员鉴权。生成方式：

- 浏览器控制台输入 `crypto.randomUUID()` 回车
- 或任意密码生成器生成 32 位以上随机字符串
- 或随便打一串，如 `my-s3cr3t-k3y-2024-flyimg`

### 第三步：配置 GitHub Secrets 和 Variables

1. 进入你 Fork 的仓库 → **Settings** → **Secrets and variables** → **Actions**

#### 必填 Secrets（敏感信息）

点击 **Secrets** 标签页，添加以下 **2 个必填**密钥：

| Secret 名称 | 填什么 | 从哪来 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | API Token | 第 2.4 步 |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID | 第 2.3 步 |
| `CRON_SECRET` | 管理密钥 | 第 2.5 步 |

#### 必填 Variables（非敏感配置）

点击 **Variables** 标签页，添加以下 **1 个必填**变量：

| Variable 名称 | 填什么 | 从哪来 |
|---|---|---|
| `R2_PUBLIC_DOMAIN` | R2 公网地址 | 第 2.2 步 |

#### 可选 Variables（非敏感配置）

点击 **Variables** 标签页，添加以下可选变量（不设置则使用默认值）：

| Variable 名称 | 默认值 | 说明 |
|---|---|---|
| `EXPIRE_HOURS` | `12` | 文件过期时间（小时） |
| `MAX_FILE_SIZE` | `20` | 单文件大小限制（MB） |
| `MAX_STORAGE_SIZE` | `1000` | 总存储上限（MB） |
| `ALLOWED_TYPES` | `image/jpeg,image/png,image/gif,image/webp,image/svg+xml` | 允许的 MIME 类型，逗号分隔 |
| `CORS_ALLOWED_ORIGINS` | `*`（允许所有） | 允许的跨域来源，逗号分隔 |
| `RENEW_OPTIONS` | `3;60;180;360;720` | 续期配置，格式：`次数;分钟1;分钟2;...`，0表示永不过期 |

> **区别**：Variables 可以在部署日志中显示，适合非敏感配置；Secrets 会被加密隐藏，适合密钥等敏感信息。

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

### 第五步：开始使用

- **前端页面 & API**：Actions Summary 中显示的 Worker URL
- **管理后台**：点击前端页面"管理"按钮，输入 `CRON_SECRET`

***

## ⚠️ 中国大陆访问注意事项

> **重要提示**：由于中国大陆的网络环境特殊性，Cloudflare 默认的 `workers.dev` 和 `r2.dev` 子域名在大陆可能无法正常访问。如果你希望在中国大陆使用此图床，**必须为 Worker 和 R2 绑定自定义域名**。

### 为什么需要自定义域名？

Cloudflare 的免费子域名（如 `*.workers.dev`、`*.r2.dev`）在部分地区（尤其是中国大陆）可能被 DNS 污染或 SNI 阻断，导致无法访问。绑定你自己的域名可以绕过这些限制，确保稳定访问。

### 准备工作

1. **拥有一个域名**：在任意域名注册商（如 Namecheap、GoDaddy、阿里云、腾讯云等）购买域名
2. **将域名 DNS 迁移到 Cloudflare**：
   - 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - 点击 **添加站点**，输入你的域名
   - 按照提示将域名的 DNS 服务器修改为 Cloudflare 提供的 NS 服务器
   - 等待 DNS 生效（通常几分钟到几小时）

### 为 Worker 绑定自定义域名

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧菜单 → **Workers 和 Pages** → 点击 `flyimg`
3. 点击 **设置** → **域和路由** → **添加** → **自定义域**
4. 输入你的子域名（如 `img.example.com` 或 `api.example.com`）
5. Cloudflare 会自动创建 DNS 记录并签发 SSL 证书（通常几分钟）

### 为 R2 存储桶绑定自定义域名

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧菜单 → **R2 对象存储** → 点击 `flyimg` 存储桶
3. 点击 **设置** → **自定义域名** → **连接域名**
4. 输入你用于图片访问的子域名（如 `static.example.com` 或 `cdn.example.com`）
5. 选择 **自动添加 DNS 记录**，Cloudflare 会自动配置
6. 等待 SSL 证书签发完成
7. 更新 GitHub Secret `R2_PUBLIC_DOMAIN` 为新的自定义域名地址（如 `https://static.example.com`）
8. 重新触发部署

> 💡 **注意**：R2 自定义域名设置后，所有已上传的图片仍然可以通过新域名访问，无需重新上传。

### 完整配置示例

假设你拥有域名 `example.com`，建议配置如下：

| 服务 | 自定义域名 | GitHub Secret 更新 |
|------|-----------|-------------------|
| Worker（前端+API） | `img.example.com` | 无需更新，直接访问新域名 |
| R2 图片存储 | `img-cdn.example.com` | `R2_PUBLIC_DOMAIN=https://img-cdn.example.com` |

### 验证是否成功

绑定完成后，在浏览器中访问：
- 前端页面：`https://你的Worker域名`
- API 测试：`https://你的Worker域名/stats`
- 图片访问：上传一张图片后，用返回的 URL 在浏览器中打开

如果都能正常访问，说明自定义域名配置成功。

***

## 📡 API 文档

所有 API 的 Base URL 为你的 Worker 地址（如 `https://flyimg.xxx.workers.dev`）。

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
      "expired": false,
      "renew_count": 0
    }
  ],
  "renew_config": {
    "max_count": 3,
    "durations": [60, 180, 360, 720]
  }
}
```

### 续期资源

```bash
curl -X POST https://your-worker.workers.dev/renew \
  -H "Content-Type: application/json" \
  -d '{"filename": "1234567890-abc.jpg", "duration": 60, "user_tag": "myname"}'
```

**参数**：

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `filename` | String | ✅ | 文件名 |
| `duration` | Number | ✅ | 续期时长（分钟），0 表示永不过期 |
| `user_tag` | String | ✅ | 用户标识（需与上传时一致） |

**响应**：

```json
{
  "success": true,
  "message": "续期成功，新过期时间：2025-01-03T00:00:00.000Z"
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

**响应**：`{"success": true, "message": "清理完成，删除了3个过期文件"}`

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
| `RENEW_OPTIONS` | `3;60;180;360;720` | 续期配置：`次数;分钟1;分钟2;...`，0 表示永不过期 |

### R2 缓存联动

上传文件的 `cacheControl` 根据过期时间自动设置：

| EXPIRE_HOURS | cacheControl |
|---|---|
| 4 | `public, max-age=14400` |
| 12 | `public, max-age=43200` |
| 24 | `public, max-age=86400` |

***

## 🏗️ 架构

```
浏览器 ──统一域名──▶ Worker + Assets
                         │
                         ├──▶ 静态资源（免费无限制）
                         │
                         ├──▶ API 处理
                         │      │
                         │      ├──▶ R2 (文件存储)
                         │      │
                         │      └──▶ D1 (元数据)
                         │
                         └──▶ Cron 定时清理
```

- **前端**：Workers Assets 托管静态文件（免费无限制）
- **API**：Worker 处理上传、查询、删除
- **存储**：R2 公网直链输出，不经过 Worker
- **数据库**：D1 存储元数据，驱动查询与清理
- **清理**：Cron 每小时删除过期记录和对应 R2 文件

***

## 💰 免费额度

本项目设计时充分考虑了 Cloudflare 的免费额度限制，确保日常使用零成本。

### Workers（API 服务）

| 项目 | 免费额度 | 本项目典型用量 |
|------|---------|--------------|
| 请求次数 | 100,000 次/天 | 上传 10 次/天 = 20 次请求（上传 + 查询） |
| 静态资源请求 | **免费无限制** | HTML/CSS/JS 访问不消耗额度 |

### R2（对象存储）

| 项目 | 免费额度 | 本项目典型用量 |
|------|---------|--------------|
| 存储空间 | 10GB | 100 个文件 × 平均 2MB = 200MB |
| A 类操作（写入） | 1,000,000 次/月 | 每上传 1 次 = 1 次写入 |
| B 类操作（读取） | 10,000,000 次/月 | 资源直链访问不经过 Worker |
| 出站流量 | **无限量**（免费） | 所有资源访问都不消耗 Worker 请求和流量 |

### D1（数据库）

| 项目 | 免费额度 | 本项目典型用量 |
|------|---------|--------------|
| 存储空间 | 5GB | 元数据极小，每条约 200 字节 |
| 读取 | 5,000,000 次/天 | 每次查看文件列表 = 1 次读取 |
| 写入 | 100,000 次/天 | 每上传 1 次 = 1 次写入 |

### 用量总结

| 使用场景 | Workers API | 静态资源 | R2 存储 | D1 读写 |
|---------|-------------|---------|---------|---------|
| **个人轻度**（每天 5 张） | 0.035% | 免费 | 2% | 极低 |
| **个人中度**（每天 20 张） | 0.064% | 免费 | 4% | 极低 |
| **小团队**（每天 50 张） | 0.124% | 免费 | 10% | 极低 |

**总体结论**：对于个人或小团队使用，本项目在 Cloudflare 免费额度内完全可以稳定运行，**零成本**。

***

## 🔧 常见问题

### 资源过期后多久删除？

最多延迟 **1 小时**（Cron 每小时执行一次）。

### 如何自定义过期时间？

设置 GitHub Secret `EXPIRE_HOURS`，单位为小时。

### 资源直链经过 Worker 吗？

**不经过**。直链是 R2 公网地址，速度更快、不消耗 Worker 请求额度。

### 如何进入管理后台？

访问 `https://你的域名/admin`，输入 `CRON_SECRET` 进行登录。

### 如何给 Worker 绑定自定义域名？

见上方 [中国大陆访问注意事项](#-中国大陆访问注意事项)。

### 部署后如何更新代码？

Fork 仓库页面 → **Sync fork** → **Update branch**，推送后自动触发部署。

### 如何重新部署？

仓库 → **Actions** → **Deploy to Cloudflare** → **Run workflow**。

### 部署失败怎么办？

1. 确认 4 个必填 Secrets 都已正确配置
2. 确认 API Token 权限包含 Workers、D1、R2 的编辑权限
3. 确认 R2 存储桶 `flyimg` 已创建并开启公共访问
4. 查看 Actions 日志中的错误信息

### 上传成功但文件无法访问？

1. 确认 R2 存储桶已开启公共访问
2. 确认 `R2_PUBLIC_DOMAIN` 以 `https://` 开头
3. 在 R2 存储桶中确认文件已存在

***

## 📁 项目结构

```
flyimg/
├── frontend/
│   ├── index.html        # 主页面
│   ├── config.js         # 前端配置（使用相对路径）
│   └── favicon.png       # 图标
├── worker.js             # Worker 后端 API + 静态资源路由
├── migrations/
│   └── 0001_init.sql     # D1 初始化
├── wrangler.toml         # Worker 配置（含 Assets）
├── .github/workflows/
│   └── deploy.yml        # 自动部署
└── README.md
```

***

## 💾 D1 数据库说明

### 数据库初始化脚本

本项目使用 Cloudflare D1（基于 SQLite 的无服务器数据库）存储文件元数据。初始化脚本位于 `migrations/0001_init.sql`。

### 表结构

**`images` 表**：存储所有上传的文件元数据

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER | 主键，自增 ID |
| `filename` | TEXT | 文件名（唯一标识） |
| `size` | INTEGER | 文件大小（字节） |
| `user_tag` | TEXT | 用户名标签，用于区分不同用户 |
| `renew_count` | INTEGER | 已续期次数 |
| `expire_at` | TEXT | 过期时间（ISO 8601 格式） |
| `created_at` | TEXT | 创建时间（ISO 8601 格式） |

> **注意**：资源 URL 通过 `R2_PUBLIC_DOMAIN` + `filename` 动态生成，不再存储在数据库中。

### 索引

为提高查询效率，脚本创建了以下索引：

- `idx_images_user_tag`：按用户查询文件时使用
- `idx_images_expire_at`：定时任务查找过期文件时使用
- `idx_images_filename`：按文件名精确查询时使用

### 部署时自动应用

数据库迁移脚本在 GitHub Actions 部署时**自动执行**，无需手动操作。

***

## 许可证

MIT License

***

如果你觉得这个项目有用，请点个 Star ⭐
