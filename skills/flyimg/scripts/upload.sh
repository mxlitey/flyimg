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

# 计算剩余时长 + 北京时间展示
# 关键：remainingHours 用 UTC epoch 秒相减，与时区无关，绝对正确
#       避免 Agent 自行用 expireAt 减 now（会因时区不一致产生 8 小时误差）
if [ -n "$EXPIRE_AT" ]; then
  # 当前 UTC epoch 秒（date -u +%s 在 GNU/BSD 均可用）
  NOW_EPOCH=$(date -u +%s)
  # expireAt 的 epoch 秒：GNU date 直接解析 ISO；BSD date 用 -j -u -f
  EXPIRE_EPOCH=$(date -d "$EXPIRE_AT" +%s 2>/dev/null) || \
  EXPIRE_EPOCH=$(date -j -u -f "%Y-%m-%dT%H:%M:%S" "${EXPIRE_AT%%.*}" +%s 2>/dev/null) || \
  EXPIRE_EPOCH=""

  if [ -n "$EXPIRE_EPOCH" ]; then
    # 剩余秒数 → 小时（向上取整，至少 0）
    REMAINING_SEC=$((EXPIRE_EPOCH - NOW_EPOCH))
    if [ "$REMAINING_SEC" -le 0 ]; then
      REMAINING_HOURS=0
    else
      REMAINING_HOURS=$(( (REMAINING_SEC + 3599) / 3600 ))
    fi
    # now / expireAt 均转为北京时间（UTC+8）展示，方法：TZ 环境变量优先，+8 hours 兜底
    to_beijing() {
      local epoch="$1"
      TZ=Asia/Shanghai date -d "@$epoch" +"%Y-%m-%d %H:%M:%S" 2>/dev/null || \
      TZ=Asia/Shanghai date -j -f "%s" "$epoch" +"%Y-%m-%d %H:%M:%S" 2>/dev/null || \
      date -d "@$epoch UTC +8 hours" +"%Y-%m-%d %H:%M:%S" 2>/dev/null || \
      date -u -d "@$epoch" +"%Y-%m-%d %H:%M:%S (UTC, 转换失败)" 2>/dev/null || \
      echo "$epoch (epoch)"
    }
    NOW_BEIJING=$(to_beijing "$NOW_EPOCH")
    EXPIRE_BEIJING=$(to_beijing "$EXPIRE_EPOCH")
  else
    # epoch 解析失败，降级
    REMAINING_HOURS=0
    NOW_BEIJING=""
    EXPIRE_BEIJING="${EXPIRE_AT} (UTC)"
  fi
fi

# 输出 JSON 结果到 stdout
# remainingHours: 剩余小时数（基于 epoch 计算，向上取整），Agent 直接使用，禁止自行换算
# now / expireAt: 均为北京时间，仅供展示
# manage_url: 文件管理链接（worker_url + "/" + user_tag），浏览器打开可查看/管理本次上传的文件
MANAGE_URL="${WORKER_URL}/${USER_TAG}"
if [ -n "$EXPIRE_AT" ]; then
  printf '{"success": true, "url": "%s", "manage_url": "%s", "user_tag": "%s", "now": "%s", "expireAt": "%s", "remainingHours": %s}\n' \
    "$URL" "$MANAGE_URL" "$USER_TAG" "$NOW_BEIJING" "$EXPIRE_BEIJING" "${REMAINING_HOURS:-0}"
else
  printf '{"success": true, "url": "%s", "manage_url": "%s", "user_tag": "%s"}\n' "$URL" "$MANAGE_URL" "$USER_TAG"
fi
