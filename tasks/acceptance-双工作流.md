# 双工作流验收记录

- 日期：2026-08-29
- 分支：Azu/travel-multipage-redesign
- 验收范围：`original-ip` 原创 IP 商品化与 `xhs-atlas` 小红书图鉴双工作流交付

## 一、自动化检查

| 命令 | 结果 | 说明 |
|---|---|---|
| `npm run lint` | PASS（退出码 0） | eslint 覆盖 shared/backend/frontend |
| `npm run typecheck` | PASS（退出码 0） | tsc --noEmit |
| `npm test` | PASS（17 个文件 236 个用例） | 含工作流、Provider、API、下载、历史迁移、组件测试 |
| `npm run build` | PASS | 产物 dist/（JS 517.88 kB gzip 157.26 kB，chunk 体积警告为已知项） |

## 二、真实 Provider 冒烟（PROVIDER_MODE=real）

命令：`PROVIDER_MODE=real npm run smoke:providers`

| 探测项 | 模型 | 结果 |
|---|---|---|
| 智谱最小 JSON | glm-5.3-flash | PASS |
| 中转站视觉 JSON | gpt-image-2（中转） | FAIL：HTTP 502，错误码 `UPSTREAM_ERROR` |
| gpt-image-2 最小生成 | gpt-image-2（中转） | FAIL：HTTP 502，错误码 `UPSTREAM_ERROR` |
| gpt-image-2 双图 edits | gpt-image-2（中转） | FAIL：HTTP 502，错误码 `UPSTREAM_ERROR` |

结论：**停止真实联调**。文案链路（智谱 GLM）可用；中转图片服务当日上游 502，视觉 JSON、单图生成与多参考图 edits 三项能力暂不可用。未改模型、未降级，待中转服务恢复后重跑本命令复验。

已知限制：真实模式下提示词与图片经第三方中转处理，中转方可见内容，禁止提交敏感素材；密钥仅存于服务端内存与 `.env`（已 gitignore），不出现在前端产物与日志。

## 三、Mock API 冒烟（npm run dev，后端 8787 mock 模式）

| 请求 | 结果 |
|---|---|
| `GET /api/health` | `{"ok":true,"mode":"mock"}` |
| `GET /templates`（前端 5173） | 200 |
| `POST /api/ip-profiles`（名称+描述+IP 图） | 201，返回 `ipProfileId`，状态 draft |
| `POST /api/ip-profiles/:id/lock` | 200，状态 locked |
| `POST /api/reference-assets`（产品图） | 201，返回 assetId |
| `POST /api/generate`（original-ip） | succeeded：品牌主视觉/识别系统/商品包装/场景应用 4 页 + 2×2 总览图全部成功，含标题/正文/标签 |
| `POST /api/generate`（xhs-atlas，无参考图） | succeeded：3 个候选标题、12 条清单、1 封面 + 2 正文页 |

测试图使用 1×1 PNG（70 字节）临时文件，存放于 /tmp，未提交仓库。冒烟后 `data/reference-assets/` 与 `data/generated-assets/` 运行时产物未提交。

## 四、浏览器验收

### 已由自动化测试覆盖的浏览器行为

- 模板中心只渲染两个入口（`workflowForms`/`AppShell` 测试覆盖模板配置遍历）。
- 旧路由 `/templates/ip-image/create` 渲染"没有找到这个模板"（`AppShell.test.tsx`）。
- 图鉴无数字选题阻止提交并提示；第五张参考图被拒绝；无参考图 payload 仅含 workflowId/topic/referenceAssetIds（`workflowForms.test.tsx`）。
- 原创 IP 无档案时显示初始化表单、锁定后直接显示生成表单（`workflowForms.test.tsx`）。
- 结果页候选标题/标题、正文、标签复制与单图/ZIP 下载按钮，图鉴 ZIP 含 `发布文案.txt` 与 `清单.json`（`workflowResults.test.tsx`、`downloads.test.ts`）。
- IndexedDB v1→v2 一次性迁移清空旧记录且不影响 v2 新记录（`historyRepository.test.ts`）。
- 从历史重新生成预填选题/产品描述并恢复本地图（`workflowForms.test.tsx`）。

### 桌面（1440×900）与手机（390×844）视觉路线

本轮执行环境无浏览器自动化工具，视觉验收未产生截图，**需人工按以下路线补验**：

1. 桌面：`/`（工作台）→ `/templates`（仅两个入口）→ `/templates/xhs-atlas/create`（输入"贵阳的12种美食"生成）→ 结果页（候选标题、复制、单图与 ZIP 下载）→ `/history`（查看/重新打开/删除/清空）→ `/templates/original-ip/create`（锁定档案直显生成表单）→ `/templates/ip-image/create`（404）。
2. 手机：同主流程，重点检查表单溢出、长标题换行、动态 6 页正文、预览对话框、下载按钮和错误提示。

## 五、旧数据清理记录

- 删除旧模板预览图 4 张：`ip-poster.webp`、`travel-guide.webp`、`scenery-visual.webp`、`people-checkin.webp`，并移除空目录 `frontend/public/template-previews/`（提交 2398a20）。
- 后端旧参考图：`data/reference-assets/` 清点为 0 个文件，无需删除（目录为空）。
- 代码中旧模板 ID 仅存在于拒绝/迁移测试（`shared/types.test.ts`、`AppShell.test.tsx`、`historyRepository.test.ts` 模拟 v1 旧数据），无生产引用。

## 六、验收 URL

- 前端：http://localhost:5173
- 后端健康检查：http://localhost:8787/api/health

## 七、结论

Mock 链路双工作流端到端可用，全部自动化检查通过；真实 Provider 文案链路可用、图片中转链路因上游 502 暂缓，待恢复后复验；浏览器视觉验收待人工补验。
