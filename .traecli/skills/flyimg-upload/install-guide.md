# Flyimg Upload Skill 自包含安装指南

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

## 二、前置条件

请先检查用户环境是否满足：

1. **已部署 Flyimg 服务**：用户需有自己的 Flyimg Worker 实例，部署后会得到一个地址，形如 `https://flyimg.xxx.workers.dev` 或自定义域名 `https://img.example.com`。若用户尚未部署，告知其需先部署 Flyimg（基于 https://github.com/mxlitey/flyimg 仓库）。

2. **运行环境**：
   - bash（Linux/macOS 自带；Windows 需 WSL 或 Git Bash）
   - `curl`、`grep`、`sed`、`od`（基础工具，通常自带）

3. **TRAE CLI 或 TRAE IDE 已安装**：Skill 机制依赖 TRAE。参考 https://docs.trae.cn/cli

---

## 三、安装步骤

### 步骤 1：确定安装位置

询问用户偏好（若用户未明确指定，默认按"项目级"安装到当前工作目录）：

- **项目级**（默认）：安装到 `<当前项目>/.traecli/skills/flyimg-upload/`，仅当前项目可用
- **全局级**：安装到 `~/.traecli/skills/flyimg-upload/`，所有项目可用

### 步骤 2：创建目录结构

```bash
mkdir -p <安装根目录>/.traecli/skills/flyimg-upload/scripts
```

### 步骤 3：创建文件

在 `<安装根目录>/.traecli/skills/flyimg-upload/` 下创建以下 3 个文件，**内容必须与下方给出的完全一致**（逐字符复制，不要改动）。

#### 文件 1：`SKILL.md`（Skill 入口，必需）

路径：`<安装根目录>/.traecli/skills/flyimg-upload/SKILL.md`

````markdown
---
name: flyimg-upload
description: 将生成的产物（图片、PDF、压缩包、代码文件、任意类型文件等）上传到 Flyimg 临时存储并获取公开下载链接分享给用户。当需要把本地文件上传到图床/临时存储、生成可分享的下载直链、给用户提供文件下载链接、上传 openclaw 产物供用户下载时使用。
---

# Flyimg 文件上传 Skill

将本地文件上传到 Flyimg（基于 Cloudflare R2 的临时资源存储），返回全球可访问的公开下载直链，供用户下载使用。

## 首次使用：配置 Worker 地址

**首次调用本 Skill 时，必须先询问用户其 Flyimg Worker 地址。**

判断逻辑：检查配置文件 `scripts/config.json` 是否存在且包含 `worker_url` 字段。

- 若**不存在或为空**：向用户提问（示例）：
  > 首次使用 Flyimg 上传 Skill，请提供你部署的 Flyimg Worker 地址（形如 `https://flyimg.xxx.workers.dev` 或自定义域名 `https://img.example.com`）。
  
  收到地址后，运行 `scripts/setup.sh "<地址>"` 写入配置，然后再执行上传。
- 若**已存在**：直接读取使用，不要重复询问。

地址格式要求：
- 必须以 `http://` 或 `https://` 开头
- 不要带末尾斜杠 `/`
- 不要带路径（如 `/upload`），仅填根域名

## 上传流程

每次上传按以下步骤执行：

1. **生成随机 user_tag**：调用 `scripts/upload.sh` 时脚本会自动生成（基于时间戳+随机数），无需手动指定。
2. **执行上传**：
   ```bash
   bash <skill_dir>/scripts/upload.sh "<文件绝对路径>"
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
````

#### 文件 2：`scripts/setup.sh`（配置脚本）

路径：`<安装根目录>/.traecli/skills/flyimg-upload/scripts/setup.sh`

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

路径：`<安装根目录>/.traecli/skills/flyimg-upload/scripts/upload.sh`

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
chmod +x <安装根目录>/.traecli/skills/flyimg-upload/scripts/setup.sh
chmod +x <安装根目录>/.traecli/skills/flyimg-upload/scripts/upload.sh
```

### 步骤 5：（可选）加入 .gitignore

`scripts/config.json` 会在首次配置时生成，含用户专属 Worker 地址，不应提交到仓库。若用户的项目使用 git，建议在项目根 `.gitignore` 中追加：

```
.traecli/skills/flyimg-upload/scripts/config.json
```

### 步骤 6：告知用户重启 TRAE CLI

**Skill 创建后不会立即生效，必须重启 TRAE CLI 才能加载。** 明确告知用户：

> 安装已完成，请重启 TRAE CLI（关闭后重新打开），然后运行 `/skills` 命令验证 `flyimg-upload` 是否出现在面板中。

### 步骤 7：验证安装

重启后引导用户运行 `/skills`，确认 `flyimg-upload` 出现即为安装成功。

---

## 四、首次使用说明（告知用户）

安装并重启后，用户首次对 Agent 说"上传文件"之类的话时，Skill 会自动触发：

1. Agent 检查 `scripts/config.json` 是否存在
2. **不存在 → 询问用户**："请提供你部署的 Flyimg Worker 地址"
3. 用户回答后，Agent 自动调用 `setup.sh` 写入配置
4. 之后每次上传会自动生成随机 user_tag 并上传，返回下载链接 + user_tag + 过期时间

用户无需手动配置，Agent 会引导完成。

---

## 五、user_tag 的作用

每次上传生成形如 `oc_<时间戳>_<随机串>` 的 user_tag，例如 `oc_1719000000_a1b2c3d4`：

- **简单加密**：不同上传使用不同标识，避免被批量遍历
- **查询凭据**：可在 Flyimg 前端用此 user_tag 查询本次上传的文件列表
- **请妥善保管**：相当于该次上传的查询密钥

---

## 六、文件类型与大小限制

由用户部署的 Flyimg 服务的 GitHub Variables 决定：

- **允许的类型**：`ALLOWED_TYPES`
  - 设为 `*` 表示不限制任何类型
  - 设为扩展名列表（如 `zip,pdf,jpg`）表示仅允许这些类型
- **单文件大小**：`MAX_FILE_SIZE`，默认 20MB
- **总存储**：`MAX_STORAGE_SIZE`，默认 1000MB
- **过期时间**：`EXPIRE_HOURS`，默认 12 小时

如需调整，在用户的 Flyimg 仓库 GitHub Variables 中修改后重新部署。

---

## 七、错误排查

| 现象 | 原因 | 解决 |
|---|---|---|
| `Config not found` | 未配置 Worker 地址 | 运行 `setup.sh` 配置 |
| HTTP 400 `不支持的文件类型` | 文件扩展名不在 `ALLOWED_TYPES` | 修改 Flyimg 部署的 `ALLOWED_TYPES` |
| HTTP 400 `文件大小超过限制` | 文件超过 `MAX_FILE_SIZE` | 调大 `MAX_FILE_SIZE` 或压缩文件 |
| HTTP 429 `存储空间已满` | 总存储达上限 | 等待过期清理或调大 `MAX_STORAGE_SIZE` |
| HTTP 000 / 网络错误 | Worker 地址错误或无法访问 | 检查地址、网络、自定义域名配置 |
| `/skills` 看不到本 Skill | 未重启 CLI 或 `name` 字段非法 | 重启 TRAE CLI；确认 `name` 仅含小写字母/数字/连字符 |

---

## 八、安装后的目录结构

```
<安装根目录>/.traecli/skills/flyimg-upload/
├── SKILL.md              # Skill 入口（必需）：触发描述 + 调用流程
├── install-guide.md      # 本文档（可选）
└── scripts/
    ├── setup.sh          # 配置脚本：写入 Worker 地址
    ├── upload.sh         # 上传脚本：生成 user_tag + 调用 API
    └── config.json       # 配置文件（首次配置后生成，勿提交）
```
