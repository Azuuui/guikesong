# 双工作流改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有四个空壳模板替换为“原创 IP 商品化”和“小红书图鉴创作”两套真实可运行、可扩展、可使用 Mock 或真实模型 Provider 的工作流。

**Architecture:** 前端使用模板注册表与工作流专属表单/结果适配器，后端使用 Workflow 注册表、独立提示词与确定性脚本；上传、Provider、历史、下载和错误处理作为公共基础设施。共享契约使用 `workflowId` 判别联合类型，避免在一个通用请求中堆积可选字段。

**Tech Stack:** React 19、TypeScript 5.9、Vite 7、Node.js 24、Express 5、Vitest 3、IndexedDB/idb、JSZip、Multer；新增 Zod、Sharp、dotenv、Supertest 与 ESLint。

## Global Constraints

- 项目路径固定为 `/Users/azu/Documents/guikesong`，在当前分支工作，不创建新项目。
- 开始前阅读 `tasks/design-原创IP与小红书图鉴工作流.md`、PRD、项目介绍和六份外部提示词资料。
- 不覆盖或顺带提交用户现有的 `guikesong介绍.md`、`tasks/prd-文旅营销素材生成.md` 修改；需要同步时先审阅差异并在最终文档任务中合并。
- 真实 Key 只允许存在于根目录 `.env`，不得读取后输出、写入测试快照、日志、文档、前端或 Git。
- 文案模型固定为 `glm-5.3-flash`，调用时固定 `reasoning_effort: "low"`。
- 生图模型固定为 `gpt-image-2`，通过 `https://lbwcxknb.ccwu.cc/v1` 中转站同步调用。
- 中转站必须先验证视觉理解文本输出和多参考图编辑能力；关键能力失败时停止，不允许静默降级。
- 当前用户可见模板只有 `original-ip` 与 `xhs-atlas`；旧四模板最终必须删除。
- 小红书参考图最多 4 张，只进入生图调用，不参与清单和文案事实生成。
- 原创 IP 的 C-1 成功后自动并行生成 C-2、C-3、C-4，不增加人工确认步骤。
- 图片中中文、艺术字和排版由图片模型完成，不增加 Canvas、SVG 或字体后置渲染；Sharp 只用于 2×2 无文字总览拼接。
- IndexedDB 最多保留最近 20 条；保存失败不得影响当前结果和下载。
- 每个任务结束运行其指定测试并使用中文 Commit Message 独立提交。

---

## File Map

### Shared

- `shared/workflows.ts`：两套请求/响应、页面角色和 IP Profile 判别联合。
- `shared/workflowSchemas.ts`：Zod 请求/响应 Schema 与安全解析函数。
- `shared/workflows.test.ts`：判别联合、业务边界和响应约束测试。
- `shared/types.ts`：Task 7 切换前保留旧前端合同；切换时删除旧合同并重新导出公共资产与新工作流类型。

### Backend foundation

- `backend/src/server.ts`：只负责加载环境和监听端口。
- `backend/src/app.ts`：创建 Express App 并挂载路由，供 Supertest 使用。
- `backend/src/config/env.ts`：读取、验证非敏感配置；禁止返回可序列化 Key 对象。
- `backend/src/http/apiError.ts`：统一业务错误与安全响应。
- `backend/src/http/fetchWithTimeout.ts`：上游请求超时和取消。
- `backend/src/http/safeRemoteImage.ts`：HTTPS、私网地址、重定向、MIME 和大小限制。

### Backend assets

- `backend/src/assets/imageValidation.ts`：扩展名、MIME、签名、大小验证。
- `backend/src/assets/referenceAssetStore.ts`：普通参考图持久化与安全读取。
- `backend/src/assets/ipProfileStore.ts`：单个全局 IP Profile 的 JSON 元数据和标准图。
- `backend/src/assets/generatedAssetStore.ts`：Provider 图片 URL/Base64 归一化后的本地结果文件。
- `backend/src/routes/referenceAssets.ts`：参考图上传/访问。
- `backend/src/routes/ipProfiles.ts`：IP Profile 创建、读取、锁定。
- `backend/src/routes/generate.ts`：解析判别联合请求并委托 Workflow 注册表。

### Backend providers

- `backend/src/providers/contracts.ts`：文本、视觉理解、生图 Provider 接口。
- `backend/src/providers/mockProviders.ts`：两套工作流可复现 Mock。
- `backend/src/providers/zhipuTextProvider.ts`：智谱 JSON 文本调用。
- `backend/src/providers/relayVisionProvider.ts`：中转站图片理解到文本 JSON。
- `backend/src/providers/relayImageProvider.ts`：`gpt-image-2` generations/edits 同步调用。
- `backend/src/providers/providerFactory.ts`：按 `PROVIDER_MODE` 组装 Provider。
- `backend/src/providers/providerSmoke.ts`：不打印 Key 的能力探测脚本。

### Backend workflows

- `backend/src/workflows/contracts.ts`：WorkflowContext、Workflow 接口。
- `backend/src/workflows/registry.ts`：`workflowId → Workflow` 注册表。
- `backend/src/workflows/original-ip/`：原创 IP Schema、提示词、渲染器、工作流和测试。
- `backend/src/workflows/xhs-atlas/`：标题规范化、清单 Schema、分页、提示词、工作流和测试。
- `backend/src/services/collage.ts`：Sharp 2×2 总览图。

### Frontend

- `frontend/src/config/templates.ts`：仅两个模板的元数据和能力声明。
- `frontend/src/features/create/WorkflowCreateRouter.tsx`：按 `workflowId` 分派专属表单。
- `frontend/src/features/create/original-ip/`：IP 初始化、产品输入和生成进度。
- `frontend/src/features/create/xhs-atlas/`：图鉴选题、可选参考图和生成进度。
- `frontend/src/features/generation/api.ts`：上传、IP Profile 和联合生成 API。
- `frontend/src/features/results/ResultDetail.tsx`：公共结果壳。
- `frontend/src/features/results/OriginalIpResult.tsx`：原创 IP 结果。
- `frontend/src/features/results/XhsAtlasResult.tsx`：图鉴结果。
- `frontend/src/features/history/`：联合历史记录、IndexedDB v2 一次性清理和 Blob 物化。
- `frontend/src/features/generation/downloads.ts`：按工作流生成文案和 JSON 文件并打包。

---

### Task 1: 建立可测试后端与工程检查基线

**Files:**
- Modify: `package.json`
- Modify: `backend/src/server.ts`
- Create: `backend/src/app.ts`
- Create: `backend/src/config/env.ts`
- Create: `backend/src/http/apiError.ts`
- Create: `backend/src/legacy/registerLegacyRoutes.ts`
- Create: `backend/src/app.test.ts`
- Create: `eslint.config.js`
- Create: `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `createApp(dependencies?: Partial<AppDependencies>): Express`
- Produces: `loadPublicConfig(): {port:number; providerMode:'mock'|'real'}`
- Produces: `ApiError(status:number, safeMessage:string, code:string)`
- Produces: `registerLegacyRoutes(app): void`，只用于保持中间提交可运行，Task 7 删除

- [ ] **Step 1: 记录基线，不修改用户文件**

Run:

```bash
git status --short --branch
npm run typecheck
npm test
npm run build
```

Expected: 记录每条命令的退出码；若现有分支失败，把原始失败摘要写入本任务记录，但不要用删除测试规避。

- [ ] **Step 2: 安装明确依赖并增加脚本**

Run:

```bash
npm install zod sharp dotenv
npm install -D supertest @types/supertest eslint @eslint/js typescript-eslint eslint-plugin-react-hooks globals
```

在 `package.json` 增加：

```json
{
  "scripts": {
    "lint": "eslint shared backend/src frontend/src",
    "test": "vitest run --config frontend/vitest.config.ts",
    "test:watch": "vitest --config frontend/vitest.config.ts",
    "smoke:providers": "tsx backend/src/providers/providerSmoke.ts"
  }
}
```

- [ ] **Step 3: 先写 App 工厂失败测试**

Create `backend/src/app.test.ts` with Node environment annotation and assertions:

```ts
// @vitest-environment node
import request from 'supertest';
import {describe, expect, it} from 'vitest';
import {createApp} from './app';

describe('app health', () => {
  it('只返回非敏感健康信息', async () => {
    const response = await request(createApp()).get('/api/health').expect(200);
    expect(response.body).toEqual({ok: true, mode: 'mock'});
    expect(JSON.stringify(response.body)).not.toMatch(/key|token|authorization/i);
  });
});
```

- [ ] **Step 4: 运行测试确认失败**

Run: `npx vitest run backend/src/app.test.ts --config frontend/vitest.config.ts`

Expected: FAIL，因为 `backend/src/app.ts` 尚不存在。

- [ ] **Step 5: 实现 App 工厂和最小启动文件**

`backend/src/server.ts` 只保留：加载 dotenv、调用 `createApp()`、监听 `loadPublicConfig().port`。`createApp()` 挂载 `cors()`、`express.json({limit:'1mb'})`、健康路由和统一错误处理。把现有参考图与 Mock generate 处理器原样迁移到 `legacy/registerLegacyRoutes.ts` 并挂载，确保 Task 1 提交后当前页面仍可运行；错误响应只包含 `{error, code}`。该 legacy 文件不得被新 Workflow 导入。

`.env.example` 写入变量名和非敏感默认值，不写真实 Key：

```env
PROVIDER_MODE=mock
PORT=8787
COPY_API_BASE_URL=https://open.bigmodel.cn/api/paas/v4
COPY_API_KEY=
COPY_MODEL=glm-5.3-flash
COPY_REASONING_EFFORT=low
IMAGE_API_BASE_URL=https://lbwcxknb.ccwu.cc/v1
IMAGE_API_KEY=
IMAGE_MODEL=gpt-image-2
VISION_MODEL=gpt-image-2
```

- [ ] **Step 6: 运行工程检查**

Run:

```bash
npm run lint
npm run typecheck
npx vitest run backend/src/app.test.ts --config frontend/vitest.config.ts
npm run build
```

Expected: 全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add package.json package-lock.json eslint.config.js .env.example .gitignore backend/src/server.ts backend/src/app.ts backend/src/config/env.ts backend/src/http/apiError.ts backend/src/legacy/registerLegacyRoutes.ts backend/src/app.test.ts
git commit -m "工程：建立可测试后端与环境配置"
```

---

### Task 2: 新增判别联合契约与 Workflow 注册表

**Files:**
- Create: `shared/workflows.ts`
- Create: `shared/workflowSchemas.ts`
- Create: `shared/workflows.test.ts`
- Create: `backend/src/workflows/contracts.ts`
- Create: `backend/src/workflows/registry.ts`
- Create: `backend/src/workflows/registry.test.ts`

**Interfaces:**
- Produces: `GenerateRequest = OriginalIpRequest | XhsAtlasRequest`
- Produces: `GenerateResult = OriginalIpResult | XhsAtlasResult`
- Produces: `parseGenerateRequest(value:unknown): GenerateRequest`
- Produces: `Workflow<I,O>.run(input:I, context:WorkflowContext): Promise<O>`
- Produces: `createWorkflowRegistry(workflows): WorkflowRegistry`

- [ ] **Step 1: 写共享契约失败测试**

测试至少包含：

```ts
expect(parseGenerateRequest({
  workflowId:'original-ip', ipProfileId:'profile-1',
  productAssetId:'asset-1', productDescription:'米白陶瓷杯',
})).toMatchObject({workflowId:'original-ip'});

expect(() => parseGenerateRequest({
  workflowId:'xhs-atlas', topic:'贵阳美食', referenceAssetIds:[],
})).toThrow('选题需包含数量');
```

同时断言 `xhs-atlas` 最多 4 个参考图，原创 IP 产品描述非空且不超过 500 字。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run shared/workflows.test.ts --config frontend/vitest.config.ts`

Expected: FAIL，缺少新类型和解析函数。

- [ ] **Step 3: 实现类型和 Zod Schema**

新工作流 ID：

```ts
export const WORKFLOW_IDS = ['original-ip','xhs-atlas'] as const;
export type WorkflowId = typeof WORKFLOW_IDS[number];
```

页面角色使用判别联合：原创 IP 为 `brand-cover | identity-system | product-system | scene-application | overview`；图鉴为 `cover | content`。致命失败不进入成功结果，成功结果状态只允许 `succeeded | partial`。Task 2 不修改旧 `TEMPLATE_IDS` 和旧前端请求类型，避免尚未切换的页面在中间提交失效；新后端只从 `shared/workflows.ts` 导入合同。

- [ ] **Step 4: 写注册表失败测试并实现最小注册表**

测试：注册两个假 Workflow 后按 ID 精确分派；重复 ID 和未知 ID 抛出安全业务错误。注册第三个测试 Workflow 不修改前两个实现。

注册表公开：

```ts
export interface Workflow<I extends GenerateRequest = GenerateRequest> {
  readonly id: I['workflowId'];
  run(input:I, context:WorkflowContext):Promise<GenerateResult>;
}
```

- [ ] **Step 5: 运行测试与类型检查**

Run:

```bash
npx vitest run shared/workflows.test.ts backend/src/workflows/registry.test.ts --config frontend/vitest.config.ts
npm run typecheck
```

Expected: PASS，且现有旧前端仍能 typecheck。新代码不得从旧 `GenerateRequest` 或旧 `TemplateId` 导入。

- [ ] **Step 6: 提交**

```bash
git add shared/workflows.ts shared/workflowSchemas.ts shared/workflows.test.ts backend/src/workflows/contracts.ts backend/src/workflows/registry.ts backend/src/workflows/registry.test.ts
git commit -m "架构：新增双工作流契约与注册表"
```

---

### Task 3: 资产存储与单个 IP Profile

**Files:**
- Create: `backend/src/assets/imageValidation.ts`
- Create: `backend/src/assets/imageValidation.test.ts`
- Create: `backend/src/assets/referenceAssetStore.ts`
- Create: `backend/src/assets/ipProfileStore.ts`
- Create: `backend/src/assets/generatedAssetStore.ts`
- Create: `backend/src/routes/referenceAssets.ts`
- Create: `backend/src/routes/ipProfiles.ts`
- Create: `backend/src/routes/assets.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/legacy/registerLegacyRoutes.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `validateImageUpload(file, limits): ValidatedImage`
- Produces: `ReferenceAssetStore.save/read`
- Produces: `IpProfileStore.create/getActive/lock`
- Produces: `GeneratedAssetStore.save/read`

- [ ] **Step 1: 写图片校验与路径安全失败测试**

覆盖 JPG、PNG、WebP 正确签名；错误扩展名、错误 MIME、伪造签名、超过 10MB、`../` 文件名、超过 4 张和未知 assetId。测试不得创建项目目录外文件，使用 `mkdtemp` 临时目录。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run backend/src/assets/imageValidation.test.ts --config frontend/vitest.config.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现聚焦的资产模块**

目录职责：

```text
data/reference-assets/   普通产品图与图鉴参考图
data/ip-profiles/        固定 IP 标准图与 profile.json
data/generated-assets/   归一化后的模型结果图
```

所有公开 URL 使用高熵 ID；读取时只按元数据映射定位，不使用 `startsWith` 扫描或用户路径拼接。

- [ ] **Step 4: 写 IP Profile 路由失败测试**

Supertest 覆盖：无 Profile 返回 404；创建 draft；未锁定不能用于生成；锁定后 `GET /api/ip-profiles/active` 返回安全字段；锁定后修改返回 409；物理路径不出现在 JSON。

- [ ] **Step 5: 实现路由并挂载**

接口固定为：

```text
POST /api/reference-assets
GET  /api/reference-assets/:assetId
POST /api/ip-profiles
POST /api/ip-profiles/:ipProfileId/lock
GET  /api/ip-profiles/active
GET  /api/generated-assets/:assetId
```

`POST /api/ip-profiles` 使用 multipart：`file`、`name`、`description`。当前只允许一个 Profile；存在 locked Profile 时返回 409。

挂载新资产路由后，从 `registerLegacyRoutes.ts` 删除旧参考图上传/读取处理器，只暂时保留旧 Mock generate，确保没有重复路由。

- [ ] **Step 6: 运行测试**

Run:

```bash
npx vitest run backend/src/assets backend/src/routes/assets.test.ts --config frontend/vitest.config.ts
npm run typecheck
```

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add .gitignore backend/src/app.ts backend/src/legacy/registerLegacyRoutes.ts backend/src/assets backend/src/routes
git commit -m "后端：新增安全资产存储与IP档案"
```

---

### Task 4: Mock、智谱和中转站 Provider

**Files:**
- Create: `backend/src/http/fetchWithTimeout.ts`
- Create: `backend/src/http/safeRemoteImage.ts`
- Create: `backend/src/providers/contracts.ts`
- Create: `backend/src/providers/mockProviders.ts`
- Create: `backend/src/providers/zhipuTextProvider.ts`
- Create: `backend/src/providers/relayVisionProvider.ts`
- Create: `backend/src/providers/relayImageProvider.ts`
- Create: `backend/src/providers/providerFactory.ts`
- Create: `backend/src/providers/providerSmoke.ts`
- Create: `backend/src/providers/providers.test.ts`
- Modify: `backend/src/config/env.ts`

**Interfaces:**
- Produces: `TextProvider.generateJson(request): Promise<unknown>`
- Produces: `VisionProvider.generateJsonFromImages(request): Promise<unknown>`
- Produces: `ImageProvider.generate(request): Promise<GeneratedImage>`
- Produces: `ImageProvider.edit(request): Promise<GeneratedImage>`
- Produces: `createProviders(config): ProviderBundle`

- [ ] **Step 1: 写 Provider 协议测试**

使用 mock fetch 断言智谱请求包含：

```json
{
  "model": "glm-5.3-flash",
  "thinking": {"type": "enabled"},
  "reasoning_effort": "low",
  "stream": false
}
```

断言中转站文生图请求使用 `gpt-image-2`；有参考图时使用 multipart edits，并保持传入数组顺序；支持 `b64_json` 和 HTTPS URL 两种响应。

- [ ] **Step 2: 写安全失败测试**

覆盖：30 秒文本超时、180 秒单次图片超时、429、5xx、非 JSON、空图片、超过 25MB、`http:` URL、localhost、环回/私网解析、超过 3 次重定向。断言面向前端的错误不包含 Key、Authorization、绝对路径或上游响应正文。

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run backend/src/providers/providers.test.ts --config frontend/vitest.config.ts`

Expected: FAIL，Provider 尚不存在。

- [ ] **Step 4: 实现 Provider 和工厂**

`PROVIDER_MODE=mock` 返回确定性 SVG/PNG Mock；`real` 返回智谱与中转站实现。Workflow 只依赖接口，不读取 `process.env`。

图片 Provider 将 URL 或 Base64 统一转成 `{bytes, mediaType}`，再交给 `GeneratedAssetStore`，不把第三方临时 URL直接透传前端。

- [ ] **Step 5: 实现不泄密能力探测脚本**

`providerSmoke.ts` 只输出：模型名、能力名、成功/失败、HTTP 状态和安全错误码。不得输出请求头、环境变量、图片 Base64或完整响应。

脚本顺序：智谱最小 JSON → 中转站视觉 JSON → GPT-Image-2 最小生成 → 两张 1×1 测试图 edits。任一步失败以非零状态退出。

- [ ] **Step 6: 运行 Mock 测试**

Run:

```bash
npx vitest run backend/src/providers/providers.test.ts --config frontend/vitest.config.ts
npm run lint
npm run typecheck
```

Expected: PASS。此时不要运行真实 Smoke，留到 Task 10 在用户已配置 `.env` 的本机执行。

- [ ] **Step 7: 提交**

```bash
git add backend/src/config/env.ts backend/src/http backend/src/providers
git commit -m "模型：接入智谱与中转站Provider"
```

---

### Task 5: 原创 IP 确定性工作流

**Files:**
- Create: `backend/src/workflows/original-ip/schemas.ts`
- Create: `backend/src/workflows/original-ip/promptRenderer.ts`
- Create: `backend/src/workflows/original-ip/workflow.ts`
- Create: `backend/src/workflows/original-ip/workflow.test.ts`
- Create: `backend/src/workflows/original-ip/prompts/brand-dna.md`
- Create: `backend/src/workflows/original-ip/prompts/board-plan.md`
- Create: `backend/src/workflows/original-ip/prompts/copy.md`
- Create: `backend/src/workflows/original-ip/prompts/c0-brand-dna.md`
- Create: `backend/src/workflows/original-ip/prompts/c1-cover.md`
- Create: `backend/src/workflows/original-ip/prompts/c2-identity.md`
- Create: `backend/src/workflows/original-ip/prompts/c3-products.md`
- Create: `backend/src/workflows/original-ip/prompts/c4-scene.md`
- Create: `backend/src/services/collage.ts`
- Modify: `backend/src/workflows/registry.ts`

**Interfaces:**
- Produces: `renderOriginalIpPrompts(dna, plan, ip): [C1,C2,C3,C4]`
- Produces: `createOriginalIpWorkflow(deps): Workflow<OriginalIpRequest,OriginalIpResult>`
- Produces: `createOverviewCollage(images): Promise<Buffer>`

- [ ] **Step 1: 拆分提示词资料**

从 `原创IP.md` 精确提取 Prompt A、Prompt B、C-0、C-1、C-2、C-3、C-4 到对应后端文件；只把文档说明转换成代码元数据，不改写提示词语义。新增 `copy.md`：输入用户产品描述和已校验 `brand_dna`，只输出 `{title,body,tags}` JSON，不引入新事实。

- [ ] **Step 2: 写渲染器失败测试**

断言：四条提示词中的 C-0 字节完全一致；空字段删除整行；无残留 `{{...}}`；参考图编号与传参顺序一致；画幅为 3:4。

- [ ] **Step 3: 写编排失败测试**

用可记录调用的 fake Providers 断言：

```text
Vision A
→ Text B 与 Text Copy 并行
→ Image C1
→ Image C2/C3/C4 并行
→ Collage
```

再覆盖：未锁定 Profile 拒绝；C-1 失败时没有 C-2～C-4；C-3 单页失败返回 `partial` 且保留 C-1/C-2/C-4 和文案；总览拼接失败只加 warning。

- [ ] **Step 4: 运行测试确认失败**

Run: `npx vitest run backend/src/workflows/original-ip --config frontend/vitest.config.ts`

Expected: FAIL，工作流未实现。

- [ ] **Step 5: 实现 Schema、渲染器和编排**

Prompt A 与 B 的 JSON 用 Zod 严格验证。C-1 参考图数组固定 `[ipImage, productImage]`；后三张固定 `[ipImage, productImage, c1Image]`。图片调用使用 `Promise.allSettled`，但只在 C-1 成功后启动后三张。

- [ ] **Step 6: 实现 Sharp 总览图**

将四张图等比缩放到统一单元格，白色间距，2×2 排列；不得绘制标题、文字或水印。总览页角色为 `overview`，不计入四张正式交付图。

- [ ] **Step 7: 运行测试**

Run:

```bash
npx vitest run backend/src/workflows/original-ip --config frontend/vitest.config.ts
npm run typecheck
```

Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add backend/src/workflows/original-ip backend/src/workflows/registry.ts backend/src/services/collage.ts
git commit -m "功能：完成原创IP商品化工作流"
```

---

### Task 6: 小红书图鉴确定性工作流

**Files:**
- Create: `backend/src/workflows/xhs-atlas/normalizeTopic.ts`
- Create: `backend/src/workflows/xhs-atlas/pagination.ts`
- Create: `backend/src/workflows/xhs-atlas/schemas.ts`
- Create: `backend/src/workflows/xhs-atlas/promptRenderer.ts`
- Create: `backend/src/workflows/xhs-atlas/workflow.ts`
- Create: `backend/src/workflows/xhs-atlas/workflow.test.ts`
- Create: `backend/src/workflows/xhs-atlas/prompts/list-json.md`
- Create: `backend/src/workflows/xhs-atlas/prompts/xhs-copy.md`
- Create: `backend/src/workflows/xhs-atlas/prompts/cover.md`
- Create: `backend/src/workflows/xhs-atlas/prompts/content.md`
- Modify: `backend/src/workflows/registry.ts`

**Interfaces:**
- Produces: `normalizeTopic(topic): {topic,count,measureWord,warnings}`
- Produces: `paginateItems(items, perPage=6): AtlasPagePlan[]`
- Produces: `renderAtlasCoverPrompt(list, layout): string`
- Produces: `renderAtlasContentPrompt(list, page): string`
- Produces: `createXhsAtlasWorkflow(deps): Workflow<XhsAtlasRequest,XhsAtlasResult>`

- [ ] **Step 1: 原样保存五文件提示词**

将四份具体提示词复制到对应 `prompts/` 文件；`README-工作流与脚本规范.md` 的确定性规则实现为 TypeScript，不放进模型提示词。

- [ ] **Step 2: 写规范化和分页失败测试**

使用表格测试：

```ts
expect(paginateItems(makeItems(7))).toEqual([expect.arrayContaining([expect.anything()]), expect.any(Array)]);
expect(paginateItems(makeItems(7)).map(page=>page.items.length)).toEqual([4,3]);
expect(paginateItems(makeItems(13)).map(page=>page.items.length)).toEqual([5,4,4]);
expect(paginateItems(makeItems(36)).map(page=>page.items.length)).toEqual([6,6,6,6,6,6]);
```

覆盖 N=2、6、7、12、13、36；无数字和 N<2 抛业务错误；48 钳制为 36、改写标题数字并产生 warning。

- [ ] **Step 3: 写清单校验和重试测试**

断言 `items.length === N`、必填字段非空、`name` 不重复、`page_slogans` 恰好 6 条。第一次无效时只重试一次；第二次无效后停止，且没有图片调用。

- [ ] **Step 4: 写并行编排和参考图边界测试**

清单成功后，文案、封面和所有正文页并行。断言参考图只出现在 `ImageProvider` 请求，`TextProvider` 请求不包含图片 URL、assetId 或 Blob。个别页面失败返回 `partial`，封面仍排第一。

- [ ] **Step 5: 运行测试确认失败并实现**

Run: `npx vitest run backend/src/workflows/xhs-atlas --config frontend/vitest.config.ts`

Expected before implementation: FAIL。实现后再次运行，Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add backend/src/workflows/xhs-atlas backend/src/workflows/registry.ts
git commit -m "功能：完成小红书图鉴工作流"
```

---

### Task 7: 生成路由与两套前端创建流程

**Files:**
- Create: `backend/src/routes/generate.ts`
- Create: `backend/src/routes/generate.test.ts`
- Modify: `backend/src/app.ts`
- Delete: `backend/src/legacy/registerLegacyRoutes.ts`
- Modify: `shared/types.ts`
- Modify: `shared/types.test.ts`
- Modify: `frontend/src/config/templates.ts`
- Modify: `frontend/src/features/generation/api.ts`
- Modify: `frontend/src/features/generation/api.test.ts`
- Create: `frontend/src/features/create/WorkflowCreateRouter.tsx`
- Create: `frontend/src/features/create/original-ip/OriginalIpCreateForm.tsx`
- Create: `frontend/src/features/create/original-ip/IpProfileSetup.tsx`
- Create: `frontend/src/features/create/xhs-atlas/XhsAtlasCreateForm.tsx`
- Create: `frontend/src/features/create/workflowForms.test.tsx`
- Modify: `frontend/src/pages/CreatePage.tsx`
- Modify: `frontend/src/styles/create.css`
- Delete: `frontend/src/features/create/CreateForm.tsx`

**Interfaces:**
- Produces: `POST /api/generate` consuming `GenerateRequest`
- Produces: `getActiveIpProfile/createIpProfile/lockIpProfile`
- Produces: `generateAssets(request, signal): Promise<GenerateResult>`

- [ ] **Step 1: 写生成路由测试**

Supertest 覆盖：两个合法请求精确分派；未知 workflow、额外敏感字段、无锁定 IP、无数字选题返回安全 4xx；上游错误返回 `{error,code}` 且没有堆栈和物理路径。

- [ ] **Step 2: 实现路由并将总体同步超时设为 10 分钟**

前端上传请求保持 30 秒超时，生成请求使用独立 `GENERATE_REQUEST_TIMEOUT_MS = 600_000`。Abort 必须同时终止当前 fetch，重复点击期间按钮 disabled。

新 `/api/generate` 路由通过测试后删除 `registerLegacyRoutes.ts`，并从 `app.ts` 移除 legacy 挂载；Task 7 提交不得同时暴露旧通用生成合同。

- [ ] **Step 3: 写模板注册失败测试**

断言模板中心数据严格为：

```ts
expect(TEMPLATE_CONFIGS.map(({id,name})=>({id,name}))).toEqual([
  {id:'original-ip',name:'原创 IP 商品化'},
  {id:'xhs-atlas',name:'小红书图鉴创作'},
]);
```

模板预览使用 CSS 视觉变体或新资源，不复用旧四模板预览文件。

在同一步把 `shared/types.ts` 的旧模板 ID、旧通用请求、旧响应和旧 `validateRequest` 删除，改为重新导出 `shared/workflows.ts` 的稳定合同与仍需共用的 `ReferenceAsset`。更新 `shared/types.test.ts`，断言旧四 ID 不再属于公开类型。

- [ ] **Step 4: 写原创 IP 表单测试**

覆盖：无 Profile 时显示初始化；图片、名称、描述必填；锁定后显示只读 Profile；日常生成只允许一张产品图；阶段文案按分析、规划、首图、后三图、保存变化；连续双击只触发一次请求。

- [ ] **Step 5: 写图鉴表单测试**

覆盖：无数字阻止提交；选题可输入 2～36；0～4 张参考图可选；第五张被拒绝；提交 payload 只包含 `workflowId/topic/referenceAssetIds`；参考图上传失败保留本地选择供重试。

- [ ] **Step 6: 实现 API 守卫和专属表单**

API 运行时守卫按 `workflowId` 校验专属 copy、pages 和 artifacts。`CreatePage` 只负责模板外壳、面包屑和 `WorkflowCreateRouter`，不得持有两套表单字段状态。

- [ ] **Step 7: 运行测试**

Run:

```bash
npx vitest run backend/src/routes/generate.test.ts frontend/src/features/generation/api.test.ts frontend/src/features/create/workflowForms.test.tsx --config frontend/vitest.config.ts
npm run lint
npm run typecheck
```

Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add shared/types.ts shared/types.test.ts backend/src/app.ts backend/src/legacy/registerLegacyRoutes.ts backend/src/routes/generate.ts backend/src/routes/generate.test.ts frontend/src/config/templates.ts frontend/src/features/generation frontend/src/features/create frontend/src/pages/CreatePage.tsx frontend/src/styles/create.css
git commit -m "前端：接入两套专属创建流程"
```

---

### Task 8: 专属结果、下载与 IndexedDB v2

**Files:**
- Modify: `frontend/src/features/results/ResultDetail.tsx`
- Create: `frontend/src/features/results/OriginalIpResult.tsx`
- Create: `frontend/src/features/results/XhsAtlasResult.tsx`
- Create: `frontend/src/features/results/workflowResults.test.tsx`
- Modify: `frontend/src/features/generation/downloads.ts`
- Modify: `frontend/src/features/generation/downloads.test.ts`
- Modify: `frontend/src/features/history/historyTypes.ts`
- Modify: `frontend/src/features/history/historyRepository.ts`
- Modify: `frontend/src/features/history/historyRepository.test.ts`
- Modify: `frontend/src/features/history/resultMaterializer.ts`
- Modify: `frontend/src/pages/ResultPage.tsx`
- Modify: `frontend/src/pages/HistoryPage.tsx`
- Modify: `frontend/src/pages/HistoryDetailPage.tsx`
- Modify: `frontend/src/test/fixtures.ts`
- Modify: `frontend/src/styles/results.css`
- Modify: `frontend/src/styles/history.css`

**Interfaces:**
- Produces: `HistoryRecord = OriginalIpHistoryRecord | XhsAtlasHistoryRecord`
- Produces: IndexedDB schema version 2
- Produces: `buildPackage(result): Promise<Blob>` with workflow-specific JSON/text files

- [ ] **Step 1: 写结果组件测试**

原创 IP：4 张正式图、可选总览、单标题/正文/标签、partial warning。图鉴：封面优先、动态正文页、3 个候选标题、正文、标签、清单 JSON。失败页显示错误但不影响成功页下载。

- [ ] **Step 2: 写下载测试**

原创 IP zip 必含 `文案.txt`、4 张成功图及存在时的 `总览图`。图鉴 zip 必含 `发布文案.txt`、`清单.json`、封面和成功正文页。继续执行单图 25MB、总包 200MB、最多 100 页限制和安全文件名去重。

- [ ] **Step 3: 写 IndexedDB v1→v2 一次性迁移测试**

先创建 version 1 数据库并写入旧记录，再打开 v2：记录应为空。关闭并重新打开 v2、写入新记录、再次打开：新记录仍存在，证明不会每次清空。

- [ ] **Step 4: 更新联合历史结构**

原创 IP 记录保存产品图 Blob、`ipProfileId`、版本快照和完整结果；图鉴保存 topic、0～4 张参考图 Blob、清单和完整结果。20 条限制、配额删除最旧后重试、单条删除和清空继续保留。

- [ ] **Step 5: 更新重新生成行为**

原创 IP 历史跳回表单时恢复产品描述并自动读取锁定 IP，产品图使用本地 Blob 重新上传；图鉴恢复 topic 和本地参考图。不得提示用户重新上传固定 IP。

- [ ] **Step 6: 运行测试**

Run:

```bash
npx vitest run frontend/src/features/results frontend/src/features/generation/downloads.test.ts frontend/src/features/history/historyRepository.test.ts --config frontend/vitest.config.ts
npm run typecheck
```

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/features/results frontend/src/features/generation/downloads.ts frontend/src/features/generation/downloads.test.ts frontend/src/features/history frontend/src/pages/ResultPage.tsx frontend/src/pages/HistoryPage.tsx frontend/src/pages/HistoryDetailPage.tsx frontend/src/test/fixtures.ts frontend/src/styles/results.css frontend/src/styles/history.css
git commit -m "功能：完成双工作流结果下载与新历史"
```

---

### Task 9: 删除旧模板与旧参考图

**Files:**
- Modify: `frontend/src/app/AppShell.test.tsx`
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/features/templates/TemplateCard.tsx`
- Delete: `frontend/public/template-previews/ip-poster.webp`
- Delete: `frontend/public/template-previews/travel-guide.webp`
- Delete: `frontend/public/template-previews/scenery-visual.webp`
- Delete: `frontend/public/template-previews/people-checkin.webp`
- Delete: all remaining source/tests used only by the old generic template contract

**Interfaces:**
- Consumes: Task 7/8 的新模板与历史实现
- Produces: 项目中无旧模板 ID、旧提示语和旧资源

- [ ] **Step 1: 搜索并列出旧引用**

Run:

```bash
rg -n "ip-image|travel-cards|scenery-collage|people-collage|IP 宣传海报|攻略种草卡|景区氛围大片|人物打卡大片" shared backend frontend
```

Expected: 输出全部待清理位置。逐一确认是否属于旧合同，不做无关重构。

- [ ] **Step 2: 删除旧导出、测试夹具和预览资源**

完成后再次运行同一 `rg`，Expected: 0 条匹配。旧 URL `/templates/ip-image/create` 等必须进入 NotFound，而不是回退通用表单。

- [ ] **Step 3: 只读清点旧后端参考图**

Run:

```bash
find '/Users/azu/Documents/guikesong/data/reference-assets' -mindepth 1 -maxdepth 1 -type f ! -name '.gitkeep' -print
find '/Users/azu/Documents/guikesong/data/reference-assets' -mindepth 1 -maxdepth 1 -type f ! -name '.gitkeep' | wc -l
```

Expected: 明确打印目标文件和数量；不得把目标扩大到 `data/` 或项目根目录。

- [ ] **Step 4: 执行已获用户授权的旧参考图删除**

Run only after validating the exact directory above:

```bash
find '/Users/azu/Documents/guikesong/data/reference-assets' -mindepth 1 -maxdepth 1 -type f ! -name '.gitkeep' -delete
```

Expected: 再次计数为 0；保留 `data/reference-assets/.gitkeep`。这些文件不可从应用恢复，提交前向用户简短说明实际删除数量。

- [ ] **Step 5: 运行全套静态与单元检查**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: 全部 PASS。

- [ ] **Step 6: 提交代码清理**

```bash
git add frontend/src frontend/public/template-previews backend/src
git commit -m "清理：移除旧模板与兼容代码"
```

运行时参考图受 `.gitignore` 管理，不应出现在提交中。

---

### Task 10: 同步文档、真实 Provider 与浏览器验收

**Files:**
- Modify: `README.md`
- Modify: `guikesong介绍.md`
- Modify: `tasks/prd-文旅营销素材生成.md`
- Create: `tasks/acceptance-双工作流.md`
- Modify: `.env.example` only if implementation variable names changed

**Interfaces:**
- Produces: 与实现一致的运行、安全、限制和验收说明

- [ ] **Step 1: 合并而不是覆盖现有文档修改**

先运行：

```bash
git diff -- guikesong介绍.md tasks/prd-文旅营销素材生成.md
```

将现有用户修改与最终实现逐项对齐：只保留两个模板；说明 IP Profile、图鉴 2～36、可选参考图只影响视觉、真实 Provider、第三方中转隐私、旧数据已清理。更新 PRD 阶段勾选状态。

- [ ] **Step 2: 运行不泄密真实 Provider 探测**

保持 `.env` 不进入任何命令输出，执行：

```bash
PROVIDER_MODE=real npm run smoke:providers
```

Expected: 四项能力均 PASS。若视觉 JSON 或多参考图 edits 失败，停止真实联调，在验收文档记录安全错误码与缺失能力；不得改模型或降级。

- [ ] **Step 3: 启动服务并做 API 冒烟**

Run: `npm run dev`

验证：

```text
GET  http://localhost:8787/api/health
GET  http://localhost:5173/templates
POST http://localhost:8787/api/ip-profiles
POST http://localhost:8787/api/generate
```

使用最小合法测试图片和最短合法输入；不把上传文件、响应图片或 Key 提交到仓库。

- [ ] **Step 4: 浏览器桌面验收**

在 1440×900 验证：模板中心只有两个入口；原创 IP 初始化与生成；图鉴无参考图/有参考图；进度、防重复点击、partial、复制、单图与 zip 下载、历史查看/重新打开/删除/清空。

- [ ] **Step 5: 浏览器手机验收**

在 390×844 验证相同主流程，重点检查表单溢出、长标题、动态 6 页、预览对话框、下载按钮和错误提示。

- [ ] **Step 6: 最终自动检查**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
git status --short
git diff --check
```

Expected: lint/typecheck/test/build 全部 PASS；Git 中没有 `.env`、上传图、生成图、`node_modules`、`dist`、临时文件。

- [ ] **Step 7: 写验收记录并提交文档**

`tasks/acceptance-双工作流.md` 记录命令、退出码、Mock/真实 Smoke 结果、桌面/手机路线、已知中转限制、实际删除旧参考图数量和验收 URL。

```bash
git add README.md guikesong介绍.md tasks/prd-文旅营销素材生成.md tasks/acceptance-双工作流.md .env.example
git commit -m "文档：同步双工作流交付与验收结果"
```

---

## Final Handoff Checklist

- [ ] `git log --oneline` 中每个任务均为完整中文提交。
- [ ] `git status --short` 只显示用户明确保留且未要求提交的文件，或为空。
- [ ] 报告所有提交编号，不只报告最后一个。
- [ ] 报告 lint、typecheck、test、build 和 API Smoke 的准确结果。
- [ ] 报告真实 Provider 的四项能力验证结果，不展示 Key。
- [ ] 报告实际删除的旧参考图数量及不可恢复性。
- [ ] 提供 `http://localhost:5173/templates`、两个创建页和历史页的验收位置。
- [ ] 将最终结果发回负责审核的讨论会话，由讨论会话按设计文档逐项验收。
