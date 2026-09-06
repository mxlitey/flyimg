#!/usr/bin/env bash
# Flyimg 上传脚本：
# - 单文件（1 个参数）：走单文件上传接口 /upload
# - 多文件（≥2 个参数）：自动合并为一个文件夹，走文件夹上传接口
#   （/upload-folder/init → 逐文件 /upload-folder/file → /upload-folder/finish），
#   所有文件共享同一个 user_tag、folder_key 与文件管理链接
# 用法: bash upload.sh "<文件1>" ["<文件2>" ...]
#       可选环境变量 FLYIMG_USER_TAG：复用已有 user_tag（跨调用归档，未传则自动生成新的）
# 输出: 聚合 JSON 到 stdout，包含 user_tag、manage_url、files、过期时间等
#       多文件时额外含 mode:"folder"、folder_key、folder_url、skipped

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
# 一次调用内的所有文件共享同一个 user_tag，归到同一文件管理链接下
# 若调用方通过 FLYIMG_USER_TAG 传入（跨调用归档场景），则复用；否则生成新的
if [ -n "${FLYIMG_USER_TAG:-}" ]; then
  USER_TAG="$FLYIMG_USER_TAG"
else
  TIMESTAMP=$(date +%s)
  RANDOM_STR=$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n')
  USER_TAG="oc_${TIMESTAMP}_${RANDOM_STR}"
fi

MANAGE_URL="${WORKER_URL}/${USER_TAG}"

# --- 计算剩余时长 + 北京时间展示（输入 ISO 过期时间，通过全局变量输出）---
# 关键：remainingHours 用 UTC epoch 秒相减，与时区无关，绝对正确
#       避免 Agent 自行用 expireAt 减 now（会因时区不一致产生 8 小时误差）
REMAINING_HOURS=0
NOW_BEIJING=""
EXPIRE_BEIJING=""

compute_time_info() {
  local expire_at="$1"
  local expire_epoch now_epoch remaining_sec
  REMAINING_HOURS=0
  NOW_BEIJING=""
  EXPIRE_BEIJING=""

  if [ -z "$expire_at" ]; then
    EXPIRE_BEIJING=""
    return 0
  fi

  now_epoch=$(date -u +%s)
  expire_epoch=$(date -d "$expire_at" +%s 2>/dev/null) || \
  expire_epoch=$(date -j -u -f "%Y-%m-%dT%H:%M:%S" "${expire_at%%.*}" +%s 2>/dev/null) || \
  expire_epoch=""

  if [ -z "$expire_epoch" ]; then
    EXPIRE_BEIJING="${expire_at} (UTC)"
    return 0
  fi

  remaining_sec=$((expire_epoch - now_epoch))
  if [ "$remaining_sec" -le 0 ]; then
    REMAINING_HOURS=0
  else
    REMAINING_HOURS=$(( (remaining_sec + 3599) / 3600 ))
  fi

  to_beijing() {
    local epoch="$1"
    TZ=Asia/Shanghai date -d "@$epoch" +"%Y-%m-%d %H:%M:%S" 2>/dev/null || \
    TZ=Asia/Shanghai date -j -f "%s" "$epoch" +"%Y-%m-%d %H:%M:%S" 2>/dev/null || \
    date -d "@$epoch UTC +8 hours" +"%Y-%m-%d %H:%M:%S" 2>/dev/null || \
    date -u -d "@$epoch" +"%Y-%m-%d %H:%M:%S (UTC, 转换失败)" 2>/dev/null || \
    echo "$epoch (epoch)"
  }
  NOW_BEIJING=$(to_beijing "$now_epoch")
  EXPIRE_BEIJING=$(to_beijing "$expire_epoch")
}

# --- 中止文件夹上传（清理已上传部分，失败静默忽略，残留由服务端定时清理）---
abort_folder() {
  local folder_key="$1"
  curl -sS -X POST "${WORKER_URL}/upload-folder/abort" \
    -H "Content-Type: application/json" \
    -d "{\"folder_key\": \"$folder_key\", \"user_tag\": \"$USER_TAG\"}" \
    --max-time 30 >/dev/null 2>&1 || true
}

# --- 单文件上传：走 /upload 接口 ---
upload_single() {
  local file_path="$1" http_response http_code response_body url expire_at

  if [ ! -f "$file_path" ]; then
    echo "错误：文件不存在: $file_path" >&2
    exit 3
  fi

  http_response=$(curl -sS -w "\n%{http_code}" \
    -X POST "${WORKER_URL}/upload" \
    -F "file=@${file_path}" \
    -F "user_tag=${USER_TAG}" \
    --max-time 120 2>&1) || {
      echo "错误：上传请求失败，请检查网络或 Worker 地址: $file_path" >&2
      exit 3
    }

  http_code=$(echo "$http_response" | tail -1)
  response_body=$(echo "$http_response" | sed '$d')

  if [ "$http_code" != "200" ]; then
    echo "错误：上传失败 $file_path (HTTP $http_code)" >&2
    echo "响应: $response_body" >&2
    exit 3
  fi

  url=$(echo "$response_body" | grep -oE '"url"[[:space:]]*:[[:space:]]*"[^"]+"' | grep -oE '"https?://[^"]+"' | tr -d '"')
  expire_at=$(echo "$response_body" | grep -oE '"expireAt"[[:space:]]*:[[:space:]]*"[^"]+"' | grep -oE '"[^"]+"' | tail -1 | tr -d '"')

  if [ -z "$url" ]; then
    echo "错误：响应中未找到 url 字段: $file_path" >&2
    echo "响应: $response_body" >&2
    exit 3
  fi

  compute_time_info "$expire_at"

  printf '{"success": true, "user_tag": "%s", "manage_url": "%s", "files": [{"url": "%s", "name": "%s"}], "now": "%s", "expireAt": "%s", "remainingHours": %s}\n' \
    "$USER_TAG" "$MANAGE_URL" "$url" "$(basename "$file_path")" "$NOW_BEIJING" "$EXPIRE_BEIJING" "${REMAINING_HOURS:-0}"
}

# --- 多文件上传：合并为文件夹，走 /upload-folder 接口 ---
upload_folder() {
  local folder_name first_parent same_parent f
  local total_size file_count init_body folder_key expire_at
  local entry rel file_path http_response http_code response_body success_flag
  local -a items rels skipped_rels
  local finish_body index_url list_body list_domain
  local files_json skipped_json url i first s

  # 文件夹名称：全部文件在同一目录时用该目录名，否则用通用名
  folder_name="多文件上传"
  first_parent=$(dirname "$1")
  same_parent=1
  for f in "$@"; do
    if [ "$(dirname "$f")" != "$first_parent" ]; then
      same_parent=0
      break
    fi
  done
  if [ "$same_parent" = "1" ] && [ -n "$first_parent" ] && [ "$first_parent" != "/" ]; then
    folder_name=$(basename "$first_parent")
    if [ -z "$folder_name" ]; then
      folder_name="多文件上传"
    fi
  fi

  # 校验文件存在，规划 rel_path（同名文件自动加 -N 后缀去重，避免覆盖），统计大小/数量
  total_size=0
  file_count=0
  items=()
  rels=()
  for f in "$@"; do
    if [ ! -f "$f" ]; then
      echo "错误：文件不存在: $f" >&2
      exit 3
    fi

    local base ext stem rel n cand used r
    base=$(basename "$f")
    rel="$base"
    n=1
    while :; do
      used=0
      for r in "${rels[@]:-}"; do
        if [ "$r" = "$rel" ]; then
          used=1
          break
        fi
      done
      [ "$used" = "0" ] && break
      # 重名：在扩展名前追加 -N
      if [[ "$base" == *.* ]]; then
        ext="${base##*.}"
        stem="${base%.*}"
        cand="${stem}-${n}.${ext}"
      else
        cand="${base}-${n}"
      fi
      rel="$cand"
      n=$((n + 1))
    done

    rels+=("$rel")
    items+=("${rel}"$'\t'"${f}")
    total_size=$((total_size + $(stat -c%s "$f" 2>/dev/null || stat -f%z "$f" 2>/dev/null || echo 0)))
    file_count=$((file_count + 1))
  done

  # 1) 初始化文件夹上传
  init_body=$(curl -sS -X POST "${WORKER_URL}/upload-folder/init" \
    -H "Content-Type: application/json" \
    -d "{\"user_tag\": \"$USER_TAG\", \"total_size\": $total_size, \"file_count\": $file_count, \"name\": \"$folder_name\"}" \
    --max-time 60 2>&1) || {
      echo "错误：文件夹初始化请求失败，请检查网络或 Worker 地址" >&2
      exit 3
    }

  folder_key=$(echo "$init_body" | grep -oE '"folder_key"[[:space:]]*:[[:space:]]*"[^"]+"' | grep -oE '"[^"]+"' | tail -1 | tr -d '"')
  if [ -z "$folder_key" ]; then
    echo "错误：文件夹初始化失败" >&2
    echo "响应: $init_body" >&2
    exit 3
  fi
  expire_at=$(echo "$init_body" | grep -oE '"expire_at"[[:space:]]*:[[:space:]]*"[^"]+"' | grep -oE '"[^"]+"' | tail -1 | tr -d '"')

  # 2) 逐文件上传（类型未开放的文件被服务端跳过，不中断整体）
  skipped_rels=()
  for entry in "${items[@]}"; do
    rel="${entry%%$'\t'*}"
    file_path="${entry#*$'\t'}"

    http_response=$(curl -sS -w "\n%{http_code}" \
      -X POST "${WORKER_URL}/upload-folder/file" \
      -F "file=@${file_path}" \
      -F "folder_key=${folder_key}" \
      -F "rel_path=${rel}" \
      -F "user_tag=${USER_TAG}" \
      --max-time 120 2>&1) || {
        echo "错误：上传请求失败，请检查网络或 Worker 地址: $file_path" >&2
        abort_folder "$folder_key"
        exit 3
      }
    http_code=$(echo "$http_response" | tail -1)
    response_body=$(echo "$http_response" | sed '$d')

    if [ "$http_code" != "200" ]; then
      echo "错误：上传失败 $rel (HTTP $http_code)" >&2
      echo "响应: $response_body" >&2
      abort_folder "$folder_key"
      exit 3
    fi

    success_flag=$(echo "$response_body" | grep -oE '"success"[[:space:]]*:[[:space:]]*[a-z]+' | grep -oE '(true|false)' | head -1 || true)
    if [ "$success_flag" = "false" ]; then
      skipped_rels+=("$rel")
    fi
  done

  # 全部被跳过则中止（不留空文件夹）
  if [ "${#skipped_rels[@]}" -eq "$file_count" ]; then
    abort_folder "$folder_key"
    echo "错误：所有文件均因类型不支持等原因被跳过，未创建文件夹" >&2
    exit 4
  fi

  # 3) 完成上传（汇总大小/文件数，标记 active）
  finish_body=$(curl -sS -X POST "${WORKER_URL}/upload-folder/finish" \
    -H "Content-Type: application/json" \
    -d "{\"folder_key\": \"$folder_key\", \"user_tag\": \"$USER_TAG\"}" \
    --max-time 60 2>&1) || {
      echo "错误：完成上传请求失败" >&2
      abort_folder "$folder_key"
      exit 3
    }

  index_url=$(echo "$finish_body" | grep -oE '"index_url"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]+"' | tail -1 | tr -d '"' || true)
  if [ "$index_url" = "null" ]; then
    index_url=""
  fi

  # 4) 拉取文件夹文件列表，取 R2 公开域名用于拼接各文件直链
  list_domain=""
  list_body=$(curl -sS "${WORKER_URL}/folder-files?folder_key=${folder_key}" --max-time 60 2>&1 || true)
  if [ -n "$list_body" ]; then
    list_domain=$(echo "$list_body" | grep -oE '"url"[[:space:]]*:[[:space:]]*"https?://[^/"]+' | grep -oE 'https?://[^/"]+' | head -1 || true)
  fi

  # 5) 构造 files JSON（含直链与 rel_path）与 skipped JSON
  files_json="["
  first=1
  for entry in "${items[@]}"; do
    rel="${entry%%$'\t'*}"
    file_path="${entry#*$'\t'}"

    skipped=0
    for s in "${skipped_rels[@]:-}"; do
      if [ "$s" = "$rel" ]; then
        skipped=1
        break
      fi
    done
    [ "$skipped" = "1" ] && continue

    if [ "$first" = "0" ]; then
      files_json+=","
    fi
    first=0
    url=""
    if [ -n "$list_domain" ]; then
      url="${list_domain}/${folder_key}/${rel}"
    fi
    files_json+="{\"url\": \"$url\", \"name\": \"$(basename "$file_path")\", \"rel_path\": \"$rel\"}"
  done
  files_json+="]"

  skipped_json="["
  first=1
  for s in "${skipped_rels[@]:-}"; do
    if [ "$first" = "0" ]; then
      skipped_json+=","
    fi
    first=0
    skipped_json+="\"$s\""
  done
  skipped_json+="]"

  compute_time_info "$expire_at"

  printf '{"success": true, "mode": "folder", "user_tag": "%s", "manage_url": "%s", "folder_key": "%s", "folder_url": "%s", "files": %s, "skipped": %s, "now": "%s", "expireAt": "%s", "remainingHours": %s}\n' \
    "$USER_TAG" "$MANAGE_URL" "$folder_key" "$index_url" "$files_json" "$skipped_json" "$NOW_BEIJING" "$EXPIRE_BEIJING" "${REMAINING_HOURS:-0}"
}

# --- 主流程：单文件走 /upload，多文件合并为文件夹上传 ---
if [ "$#" -eq 1 ]; then
  upload_single "$1"
else
  upload_folder "$@"
fi
