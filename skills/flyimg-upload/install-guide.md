# Flyimg Upload Skill 安装指南（AgentSkills 规范）

> **本文档供 AI Agent 读取。** 用户把本文档的链接发给 Agent 后，Agent 应按本文档指令独立完成 Skill 的安装，无需访问代码仓库。
>
> 本文已包含创建该 Skill 所需的**全部文件内容**，Agent 只需按步骤创建对应文件即可。

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
   - `curl`、`grep`、`sed`、`od`（基础工具，通常自带）

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

### 步骤 2：创建目录

```bash
mkdir -p <INSTALL_ROOT>/scripts
```

### 步骤 3：创建文件

在 `<INSTALL_ROOT>/` 下创建以下 3 个文件，**内容必须与下方给出的完全一致**（逐字符复制，不要改动）。

#### 文件 1：`SKILL.md`（Skill 入口，必需）

路径：`<INSTALL_ROOT>/SKILL.md`

````markdown
---
name: flyimg-upload
description: 将生成的产物（图片、PDF、压缩包、代码文件、任意类型文件等）上传到 Flyimg 临时存储并获取公开下载链接分享给用户。当需要把本地文件上传到图床/临时存储、生成可分享的下载直链、给用户提供文件下载链接、上传 openclaw 产物供用户下载时使用。
---

# Flyimg 文件上传 Skill

将本地文件上传到 Flyimg（基于 Cloudflare R2 的临时资源存储），返回全球可访问的公开下载直链，供用户下载使用。

本 Skill 遵循 AgentSkills 规范，兼容 Claude Code、Codex CLI、OpenClaw（龙虾）等支持 `SKILL.md` 的智能体工具。

## 首次使用：配置 Worker 地址

**首次调用本 Skill 时，必须先询问用户其 Flyimg Worker 地址。**

判断逻辑：检查配置文件 `{baseDir}/scripts/config.json` 是否存在且包含 `worker_url` 字段。

- 若**不存在或为空**：向用户提问（示例）：
  > 首次使用 Flyimg 上传 Skill，请提供你部署的 Flyimg Worker 地址（形如 `https://flyimg.xxx.workers.dev` 或自定义域名 `https://img.example.com`）。
  
  收到地址后，运行以下命令写入配置，然后再执行上传：
  ```bash
  bash {baseDir}/scripts/setup.sh "<地址>"
  ```
- 若**已存在**：直接读取使用，不要重复询问。

地址格式要求：
- 必须以 `http://` 或 `https://` 开头
- 不要带末尾斜杠 `/`
- 不要带路径（如 `/upload`），仅填根域名

> 注：`{baseDir}` 是本 Skill 文件夹的根目录路径。OpenClaw 会自动替换为实际路径；Claude Code / Codex 中若 `{baseDir}` 未被替换，请使用 Skill 文件夹的实际绝对路径替代。

## 上传流程

每次上传按以下步骤执行：

1. **生成随机 user_tag**：调用上传脚本时会自动生成（基于时间戳+随机数），无需手动指定。
2. **执行上传**：
   ```bash
   bash {baseDir}/scripts/upload.sh "<文件绝对路径>"
   ```
3. **解析输出**：脚本以 JSON 形式输出到 stdout：
   ```json
   {"success": true, "url": "https://...", "user_tag": "oc_1719000000_ab12cd34", "expireAt": "..."}
   ```
4. **告知用户**：将 **下载链接（url）** 和 **user_tag** 都明确告知用户：
   - `url`：用户可直接在浏览器打开下载
   - `user_tag`：用于后续在 Flyimg 用户页查询该次上传的文件（简单加密用途，请妥善保管）

## 输出规范

上传成功后，向用户回复时**必须同时包含**：

- 下载链接（可点击的 markdown 链接）
- 本次上传的 user_tag
- 过期时间（如响应中包含 expireAt）

示例回复：
> 上传成功！
> 
> - 下载链接：https://pub-xxx.r2.dev/1719000000-abcd.jpg
> - 用户标识（user_tag）：`oc_1719000000_ab12cd34`
> - 过期时间：2025-06-30 12:00:00
> 
> 请在过期前下载。user_tag 可用于在 Flyimg 查询本次上传的文件。

## 错误处理

- 脚本退出码非 0 时，读取 stderr 错误信息并告知用户
- 常见错误：
  - `Config not found`：需先运行 setup.sh 配置 Worker 地址
  - `File not found`：文件路径错误
  - HTTP 4xx/5xx：Worker 地址错误或服务异常，提示用户检查

## 参考文件

- `{baseDir}/scripts/setup.sh`：写入 Worker 地址到 config.json
- `{baseDir}/scripts/upload.sh`：执行上传，生成随机 user_tag，输出 JSON
- `{baseDir}/scripts/config.json`：存储 Worker 地址（首次配置后生成）
- `{baseDir}/install-guide.md`：安装与使用指南
````

#### 文件 2：`scripts/setup.sh`（配置脚本）

路径：`<INSTALL_ROOT>/scripts/setup.sh`

```bash
#!/usr/bin/env bash
# Flyimg Skill 配置脚本：写入 Worker 地址到 config.json
# 用法: bash setup.sh "<worker_url>"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/config.json"

if [ "$#" -lt 1 ] || [ -z "${1:-}" ]; then
  echo "用法: bash setup.sh <worker_url>" >&2
  echo "示例: bash setup.sh https://flyimg.xxx.workers.dev" >&2
  exit 1
fi

WORKER_URL="$1"

# 校验协议
if ! echo "$WORKER_URL" | grep -Eq '^https?://'; then
  echo "错误：地址必须以 http:// 或 https:// 开头" >&2
  exit 1
fi

# 去除末尾斜杠
WORKER_URL="${WORKER_URL%/}"

# 写入配置（覆盖）
cat > "$CONFIG_FILE" <<EOF
{
  "worker_url": "${WORKER_URL}"
}
EOF

echo "配置已写入 ${CONFIG_FILE}"
echo "Worker 地址: ${WORKER_URL}"
```

#### 文件 3：`scripts/upload.sh`（上传脚本）

路径：`<INSTALL_ROOT>/scripts/upload.sh`

```bash
#!/usr/bin/env bash
# Flyimg 上传脚本：生成随机 user_tag，上传文件，输出 JSON 结果
# 用法: bash upload.sh "<文件绝对路径>"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/config.json"

# --- 参数校验 ---
if [ "$#" -lt 1 ] || [ -z "${1:-}" ]; then
  echo "用法: bash upload.sh <文件路径>" >&2
  exit 1
fi

FILE_PATH="$1"

if [ ! -f "$FILE_PATH" ]; then
  echo "错误：文件不存在: $FILE_PATH" >&2
  exit 1
fi

# --- 读取配置 ---
if [ ! -f "$CONFIG_FILE" ]; then
  echo "Config not found: 请先运行 setup.sh 配置 Flyimg Worker 地址" >&2
  exit 2
fi

WORKER_URL=$(grep -oE '"worker_url"[[:space:]]*:[[:space:]]*"[^"]+"' "$CONFIG_FILE" \
  | grep -oE '"https?://[^"]+"' | tr -d '"')

if [ -z "$WORKER_URL" ]; then
  echo "Config not found: config.json 中 worker_url 为空，请重新运行 setup.sh" >&2
  exit 2
fi

# --- 生成随机 user_tag（时间戳 + 随机串，作为简单加密标识）---
# 格式: oc_<10位时间戳>_<8位随机>
TIMESTAMP=$(date +%s)
RANDOM_STR=$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n')
USER_TAG="oc_${TIMESTAMP}_${RANDOM_STR}"

# --- 执行上传 ---
UPLOAD_URL="${WORKER_URL}/upload"

HTTP_RESPONSE=$(curl -sS -w "\n%{http_code}" \
  -X POST "$UPLOAD_URL" \
  -F "file=@${FILE_PATH}" \
  -F "user_tag=${USER_TAG}" \
  --max-time 120 2>&1) || {
    echo "错误：上传请求失败，请检查网络或 Worker 地址: $WORKER_URL" >&2
    exit 3
  }

# 分离响应体和状态码
HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -1)
RESPONSE_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')

# --- 处理响应 ---
if [ "$HTTP_CODE" != "200" ]; then
  echo "错误：上传失败 (HTTP $HTTP_CODE)" >&2
  echo "响应: $RESPONSE_BODY" >&2
  exit 4
fi

# 从响应中提取 url 和 expireAt
# 响应格式: {"success":true,"url":"...","markdown":"...","html":"...","expireAt":"...","expireHours":12}
URL=$(echo "$RESPONSE_BODY" | grep -oE '"url"[[:space:]]*:[[:space:]]*"[^"]+"' | grep -oE '"https?://[^"]+"' | tr -d '"')
EXPIRE_AT=$(echo "$RESPONSE_BODY" | grep -oE '"expireAt"[[:space:]]*:[[:space:]]*"[^"]+"' | grep -oE '"[^"]+"' | tail -1 | tr -d '"')

if [ -z "$URL" ]; then
  echo "错误：响应中未找到 url 字段" >&2
  echo "响应: $RESPONSE_BODY" >&2
  exit 5
fi

# 输出 JSON 结果到 stdout
if [ -n "$EXPIRE_AT" ]; then
  printf '{"success": true, "url": "%s", "user_tag": "%s", "expireAt": "%s"}\n' "$URL" "$USER_TAG" "$EXPIRE_AT"
else
  printf '{"success": true, "url": "%s", "user_tag": "%s"}\n' "$URL" "$USER_TAG"
fi
```

### 步骤 4：设置脚本可执行权限

```bash
chmod +x <INSTALL_ROOT>/scripts/setup.sh
chmod +x <INSTALL_ROOT>/scripts/upload.sh
```

### 步骤 5：（可选）加入 .gitignore

`scripts/config.json` 会在首次配置时生成，含用户专属 Worker 地址，不应提交到仓库。若用户的项目使用 git 且选择了**项目级安装**，建议在项目根 `.gitignore` 中追加：

```
# Flyimg Skill 用户配置（含 Worker 地址，勿提交）
.claude/skills/flyimg-upload/scripts/config.json
.agents/skills/flyimg-upload/scripts/config.json
skills/flyimg-upload/scripts/config.json
```

### 步骤 6：告知用户重启 Agent 工具

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
├── install-guide.md      # 本文档（可选，供 Agent 读取安装）
└── scripts/
    ├── setup.sh          # 配置脚本：写入 Worker 地址
    ├── upload.sh         # 上传脚本：生成 user_tag + 调用 API
    └── config.json       # 配置文件（首次配置后生成，勿提交）
```
