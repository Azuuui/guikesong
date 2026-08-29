import {ArrowLeft, ImageSquare} from '@phosphor-icons/react';
import {useState} from 'react';
import {Link, useLocation, useNavigate, useParams} from 'react-router-dom';
import type {GenerateResponse, ReferenceAsset} from '../../../shared/types';
import {TEMPLATE_CONFIGS_BY_ID, type TemplateConfig} from '../config/templates';
import {
  CreateForm,
  type CreateDraft,
  type CreatePhase,
} from '../features/create/CreateForm';
import {generateMarketingAssets, uploadReferenceFiles} from '../features/generation/api';
import {historyRepository} from '../features/history/historyRepository';
import {captureHistoryRecord} from '../features/history/resultMaterializer';

type CreateLocationState = {
  initialPrompt?: unknown;
};

const EXPECTED_OUTPUTS: Record<TemplateConfig['id'], string> = {
  'ip-image': '动态生成活动主视觉、宣传标题、正文与传播标签。',
  'travel-cards': '动态生成完整攻略图文页面、种草文案与传播标签。',
  'scenery-collage': '动态生成景区氛围视觉、推广文案与传播标签。',
  'people-collage': '动态生成人物打卡视觉、社交文案与传播标签。',
};

function TemplateGuide({template}: {template: TemplateConfig}) {
  const [previewFailed, setPreviewFailed] = useState(false);

  return (
    <aside aria-labelledby="template-guide-title" className="template-guide">
      <div className="template-guide__preview">
        {previewFailed ? (
          <span className="template-guide__preview-placeholder" role="img" aria-label="模板示例图暂不可用">
            <ImageSquare aria-hidden="true" size={28} />
            <span>示例图暂不可用</span>
          </span>
        ) : (
          <img
            alt={`${template.name}示例图`}
            onError={() => setPreviewFailed(true)}
            src={template.previewUrl}
          />
        )}
      </div>
      <div className="template-guide__summary">
        <p>当前模板</p>
        <h2 id="template-guide-title">{template.name}</h2>
        <p>{template.description}</p>
      </div>
      <details className="template-guide__details">
        <summary>查看模板建议与输出</summary>
        <div className="template-guide__detail-content">
          <section>
            <h3>适用场景</h3>
            <ul>{template.suitableFor.map(item => <li key={item}>{item}</li>)}</ul>
          </section>
          <section>
            <h3>推荐输入内容</h3>
            <p>{template.inputAdvice}</p>
          </section>
          <section>
            <h3>参考图建议</h3>
            <p>{template.referenceAdvice}</p>
          </section>
          <section>
            <h3>本次输出</h3>
            <p>{EXPECTED_OUTPUTS[template.id]}</p>
          </section>
        </div>
      </details>
    </aside>
  );
}

export function CreatePage() {
  const {templateId = ''} = useParams();
  const template = TEMPLATE_CONFIGS_BY_ID.get(templateId as TemplateConfig['id']);
  const navigate = useNavigate();
  const location = useLocation();
  const [phase, setPhase] = useState<CreatePhase>('idle');
  const locationState = location.state as CreateLocationState | null;
  const initialPrompt = typeof locationState?.initialPrompt === 'string'
    ? locationState.initialPrompt
    : undefined;
  const isBusy = phase === 'validating'
    || phase === 'uploading'
    || phase === 'generating'
    || phase === 'saving';

  if (!template) {
    return (
      <section aria-labelledby="create-not-found-title" className="empty-state create-page__not-found">
        <span aria-hidden="true" className="empty-state__icon"><ImageSquare size={24} /></span>
        <h1 id="create-not-found-title">没有找到这个模板</h1>
        <p>模板可能已调整，请返回模板中心重新选择。</p>
        <Link className="button empty-state__action" to="/templates">
          <ArrowLeft aria-hidden="true" size={18} weight="bold" />
          返回模板中心
        </Link>
      </section>
    );
  }

  async function saveResult(
    response: GenerateResponse,
    draft: CreateDraft,
    assets: ReferenceAsset[],
    createdAt: string,
    signal?: AbortSignal,
  ) {
    if (assets.length !== draft.files.length) {
      throw new Error('参考图上传结果与本地文件不匹配');
    }
    const record = await captureHistoryRecord({
      response,
      userPrompt: draft.userPrompt,
      createdAt,
      signal,
      referenceFiles: assets.map((asset, index) => ({asset, blob: draft.files[index]})),
    });
    await historyRepository.put(record);
  }

  return (
    <section aria-labelledby="create-page-title" className="create-page">
      <nav aria-label="面包屑" className="create-page__breadcrumb">
        <Link to="/templates">模板中心</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{template.name}</span>
      </nav>

      <header className="page-header create-page__header">
        <div>
          <p className="create-page__eyebrow">使用模板创作</p>
          <h1 id="create-page-title">{template.name}</h1>
          <p>{template.description}</p>
        </div>
        <Link
          aria-disabled={isBusy || undefined}
          className={`button button--secondary create-page__change-template${isBusy ? ' create-page__change-template--disabled' : ''}`}
          onClick={event => {
            if (isBusy) event.preventDefault();
          }}
          tabIndex={isBusy ? -1 : undefined}
          to="/templates"
        >
          更换模板
        </Link>
      </header>

      <div className="create-page__layout">
        <div className="create-page__form-column">
          <CreateForm
            generate={generateMarketingAssets}
            initialPrompt={initialPrompt}
            key={template.id}
            onComplete={(requestId, historySaveWarning, response, draft, createdAt) => {
              if (!response || !draft || !createdAt) return;
              navigate(`/results/${requestId}`, {
                state: {
                  response,
                  userPrompt: draft.userPrompt,
                  createdAt,
                  historySaveWarning,
                },
              });
            }}
            onPhaseChange={setPhase}
            saveResult={saveResult}
            template={template}
            uploadFiles={(files, signal) => uploadReferenceFiles(files, signal)}
          />
        </div>
        <TemplateGuide key={template.id} template={template} />
      </div>
    </section>
  );
}
