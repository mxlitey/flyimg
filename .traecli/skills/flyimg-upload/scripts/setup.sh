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
