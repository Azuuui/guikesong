# 四工作流验收记录

- 日期：2026-08-30
- 分支：Azu/travel-multipage-redesign
- 验收范围：`travel-guide` 目的地手绘攻略与 `ugc-photo-campaign` 照片心情图集两套新工作流交付，及公共 `SearchProvider` 能力
- 提交：1e0b3df（工作流：新增手绘攻略与照片心情图集端到端实现，51 文件）

## 一、自动化检查

| 命令 | 结果 | 说明 |
|---|---|---|
| `npm run lint` | PASS（退出码 0） | eslint 覆盖 shared/backend/frontend |
| `npm run typecheck` | PASS（退出码 0） | tsc --noEmit |
| `npm test` | PASS（28 个文件 376 个用例） | 新增 travel-guide / ugc-photo-campaign 工作流单测、表单、结果面板、下载与历史恢复测试 |
| `npm run build` | PASS | 产物 dist/（JS 621.03 kB gzip 188.59 kB，chunk 体积警告为已知项） |

## 二、真实 Provider 冒烟（PROVIDER_MODE=real）

命令：`PROVIDER_MODE=real npm run smoke:providers`

| 探测项 | 模型 | 结果 |
|---|---|---|
| 智谱最小 JSON | glm-5.3-flash | PASS |
| 智谱 web 搜索 | search_pro | PASS |
| 中转站视觉 JSON | gpt-5.5 | PASS |
| gpt-image-2 最小生成 | gpt-image-2 | PASS |
| gpt-image-2 双图 edits | gpt-image-2 | PASS |

结论：五个能力探测全部通过，含本次新增的智谱 web 搜索链路。真实模式下提示词与图片经第三方中转处理，中转方可见内容，禁止提交敏感素材；密钥仅存于服务端内存与 `.env`（已 gitignore）。

## 三、Mock API 冒烟（后端 8787 mock 模式）

| 请求 | 结果 |
|---|---|
| `POST /api/generate`（travel-guide，destination=成都） | succeeded：封面 + 2 张路线页 + 交通/住宿/美食页共 6 页全部成功 |
| `POST /api/generate`（travel-guide，destination=杭州西湖） | succeeded：6 页全部成功；返回 `days: 2`、行程 JSON 完整；产生 warning「模型输出的目的地与输入不一致，已按输入渲染」验证按输入渲染降级 |
| `POST /api/reference-assets`（3 张 1×1 PNG） | 201，返回 3 个 assetId |
| `POST /api/generate`（ugc-photo-campaign，3 张照片 + 投稿昵称） | succeeded：3 张海报全部成功，`mood: 安静`，credits 按位对齐（阿紫/小蓝/空），3 个候选标题与正文标签完整 |
| `POST /api/generate`（ugc-photo-campaign，仅 1 张照片） | 正确拒绝：`DESCRIPTIONS_INVALID`「照片描述数量与照片数量不一致（3/1）」；Mock fixture 预置 3 张照片场景，Mock 端到端演示需上传 3 张投稿照片 |
| `GET /api/generated-assets/:filename` | 200，`image/png`，字节完整 |

测试图使用 1×1 PNG（69 字节）临时文件，存放于 /tmp，未提交仓库。冒烟后 `backend/data/` 运行时产物已加入 .gitignore，未提交。

## 四、浏览器验收

### 已由自动化测试覆盖的浏览器行为

- 模板轨道按顺序展示四个模板并支持切换保留输入（`DashboardPage.test.tsx`、`HomeTemplateRail.test.tsx`）。
- 手绘攻略表单校验目的地并拒绝参考图；游客返图表单校验 1～7 张照片并支持投稿昵称（`workflowForms.test.tsx`）。
- 手绘攻略结果页展示行程概览与逐日路线；游客返图结果页展示共同情绪与活动主题；缩略图标签按工作流区分（`workflowResults.test.tsx`）。
- 手绘攻略 ZIP 含 `行程.json`；部分失败时 ZIP 仅含成功图片与完整文案（`downloads.test.ts`）。
- 本机历史按工作流保存四个工作流记录，恢复与重新生成预填目的地/活动主题（`historyRepository.test.ts`、`workflowForms.test.tsx`）。
- 主页四工作流输入校验：手绘攻略目的地规则与后端一致、不允许附件；游客返图至少 1 张照片（`useHomeGeneration.test.tsx`）。

### 桌面与手机视觉路线

本轮执行环境无浏览器自动化工具，视觉验收未产生截图，**需人工按以下路线补验**：

1. 桌面：`/` 切换到「目的地手绘攻略」输入“成都”生成 → 结果页（行程概览、逐日路线、复制、单图与 ZIP 下载含 `行程.json`）→ 切换到「照片心情图集」上传 3 张照片生成 → 结果页（共同情绪、海报切换、投稿昵称显示）→ `/history` 查看两类新记录。
2. 手机：同主流程，重点检查照片九宫格/列表溢出、长行程文本换行、海报缩略图导航和下载按钮。

## 五、验收 URL

- 前端：http://localhost:5173
- 后端健康检查：http://localhost:8787/api/health

## 六、结论

四工作流 Mock 链路端到端可用，全部自动化检查通过；真实 Provider 五项能力探测全部通过（含智谱 web 搜索）；浏览器视觉验收待人工补验。`.env_副本` 含密钥副本，保留在本地未提交。
