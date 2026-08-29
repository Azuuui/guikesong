import type {TemplateConfig} from '../../config/templates';
import type {WorkflowFormProps} from './types';
import {OriginalIpCreateForm} from './original-ip/OriginalIpCreateForm';
import {XhsAtlasCreateForm} from './xhs-atlas/XhsAtlasCreateForm';

export type WorkflowCreateRouterProps = WorkflowFormProps & {
  template: TemplateConfig;
  /** 结果页"再来一次"回传的一句话输入：图鉴为选题，原创 IP 为产品描述。 */
  initialPrompt?: string;
  /** 从本机历史恢复的文件：原创 IP 为产品图，图鉴为参考图。 */
  initialFiles?: File[];
};

/** 按 workflowId 分派专属创建表单；CreatePage 只保留模板外壳。 */
export function WorkflowCreateRouter({
  template,
  initialPrompt,
  initialFiles,
  onComplete,
  onPhaseChange,
  saveResult,
}: WorkflowCreateRouterProps) {
  if (template.id === 'original-ip') {
    return (
      <OriginalIpCreateForm
        initialProductDescription={initialPrompt}
        initialProductFiles={initialFiles}
        onComplete={onComplete}
        onPhaseChange={onPhaseChange}
        saveResult={saveResult}
        template={template}
      />
    );
  }

  return (
    <XhsAtlasCreateForm
      initialReferenceFiles={initialFiles}
      initialTopic={initialPrompt}
      onComplete={onComplete}
      onPhaseChange={onPhaseChange}
      saveResult={saveResult}
      template={template}
    />
  );
}
