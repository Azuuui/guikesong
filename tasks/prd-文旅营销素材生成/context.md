# 文旅营销素材生成 PRD 上下文

Parent PRD：[PRD：文旅营销素材生成 Demo](../prd-文旅营销素材生成.md)
Last Updated：2026-08-28

## 已审阅输入

- `project002文旅营销素材生成介绍.md`
- `docs/superpowers/specs/2026-08-28-文旅营销素材生成-design.md`
- 用户确认的四类模板：固定 IP、旅游攻略知识卡片、风景拼图、人物拼图。
- 用户确认的交互：选择模板、输入一句话、一键生成并返回完整素材。
- 用户确认的生成方式：用户文案与视觉规划两套提示词；视觉提示词规定图片文字、艺术字体和排版。
- 用户确认的 Demo 边界：不上传图片；允许图片部分失败；Mock 跑通并预留真实 Provider。

## 当前项目事实

- 项目为新仓库，当前只有项目介绍和设计文档。
- 无 `package.json`、前后端代码、测试、环境变量、部署配置或现有模型 SDK。
- 设计基线提交为 `a736078`。
- 因真实 Provider 尚未指定，不能在 PRD 中假设具体 SDK、鉴权方式、异步任务协议或图片 URL 生命周期。

## 推荐技术边界

- 使用 npm workspace 或等价单仓结构管理 `frontend`、`backend`、`shared`。
- 前后端使用 TypeScript；共享 DTO 从 `shared` 导出。
- 后端采用轻量 HTTP 框架，具体框架由执行会话根据依赖与测试便利性选择并记录。
- Provider 通过接口隔离；Mock Provider 不依赖网络，真实 Provider 从环境变量读取配置。
- Mock 图片建议返回可下载的本地静态图或 SVG/Data URL，以验证多页面展示和素材包下载。
- 完整素材包建议使用 ZIP，包含成功图片与 UTF-8 `文案.txt`；是否加入 JSON 清单由实现复杂度决定。

## 核心数据流

```text
templateId + userPrompt
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
- 前端：模板选择、输入校验、重复提交、结果展示、复制、下载、部分成功提示。
- 浏览器：桌面与手机宽度完成一次 Mock 生成，验证 ZIP 和单图下载。
- 手工：连续生成四个模板，确认结果不会串模板或残留上一次状态。

## 设计影响与风险

- 双提示词并行要求文案与视觉规划均只依赖模板和用户输入；若正式提示词要求视觉内容引用文案输出，应把该模板切换为顺序模式并更新 PRD。
- 图片文字由模型生成，系统只能验证图片存在，无法程序化保证中文正确；需要人工 Demo 验收。
- 不上传参考图片意味着固定 IP 和人物一致性只是提示词效果，不是产品保证。
- 图片 URL 可能过期或受跨域限制；真实 Provider 接入时应选择后端代理、转存或稳定 URL 策略并更新阶段文件。

## 尚未审阅

- 真实模型官方 API 文档：Provider 未指定。
- 字体商业授权：字体由模型画面生成，项目不打包字体文件；若后续改为本地字体渲染需重新审查。
- 部署平台限制：尚未提供。
