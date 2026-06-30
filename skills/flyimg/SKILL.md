---
name: flyimg
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
   {"success": true, "url": "https://...", "user_tag": "oc_1719000000_ab12cd34", "now": "2025-06-30 12:00:00", "expireAt": "2025-06-30 20:00:00", "remainingHours": 8}
   ```
   字段说明：
   - `url`：下载直链
   - `user_tag`：本次上传的查询标识
   - `now`：当前北京时间（UTC+8），格式 `YYYY-MM-DD HH:MM:SS`
   - `expireAt`：过期北京时间（UTC+8），格式同上
   - `remainingHours`：**剩余小时数（已向上取整）**，由脚本基于 UTC 时间戳计算，与时区无关

   > ⚠️ **禁止自行计算剩余时长**：不要用 `expireAt` 减去 `date` 取到的"现在"。
   > 机器时区可能是 UTC，而 `expireAt`/`now` 是北京时间，跨时区壁钟相减会产生 **8 小时误差**（如把 4 小时报成 12 小时）。
   > 直接使用脚本给出的 `remainingHours`。
4. **告知用户**：将 **下载链接（url）** 和 **user_tag** 都明确告知用户：
   - `url`：用户可直接在浏览器打开下载
   - `user_tag`：用于后续在 Flyimg 用户页查询该次上传的文件（简单加密用途，请妥善保管）

## 输出规范

上传成功后，向用户回复时**必须同时包含**：

- 下载链接（可点击的 markdown 链接）
- 本次上传的 user_tag
- 过期时间（北京时间 `expireAt`）
- 剩余时长（直接用 `remainingHours`，如"约 8 小时后过期"）

示例回复：
> 上传成功！
> 
> - 下载链接：https://pub-xxx.r2.dev/1719000000-abcd.jpg
> - 用户标识（user_tag）：`oc_1719000000_ab12cd34`
> - 过期时间：2025-06-30 20:00:00（北京时间，约 8 小时后过期）
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
