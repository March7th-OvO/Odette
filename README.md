# Odette · 图床

React + Vite + TypeScript 管理后台与 Hono API 部署在**同一个 Cloudflare Worker**。R2 保存原图，生产图片通过 R2 自定义域名直接分发，不经过管理 Worker。没有数据库、注册系统或额外服务器。

## 本地启动

需要 Node.js 22.12+（推荐 Node.js 24）。

```bash
npm install
npm run dev
```

打开 http://127.0.0.1:5173 。Vite 将 `/api/*` 转发到本地 Worker（8787）；开发环境的 `IMAGE_BUCKET` 使用远程绑定，直接读取和修改线上 `march7th-assets` 桶，图片通过 R2 自定义域名预览。第一次启动会自动创建静态资源目录，无需先构建。

Windows PowerShell 如果阻止运行 npm.ps1，请使用 `npm.cmd` / `npx.cmd`。

```bash
npm run build          # 前后端类型检查 + 前端生产构建
npm test               # 文件校验、API 参数和鉴权边界测试
npm run cf-typegen     # 修改 Wrangler 配置后重新生成绑定类型
npx wrangler deploy --dry-run   # 验证生产 Worker 打包
```

启动开发服务后，可运行 `node tests/local-api.cjs` 验证真实本地 R2 上传、元数据、文件内容、分页、大小限制和清理。可选浏览器回归：安装 Playwright 及 Chromium 后运行 `node tests/browser.cjs`；也可用 `PLAYWRIGHT_PATH`、`CHROMIUM_PATH` 指向已有安装。浏览器测试以空的本地图片库为起点，测试数据会在结束时清理。

## 功能

仅管理 `march7th-assets` 桶的 `image/` 命名空间。`image/` 是目录浏览器根目录，使用 R2 `prefix + delimiter: "/"` 将扁平 Key 按层级展示；不创建数据库目录记录，也不提供整目录删除或重命名。新上传使用“当前目录前缀 + UUID.ext”，删除兼容 `image/banner.webp`、`image/march7th/avatar.png` 等旧路径，无需迁移现有对象。目录前缀和删除 Key 都限制在 `image/` 内、UTF-8 最长 1024 字节，不接受空路径段、`.` / `..` 路径段、反斜杠或控制字符。HTTP 接口路径仍为 `/api/images`。

开发环境直接连接线上 `march7th-assets` 桶，不再使用 `.wrangler/state` 中的模拟数据；在本地上传和删除都会同步影响线上对象。

- 拖拽与多选上传到当前目录，逐个上传并报告每个文件的成功或失败。
- JPEG、PNG、WebP、AVIF、GIF，单张最多 10 MiB；拒绝 SVG、空文件与明显不匹配的文件签名。
- 图片网格按需加载 400px Cloudflare 动态缩略图；点击后才在弹窗加载原图。支持复制 URL / Markdown、删除确认、刷新。
- 文件夹卡片、面包屑和返回按钮组成层级目录浏览器；列表使用 R2 原始游标分页，每页最多 24 个结果。顺序是 R2 Key 字典序，不是上传时间倒序；不提供文件名全文搜索或全桶统计。
- 原文件名、MIME 保存在 R2 元数据；Key 使用当前目录前缀和随机 UUID。条件写入防止覆盖已有对象。

## 目录与分层

```text
src/components/        上传区、图片卡片、网格、复制按钮
src/pages/             单页图片库
src/api/               同源 HTTP 客户端
shared/image.ts        前后端共享类型与限制
worker/routes/         路由、请求解析
worker/services/       文件检查、对象命名、业务规则
worker/repositories/   R2 Binding 读写
worker/middleware/     Cloudflare Access 鉴权、统一错误
worker/utils/          Key 与响应工具
worker/types/          Hono 环境类型
tests/                 自动测试
```

调用链：React → Route → Service → Repository → `IMAGE_BUCKET`。

## API

除健康检查外所有 API 都需要 Cloudflare Access。响应为 `{ code, data, message? }`，失败同时使用对应 HTTP 错误码。

| 方法 | 路径 | 请求 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查，不检查桶连接 |
| GET | `/api/images` | `prefix` 默认 `image/`，`limit` 1–100，`cursor` 可选 |
| POST | `/api/images` | multipart/form-data，单个 `file` 字段；`prefix` 为当前目录，默认 `image/` |
| DELETE | `/api/images` | JSON：`{"key":"image/<directory>/<uuid>.png"}` |

列表 `data` 为 `{prefix, folders, items, cursor}`：`prefix` 是当前目录，`folders` 是 R2 `delimitedPrefixes` 返回的下一层完整前缀，`items` 只包含当前层图片，`cursor: null` 表示没有下一页。图片对象包含 `key, url, thumbnailUrl, originalName, size, contentType, uploaded`。`url` 是原图地址，`thumbnailUrl` 是固定宽度 400px、自动格式、质量 75 的 Cloudflare Image Transformations 地址。删除不存在的有效图片 Key 也成功，便于安全重试；以 `/` 结尾的目录前缀不能通过删除接口删除。文件签名检查用于阻止明显伪装，不进行解码、转码或内容审核。

## 生产部署

仓库中是可运行的代码和示例配置；尚未创建线上桶、域名、Access 应用或 GitHub 远程仓库。

1. 登录 Cloudflare：`npx wrangler login`，创建 R2 桶：`npx wrangler r2 bucket create march7th-assets`。
2. 在 R2 桶的设置中连接你自己的图片域名（例如 `img.example.com`）。图片公开读取；不要给图片域名配置管理后台的 Access 限制。
3. 在图片域名所在 Zone 的 Images → Transformations 中启用转换。缩略图通过图片域名自身的 `/cdn-cgi/image/` 路径读取同域原图，无需额外添加允许来源。
4. 在 Cloudflare Zero Trust → Access 创建 Self-hosted 应用，覆盖整个管理域名（例如 `admin.example.com`），Allow 策略仅允许自己的邮箱。记录 team domain 和 Application Audience（AUD）。
5. 修改 `wrangler.jsonc` 的顶层生产配置：`PUBLIC_IMAGE_URL`、`ACCESS_TEAM_DOMAIN`（仅主机名，如 `your-team.cloudflareaccess.com`）、`ACCESS_AUD`、`r2_buckets` 的桶名。补充管理域名：

   ```jsonc
   "routes": [{ "pattern": "admin.example.com", "custom_domain": true }]
   ```

6. 执行 `npm run cf-typegen`、`npm run build`、`npx wrangler deploy`。或者 `npm run deploy` 一次构建并部署。
7. 验证未登录访问管理域名会进入 Access 登录；登录后可上传，列表请求 `/cdn-cgi/image/` 缩略图，点击预览后才请求原图 URL，且未登录浏览器也可打开图片。

默认关闭 `workers.dev` 和预览 URL，避免出现未受 Access 保护的额外管理入口。Access 配置缺失时 API 返回 503，绝不会默认放行。Worker 使用 `jose` 验证 **Cloudflare 签发的 Access assertion**（签名、issuer、audience、有效期），不自行签发 JWT，也没有用户表、密码或 refresh token。静态后台由整个域名的 Access 应用保护。

不要部署 `--env development`：它专供本地模拟使用。生产配置不要设为 development。R2 密钥不需要进入前端或 `.env`，Worker 始终通过 Binding 访问 R2。

图片设置一年 immutable 缓存，替换图片应上传新 Key。删除对象不会主动清理 CDN 或浏览器缓存；需要即时撤下时，额外在 Cloudflare 清除对应 URL 的缓存。CDN 命中也取决于图片域名的 Cache Rules，不能仅凭上传成功判断。

## GitHub 自动部署

将这个目录推送到你自己的单个 GitHub 仓库，然后在 Cloudflare Worker → Settings → Builds 连接该仓库。构建命令设为 `npm run build`，部署命令设为 `npx wrangler deploy`，选择正式发布分支。域名、桶和 Access 必须先按上述步骤配置。这里不引入额外 GitHub Actions 或第二个仓库。

参考：[Workers 静态资源](https://developers.cloudflare.com/workers/static-assets/)、[Access 凭据验证](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)、[R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)、[R2 公共桶与自定义域名](https://developers.cloudflare.com/r2/buckets/public-buckets/)。
