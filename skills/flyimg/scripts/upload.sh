#!/usr/bin/env bash
# Flyimg 上传脚本：支持单文件或多文件上传，多文件时归到同一个 user_tag
# 用法: bash upload.sh "<文件1>" ["<文件2>" ...]
#       可选环境变量 FLYIMG_USER_TAG：复用已有 user_tag（跨调用归档，未传则自动生成新的）
# 输出: 聚合 JSON 到 stdout，包含 user_tag、manage_url、files 数组、过期时间等

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/config.json"

# --- 参数校验 ---
if [ "$#" -lt 1 ]; then
  echo "用法: bash upload.sh <文件1> [<文件2> ...]" >&2
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

# --- 生成或复用 user_tag（时间戳 + 随机串，作为简单加密标识）---
# 格式: oc_<10位时间戳>_<8位随机>
# 多文件上传时，所有文件共享同一个 user_tag，归到同一文件管理链接下
# 若调用方通过 FLYIMG_USER_TAG 传入（跨调用归档场景），则复用；否则生成新的
if [ -n "${FLYIMG_USER_TAG:-}" ]; then
  USER_TAG="$FLYIMG_USER_TAG"
else
  TIMESTAMP=$(date +%s)
  RANDOM_STR=$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n')
  USER_TAG="oc_${TIMESTAMP}_${RANDOM_STR}"
fi

UPLOAD_URL="${WORKER_URL}/upload"
MANAGE_URL="${WORKER_URL}/${USER_TAG}"

# --- 上传单个文件的内部函数（用当前 USER_TAG）---
# 输出: <url>\t<expireAt> 到 stdout（成功）；失败时 stderr 打印错误并 return 1
upload_one() {
  local file_path="$1"
  local http_response http_code response_body url expire_at

  if [ ! -f "$file_path" ]; then
    echo "错误：文件不存在: $file_path" >&2
    return 1
  fi

  http_response=$(curl -sS -w "\n%{http_code}" \
    -X POST "$UPLOAD_URL" \
    -F "file=@${file_path}" \
    -F "user_tag=${USER_TAG}" \
    --max-time 120 2>&1) || {
      echo "错误：上传请求失败，请检查网络或 Worker 地址: $file_path" >&2
      return 1
    }

  http_code=$(echo "$http_response" | tail -1)
  response_body=$(echo "$http_response" | sed '$d')

  if [ "$http_code" != "200" ]; then
    echo "错误：上传失败 $file_path (HTTP $http_code)" >&2
    echo "响应: $response_body" >&2
    return 1
  fi

  url=$(echo "$response_body" | grep -oE '"url"[[:space:]]*:[[:space:]]*"[^"]+"' | grep -oE '"https?://[^"]+"' | tr -d '"')
  expire_at=$(echo "$response_body" | grep -oE '"expireAt"[[:space:]]*:[[:space:]]*"[^"]+"' | grep -oE '"[^"]+"' | tail -1 | tr -d '"')

  if [ -z "$url" ]; then
    echo "错误：响应中未找到 url 字段: $file_path" >&2
    echo "响应: $response_body" >&2
    return 1
  fi

  printf '%s\t%s' "$url" "$expire_at"
}

# --- 循环上传所有文件，收集结果 ---
SUCCESS_URLS=()
SUCCESS_FILES=()
FAILED_FILES=()
FIRST_EXPIRE_AT=""

for file_path in "$@"; do
  if result=$(upload_one "$file_path"); then
    url=$(echo "$result" | cut -f1)
    expire_at=$(echo "$result" | cut -f2)
    SUCCESS_URLS+=("$url")
    SUCCESS_FILES+=("$file_path")
    if [ -n "$expire_at" ] && [ -z "$FIRST_EXPIRE_AT" ]; then
      FIRST_EXPIRE_AT="$expire_at"
    fi
  else
    FAILED_FILES+=("$file_path")
  fi
done

# --- 全部失败则退出 ---
if [ "${#SUCCESS_URLS[@]}" -eq 0 ]; then
  echo "错误：所有文件上传失败" >&2
  exit 4
fi

# --- 计算剩余时长 + 北京时间展示 ---
# 关键：remainingHours 用 UTC epoch 秒相减，与时区无关，绝对正确
#       避免 Agent 自行用 expireAt 减 now（会因时区不一致产生 8 小时误差）
NOW_EPOCH=$(date -u +%s)
REMAINING_HOURS=0
NOW_BEIJING=""
EXPIRE_BEIJING=""

if [ -n "$FIRST_EXPIRE_AT" ]; then
  EXPIRE_EPOCH=$(date -d "$FIRST_EXPIRE_AT" +%s 2>/dev/null) || \
  EXPIRE_EPOCH=$(date -j -u -f "%Y-%m-%dT%H:%M:%S" "${FIRST_EXPIRE_AT%%.*}" +%s 2>/dev/null) || \
  EXPIRE_EPOCH=""

  if [ -n "$EXPIRE_EPOCH" ]; then
    REMAINING_SEC=$((EXPIRE_EPOCH - NOW_EPOCH))
    if [ "$REMAINING_SEC" -le 0 ]; then
      REMAINING_HOURS=0
    else
      REMAINING_HOURS=$(( (REMAINING_SEC + 3599) / 3600 ))
    fi
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
    EXPIRE_BEIJING="${FIRST_EXPIRE_AT} (UTC)"
  fi
fi

# --- 构造 files JSON 数组 ---
FILES_JSON="["
for i in "${!SUCCESS_URLS[@]}"; do
  if [ "$i" -gt 0 ]; then FILES_JSON+=","; fi
  fname=$(basename "${SUCCESS_FILES[$i]}")
  FILES_JSON+="{\"url\": \"${SUCCESS_URLS[$i]}\", \"name\": \"$fname\"}"
done
FILES_JSON+="]"

# --- 输出聚合 JSON 结果到 stdout ---
# user_tag: 本次上传的标识（所有文件共享）
# manage_url: 文件管理链接（worker_url + "/" + user_tag），所有文件共用
# files: 上传成功的文件数组，每项含 url（下载直链）和 name（文件名）
# now / expireAt: 均为北京时间，仅供展示
# remainingHours: 剩余小时数（基于 epoch 计算，向上取整），Agent 直接使用，禁止自行换算
if [ -n "$FIRST_EXPIRE_AT" ]; then
  printf '{"success": true, "user_tag": "%s", "manage_url": "%s", "files": %s, "now": "%s", "expireAt": "%s", "remainingHours": %s}\n' \
    "$USER_TAG" "$MANAGE_URL" "$FILES_JSON" "$NOW_BEIJING" "$EXPIRE_BEIJING" "${REMAINING_HOURS:-0}"
else
  printf '{"success": true, "user_tag": "%s", "manage_url": "%s", "files": %s}\n' \
    "$USER_TAG" "$MANAGE_URL" "$FILES_JSON"
fi

# --- 若有部分失败，stderr 提示（不影响 stdout 的 JSON）---
if [ "${#FAILED_FILES[@]}" -gt 0 ]; then
  echo "警告：${#FAILED_FILES[@]} 个文件上传失败" >&2
fi
