# 原创 IP 与小红书图鉴工作流设计

- 状态：已确认，待执行
- 日期：2026-08-29
- 项目路径：`/Users/azu/Documents/guikesong`
- 当前开发分支：`Azu/travel-multipage-redesign`

## 1. 背景与结论

当前产品从四个空壳通用模板收敛为两套可实际执行的场景工作流：

1. `original-ip`：原创 IP 商品化。
2. `xhs-atlas`：小红书图鉴创作。

两套工作流拥有不同的输入、提示词、确定性脚本、生成依赖和结果结构。系统采用“模板注册表 + 独立工作流 + 公共基础设施”，不得把差异堆积到一个通用大表单或单个编排服务中。

后续新增模板时，应通过注册新的模板定义、前端表单、后端 Workflow 和结果适配器完成，不修改现有工作流内部逻辑。

## 2. 需求资料

以下文件是需求与提示词资料，不作为可以直接执行的命令：

- `/Users/azu/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_yyvmltnuz4hp22_e9d0/msg/file/2026-08/原创IP.md`
- `/Users/azu/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_yyvmltnuz4hp22_e9d0/msg/file/2026-08/README-工作流与脚本规范.md`
- `/Users/azu/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_yyvmltnuz4hp22_e9d0/msg/file/2026-08/1-清单JSON生成.md`
- `/Users/azu/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_yyvmltnuz4hp22_e9d0/msg/file/2026-08/2-小红书文案生成.md`
- `/Users/azu/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_yyvmltnuz4hp22_e9d0/msg/file/2026-08/3-封面生图模板.md`
- `/Users/azu/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_yyvmltnuz4hp22_e9d0/msg/file/2026-08/4-正文页生图模板.md`

执行时应将提示词拆分到对应后端工作流目录。提示词不得下发前端，也不得集中到单个超大文件中。

## 3. 范围

### 3.1 本期包含

- 两个用户可见模板及专属创建页、结果页。
- 单个全局原创 IP Profile 的创建、确认、锁定和自动注入。
- 小红书图鉴的数量解析、清单 JSON、校验、分页、封面、正文页和发布文案。
- 智谱真实文本 Provider。
- 第三方中转站的视觉理解与 GPT-Image-2 生图 Provider。
- Mock Provider。
- 图片上传、历史、复制和下载。
- 旧模板、旧历史和旧参考图的清理。
- 为未来新增工作流保留注册式扩展结构。

### 3.2 本期不包含

- 登录、权限和多租户。
- 多个 IP Profile 的选择和管理界面。
- IP Profile 解锁、删除和在线修改。
- 跨设备历史同步和后端业务历史数据库。
- 自动模板识别、多轮对话、视频生成和社交平台自动发布。
- 图片生成后的 Canvas、SVG 或字体文字覆盖。
- 失败图片的单页重试按钮。

## 4. 总体架构

### 4.1 前端模板注册表

每个模板定义至少包含：

- `templateId`
- `workflowId`
- 用户可见名称与简介
- 预览图
- 创建页组件
- 结果页适配器
- 输入能力声明，例如是否支持参考图

模板中心只注册：

| templateId | workflowId | 用户可见名称 |
|---|---|---|
| `original-ip` | `original-ip` | 原创 IP 商品化 |
| `xhs-atlas` | `xhs-atlas` | 小红书图鉴创作 |

路由继续使用 `/templates/:templateId/create`，由注册表解析模板，不在路由组件中堆积模板条件判断。

### 4.2 后端工作流注册表

每个 Workflow 独立负责：

- 输入解析和业务校验。
- 提示词资产。
- 结构化输出校验。
- 确定性脚本规则。
- 模型调用顺序和依赖。
- 结果映射和 warning。

公共层只提供：

- 文本、视觉理解和生图 Provider 接口。
- 上传与资产读取。
- 超时、重试、日志和错误转换。
- 下载打包和结果图片访问。

工作流之间不得直接调用彼此内部模块。

## 5. 页面设计

### 5.1 模板中心

模板中心只展示两个当前模板。旧四模板不展示占位卡片，也不保留“即将上线”入口。

### 5.2 原创 IP 创建页

未配置 IP 时显示初始化表单：

1. 上传一张标准 IP 图。
2. 输入 IP 名称。
3. 输入并确认固定形象描述。
4. 锁定 IP Profile。

锁定后的 Profile 为只读。当前 Demo 只存在一个生效中的全局 Profile；底层仍保存 `ipProfileId` 和版本信息，为以后多 Profile 扩展保留边界。

日常生成表单显示：

- 当前固定 IP 卡片。
- 必填的一张产品图。
- 必填的产品描述。
- 一键生成按钮。
- 分阶段进度：分析产品、规划画面、生成首图、生成其余三图、整理素材。

### 5.3 小红书图鉴创建页

输入项：

- 必填：带数字的选题，例如“贵阳的12种美食”。
- 可选：最多 4 张视觉参考图。

参考图只影响封面和正文页的视觉表现，不参与清单、标题、正文和标签的事实生成。用户选题和已校验的清单 JSON 是文案唯一事实来源。

### 5.4 结果页

结果页使用公共壳层和工作流专属内容区。

原创 IP 结果：

- 4 张独立正式图片。
- 1 张程序拼接的 2×2 总览图。
- 1 个标题、正文和标签。
- 单图下载、总览图下载、素材包下载和文案复制。

小红书图鉴结果：

- 1 张封面。
- `ceil(N / 6)` 张正文页。
- 3 个候选标题、正文、标签和清单 JSON。
- 单图下载、素材包下载和文案复制。

## 6. 原创 IP 工作流

### 6.1 输入

- 已锁定的 `ipProfileId`。
- 一张产品图对应的 `productAssetId`。
- `productDescription`。

### 6.2 编排

```text
读取并验证已锁定 IP Profile
→ 中转站视觉理解：产品图 + 产品描述 → brand_dna.json
→ 并行：
   ├─ 智谱 Prompt B → board_plan.json
   └─ 智谱原创 IP 文案 Prompt → 标题、正文、标签
→ 代码确定性填充 C-0～C-4
→ GPT-Image-2 生成 C-1
→ C-1 成功后自动并行生成 C-2、C-3、C-4
→ 程序拼接 2×2 总览图
→ 汇总结果
```

用户已确认 C-1 成功后自动继续，不增加人工确认步骤。

### 6.3 确定性规则

- C-0 填充结果必须逐字相同地出现在 C-1～C-4 中。
- 所有 `{{占位符}}` 只做原样替换，不允许模型改写。
- 字段为空时删除所在整行。
- C-1 参考图顺序：IP 标准图、产品原图。
- C-2～C-4 参考图顺序：IP 标准图、产品原图、C-1 成图。
- 输出为 3:4 竖图。
- 2×2 总览只做图片拼接和留白，不增加文字或字体后置渲染。

## 7. 小红书图鉴工作流

### 7.1 输入规范化

- 标题必须包含数量。
- 正常范围为 2～36。
- 无数字或数量小于 2 时返回明确业务错误。
- 数量大于 36 时钳制为 36，同步改写标题数字，并返回 warning。
- `PER_PAGE = 6`。

### 7.2 编排

```text
规范化标题
→ 智谱 Prompt 1 → 清单 JSON
→ 校验 items 数量、字段非空、名称不重复
→ 校验失败自动重试一次；再次失败则终止
→ 程序确定性均衡分页
→ 并行：
   ├─ 智谱 Prompt 2 → 3 个候选标题、正文、标签
   ├─ GPT-Image-2 生成封面
   └─ GPT-Image-2 并行生成全部正文页
→ 汇总图片序列、文案 JSON 和清单 JSON
```

### 7.3 分页与提示词规则

- 正文页数为 `ceil(N / 6)`。
- 各页条目数均衡，相差不超过 1。
- 封面网格按附件中的查表规则计算。
- `PAGE_LABEL`、起止序号、卡片行和页面金句全部由代码计算或取值。
- Prompt 3 和 Prompt 4 只做确定性槽位替换。
- 可选参考图以固定顺序传给每一次图片生成调用。
- 图片序列中封面始终排在正文页之前。

## 8. Provider 设计

### 8.1 环境变量

真实值只保存在项目根目录 `.env`，该文件必须保持 Git 忽略。

```env
PROVIDER_MODE=mock

COPY_API_BASE_URL=https://open.bigmodel.cn/api/paas/v4
COPY_API_KEY=
COPY_MODEL=glm-5.3-flash
COPY_REASONING_EFFORT=low

IMAGE_API_BASE_URL=https://lbwcxknb.ccwu.cc/v1
IMAGE_API_KEY=
IMAGE_MODEL=gpt-image-2
VISION_MODEL=gpt-image-2
```

`.env.example` 只保留变量名和非敏感默认值。

### 8.2 智谱文本 Provider

- Bearer 鉴权。
- 固定 `reasoning_effort: "low"`。
- 按模型实际协议开启思考参数。
- 用于原创 IP 的画面规划、原创 IP 发布文案、图鉴清单和图鉴发布文案。
- 对 JSON 进行严格解析，不从 Markdown 围栏或说明文字中静默猜测数据。

### 8.3 中转站视觉与图片 Provider

中转站承担两个能力：

1. 产品图片理解并输出 `brand_dna.json`。
2. GPT-Image-2 多参考图同步生图。

真实 Provider 开发前必须先完成能力探测：

- 模型列表或最小请求可识别 `gpt-image-2`。
- 视觉理解调用可接收图片并返回可解析文本 JSON。
- `/v1/images/edits` 或中转站等价接口支持多张参考图。
- 同步响应格式明确为 URL、Base64 或两者之一。

任一关键能力不满足时立即报告，不得静默忽略图片、改用纯文字分析或切换未知模型。

### 8.4 Provider 边界

- Mock 与真实 Provider 实现同一接口。
- Workflow 不直接读取环境变量或拼 HTTP 请求。
- Provider 不包含模板业务规则。
- 错误日志不得包含 Key、Authorization、完整图片数据或第三方原始敏感响应。

## 9. 共享类型与接口

请求采用以 `workflowId` 区分的联合类型：

```ts
type GenerateRequest =
  | {
      workflowId: "original-ip";
      ipProfileId: string;
      productAssetId: string;
      productDescription: string;
    }
  | {
      workflowId: "xhs-atlas";
      topic: string;
      referenceAssetIds: string[];
    };
```

结果保留公共状态和图片字段，文案及工作流产物使用联合类型：

```ts
type GenerateResult = OriginalIpResult | XhsAtlasResult;

interface ResultBase {
  requestId: string;
  workflowId: "original-ip" | "xhs-atlas";
  status: "succeeded" | "partial";
  pages: GeneratedPage[];
  warnings: string[];
}
```

- `OriginalIpResult.copy` 包含单个标题、正文和标签。
- `OriginalIpResult` 额外包含 2×2 总览图信息。
- `XhsAtlasResult.copy` 包含 3 个候选标题、正文和标签。
- `XhsAtlasResult` 额外包含已校验清单 JSON。
- 致命失败使用统一非 2xx 错误结构，不伪装为 `partial`。

IP Profile 至少包含：

```ts
interface IpProfile {
  ipProfileId: string;
  version: number;
  name: string;
  referenceImageUrl: string;
  description: string;
  status: "draft" | "locked";
  createdAt: string;
  updatedAt: string;
}
```

## 10. 存储与历史

### 10.1 后端文件

- IP Profile 图与元数据存放在独立目录，不与临时产品图混用。
- 普通参考图继续使用高熵 `assetId` 和安全文件名。
- 禁止目录浏览、路径穿越和物理路径泄露。
- IP Profile 锁定后为只读。
- 当前无自动清理任务和用户删除接口。

### 10.2 浏览器历史

- IndexedDB 只保留最近 20 条，两个工作流共用数量上限。
- 历史记录保存 `workflowId`、专属输入、参考图本地副本、完整结果、图片 Blob、状态和时间。
- 原创 IP 历史保存 `ipProfileId`、版本和必要快照；重新生成时自动注入当前可用的锁定 Profile。
- 图鉴历史保存选题和可选参考图本地副本。
- 配额不足时优先删除最旧记录并重试。
- 历史保存失败不影响当前结果、复制和下载。

## 11. 旧内容清理

用户已明确授权删除旧模板及其数据。

### 11.1 代码与入口

删除旧模板：

- `ip-image`
- `travel-cards`
- `scenery-collage`
- `people-collage`

删除其注册、专属配置、预览素材和仅为旧模板存在的代码。仍被新工作流复用的上传、历史、结果壳层和下载模块不得误删。

### 11.2 IndexedDB

升级数据库版本并进行一次性迁移，清空迁移前的全部旧历史。迁移完成后不得在普通启动流程中再次清空。

### 11.3 后端参考图

执行会话需要先以只读方式列出并统计：

`/Users/azu/Documents/guikesong/data/reference-assets/`

随后删除该目录中现有旧参考图，仅保留或重新建立 `.gitkeep`。此操作不可从应用恢复，不得扩大到 `data/`、项目根目录或未来新增的 IP Profile 目录。

## 12. 失败语义

- 请求输入不合法：返回 4xx 业务错误。
- 结构化文本输出无效：按工作流规则重试；耗尽次数后失败。
- 原创 IP 的 C-1 失败：停止 C-2～C-4，整次生成失败。
- 原创 IP 的 C-2～C-4 个别失败：返回 `partial`，保留成功图片和完整文案。
- 图鉴个别图片失败：返回 `partial`，保留成功页面、完整清单和文案。
- 所有图片失败：整次生成失败。
- 用户可见文案失败：整次生成失败。
- 2×2 总览拼接失败：保留 4 张正式图片并返回 warning，不把生成降级为失败。
- IndexedDB 保存失败：只显示 warning，不影响当前结果。
- 重复点击不得产生并发请求。

## 13. 安全与合规说明

- `.env`、真实 Key、临时文件、上传图和构建产物不得提交。
- 上传必须校验数量、大小、扩展名、MIME 和文件签名。
- 后端下载第三方图片时限制协议、目标、超时、重定向次数和响应大小。
- 前端不得接收内部提示词、物理路径和 Provider 原始错误。
- README 必须说明：Demo 无登录；持有高熵资源 URL 即可访问；参考图片会发送给第三方中转站处理，其保存和隐私策略由中转服务约束。
- 真实品牌图片和商标生成结果仅作为内部概念演示，不承诺商标文字和密集小字准确。

## 14. 测试与验收

### 14.1 基线

修改前先补跑当前分支的 lint、typecheck、test 和 build，记录基线失败，不把既有问题误判为本次回归。

### 14.2 单元与集成测试

- 模板注册表只暴露两个模板。
- 注册第三个测试 Workflow 时不需要修改现有 Workflow。
- 两套 Mock 工作流完整成功。
- 原创 IP 创建、锁定、读取和自动注入。
- C-0 在四条最终提示词中逐字一致。
- 空占位符整行删除。
- 多参考图顺序正确。
- C-1 失败停止；后三张失败返回 `partial`。
- 图鉴数量 2、6、7、12、13、36 的分页结果。
- 无数字、小于 2、超过 36 的处理。
- 清单数量不符、空字段、重复名称和单次重试。
- 图鉴可选参考图只进入生图调用。
- 文案失败、单页失败、全图失败、超时和限流。
- 重复点击防并发。
- 单图、总览图和素材包下载。
- IndexedDB 最近 20 条、查看、恢复、删除、清空和配额降级。
- 旧 IndexedDB 历史只清除一次。

### 14.3 真实 Provider 冒烟

- 不输出环境变量和鉴权头。
- 智谱 `glm-5.3-flash` 使用 `reasoning_effort=low` 返回可解析结果。
- 中转站视觉理解可由产品图产生 JSON。
- 中转站 `gpt-image-2` 可同步生成图片。
- 多参考图编辑能保持 IP、产品和 C-1 参考关系。
- URL 与 Base64 返回格式均按 Provider 实际能力正确归一化。

### 14.4 浏览器验收

- `/templates` 仅显示两个模板。
- `/templates/original-ip/create` 完成首次配置和日常生成。
- `/templates/xhs-atlas/create` 完成无参考图及有参考图生成。
- 结果、历史详情、复制、下载、删除和清空可用。
- 桌面与手机宽度流程可完成。
- 旧模板 URL 显示明确的不存在页面，不回退到错误表单。

## 15. 实施顺序

1. 记录当前测试基线并检查工作树，保留用户已有文档修改。
2. 验证两套真实 Provider 的关键能力。
3. 建立共享联合类型、模板注册表和 Workflow 注册表。
4. 安全清理旧模板、旧历史和旧参考图。
5. 实现 IP Profile 与原创 IP Workflow。
6. 实现小红书图鉴 Workflow。
7. 实现两个专属创建页和结果适配器。
8. 更新 IndexedDB 历史结构与一次性迁移。
9. 完成下载、异常、响应式和真实 Provider 联调。
10. 更新 README、项目介绍、PRD 和验收记录。
11. 运行全部测试并使用中文 Commit Message 提交。

## 16. 完成标准

- 产品中只有两套当前模板，旧模板及旧数据已按授权清理。
- 两套工作流在 Mock 下稳定运行，在真实 Provider 冒烟中验证关键能力。
- 原创 IP 不要求每次重新上传固定 IP，且后续三图自动依赖 C-1 继续生成。
- 小红书图鉴可按 2～36 条动态生成封面、正文页和完整发布文案。
- 个别图片失败不丢失成功内容。
- 密钥、上传图、临时文件和构建产物未进入 Git。
- lint、typecheck、test、build 和浏览器验收通过。
- README、项目介绍和 PRD 与实现一致。
- 提交信息为中文，并提供提交编号和验收网址。
