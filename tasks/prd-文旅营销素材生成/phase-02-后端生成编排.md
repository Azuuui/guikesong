# Phase 2：后端生成编排

Parent PRD：[PRD：文旅营销素材生成 Demo](../prd-文旅营销素材生成.md)
Status：Not Started
Last Updated：2026-08-28

## 目标

实现参考素材持久上传、四模板注册、文案与视觉规划双分支、页面级图片生成、Mock Provider、统一 API 和部分成功语义。

## 对应范围

- Goals：G-2—G-5
- Success Criteria：SC-1—SC-5、SC-7—SC-9
- Requirements：FR-3—FR-19、FR-25—FR-29、NFR-2—NFR-4、NFR-6—NFR-9

## Phase Discovery Gate

- [ ] 重新读取共享类型、环境变量和 Phase 1 验证结果。
- [ ] 确认队友正式提示词是否已到位；未到位继续使用简单占位提示词。
- [ ] 确认真实 Provider 是否仍未指定；未指定时不引入供应商 SDK。
- [ ] 核对文案和视觉规划是否仍可并行；若提示词产生依赖，先更新 PRD。
- [ ] 核对图片 Provider 并发和超时配置边界。
- [ ] 核对后端运行环境的持久目录权限和重启后保留能力。

## 范围

### In Scope

- 参考素材上传、读取和持久文件存储。
- 四个独立模板模块。
- Copy、Visual Plan、Image 三类 Provider 接口和 Mock 实现。
- 生成服务、页面并发、部分失败聚合和 Generate API。

### Out of Scope

- 前端完整结果页、真实模型 SDK、单页重试和持久化。

## 实施清单

- [ ] 定义 `MarketingTemplate`，包含 `id`、`name`、`buildCopyPrompt`、`buildVisualPlanPrompt`。
- [ ] 实现 `POST /api/reference-assets`，支持最多 4 张 JPG、PNG、WebP，单张不超过 10MB。
- [ ] 使用文件签名识别真实图片类型，拒绝扩展名/MIME 欺骗、路径穿越和可执行内容。
- [ ] 使用高熵随机 `assetId` 和安全文件名保存文件及必要元数据，禁止目录列表并将目录加入 `.gitignore`。
- [ ] 实现受控的参考素材读取接口，响应正确 `Content-Type`，不暴露物理路径。
- [ ] 为四个模板创建独立文件和简单占位提示词，禁止复制到生成服务。
- [ ] 实现模板注册表与唯一 ID 校验测试。
- [ ] 定义 `CopyProvider`、`VisualPlanProvider`、`ImageProvider` 接口和统一错误类型。
- [ ] 实现确定性 Mock Copy Provider，返回标题、正文和标签。
- [ ] 实现确定性 Mock Visual Plan Provider，按模板返回封面/内容/结尾页面计划。
- [ ] 实现可下载的 Mock Image Provider，并允许测试指定某个页面失败。
- [ ] 实现生成服务：校验请求和参考素材 ID、加载素材、并行执行 Copy/Visual Plan、校验视觉计划、并发生成页面并聚合状态。
- [ ] 实现 `POST /api/generate`，返回统一 `GenerateResponse`，不返回内部提示词。
- [ ] 实现 Provider 超时、文案失败、视觉规划失败和单页失败的错误映射。
- [ ] 记录结构化请求与失败日志，不记录密钥和完整提示词正文。
- [ ] 为上传成功、非法类型、伪造类型、超限、路径安全、重启后存在、成功生成、未知素材 ID、文案失败、视觉规划失败、单页失败编写单元和 API 集成测试。
- [ ] 更新 README 的 Provider 接口说明，并用中文 Commit Message 提交。

## 验证策略

以单元测试验证模板与编排纯逻辑，以 HTTP 集成测试验证 API 合同和错误状态；Mock Provider 保证测试不依赖网络。

## 验证清单

- [ ] 四模板 Prompt Builder 快照或关键约束测试通过。
- [ ] Copy 与 Visual Plan 默认通过并行调用执行。
- [ ] 动态页面数量正确，页面文件名稳定且无重复。
- [ ] 单页失败时 HTTP 请求仍成功返回 `partial`，其余页面完整。
- [ ] 文案或视觉计划失败时返回统一失败响应，不泄露内部提示词。
- [ ] 生成完成后参考文件仍存在且可读取；服务重启后仍存在。
- [ ] 目录浏览、原始物理路径和原始文件名无法直接暴露。
- [ ] API 集成测试与根目录静态检查通过。

## 退出标准

- [ ] 前端可仅依赖公开 DTO 完成集成。
- [ ] Mock 模式完整返回四类素材结果。
- [ ] 真实 Provider 可通过接口接入，无需修改模板和 API。

## 阶段末多轮审查

- [ ] 1. 双提示词与页面编排覆盖审查
- [ ] 2. 错误、超时和部分成功正确性审查
- [ ] 3. Provider/模板/服务边界简化审查
- [ ] 4. 并发与日志安全审查
- [ ] 5. 重复提示词、临时 Mock 和无用依赖清理审查
