# Articles 开发与使用

## 数据源与结构

- 文章与 Bundle 图片：`March7th-OvO/Firefly` → `master` → `src/content/posts/`。
- 共享图片：现有 R2 `IMAGE_BUCKET`；编辑器共用 `/api/images` 上传和目录浏览。
- 鉴权：现有 Cloudflare Access middleware，同时保留 Worker 端 assertion 验证和同源写入检查。
- 四层：React → `post.route.ts` → `post.service.ts` → `post.repository.ts` → GitHub。
- `worker/utils/frontmatter.ts` 只解析 YAML 头部。正文没有 Markdown AST 读写环节。

新增 `/articles` 页面，原图片页面继续支持 `/` 和 `/assets`。侧边栏只增加 Articles 导航，不更改原有样式。文章列表展示 Content Tree，Bundle 标记来源于目录中的 `index.md` / `index.mdx`；两种入口同时存在时显示冲突。

## 配置

生产和 development 的非敏感配置已写入 `wrangler.jsonc`：

```text
GITHUB_OWNER=March7th-OvO
GITHUB_REPO=Firefly
GITHUB_BRANCH=master
GITHUB_POSTS_PATH=src/content/posts
```

公开仓库支持无 token 读取，但会受 GitHub 未认证请求额度限制。写入使用只授权该仓库的 fine-grained PAT，配置 Contents 读写权限，并确保分支规则允许该身份提交。不要把 token 放入前端、Git 仓库或普通 `vars`。

```powershell
npx.cmd wrangler secret put GITHUB_TOKEN
```

本地可创建已被 Git 忽略的 `.dev.vars.development`：

```dotenv
GITHUB_TOKEN=你的仓库令牌
GITHUB_ALLOW_WRITES=false
```

本地写入真实 GitHub 必须明确将 `GITHUB_ALLOW_WRITES` 设为 `true`；建议同时在 development 配置中指定专用测试分支。生产写入不受这个开发开关限制。不要部署 development 环境。当前实现没有部署到生产，也没有向 Firefly 写入测试文章。

## API

所有 JSON 响应沿用 `{ code, data, message? }`。

| 方法 | 地址 | 输入 |
| --- | --- | --- |
| GET | `/api/posts/tree` | 完整内容树，响应包含 `entries`、commit `revision` 与公开图片域名 `mediaBaseUrl` |
| GET | `/api/posts?path=guide%2Findex.mdx` | 相对路径 |
| POST | `/api/posts` | `{ path, frontmatter, body, autoUpdated? }` |
| PUT | `/api/posts` | `{ path, sha, frontmatter, body, autoUpdated? }` |
| DELETE | `/api/posts` | `{ path, sha }` |
| GET | `/api/posts/asset?path=guide%2Fcover.png` | 鉴权后的仓库栅格图片预览，最大 10 MiB |

`GET /api/posts` 返回 `{ path, sha, extension, frontmatter, body }`。写入返回 `{ document, commitSha, commitUrl }`；前端使用新的 `document.sha` 继续保存。无改动时 `commitSha` / `commitUrl` 为 `null`，不创建提交。

`path` 相对于配置的内容根目录，支持目录层级；禁止绝对路径、`.` / `..` 路径段、空段、反斜杠、控制字符与含混的编码路径。文章仅接受小写 `.md` / `.mdx` 扩展名。符号链接和 submodule 不可编辑。创建同路径返回冲突；更新和删除要求文件 SHA。前端不提供移动、重命名、转换扩展名或递归删除。

文章上限 1 MiB，请求体上限 2 MiB。读取 Git Trees 先定位内容子树，再递归读取；截断时退回逐层遍历，失败不会返回部分树。小型树按不可变 commit 缓存，分支 head 仍实时读取。

## Frontmatter 与保存语义

- `title`、`published` 必填；CMS 新建还要求显式 slug，并默认 `draft: true`。
- 编辑界面默认提供 `lang: zh-CN`、`comment: true`、`pinned: false`，不注入空 author、password、series 或 updated。
- 旧文章的缺省字段保持缺省；未知字段和未修改的 YAML 节点保留。清空可选表单字段会移除该字段；已有空值不被批量清理。`false`、数字 `0` 与 `category: null` 都是有效值。
- 日期通过 YAML timestamp 序列化，兼容 Firefly 的 `z.date()`，JSON 中为 ISO 日期字符串。
- 新建、首次发布草稿不补 `updated`。实际修改已发布文章才默认设置香港时区当天日期；可关闭自动日期。无变化不更新日期。
- 单改元信息时正文逐字保留，包括 CRLF、尾部空白、MDX import、JSX 和指令。表单操作不经过 Markdown parse/stringify。
- 保存草稿与发布分别设置 `draft: true/false`。已发布文章转为草稿时提示下架影响。GitHub 提交成功只显示“已提交，部署状态未确认”。

修改 slug 不改变文件路径。全局唯一性检查包括嵌套 `.md` / `.mdx`、草稿以及旧文章由 Astro glob 规则推导的 ID；检查前后的分支 head 不同则拒绝保存。同一文件 SHA 冲突不自动覆盖。

**并发边界：** Contents API 只提供文件级乐观锁。不同客户端仍可能在最后一次 head 检查之后同时向不同文件写入同一 slug；当前检查不是跨文件原子约束。需要完全杜绝时，应增加基于分支引用的原子提交流程，并在博客构建侧校验重复 ID。当前实现不会修改 Firefly 的构建流程。

## 编辑器与资源

正文提供 Write / Preview、常用 Markdown 工具栏和插图。`.md` 预览不执行原始 HTML；`.mdx` 保持源码展示，不执行仓库组件。扩展指令、公式、图表与最终排版以 Astro 构建结果为准。

Cover 支持 None、Random API、Repository Asset、Odette Media、External URL。底层仍保存 `image` 字符串，`api` 原样保留。仓库图片相对于文章所在目录解析，插入时使用相对引用；共享图片使用 R2 API 返回的原图 URL。原文中的非图床链接不会被自动迁移。

R2 选择器支持目录、分页、上传和描述输入，封面与正文共用。移除图片引用、删除文章不会删除 R2 或 Bundle 图片。仓库资源第一版只支持浏览和栅格图片预览，不提供 GitHub 二进制上传或资源删除。

浏览器自动暂存仅用于恢复当前设备的未提交编辑，不是跨设备草稿库。暂存保留基准 SHA；发生冲突时展示远端正文与元信息，必须明确选择远端版本或确认比较后使用最新 SHA。新建但尚未提交的暂存可通过重新填写相同路径恢复。主题 password 字段仍保存在仓库中，公开仓库中可见。

## 验证

```powershell
npm.cmd test
npm.cmd run build
npx.cmd wrangler deploy --dry-run
```

浏览器回归使用模拟 API，不会写入真实 R2 / GitHub：

```powershell
# 一个终端启动纯前端
npx.cmd vite --host 127.0.0.1
# 另一个终端运行测试，默认使用本机 Edge
npm.cmd run test:articles-browser
```

也可通过 `CHROMIUM_PATH` 指定已有 Chromium。截图写入忽略目录 `.wrangler/qa/`。测试覆盖 MDX 正文保真、稳定路径、连续保存 SHA、R2/仓库图片选择、冲突保留、Markdown 安全预览、新建/删除与窄屏溢出。原有 `tests/browser.cjs` 会操作真实开发桶，不属于上述模拟回归。
