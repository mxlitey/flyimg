# Flyimg・瞬图

**基于 Cloudflare Workers + R2 实现的极简临时图床**

自动过期・全球加速・无感上传・免费额度友好

***

## 🌟 项目介绍

Flyimg（瞬图）是一款**前后端分离、无服务器、零成本**的临时图片托管服务。

图片上传后会在设定时间自动清理，充分利用 Cloudflare 免费额度，适合个人日常贴图、论坛外链、临时分享等场景。

### 核心亮点

- 🚀 **极致省资源**：图片直接走 R2 公网直链，**不经 Worker 转发**
- 🧩 **前后端分离**：前端静态部署，API 仅处理上传 / 统计 / 清理
- 🕒 **自动过期清理**：Cron 定时批量删除，支持自定义过期时间
- 📊 **存储用量可视化**：实时显示文件数与存储空间占用
- 🎨 **明暗双主题**：自动适配系统主题，支持手动切换
- 📱 **全响应式**：拖拽上传 / Ctrl+V 粘贴 / 点击上传 三端友好
- 💰 **完全免费**：依赖 Cloudflare 免费层，日常使用几乎不产生费用

***

## 🏗️ 架构设计

- **前端**：纯静态 HTML → 部署在 Cloudflare Pages
- **后端**：Cloudflare Worker → 仅提供 API 服务
- **存储**：Cloudflare R2 → 公网直链输出，不走 Worker
- **清理**：Cron 定时触发 → 每小时批量删除过期文件

**优势**：

- Worker 请求量减少 **90%+**
- 图片加载更快、更稳定
- 免费额度可以支撑极大流量

***

## 🚀 部署指南

### 方式一：GitHub Actions 一键部署（推荐 ⭐）

**只需 Fork 项目、设置 5 个 Secrets，推送代码即可自动部署 Worker + Pages 前后端**

#### 1. 准备工作

**① 注册 [Cloudflare 账号](https://dash.cloudflare.com/sign-up)**

**② 创建 R2 存储桶**

- Dashboard → 左侧 **R2** → **创建存储桶**
- 名称必须为：`flyimg`
- 开启 **公共访问**，记录公网域名（如 `https://pub-xxxx.r2.dev`）

**③ 获取 API Token**

- 右上角头像 → **我的个人资料** → **API Tokens** → **创建 Token**
- 选择 **Edit Cloudflare Workers** 模板
- 点击 **继续以显示摘要** → **创建 Token**
- **复制 Token**（只显示一次）

**④ 准备一个随机密钥**

自己想一串字母数字组合，如 `a1b2c3d4e5f6g7h8`。

**⑤ 获取 Cloudflare 子域名**

Cloudflare Dashboard → 首页右侧栏查看你的子域名。
格式类似 `xxxxxxx`，你的 Worker 地址会是 `https://flyimg-worker.xxxxxxx.workers.dev`。

#### 2. Fork 项目

访问 [https://github.com/mxlitey/flyimg](https://github.com/mxlitey/flyimg)，点击右上角 **Fork**。

#### 3. 设置 Secrets

打开 Fork 后的仓库 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

添加以下 5 个 Secrets：

| Secret 名称 | 值 | 在哪找到 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | 你复制的 API Token | Cloudflare → 个人资料 → API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | 你的账户 ID | Cloudflare → 首页右侧栏 → 账户 ID |
| `WORKER_SUBDOMAIN` | 你的 Cloudflare 子域名 | Cloudflare → 首页右侧栏 → 账户 ID 下方 |
| `R2_PUBLIC_DOMAIN` | R2 公网域名 | R2 → 存储桶 → 设置 → 公共访问 |
| `CRON_SECRET` | 你准备的随机密钥 | 自己随便写的字母数字组合 |

#### 4. 触发部署

点击仓库上方的 **Actions** → 选择 **Deploy to Cloudflare** → 点击 **Run workflow** → 选择 `main` 分支 → 点击 **Run workflow**

等待部署完成（绿色 ✅）即可。

#### 5. 完成！

部署完成后：
- **Worker API 地址**：`https://flyimg-worker.你的子域名.workers.dev`
- **前端页面地址**：`https://flyimg.你的子域名.pages.dev`

---

## 📷 使用说明

1. 打开前端页面
2. 点击 / 拖拽 / Ctrl+V 粘贴上传图片
3. 自动生成：直链 / Markdown / HTML 三种格式
4. 图片将在 N 小时后自动删除
5. 系统每小时批量清理一次过期文件

***

## 📊 免费额度说明（Cloudflare）

### Workers 免费计划

- 每日请求数：**100,000**
- 每请求 CPU 时间：**10ms**

### R2 免费计划

- 存储：**10GB**
- A 类操作：100 万次 / 月
- B 类操作：1000 万次 / 月
- **出口流量完全免费**

本架构下：

- 图片不走 Worker
- 前端不走 Worker
- 仅上传 / 统计 / 清理走 API

**日常使用几乎永远用不完免费额度**

***

## 🧠 工作机制

1. **上传**：Worker 校验文件 → 存入 R2 → 记录过期时间
2. **访问**：直接返回 R2 公网直链，不经 Worker
3. **清理**：Cron 每小时遍历所有文件 → 删除已过期内容
4. **统计**：只统计未过期文件数量与占用空间

***

## 🔧 常见问题

### 1. 图片过期后多久删除？

最多延迟 **1 小时**（由 Cron 决定），不影响使用。

### 2. 可以自定义过期时间吗？

可以，修改环境变量 `EXPIRE_HOURS` 即可。

### 3. 如何限制文件大小？

修改 `MAX_FILE_SIZE`，单位 MB。

### 4. 图片直链是 R2 还是 Worker？

是 **R2 公网直链**，不经过 Worker，速度更快更省资源。

### 5. 能否用于公开图床？

可以，但建议设置合理存储上限，避免被滥用。

### 6. 如何防止被滥用？

- 设置 `MAX_FILE_SIZE` 和 `MAX_STORAGE_SIZE` 限制
- 配置 `CORS_ALLOWED_ORIGINS` 限制允许的来源域名
- Worker 内置简单的速率限制（每分钟最多 10 次上传）

***

## 📁 项目结构

```
flyimg/
├── frontend/              # 纯静态前端
│   ├── index.html         # 前端页面
│   └── config.js          # API 配置（部署时自动生成）
├── worker.js              # Worker 后端 API
├── wrangler.toml          # Wrangler 配置文件
├── .github/
│   └── workflows/
│       └── deploy.yml     # GitHub Actions 自动部署
├── .gitignore
├── LICENSE
└── README.md
```

***

## 📄 许可证

MIT License

***

## 🤝 贡献

欢迎提交 Issue 与 PR。

***

## ⭐ 支持

如果你觉得这个项目有用，请点个 Star ⭐
