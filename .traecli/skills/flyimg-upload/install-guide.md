# Flyimg Upload Skill 安装指南

> 本文档供 AI Agent 读取，用于指导用户安装和使用 Flyimg 上传 Skill。

## 这个 Skill 是做什么的

将本地文件上传到 Flyimg（基于 Cloudflare R2 的临时资源存储服务），返回全球可访问的公开下载直链。适合在 Agent 生成产物（图片、PDF、压缩包、代码文件等）后，上传并给用户提供下载链接。

## 前置条件

1. **已部署 Flyimg 服务**：用户需有自己的 Flyimg Worker 实例（基于本仓库部署到 Cloudflare）。
   - 部署文档：见仓库根目录 `README.md`
   - 部署后会得到一个 Worker 地址，形如 `https://flyimg.xxx.workers.dev` 或自定义域名 `https://img.example.com`

2. **运行环境**：
   - bash（Linux/macOS 自带；Windows 需 WSL 或 Git Bash）
   - `curl`（几乎所有系统自带）
   - `grep`、`sed`、`od`（基础工具，通常自带）

3. **TRAE CLI 已安装**：Skill 机制依赖 TRAE CLI。如未安装，参考 https://docs.trae.cn/cli

## 安装步骤

### 方式一：作为项目 Skill（推荐，随项目分发）

将 `flyimg-upload` 文件夹放到项目的 `.traecli/skills/` 目录下：

```
你的项目/
└── .traecli/
    └── skills/
        └── flyimg-upload/
            ├── SKILL.md
            ├── install-guide.md
            └── scripts/
                ├── setup.sh
                └── upload.sh
```

本仓库已内置此 Skill 在 `.traecli/skills/flyimg-upload/`，fork/clone 后即可使用。

### 方式二：作为全局 Skill（跨项目可用）

复制到全局目录：

```bash
mkdir -p ~/.traecli/skills
cp -r .traecli/skills/flyimg-upload ~/.traecli/skills/
```

### 安装后验证

1. **重启 TRAE CLI**（创建或修改 Skill 后必须重启才能加载）。
2. 运行内置命令查看是否加载成功：
   ```
   /skills
   ```
   面板中应出现 `flyimg-upload`。

## 首次使用配置

**首次触发本 Skill 时，Agent 会询问用户的 Flyimg Worker 地址。**

用户只需提供地址，Agent 会自动调用配置脚本写入：

```bash
bash <skill_dir>/scripts/setup.sh "https://flyimg.xxx.workers.dev"
```

配置会写入 `scripts/config.json`：
```json
{
  "worker_url": "https://flyimg.xxx.workers.dev"
}
```

之后再次使用无需重复配置。如需更换地址，重新运行 `setup.sh` 即可。

> **提示**：`config.json` 含用户专属地址，建议加入 `.gitignore` 不提交到仓库。

## 使用方式

配置完成后，Agent 会在以下场景自动触发本 Skill：

- 用户要求"上传文件"、"生成下载链接"、"把产物分享给我"
- Agent 生成产物后需要提供可下载的 URL

### 手动测试

也可直接运行脚本测试：

```bash
bash <skill_dir>/scripts/upload.sh "/path/to/your-file.zip"
```

成功输出示例（stdout，JSON 格式）：
```json
{"success": true, "url": "https://pub-xxx.r2.dev/1719000000-abcd.zip", "user_tag": "oc_1719000000_a1b2c3d4", "expireAt": "2025-06-30T12:00:00.000Z"}
```

### Agent 回复用户的标准格式

Agent 上传成功后会向用户回复：
- **下载链接**（可直接点击）
- **user_tag**（本次上传的随机标识，用于后续查询）
- **过期时间**

## user_tag 的作用

每次上传会生成形如 `oc_<时间戳>_<随机串>` 的 user_tag，例如 `oc_1719000000_a1b2c3d4`。

- **简单加密**：不同上传使用不同标识，避免被批量遍历
- **查询凭据**：可在 Flyimg 前端用此 user_tag 查询本次上传的文件列表
- **请妥善保管**：相当于该次上传的查询密钥

## 文件类型与大小限制

- **允许的类型**：由 Flyimg 部署的 `ALLOWED_TYPES` 变量决定
  - 设为 `*` 表示不限制任何类型
  - 设为扩展名列表（如 `zip,pdf,jpg`）表示仅允许这些类型
- **单文件大小**：由 `MAX_FILE_SIZE` 决定，默认 20MB
- **总存储**：由 `MAX_STORAGE_SIZE` 决定，默认 1000MB
- **过期时间**：由 `EXPIRE_HOURS` 决定，默认 12 小时

如需调整，在 Flyimg 仓库的 GitHub Variables 中修改后重新部署。

## 错误排查

| 现象 | 原因 | 解决 |
|---|---|---|
| `Config not found` | 未配置 Worker 地址 | 运行 `setup.sh` 配置 |
| HTTP 400 `不支持的文件类型` | 文件扩展名不在 `ALLOWED_TYPES` | 修改 Flyimg 部署的 `ALLOWED_TYPES` |
| HTTP 400 `文件大小超过限制` | 文件超过 `MAX_FILE_SIZE` | 调大 `MAX_FILE_SIZE` 或压缩文件 |
| HTTP 429 `存储空间已满` | 总存储达上限 | 等待过期清理或调大 `MAX_STORAGE_SIZE` |
| HTTP 000 / 网络错误 | Worker 地址错误或无法访问 | 检查地址、网络、自定义域名配置 |
| `/skills` 看不到本 Skill | 未重启 CLI 或 `name` 字段非法 | 重启 TRAE CLI；检查 `name` 仅小写字母/数字/连字符 |

## 目录结构

```
flyimg-upload/
├── SKILL.md              # Skill 入口（必需）：触发描述 + 调用流程
├── install-guide.md      # 本文档：安装与使用指南
└── scripts/
    ├── setup.sh          # 配置脚本：写入 Worker 地址
    ├── upload.sh         # 上传脚本：生成 user_tag + 调用 API
    └── config.json       # 配置文件（首次配置后生成，勿提交）
```
