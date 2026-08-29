# 文旅营销素材生成 Demo

黔景智作（QianScape AI / QSAI）是面向文旅运营人员的多页面素材创作产品。主页默认选中最常用工作流，用户输入一句话、可选添加图片后即可生成；默认 Mock 链路无需模型密钥。

## 启动

```bash
npm install
npm run dev
```

前端地址为 `http://localhost:5173`，后端地址为 `http://localhost:8787`。

真实模型模式：在 `.env` 配置 `COPY_API_KEY` 与 `IMAGE_API_KEY` 后运行 `PROVIDER_MODE=real npm run dev`。文案走智谱 GLM，图片走第三方中转；中转方可以看到提示词与图片内容，请勿提交敏感素材。密钥仅保存在服务端，不会进入前端构建产物。

## 技术栈

### 前端

| 类别 | 技术选型 | 说明 |
| --- | --- | --- |
| UI 框架 | React 19 | 组件化界面，配合 React Router DOM 7 实现多页面路由 |
| 语言 | TypeScript 5.9 | 全仓严格类型检查 |
| 构建工具 | Vite 7 | 开发热更新与生产构建 |
| 图标 | Phosphor Icons React | 统一视觉图标体系 |
| 本地历史 | idb（IndexedDB） | 结果与参考图副本按工作流存本机，保留最近 20 条 |
| 素材打包 | JSZip | 前端生成包含文案与图片的 ZIP 素材包 |
| 前端测试 | Vitest + Testing Library + jsdom + fake-indexeddb | 组件渲染与 IndexedDB 相关逻辑测试 |

前端按 `app / pages / features / components / config / styles` 分层组织，API 层统一做响应校验、30s 超时与业务错误白名单传递。

### 后端

| 类别 | 技术选型 | 说明 |
| --- | --- | --- |
| 运行环境 | Node.js + tsx | TypeScript 源码直接运行，无需预编译 |
| Web 框架 | Express 5 | API 服务与静态资源托管 |
| 文件上传 | multer | 参考图 / 产品图 multipart 上传 |
| 图片处理 | sharp | 图片校验与格式处理 |
| 参数校验 | Zod 4 | 请求体与 Provider 响应结构校验 |
| 环境配置 | dotenv | `.env` 管理密钥与运行模式 |
| API 测试 | supertest | 后端接口集成测试 |

后端按 `config / http / routes / services / storage / workflows / providers` 模块化组织，支持模板注册、双工作流编排与部分成功聚合。

### AI 模型层

| 能力 | 模型 | 提供方 |
| --- | --- | --- |
| 文案生成 | GLM（glm-5.3-flash） | 智谱 AI 开放平台 |
| 图像生成 | gpt-image-2 | 第三方 API 中转站 |
| 视觉分析 | gpt-5.5 | 第三方 API 中转站 |

Provider 层提供 Mock / Real 双模式：Mock 无需任何密钥即可跑通全流程；Real 模式通过 `.env` 切换，密钥仅存于服务端。

### 工程化

| 类别 | 技术选型 |
| --- | --- |
| 代码规范 | ESLint + typescript-eslint |
| 单元 / 集成测试 | Vitest（前端组件 + 后端 API 共 236+ 用例） |
| 并行启动 | concurrently（一键同时跑前后端） |
| 版本管理 | Git / GitHub |

## 双工作流

| 模板 | 输入 | 输出 |
| --- | --- | --- |
| 小红书图鉴创作 | 含 2～36 数量的选题（如“贵阳的12种美食”），最多 4 张参考图 | 图鉴封面与正文页、3 个候选标题、发布正文与标签、清单 JSON |
| 原创 IP 商品化 | 一张产品图 + 产品描述（首次需初始化并锁定 IP 档案） | 品牌主视觉、识别系统、商品包装、场景应用四张 3:4 图、可选 2×2 总览图与发布文案 |

图鉴参考图只影响画面视觉，不改变清单事实。

## 页面入口

| 路由 | 页面 |
| --- | --- |
| `/` | 一句话生成主页；默认选中小红书图鉴创作 |
| `/templates` | 全部模板 |
| `/templates/:templateId` | 模板详情 |
| `/templates/original-ip/create` | 原创 IP 首次档案配置与兼容创建入口 |
| `/results/:requestId` | 当前生成结果 |
| `/history` | 本机历史 |
| `/history/:recordId` | 历史结果详情 |

## 参考图与本机历史

- 参考图支持 JPG、PNG、WebP，单张不超过 10MB；原创 IP 每次生成上传 1 张产品图，图鉴最多 4 张。
- 上传后的参考图持久保存在后端 `data/reference-assets/`；生成完成后不会自动删除。
- 完整生成结果和参考图本地副本保存在当前浏览器 IndexedDB（v2，按工作流存储），按保存时间保留最近 20 条。
- 清空或删除本机历史只影响当前浏览器，不会删除后端参考图或已经下载的文件。
- 刷新 `/results/:requestId` 或打开历史详情时，页面会从 IndexedDB 恢复已有结果，不会重新请求生成。
- 从历史重新生成时，产品描述/选题自动预填，本地图随历史恢复，可直接再次生成。

## 结果使用

- 标题（图鉴为候选标题）、正文和标签可分别复制。
- 成功图片可单独下载，也可下载包含文案和图片的 ZIP 素材包；图鉴素材包额外包含 `发布文案.txt` 与 `清单.json`。
- 部分图片失败时，ZIP 仅包含成功图片和完整文案；全部图片失败时仍可查看并下载文案。

## 当前验证状态

双工作流和新版正式首页均已交付。顶部采用全宽毛玻璃导航，Trae 粒子显影背景只在主页挂载；全部模板、模板详情、结果和历史均为独立页面。验证记录见 `tasks/acceptance-双工作流.md` 和 Phase 3 文档。
