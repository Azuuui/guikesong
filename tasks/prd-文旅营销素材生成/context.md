# 文旅营销素材生成 PRD 上下文

Parent PRD：[PRD：文旅营销素材生成 Demo](../prd-文旅营销素材生成.md)
Last Updated：2026-08-28

## 已审阅输入

- `guikesong介绍.md`
- `docs/superpowers/specs/2026-08-28-文旅营销素材生成-design.md`
- 用户确认的四类模板：固定 IP、旅游攻略知识卡片、风景拼图、人物拼图。
- 用户确认的交互：选择模板、输入一句话、一键生成并返回完整素材。
- 用户确认的生成方式：用户文案与视觉规划两套提示词；视觉提示词规定图片文字、艺术字体和排版。
- 用户确认的 Demo 边界：所有模板可选上传最多 4 张参考图；允许图片部分失败；Mock 跑通并预留真实 Provider。
- 用户确认的历史规则：完整记录保存在用户电脑浏览器 IndexedDB，默认最近 20 条。
- 用户确认的后端规则：上传参考图生成完成后不删除，由后端持久保存。

## 当前项目事实

- 项目为新仓库，当前只有项目介绍和设计文档。
- 无 `package.json`、前后端代码、测试、环境变量、部署配置、存储目录或现有模型 SDK。
- 设计基线提交为 `a736078`。
- 因真实 Provider 尚未指定，不能在 PRD 中假设具体 SDK、鉴权方式、异步任务协议或图片 URL 生命周期。

## 推荐技术边界

- 使用 npm workspace 或等价单仓结构管理 `frontend`、`backend`、`shared`。
- 前后端使用 TypeScript；共享 DTO 从 `shared` 导出。
- 后端采用轻量 HTTP 框架，具体框架由执行会话根据依赖与测试便利性选择并记录。
- Provider 通过接口隔离；Mock Provider 不依赖网络，真实 Provider 从环境变量读取配置。
- 参考素材使用独立上传 API 和高熵 `assetId`，文件存放到 Git 忽略的持久运行时目录。
- 后端不引入业务数据库；必要的素材元数据使用安全文件名和 JSON sidecar 或等价轻量方式维护。
- 前端使用 IndexedDB 保存完整历史与 Blob，不使用 localStorage 承载大图片。
- Mock 图片建议返回可下载的本地静态图或 SVG/Data URL，以验证多页面展示和素材包下载。
- 完整素材包建议使用 ZIP，包含成功图片与 UTF-8 `文案.txt`；是否加入 JSON 清单由实现复杂度决定。

## 核心数据流

```text
参考图文件 ──→ Reference Assets API ──→ assetIds + 持久文件
                                          ↓
templateId + userPrompt + referenceAssetIds
        ↓
模板注册表
  ├─ buildCopyPrompt
  └─ buildVisualPlanPrompt
        ↓ Promise.all
文案 Provider        视觉规划 Provider
        ↓                  ↓
GeneratedCopy           VisualPlan.pages
                              ↓
                    页面级图片 Provider 并发
                              ↓
                    succeeded / failed pages
        └───────────────┬──────┘
                        ↓
                 GenerateResponse
```

## 验证表面

- 静态：TypeScript typecheck、lint、production build。
- 单元：输入校验、模板注册、提示词构建、视觉计划解析、状态聚合、文件命名。
- 集成：Generate API 的成功、未知模板、空输入、文案失败、单页失败。
- 集成：Reference Assets API 的类型/大小/签名/路径安全、读取和重启后存在性。
- 前端：模板选择、输入校验、参考图预览/移除、重复提交、结果展示、复制、下载、部分成功提示、IndexedDB 历史。
- 浏览器：桌面与手机宽度完成一次 Mock 生成，验证 ZIP 和单图下载。
- 手工：连续生成四个模板，确认结果不会串模板或残留上一次状态。

## 设计影响与风险

- 双提示词并行要求文案与视觉规划均只依赖模板和用户输入；若正式提示词要求视觉内容引用文案输出，应把该模板切换为顺序模式并更新 PRD。
- 图片文字由模型生成，系统只能验证图片存在，无法程序化保证中文正确；需要人工 Demo 验收。
- 上传参考图片仍不等于模型能够保证固定 IP 和人物一致性，产品只保证素材传递。
- 图片 URL 可能过期或受跨域限制；真实 Provider 接入时应选择后端代理、转存或稳定 URL 策略并更新阶段文件。
- 后端参考素材永久保留会累积磁盘占用，生产版必须补权限、配额、审计、保留期和清理任务。
- 本机历史不跨浏览器或设备；清除浏览器站点数据会永久删除历史。
- 删除本机历史不会删除后端参考图，这是 Demo 明确边界。

## 尚未审阅

- 真实模型官方 API 文档：Provider 未指定。
- 字体商业授权：字体由模型画面生成，项目不打包字体文件；若后续改为本地字体渲染需重新审查。
- 部署平台限制：尚未提供。
