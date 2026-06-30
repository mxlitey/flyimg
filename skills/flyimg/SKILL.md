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

1. **生成随机 user_tag**：调用上传脚本时会自动生成（基于时间戳+随机数），无需手动指定。多文件归档场景可通过环境变量复用已有 user_tag（见下方「多文件归档」）。
2. **执行上传**：
   ```bash
   bash {baseDir}/scripts/upload.sh "<文件绝对路径>"
   ```
   多文件归档时复用同一 user_tag：
   ```bash
   FLYIMG_USER_TAG="<已有 user_tag>" bash {baseDir}/scripts/upload.sh "<文件绝对路径>"
   ```
3. **解析输出**：脚本以 JSON 形式输出到 stdout：
   ```json
   {"success": true, "url": "https://...", "manage_url": "https://worker.example.com/oc_1719000000_ab12cd34", "user_tag": "oc_1719000000_ab12cd34", "now": "2025-06-30 12:00:00", "expireAt": "2025-06-30 20:00:00", "remainingHours": 8}
   ```
   字段说明：
   - `url`：下载直链
   - `manage_url`：**文件管理链接**（= Worker 地址 + `/` + user_tag），浏览器打开可查看/管理本次上传的文件
   - `user_tag`：本次上传的内部标识（拼接 manage_url 用，无需单独展示给用户）
   - `now`：当前北京时间（UTC+8），格式 `YYYY-MM-DD HH:MM:SS`
   - `expireAt`：过期北京时间（UTC+8），格式同上
   - `remainingHours`：**剩余小时数（已向上取整）**，由脚本基于 UTC 时间戳计算，与时区无关

   > ⚠️ **禁止自行计算剩余时长**：不要用 `expireAt` 减去 `date` 取到的"现在"。
   > 机器时区可能是 UTC，而 `expireAt`/`now` 是北京时间，跨时区壁钟相减会产生 **8 小时误差**（如把 4 小时报成 12 小时）。
   > 直接使用脚本给出的 `remainingHours`。
   > ⚠️ **禁止自行拼接管理链接**：直接使用脚本输出的 `manage_url`，不要用 worker_url + user_tag 自行拼接（易出错）。
4. **告知用户**：将 **下载链接（url）** 和 **文件管理链接（manage_url）** 都明确告知用户：
   - `url`：用户可直接在浏览器打开下载
   - `manage_url`：用户可在浏览器打开查看/管理本次上传的文件（续期、查看列表等）

## 多文件归档

当用户**一次提问中要求上传多个文件**时，应将它们归到**同一个 user_tag**下，这样所有文件共享同一个 `manage_url`，用户只需管理一个链接。

**流程**：

1. 第一个文件按正常流程上传，脚本自动生成 `user_tag`：
   ```bash
   bash {baseDir}/scripts/upload.sh "<文件1绝对路径>"
   ```
   从输出 JSON 中取出 `user_tag` 字段值（记为 `<TAG>`）。
2. 后续文件通过 `FLYIMG_USER_TAG` 环境变量复用同一 `user_tag`：
   ```bash
   FLYIMG_USER_TAG="<TAG>" bash {baseDir}/scripts/upload.sh "<文件2绝对路径>"
   FLYIMG_USER_TAG="<TAG>" bash {baseDir}/scripts/upload.sh "<文件3绝对路径>"
   ```
3. 所有文件的 `manage_url` 相同，最终回复中只展示一个文件管理链接。

> 单文件上传无需此流程，直接调用 `upload.sh` 即可。

## 输出规范

上传成功后，向用户回复时**必须同时包含**：

- 下载链接（可点击的 markdown 链接）
- 文件管理链接（可点击的 markdown 链接，即 `manage_url`）
- 过期时间（北京时间 `expireAt`）
- 剩余时长（直接用 `remainingHours`，如"约 8 小时后过期"）

**单文件示例回复**：
> 上传成功！
>
> - 下载链接：https://pub-xxx.r2.dev/1719000000-abcd.jpg
> - 文件管理：https://worker.example.com/oc_1719000000_ab12cd34
> - 过期时间：2025-06-30 20:00:00（北京时间，约 8 小时后过期）
>
> 请在过期前下载。可通过文件管理链接查看/管理本次上传的文件。

**多文件示例回复**（一次上传 3 个文件，归到同一管理链接）：
> 上传成功！共 3 个文件，已归到同一管理链接下：
>
> - 文件1：https://pub-xxx.r2.dev/1719000000-abcd.jpg
> - 文件2：https://pub-xxx.r2.dev/1719000000-efgh.png
> - 文件3：https://pub-xxx.r2.dev/1719000000-ijkl.zip
> - 文件管理：https://worker.example.com/oc_1719000000_ab12cd34
> - 过期时间：2025-06-30 20:00:00（北京时间，约 8 小时后过期）
>
> 请在过期前下载。可通过文件管理链接查看/管理本次上传的全部文件。

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
