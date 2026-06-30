# Flyimg Upload Skill 安装指南（AgentSkills 规范）

> **本文档供 AI Agent 读取。** 用户把本文档的链接发给 Agent 后，Agent 应按本文档指令从 GitHub 下载 Skill 文件并完成安装，**不要本地创建文件内容**。

---

## 一、这个 Skill 是做什么的

将本地文件上传到 Flyimg（基于 Cloudflare R2 的临时资源存储服务），返回全球可访问的公开下载直链。适合在 Agent 生成产物（图片、PDF、压缩包、代码文件等）后，上传并给用户提供下载链接。

核心特性：
- 首次使用时询问用户的 Flyimg Worker 地址并写入本地配置
- 每次上传基于时间戳+随机数生成 user_tag（简单加密标识）
- 上传后向用户返回下载链接 + user_tag + 过期时间

---

## 二、兼容的 Agent 工具

本 Skill 遵循 **AgentSkills 规范**（`SKILL.md` + YAML frontmatter），兼容以下工具：

| 工具 | 项目级目录 | 全局级目录 | `{baseDir}` 占位符 |
|---|---|---|---|
| **Claude Code** | `.claude/skills/flyimg-upload/` | `~/.claude/skills/flyimg-upload/` | 不替换，需用实际路径 |
| **Codex CLI** | `.agents/skills/flyimg-upload/` | `~/.agents/skills/flyimg-upload/` | 不替换，需用实际路径 |
| **OpenClaw（龙虾）** | `<workspace>/skills/flyimg-upload/` | `~/.openclaw/skills/flyimg-upload/` | ✅ 自动替换为实际路径 |

> 不支持 Cursor / Windsurf / Cline（它们使用规则文件注入模式，不执行脚本）。

---

## 三、前置条件

1. **已部署 Flyimg 服务**：用户需有自己的 Flyimg Worker 实例，部署后会得到一个地址，形如 `https://flyimg.xxx.workers.dev` 或自定义域名 `https://img.example.com`。若用户尚未部署，告知其需先部署 Flyimg（基于 https://github.com/mxlitey/flyimg 仓库）。

2. **运行环境**：
   - bash（Linux/macOS 自带；Windows 需 WSL 或 Git Bash）
   - `curl`、`git`（基础工具，通常自带）

3. **已安装兼容的 Agent 工具**：Claude Code / Codex CLI / OpenClaw 任一。

---

## 四、安装步骤

### 步骤 1：确定用户使用的工具与安装位置

询问用户（若用户未明确指定）：

1. **使用哪个 Agent 工具？**（Claude Code / Codex CLI / OpenClaw）
2. **安装到项目级还是全局级？**
   - 项目级：仅当前项目可用，可提交到 git 与团队共享
   - 全局级：所有项目可用，仅本人使用

根据选择确定**安装根目录** `<INSTALL_ROOT>`：

| 工具 + 范围 | `<INSTALL_ROOT>` |
|---|---|
| Claude Code 项目级 | `<当前项目>/.claude/skills/flyimg-upload` |
| Claude Code 全局级 | `~/.claude/skills/flyimg-upload` |
| Codex CLI 项目级 | `<当前项目>/.agents/skills/flyimg-upload` |
| Codex CLI 全局级 | `~/.agents/skills/flyimg-upload` |
| OpenClaw 项目级 | `<当前工作区>/skills/flyimg-upload` |
| OpenClaw 全局级 | `~/.openclaw/skills/flyimg-upload` |

### 步骤 2：从 GitHub 下载 Skill 文件

执行以下命令，直接从 GitHub 下载全部 3 个文件到 `<INSTALL_ROOT>`：

```bash
# 设置安装根目录（替换为步骤1确定的路径）
INSTALL_ROOT="<INSTALL_ROOT>"

# 创建目录
mkdir -p "$INSTALL_ROOT/scripts"

# GitHub raw 文件基础路径
BASE_URL="https://raw.githubusercontent.com/mxlitey/flyimg/main/skills/flyimg-upload"

# 下载 SKILL.md
curl -fsSL "$BASE_URL/SKILL.md" -o "$INSTALL_ROOT/SKILL.md"

# 下载脚本
curl -fsSL "$BASE_URL/scripts/setup.sh" -o "$INSTALL_ROOT/scripts/setup.sh"
curl -fsSL "$BASE_URL/scripts/upload.sh" -o "$INSTALL_ROOT/scripts/upload.sh"

# 设置脚本可执行权限
chmod +x "$INSTALL_ROOT/scripts/setup.sh" "$INSTALL_ROOT/scripts/upload.sh"

# 验证下载
ls -la "$INSTALL_ROOT" "$INSTALL_ROOT/scripts"
```

**验证要点**：
- 3 个文件都已下载（`SKILL.md`、`scripts/setup.sh`、`scripts/upload.sh`）
- 两个脚本有可执行权限（`-rwx` 开头）
- 若任一 `curl` 失败（非 0 退出），停止安装并告知用户：可能是网络问题或 GitHub 仓库地址变更

### 步骤 3：（可选）加入 .gitignore

`scripts/config.json` 会在首次配置时生成，含用户专属 Worker 地址，不应提交到仓库。若用户的项目使用 git 且选择了**项目级安装**，建议在项目根 `.gitignore` 中追加：

```
# Flyimg Skill 本地配置（含 Worker 地址，勿提交）
.claude/skills/flyimg-upload/scripts/config.json
.agents/skills/flyimg-upload/scripts/config.json
skills/flyimg-upload/scripts/config.json
```

### 步骤 4：告知用户重启 Agent 工具

**Skill 创建后不会立即生效，必须重启 Agent 工具才能加载。** 明确告知用户：

- **Claude Code**：完全退出（cmd-Q / Ctrl-C 后重新打开），在项目目录运行 `claude`，输入 `/` 查看是否出现 `flyimg-upload`
- **Codex CLI**：重启 Codex 会话，运行 `codex` 检查 skill 加载日志
- **OpenClaw（龙虾）**：在「技能模块」面板查看是否出现 `flyimg-upload`，或重启龙虾进程

---

## 五、首次使用说明（告知用户）

安装并重启后，用户首次对 Agent 说"上传文件"之类的话时，Skill 会自动触发：

1. Agent 检查 `scripts/config.json` 是否存在
2. **不存在 → 询问用户**："请提供你部署的 Flyimg Worker 地址"
3. 用户回答后，Agent 自动调用 `setup.sh` 写入配置
4. 之后每次上传会自动生成随机 user_tag 并上传，返回下载链接 + user_tag + 过期时间

用户无需手动配置，Agent 会引导完成。

---

## 六、user_tag 的作用

每次上传生成形如 `oc_<时间戳>_<随机串>` 的 user_tag，例如 `oc_1719000000_a1b2c3d4`：

- **简单加密**：不同上传使用不同标识，避免被批量遍历
- **查询凭据**：可在 Flyimg 前端用此 user_tag 查询本次上传的文件列表
- **请妥善保管**：相当于该次上传的查询密钥

---

## 七、文件类型与大小限制

由用户部署的 Flyimg 服务的 GitHub Variables 决定：

- **允许的类型**：`ALLOWED_TYPES`
  - 设为 `*` 表示不限制任何类型
  - 设为扩展名列表（如 `zip,pdf,jpg`）表示仅允许这些类型
- **单文件大小**：`MAX_FILE_SIZE`，默认 20MB
- **总存储**：`MAX_STORAGE_SIZE`，默认 1000MB
- **过期时间**：`EXPIRE_HOURS`，默认 12 小时

如需调整，在用户的 Flyimg 仓库 GitHub Variables 中修改后重新部署。

---

## 八、错误排查

| 现象 | 原因 | 解决 |
|---|---|---|
| `curl` 下载失败 | 网络问题或 GitHub 仓库地址变更 | 检查网络；确认仓库 `mxlitey/flyimg` 仍可访问 |
| `Config not found` | 未配置 Worker 地址 | 运行 `setup.sh` 配置 |
| HTTP 400 `不支持的文件类型` | 文件扩展名不在 `ALLOWED_TYPES` | 修改 Flyimg 部署的 `ALLOWED_TYPES` |
| HTTP 400 `文件大小超过限制` | 文件超过 `MAX_FILE_SIZE` | 调大 `MAX_FILE_SIZE` 或压缩文件 |
| HTTP 429 `存储空间已满` | 总存储达上限 | 等待过期清理或调大 `MAX_STORAGE_SIZE` |
| HTTP 000 / 网络错误 | Worker 地址错误或无法访问 | 检查地址、网络、自定义域名配置 |
| Skill 未被识别 | 未重启工具或 `name` 字段非法 | 重启 Agent 工具；确认 `name` 仅含小写字母/数字/连字符 |
| `{baseDir}` 未被替换 | Claude Code / Codex 不支持该占位符 | Agent 调用脚本时使用 Skill 文件夹的实际绝对路径 |

---

## 九、安装后的目录结构

```
<INSTALL_ROOT>/
├── SKILL.md              # Skill 入口（必需）：触发描述 + 调用流程
└── scripts/
    ├── setup.sh          # 配置脚本：写入 Worker 地址
    ├── upload.sh         # 上传脚本：生成 user_tag + 调用 API
    └── config.json       # 配置文件（首次配置后生成，勿提交）
```

---

## 十、GitHub 源仓库

- 仓库：https://github.com/mxlitey/flyimg
- Skill 目录：`skills/flyimg-upload/`
- 分支：`main`

如需获取最新版本或查看源码，访问上述仓库。
