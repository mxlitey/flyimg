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

## 🚀 一键部署

### 1. 准备工作

- 注册 [Cloudflare 账号](https://dash.cloudflare.com/)
- 创建一个 **R2 存储桶**
- 开启 R2 **公共访问**，获取公网域名

### 2. 部署后端（Worker）

点击下方按钮一键部署：

[![Deploy to Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/YOUR_USERNAME/flyimg)

#### 必需环境变量

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `R2_BUCKET` | R2 存储桶名称 | `my-img-bucket` |
| `R2_PUBLIC_DOMAIN` | R2 公网访问域名 | `https://pub-xxxx.r2.dev` |
| `CRON_SECRET` | 清理接口密钥（随机字符串） | `a1b2c3d4e5f6` |
| `WORKER_URL` | Worker 完整地址 | `https://xxx.yyy.workers.dev` |

#### 可选环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `EXPIRE_HOURS` | `12` | 图片过期时间（小时） |
| `MAX_FILE_SIZE` | `20` | 单文件大小限制（MB） |
| `MAX_STORAGE_SIZE` | `1000` | 总存储上限（MB） |
| `ALLOWED_TYPES` | 常见图片 | 允许的 MIME 类型，逗号分隔 |
| `CORS_ALLOWED_ORIGINS` | `*` | 允许的跨域来源，逗号分隔 |

### 3. 配置 R2 绑定

Worker → 设置 → 变量 → R2 存储桶绑定

添加绑定：**变量名 = R2_BUCKET** → 选择你的桶

### 4. 设置定时清理（Cron）

Worker → 触发器 → 添加 Cron 触发器

表达式：

```
0 */1 * * *
```

每小时执行一次过期清理。

### 5. 部署前端（Pages）

1. Fork 本项目
2. 新建 Pages 项目 → 连接 Git
3. 构建目录：`frontend`
4. 构建命令：**留空**
5. 编辑 `frontend/index.html`，将 `API_BASE` 改为你的 Worker 地址

完成访问。

***

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
├── frontend/           # 纯静态前端
│   └── index.html      # 前端页面（部署时需修改 API_BASE）
├── worker.js           # Worker 后端 API
├── .env.example        # 环境变量模板
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
