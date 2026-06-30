# Flyimg Upload Skill 安装指南（AgentSkills 规范）

> **本文档供 AI Agent 读取。** 用户把本文档的链接发给 Agent 后，Agent 应按本文档指令从 GitHub 下载 Skill 文件并完成安装，**不要本地创建文件内容**。
>
> 本指南采用**识别当前工具 + 全局安装**模式：只安装到**当前正在运行本安装流程的 Agent 工具**的全局 skill 目录，不安装到其他工具。
>
> **文档访问镜像（国内用户）**：本文档的 GitHub 链接在国内可能无法访问，可改用 Gitee 镜像获取：
> - GitHub：`https://raw.githubusercontent.com/mxlitey/flyimg/main/skills/flyimg/install-guide.md`
> - Gitee：`https://raw.giteeusercontent.com/litey/flyimg/raw/main/skills/flyimg/install-guide.md`
>
> **下载源策略**：本文档中所有从远程下载 Skill 文件的步骤均采用「**先 GitHub，失败回退 Gitee**」策略——先尝试 GitHub 源，连接失败或下载出错时自动改用 Gitee 镜像，确保国内/国外环境都能完成安装。

---

## 一、这个 Skill 是做什么的

将本地文件上传到 Flyimg（基于 Cloudflare R2 的临时资源存储服务），返回全球可访问的公开下载直链。适合在 Agent 生成产物（图片、PDF、压缩包、代码文件等）后，上传并给用户提供下载链接。

核心特性：
- 首次使用时询问用户的 Flyimg Worker 地址并写入本地配置
- 每次上传基于时间戳+随机数生成 user_tag（简单加密标识）
- 上传后向用户返回下载链接 + user_tag + 过期时间

---

## 二、兼容的 Agent 工具

本 Skill 遵循 **AgentSkills 规范**（`SKILL.md` + YAML frontmatter，对应 [agentskills.io](https://agentskills.io/specification) 开放标准）。**任何兼容该规范、支持 `SKILL.md` 并可执行 `scripts/` 下脚本的 Agent 工具**均可安装本 Skill——由 Agent 根据自身运行环境确定全局 skill 目录并完成安装，无需在本文档中逐一硬编码识别。

以下为已知兼容工具及其全局 Skill 目录（供 Agent 确定 `INSTALL_ROOT` 时参考）：

| 工具 | 全局 Skill 目录 | `{baseDir}` 占位符 |
|---|---|---|
| **Claude Code** | `~/.claude/skills/flyimg/` | 不替换，需用实际路径 |
| **Codex CLI** | `~/.agents/skills/flyimg/` | 不替换，需用实际路径 |
| **OpenClaw（龙虾）** | `~/.openclaw/skills/flyimg/` | ✅ 自动替换为实际路径 |
| **Hermes** | `~/.hermes/skills/flyimg/` | 视配置而定 |

> 上表仅为已知示例，并非穷举。其他遵循 agentskills.io 规范的 Agent 工具同样适用——Agent 应自行确认其全局 skill 目录。
>
> 不支持仅使用规则文件注入、不执行脚本的模式（如 Cursor / Windsurf / Cline 的部分模式）。

---

## 三、前置条件

1. **已部署 Flyimg 服务**：用户需有自己的 Flyimg Worker 实例，部署后会得到一个地址，形如 `https://flyimg.xxx.workers.dev` 或自定义域名 `https://img.example.com`。若用户尚未部署，告知其需先部署 Flyimg（基于 https://github.com/mxlitey/flyimg 仓库，国内可访问 Gitee 镜像 https://gitee.com/litey/flyimg）。

2. **运行环境**：
   - bash（Linux/macOS 自带；Windows 需 WSL 或 Git Bash）
   - `curl`（基础工具，通常自带）

3. **正在使用兼容的 Agent 工具**：Agent 应识别当前运行环境，无需用户声明。

---

## 四、安装步骤

### 步骤 1：确定安装目录

Agent 读取本文档后，需根据**自身当前运行环境**确定本 Skill 的安装目录 `INSTALL_ROOT`。本指南**不提供固定的环境变量/进程名检测脚本**——因为兼容 agentskills.io 标准的 Agent 工具众多且持续增加，硬编码识别反而会遗漏新工具。改由 Agent（LLM）自行判断，这是最通用、最可靠的方式。

**确定方法**：

- Agent（LLM）**应当知道自己运行在哪个工具中**以及该工具的全局 skill 目录位置——直接据此确定 `INSTALL_ROOT`，无需询问用户。
- 将 `INSTALL_ROOT` 设为该工具全局 skill 目录下的 `flyimg/` 子目录，参考「二、兼容的 Agent 工具」表格，例如：
  - Claude Code → `~/.claude/skills/flyimg`
  - Codex CLI → `~/.agents/skills/flyimg`
  - OpenClaw → `~/.openclaw/skills/flyimg`
  - Hermes → `~/.hermes/skills/flyimg`
  - 其他兼容工具 → 该工具文档规定的全局 skill 目录下的 `flyimg/`
- 仅当 Agent 确实无法判断（罕见情况）时，才询问用户当前使用的工具或其全局 skill 目录路径。

**关键原则**：
- 不要询问用户"你用的是哪个工具"——Agent 自己就能判断
- 只装到**当前工具**的全局目录，**不要**装到其他工具目录
- 确定后设好 `INSTALL_ROOT` 变量，继续执行步骤 2

### 步骤 2：从远程下载 Skill 文件到当前工具的全局目录（先 GitHub，失败回退 Gitee）

> **下载源策略**：国内访问 GitHub raw 可能超时，本步骤先尝试 GitHub，失败后自动回退到 Gitee 镜像，确保国内外环境都能装上。

```bash
# 使用步骤 1 确定的 INSTALL_ROOT（即当前 Agent 工具全局 skill 目录下的 flyimg/ 子目录）
# Agent 根据自身运行环境设置，例如：
# INSTALL_ROOT="$HOME/.claude/skills/flyimg"      # Claude Code
# INSTALL_ROOT="$HOME/.agents/skills/flyimg"      # Codex CLI
# INSTALL_ROOT="$HOME/.openclaw/skills/flyimg"    # OpenClaw
# INSTALL_ROOT="$HOME/.hermes/skills/flyimg"      # Hermes

# 创建目录
mkdir -p "$INSTALL_ROOT/scripts"

# 远程源：GitHub 主源 + Gitee 镜像（GitHub 不可访问时回退）
GITHUB_URL="https://raw.githubusercontent.com/mxlitey/flyimg/main/skills/flyimg"
GITEE_URL="https://raw.giteeusercontent.com/litey/flyimg/raw/main/skills/flyimg"

# 下载单个文件的函数：先 GitHub，失败回退 Gitee
# 用法：download_file <相对路径> <输出路径>
download_file() {
  local rel_path="$1"
  local out_path="$2"

  # 先尝试 GitHub（10 秒连接超时，避免长时间挂起）
  if curl -fsSL --connect-timeout 10 "$GITHUB_URL/$rel_path" -o "$out_path" 2>/dev/null; then
    echo "✓ 从 GitHub 下载 $rel_path"
    return 0
  fi

  # GitHub 失败，回退 Gitee 镜像
  echo "… GitHub 不可达，回退到 Gitee 镜像下载 $rel_path"
  if curl -fsSL --connect-timeout 10 "$GITEE_URL/$rel_path" -o "$out_path" 2>/dev/null; then
    echo "✓ 从 Gitee 镜像下载 $rel_path"
    return 0
  fi

  echo "✗ 下载 $rel_path 失败（GitHub 与 Gitee 均不可用）" >&2
  return 1
}

# 下载 SKILL.md
download_file "SKILL.md" "$INSTALL_ROOT/SKILL.md" || exit 1

# 下载脚本
download_file "scripts/setup.sh" "$INSTALL_ROOT/scripts/setup.sh" || exit 1
download_file "scripts/upload.sh" "$INSTALL_ROOT/scripts/upload.sh" || exit 1

# 设置脚本可执行权限
chmod +x "$INSTALL_ROOT/scripts/setup.sh" "$INSTALL_ROOT/scripts/upload.sh"

# 验证
echo "✓ 安装完成"
ls -la "$INSTALL_ROOT" "$INSTALL_ROOT/scripts"
```

**验证要点**：
- 目录下有 3 个文件（`SKILL.md`、`scripts/setup.sh`、`scripts/upload.sh`）
- 两个脚本有可执行权限（`-rwx` 开头）
- 若任一 `curl` 失败（非 0 退出，即 GitHub 与 Gitee 都失败），停止安装并告知用户：可能是网络问题或仓库地址变更

### 步骤 3：告知用户重启 Agent 工具

**Skill 创建后不会立即生效，必须重启 Agent 工具才能加载。** 明确告知用户重启其正在使用的 Agent 工具，并通过该工具的 skill 发现机制（斜杠命令 / 技能面板 / skill 列表等）确认是否出现 `flyimg`。

常见工具的重启方式（参考）：

- **Claude Code**：完全退出（cmd-Q / Ctrl-C 后重新打开），任意目录运行 `claude`，输入 `/` 查看是否出现 `flyimg`
- **Codex CLI**：重启 Codex 会话，运行 `codex` 检查 skill 加载日志
- **OpenClaw（龙虾）**：在「技能模块」面板查看是否出现 `flyimg`，或重启龙虾进程
- **Hermes**：重启 Hermes 会话，运行 `hermes skills list` 或在技能列表中确认 `flyimg`

> 其他兼容工具请参考其官方文档的 skill 加载/刷新方式。
>
> 全局安装后，用户在**任意项目目录**都能使用本 Skill，无需在每个项目里重复安装。

---

## 五、首次使用说明（告知用户）

安装并重启后，用户首次对 Agent 说"上传文件"之类的话时，Skill 会自动触发：

1. Agent 检查 `scripts/config.json` 是否存在
2. **不存在 → 询问用户**："请提供你部署的 Flyimg Worker 地址"
3. 用户回答后，Agent 自动调用 `setup.sh` 写入配置
4. 之后每次上传会自动生成随机 user_tag 并上传，返回下载链接 + 文件管理链接 + 过期时间

用户无需手动配置，Agent 会引导完成。

---

## 六、文件管理链接

每次上传会生成形如 `oc_<时间戳>_<随机串>` 的 user_tag（例如 `oc_1719000000_a1b2c3d4`），并由脚本拼接出**文件管理链接**：

```
manage_url = <Flyimg Worker 地址> + "/" + user_tag
例如：https://worker.example.com/oc_1719000000_a1b2c3d4
```

- **文件管理**：在浏览器打开 `manage_url` 即可查看/管理本次上传的文件（查看列表、续期等）
- **简单加密**：不同上传使用不同 user_tag，避免被批量遍历
- **妥善保管**：`manage_url`（含 user_tag）相当于该次上传的管理入口，请勿随意泄露

> Agent 应直接使用脚本输出的 `manage_url`，无需自行拼接。

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
| `curl` 下载失败 | 网络问题或仓库地址变更（GitHub 与 Gitee 均不可达） | 检查网络；确认仓库 `mxlitey/flyimg`（GitHub）或 `litey/flyimg`（Gitee）仍可访问 |
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

## 十、源仓库（GitHub 主源 + Gitee 镜像）

| 源 | 仓库地址 | raw 文件基础路径 |
|---|---|---|
| **GitHub（主源）** | https://github.com/mxlitey/flyimg | `https://raw.githubusercontent.com/mxlitey/flyimg/main/skills/flyimg` |
| **Gitee（国内镜像）** | https://gitee.com/litey/flyimg | `https://raw.giteeusercontent.com/litey/flyimg/raw/main/skills/flyimg` |

- Skill 目录：`skills/flyimg/`
- 分支：`main`
- **优先使用 GitHub 源**；国内访问 GitHub 失败时使用 Gitee 镜像（本指南所有下载步骤已内置该回退逻辑）。

如需获取最新版本或查看源码，访问上述任一仓库。
