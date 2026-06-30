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

# 将 UTC 时间（ISO 8601，如 2025-06-30T12:00:00.000Z）转换为北京时间（UTC+8）
# 输出格式: 2025-06-30 20:00:00
if [ -n "$EXPIRE_AT" ]; then
  # 尝试 GNU date（Linux 常见）: date -d "<UTC> +8 hours" +"%Y-%m-%d %H:%M:%S"
  BEIJING_EXPIRE=$(date -d "$EXPIRE_AT +8 hours" +"%Y-%m-%d %H:%M:%S" 2>/dev/null) || \
  # 降级 BSD date（macOS 默认）: date -j -f "%Y-%m-%dT%H:%M:%S" "<去掉毫秒Z>" "+%Y-%m-%d %H:%M:%S" 后再加 8 小时
  BEIJING_EXPIRE=$(date -j -u -f "%Y-%m-%dT%H:%M:%S" "${EXPIRE_AT%%.*}" +"%Y-%m-%d %H:%M:%S" 2>/dev/null | \
    awk -v t=8 '{split($2,a,":"); m=a[1]*60+a[2]+t*60; h=int(m/60)%24; m=m%60; printf "%s %02d:%02d:%s\n",$1,h,m,a[3]}') || \
  # 全部失败则保留原始 UTC 值并标注
  BEIJING_EXPIRE="${EXPIRE_AT} (UTC)"
fi

# 输出 JSON 结果到 stdout（expireAt 为北京时间）
if [ -n "$EXPIRE_AT" ]; then
  printf '{"success": true, "url": "%s", "user_tag": "%s", "expireAt": "%s"}\n' "$URL" "$USER_TAG" "$BEIJING_EXPIRE"
else
  printf '{"success": true, "url": "%s", "user_tag": "%s"}\n' "$URL" "$USER_TAG"
fi
