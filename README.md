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

### 第一步：准备工作（所有部署方式都必须完成）

**1. 注册 Cloudflare 账号**

访问 [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)，用邮箱注册一个免费账号。

**2. 创建 R2 存储桶**

- 登录 Cloudflare Dashboard
- 左侧菜单找到 **R2**，点击进入
- 点击 **创建存储桶**
- 存储桶名称填写：`flyimg`（必须完全一致）
- 点击创建

**3. 开启 R2 公共访问**

- 创建完成后，点击进入 `flyimg` 存储桶
- 点击 **设置** 选项卡
- 找到 **公共访问** 区域，点击 **允许公共访问**
- 启用后，你会看到一个公网域名，格式类似：`https://pub-xxxxxxxxxxxxxxxx.r2.dev`
- **复制这个域名**，后面要用

**4. 获取 Cloudflare API Token**

- 点击右上角头像 → **我的个人资料**
- 左侧选择 **API Tokens**
- 点击 **创建 Token**
- 选择 **Edit Cloudflare Workers** 模板（点右边的「使用模板」）
- 直接点击 **继续以显示摘要**
- 点击 **创建 Token**
- **复制这个 Token**，只显示一次，后面要用

**5. 生成一个随机密钥**

随便想一串字母数字组合，比如 `a1b2c3d4e5f6g7h8`，作为清理接口的密钥。

---

### 第二步：选择一种部署方式

---

### 方式一：一键部署（最简单 ⭐ 推荐）

**适合：不想碰代码，点击按钮就能完成部署的用户**

**1. 点击部署按钮**

[![Deploy to Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mxlitey/flyimg)

点击后会自动跳转到 Cloudflare，按提示完成授权即可。

**2. 部署完成后配置变量**

部署完成后，你需要进入 Worker 的设置页面添加 2 个变量：

**进入方式：** Cloudflare Dashboard → 左侧菜单 **Workers & Pages** → 找到 `flyimg` → 点击进入 → 点击上方的 **设置** 选项卡

**① 添加 R2_PUBLIC_DOMAIN 变量**

- 在设置页面找到 **变量** 区域
- 点击 **添加变量**
- 变量名填写：`R2_PUBLIC_DOMAIN`
- 变量值填写：你刚才复制的 R2 公网域名（如 `https://pub-xxxxxxxxxxxxxxxx.r2.dev`）
- 点击 **保存**

**② 添加 CRON_SECRET 变量（加密）**

- 在同一个变量页面，点击 **添加变量**
- 变量名填写：`CRON_SECRET`
- 变量值填写：你刚才生成的随机密钥（如 `a1b2c3d4e5f6g7h8`）
- 点击变量名右边的小锁图标 🔒（加密）
- 点击 **保存**

**③ 绑定 R2 存储桶**

- 在设置页面找到 **R2 存储桶绑定** 区域
- 点击 **添加绑定**
- 变量名称填写：`R2_BUCKET`
- R2 存储桶选择：`flyimg`
- 点击 **保存**

**3. 完成！**

你的图床 Worker 已经部署成功。访问 `https://flyimg.你的账号.workers.dev` 即可看到 API 响应。

接下来还需要部署前端页面（见下方「部署前端」部分）。

---

### 方式二：GitHub Actions 自动部署

**适合：有 GitHub 账号，希望每次修改代码自动部署的用户**

**1. Fork 本项目**

- 访问 [https://github.com/mxlitey/flyimg](https://github.com/mxlitey/flyimg)
- 点击右上角的 **Fork** 按钮
- 选择你的 GitHub 账号，等待 Fork 完成

**2. 在 Fork 的仓库中设置 Secrets**

- 打开你 Fork 后的仓库（地址类似 `https://github.com/你的用户名/flyimg`）
- 点击上方的 **Settings** 选项卡
- 左侧菜单找到 **Secrets and variables** → 展开后点击 **Actions**
- 点击绿色的 **New repository secret** 按钮

需要添加以下 3 个 Secret（重复上面的步骤添加 3 次）：

| Secret 名称 | 值 | 说明 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | 你刚才复制的 API Token | 用于授权部署 |
| `R2_PUBLIC_DOMAIN` | 你刚才复制的 R2 公网域名 | 如 `https://pub-xxxx.r2.dev` |
| `CRON_SECRET` | 你刚才生成的随机密钥 | 如 `a1b2c3d4e5f6g7h8` |

**添加示例：**
- Name 填写：`CLOUDFLARE_API_TOKEN`
- Secret 粘贴：你的 API Token
- 点击 **Add secret**

**3. 触发部署**

设置完成后，有以下两种方式触发部署：

- **方式 A**：修改仓库中的任一文件，提交并推送，会自动触发部署
- **方式 B**：点击仓库上方的 **Actions** 选项卡 → 选择 **Deploy to Cloudflare Workers** → 点击 **Run workflow** → 选择 `main` 分支 → 点击 **Run workflow**

**4. 查看部署结果**

- 在 Actions 页面中可以看到部署进度
- 绿色 ✅ 表示成功，红色 ❌ 表示失败
- 点击具体的运行记录可以查看详细日志

**5. 完成！**

部署成功后，访问 `https://flyimg.你的账号.workers.dev` 即可看到 API 响应。

接下来还需要部署前端页面（见下方「部署前端」部分）。

---

### 方式三：本地 Wrangler CLI 部署

**适合：熟悉命令行，喜欢在本地操作的用户**

**1. 安装 Node.js**

如果还没安装 Node.js，访问 [https://nodejs.org](https://nodejs.org) 下载并安装 LTS 版本。

**2. 安装 Wrangler**

打开命令行（Windows 用户按 `Win + R` 输入 `cmd` 回车），执行：

```bash
npm install -g wrangler
```

**3. 登录 Cloudflare**

```bash
wrangler login
```

会弹出浏览器让你授权，点击允许即可。

**4. 确保 R2 存储桶存在**

```bash
wrangler r2 bucket create flyimg
```

如果提示已存在也没关系，说明之前已经创建过了。

**5. 设置环境变量**

```bash
wrangler secret put R2_PUBLIC_DOMAIN
```

执行后会提示你输入值，粘贴你的 R2 公网域名（如 `https://pub-xxxx.r2.dev`），回车确认。

```bash
wrangler secret put CRON_SECRET
```

同样，执行后输入你的随机密钥（如 `a1b2c3d4e5f6g7h8`），回车确认。

**6. 部署**

```bash
wrangler deploy
```

等待部署完成即可。

**7. 完成！**

访问 `https://flyimg.你的账号.workers.dev` 即可看到 API 响应。

接下来还需要部署前端页面（见下方「部署前端」部分）。

---

### 方式四：手动上传（不推荐）

**适合：不想用任何自动化工具，只想手动复制粘贴的用户**

1. Cloudflare Dashboard → **Workers & Pages** → **创建 Worker**
2. 名称填写 `flyimg`，点击部署
3. 打开项目中的 `worker.js` 文件，复制全部内容
4. 粘贴到 Worker 编辑器中，点击 **部署**
5. 进入 Worker 设置页面：
   - **变量** → 添加 `R2_PUBLIC_DOMAIN`（值：R2 公网域名）
   - **变量** → 添加 `CRON_SECRET`（值：随机密钥，点击小锁加密）
   - **R2 存储桶绑定** → 添加绑定，变量名 `R2_BUCKET`，选择 `flyimg`
   - **触发器** → 添加 Cron 触发器，表达式 `0 */1 * * *`

---

## 🖥️ 部署前端（Page）

Worker 部署完成后，你还需要部署前端页面才能正常使用图床。

**1. Fork 本项目**（如果还没 Fork）

访问 [https://github.com/mxlitey/flyimg](https://github.com/mxlitey/flyimg)，点击 Fork。

**2. 修改前端配置**

- 打开你 Fork 的仓库
- 进入 `frontend/index.html` 文件
- 点击编辑按钮（铅笔图标 ✏️）
- 找到第 69 行左右的这行代码：

```javascript
const API_BASE = 'https://your-worker-name.your-account.workers.dev';
```

- 把地址改为你自己的 Worker 地址：

```javascript
const API_BASE = 'https://flyimg.你的账号.workers.dev';
```

- 提交修改

**3. 创建 Cloudflare Pages 项目**

- Cloudflare Dashboard → 左侧菜单 **Workers & Pages**
- 点击 **创建** → 选择 **Pages**
- 点击 **连接到 Git**
- 授权后选择你 Fork 的 `flyimg` 仓库
- 配置构建设置：
  - **构建目录** 填写：`frontend`
  - **构建命令** 留空（什么都不填）
- 点击 **保存并部署**

**4. 完成！**

部署完成后，你会得到一个 Pages 网址（类似 `https://flyimg-xxxx.pages.dev`），这就是你的图床前端地址。

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
│   └── index.html         # 前端页面（部署时需修改 API_BASE）
├── worker.js              # Worker 后端 API
├── wrangler.toml          # Wrangler 配置文件（R2 桶固定为 "flyimg"）
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
