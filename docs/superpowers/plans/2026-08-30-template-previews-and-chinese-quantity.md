# 模板封面与中文数量识别 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让小红书种草图鉴正确识别“两个、十二种”等中文数量，并将首页常用模板的四张旧封面替换为用户提供的正式示例图。

**Architecture:** 在 `shared` 新增唯一的图鉴数量解析入口，前端首页、创建页、共享请求校验和后端工作流统一复用，避免重复正则产生规则漂移。四张模板图作为版本化静态资源存入前端资产目录，由模板配置按工作流映射；现有 `TemplatePreview` 继续负责裁切与展示。

**Tech Stack:** React 19、TypeScript 5.9、Vite 7、Node.js、Vitest。

## Global Constraints

- 支持 2～36 的阿拉伯数字与中文数量表达，至少覆盖“2个”“两个”“十二种”“三十六处”。
- 小于 2 的数量继续返回“选题数量至少为 2”；超过 36 的数量继续由后端收敛到 36。
- 中文数字只有紧跟受支持量词时才作为数量，避免普通汉字“一、十”等被误识别。
- 四张图片必须复制进项目，不能引用微信临时路径。
- 首页模板封面按各自原图比例完整展示：商品大片与游客返图为 3:4，图鉴与攻略为 2:3；桌面端四张模板卡片整体居中。
- 不改变模板业务名称、生成流程和图片生成逻辑。

---

### Task 1: 统一图鉴数量解析

**Files:**
- Create: `shared/xhsAtlasTopicQuantity.ts`
- Modify: `shared/workflowSchemas.ts`
- Modify: `backend/src/workflows/xhs-atlas/normalizeTopic.ts`
- Modify: `frontend/src/features/create/xhs-atlas/XhsAtlasCreateForm.tsx`
- Modify: `frontend/src/features/home/useHomeGeneration.ts`
- Test: `shared/workflows.test.ts`
- Test: `backend/src/workflows/xhs-atlas/workflow.test.ts`
- Test: `frontend/src/features/create/workflowForms.test.tsx`
- Test: `frontend/src/features/home/useHomeGeneration.test.tsx`

**Interfaces:**
- Produces: `findXhsAtlasTopicQuantity(topic: string): TopicQuantityMatch | undefined`。
- `TopicQuantityMatch` 提供 `count`、`rawNumber`、`index`、`length` 和 `measureWord`，供校验与后端标题改写共同使用。

- [x] **Step 1: 添加失败测试**

覆盖“两个贵州景点”“十二种美食”“三十六处打卡地”可提交和解析，“一个景点”仍按低于下限拒绝。

- [x] **Step 2: 运行定向测试确认失败**

Run: `npm test -- --run shared/workflows.test.ts backend/src/workflows/xhs-atlas/workflow.test.ts frontend/src/features/create/workflowForms.test.tsx frontend/src/features/home/useHomeGeneration.test.tsx`

Expected: 中文数量用例因当前仅匹配 `\d+` 而失败。

- [x] **Step 3: 实现共享解析器并替换四处重复规则**

解析阿拉伯数字，以及由“零〇一二两三四五六七八九十”组成且紧跟已支持量词的中文数量；中文转换支持 0～99，业务上下限仍由调用方处理。后端超限改写时使用匹配位置，不误改其他文本。

- [x] **Step 4: 运行定向测试确认通过**

Run: `npm test -- --run shared/workflows.test.ts backend/src/workflows/xhs-atlas/workflow.test.ts frontend/src/features/create/workflowForms.test.tsx frontend/src/features/home/useHomeGeneration.test.tsx`

Expected: 全部通过。

### Task 2: 替换四个常用模板封面

**Files:**
- Create: `frontend/src/assets/template-previews/original-ip-product.webp`
- Create: `frontend/src/assets/template-previews/xhs-atlas.webp`
- Create: `frontend/src/assets/template-previews/travel-guide.webp`
- Create: `frontend/src/assets/template-previews/ugc-photo-campaign.webp`
- Modify: `frontend/src/config/templates.ts`
- Modify: `frontend/src/styles/templates.css`
- Test: `frontend/src/config/templates.test.ts`

**Interfaces:**
- `TEMPLATE_CONFIGS[*].previewImageUrl` 继续作为唯一图片入口。
- `previewVariant` 继续控制每张图的 `object-position`。

- [x] **Step 1: 添加配置测试**

断言四个模板封面均来自 `assets/template-previews`，不再引用粒子背景。

- [x] **Step 2: 复制用户提供图片并更新配置**

将四张原图复制为语义化文件名，更新 `templates.ts` import，不引用微信临时目录。

- [x] **Step 3: 匹配原图比例并居中模板区域**

首页常用模板不再强制使用 16:9：按四张原图的 3:4 或 2:3 比例完整展示；桌面端卡片与标题整体居中，手机端仍保留从左开始的横向滚动，避免首张卡片被屏幕裁掉。

- [x] **Step 4: 运行配置与组件测试**

Run: `npm test -- --run frontend/src/config/templates.test.ts frontend/src/features/templates`

Expected: 全部通过。

### Task 3: 完整质量检查与提交

**Files:**
- Modify: `docs/superpowers/plans/2026-08-30-template-previews-and-chinese-quantity.md`

**Interfaces:**
- Consumes: Task 1 的共享数量解析与 Task 2 的静态封面资源。
- Produces: 可构建、可测试且已提交的完整改动。

- [x] **Step 1: 执行完整检查**

Run: `npm run lint && npm run typecheck && npm test && npm run build`

Expected: 全部退出码为 0。

- [x] **Step 2: 浏览器验收**

确认首页四个常用模板显示新封面；选择“小红书种草图鉴”输入“两个贵州景点”时不再出现缺少数量提示。

- [x] **Step 3: 更新计划勾选状态并检查可复用经验**

确认是否存在符合全局复利日志准入标准的新经验；没有则不修改全局文档。

- [x] **Step 4: 中文提交**

Run: `git add ... && git commit -m "修复：支持图鉴中文数量并更新模板封面"`
