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

## 参考文件

- `scripts/setup.sh`：写入 Worker 地址到 config.json
- `scripts/upload.sh`：执行上传，生成随机 user_tag，输出 JSON
- `scripts/config.json`：存储 Worker 地址（首次配置后生成）
- `install-guide.md`：安装与使用指南
