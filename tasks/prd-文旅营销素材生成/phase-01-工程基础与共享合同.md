# Phase 1：工程基础与共享合同

Parent PRD：[PRD：文旅营销素材生成 Demo](../prd-文旅营销素材生成.md)
Status：Not Started
Last Updated：2026-08-28

## 目标

建立可运行、可测试、职责清晰的前后端 TypeScript 工程，并锁定公共请求、响应、参考素材、本机历史和错误合同。

## 对应范围

- Goals：G-1、G-3、G-4
- Success Criteria：SC-1、SC-7—SC-11
- Requirements：FR-1—FR-7、FR-15、FR-20—FR-29、NFR-1、NFR-2、NFR-4、NFR-6、NFR-8—NFR-10

## Phase Discovery Gate

- [ ] 重新阅读主 PRD、`context.md` 和设计文档。
- [ ] 核对本机 Node.js/npm 版本及可用依赖，不重复下载已存在工具。
- [ ] 确认项目 Git 状态，保留用户或队友新增文件。
- [ ] 确认真实 Provider 仍未指定；本阶段不引入特定模型 SDK。
- [ ] 若工程结构变化，先同步主 PRD 和项目介绍。

## 范围

### In Scope

- 单仓工程、前端、后端、共享类型、基础脚本和环境变量示例。
- 生成 DTO、参考素材 DTO、模板 ID、页面状态、IndexedDB 历史结构和统一错误类型。
- 最小健康检查与 Mock 默认配置。

### Out of Scope

- 具体模板提示词、生成编排、完整 UI、文件上传实现和真实模型调用。

## 实施清单

- [ ] 创建根 `package.json` 与 workspace 脚本，支持一次安装、测试、检查和构建。
- [ ] 创建 `frontend` React + TypeScript + Vite 工程入口，不添加业务大组件。
- [ ] 创建 `backend` Node.js + TypeScript HTTP 服务入口与 `/api/health`。
- [ ] 创建 `shared` 类型包，导出四个模板 ID、`ReferenceAsset`、`GenerateRequest`、`GeneratedCopy`、`GeneratedPage`、`GenerateResponse`、历史记录结构和内部 `VisualPlan`。
- [ ] 实现共享运行时校验或后端请求校验，覆盖未知模板和 2—500 字输入。
- [ ] 创建 `.env.example`，只列 Provider 模式、地址、模型名、密钥和超时变量，不写真实密钥。
- [ ] 定义后端参考素材运行时目录、最大文件数/大小配置和 Git 忽略规则。
- [ ] 定义 IndexedDB 数据库名、版本、对象仓库、20 条上限和升级策略。
- [ ] 配置 TypeScript、lint、测试和构建脚本，避免前后端重复配置失控。
- [ ] 编写共享类型/校验测试和健康接口测试。
- [ ] 更新 README 与项目介绍，记录启动命令和目录职责。
- [ ] 使用中文 Commit Message 提交完整可运行基础工程。

## 验证策略

使用静态检查、共享逻辑单元测试和健康接口测试；此阶段没有完整用户界面，不要求浏览器业务验收。

## 验证清单

- [ ] 依赖安装成功且 lockfile 已提交。
- [ ] 根目录 typecheck、lint、test、build 命令全部通过。
- [ ] `/api/health` 返回可识别的 Mock 模式状态。
- [ ] 未知模板、过短和过长输入的校验测试通过。
- [ ] 参考素材数量、媒体类型和历史结构校验测试通过。
- [ ] 客户端构建产物不包含 `.env` 示例中的密钥占位值之外的秘密。

## 退出标准

- [ ] 前后端与共享类型可独立构建。
- [ ] 公共合同与设计文档一致。
- [ ] Phase 2 无工程或类型阻塞。

## 阶段末多轮审查

- [ ] 1. 范围覆盖审查
- [ ] 2. 正确性和边界审查
- [ ] 3. 简化与模块职责审查
- [ ] 4. 命名、类型和脚本一致性审查
- [ ] 5. 无用依赖、临时代码和敏感信息清理审查
