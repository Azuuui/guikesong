import {ArrowLeft, ImageSquare} from '@phosphor-icons/react';
import {useCallback, useMemo, useState} from 'react';
import {Link, useLocation, useNavigate, useParams} from 'react-router-dom';
import {TEMPLATE_CONFIGS_BY_ID, type TemplateConfig} from '../config/templates';
import {WorkflowCreateRouter} from '../features/create/WorkflowCreateRouter';
import {
  isActivePhase,
  type CreatePhase,
  type WorkflowCompletion,
  type WorkflowSaveInput,
} from '../features/create/types';
import {historyRepository} from '../features/history/historyRepository';
import {type RestoredFile} from '../features/history/historyTypes';
import {captureHistoryRecord} from '../features/history/resultMaterializer';
import {TemplatePreview} from '../features/templates/TemplatePreview';

type CreateLocationState = {
  initialPrompt?: unknown;
  restoredFiles?: unknown;
};

/** 路由 state 来自历史页跳转；仅接受形状合法的恢复文件，其余忽略。 */
function parseRestoredFiles(value: unknown): File[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (
      typeof item !== 'object'
      || item === null
      || typeof (item as RestoredFile).name !== 'string'
      || typeof (item as RestoredFile).mediaType !== 'string'
      || !((item as RestoredFile).blob instanceof Blob)
    ) {
      return [];
    }
    const {name, mediaType, blob} = item as RestoredFile;
    return [new File([blob], name, {type: mediaType})];
  });
}

function TemplateGuide({template}: {template: TemplateConfig}) {
  return (
    <aside aria-labelledby="template-guide-title" className="template-guide">
      <div className="template-guide__preview">
        <TemplatePreview
          description={template.description}
          imageUrl={template.previewImageUrl}
          name={template.name}
          variant={template.previewVariant}
        />
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
            <p>{template.outputs}</p>
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
  const initialFiles = useMemo(() => parseRestoredFiles(locationState?.restoredFiles), [locationState?.restoredFiles]);
  const isBusy = isActivePhase(phase);

  const saveResult = useCallback(async (input: WorkflowSaveInput) => {
    const record = await captureHistoryRecord(input);
    await historyRepository.put(record);
  }, []);

  const handleComplete = useCallback((completion: WorkflowCompletion) => {
    navigate(`/results/${completion.requestId}`, {
      state: {
        result: completion.result,
        userPrompt: completion.userPrompt,
        createdAt: completion.createdAt,
        historySaveWarning: completion.historySaveWarning,
      },
    });
  }, [navigate]);

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
          <WorkflowCreateRouter
            initialFiles={initialFiles}
            initialPrompt={initialPrompt}
            key={template.id}
            onComplete={handleComplete}
            onPhaseChange={setPhase}
            saveResult={saveResult}
            template={template}
          />
        </div>
        <TemplateGuide key={template.id} template={template} />
      </div>
    </section>
  );
}
