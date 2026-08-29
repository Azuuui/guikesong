import {CheckCircle, Info, WarningCircle} from '@phosphor-icons/react';
import {useEffect, useRef, useState, type FormEvent} from 'react';
import type {
  GenerateRequest,
  GenerateResponse,
  ReferenceAsset,
  TemplateId,
} from '../../../../shared/types';
import {Button} from '../../components/Button';
import type {TemplateConfig} from '../../config/templates';
import {
  ReferenceUploader,
  type ReferenceUploadStatus,
} from './ReferenceUploader';

export type CreatePhase = 'idle' | 'validating' | 'uploading' | 'generating' | 'saving' | 'error';

export type CreateDraft = {
  templateId: TemplateId;
  userPrompt: string;
  files: File[];
};

export type CreateFormProps = {
  template: TemplateConfig;
  initialPrompt?: string;
  uploadFiles: (files: File[]) => Promise<ReferenceAsset[]>;
  generate: (request: GenerateRequest) => Promise<GenerateResponse>;
  saveResult: (
    response: GenerateResponse,
    draft: CreateDraft,
    assets: ReferenceAsset[],
    createdAt: string,
  ) => Promise<void>;
  onComplete: (
    requestId: string,
    historySaveWarning?: string,
    response?: GenerateResponse,
    draft?: CreateDraft,
    createdAt?: string,
  ) => void;
  onPhaseChange?: (phase: CreatePhase) => void;
};

const HISTORY_SAVE_WARNING = '素材已经生成，但未能保存到本机历史。请先下载素材包。';

function activePhase(phase: CreatePhase): boolean {
  return phase === 'validating'
    || phase === 'uploading'
    || phase === 'generating'
    || phase === 'saving';
}

function phaseLabel(phase: CreatePhase): string | undefined {
  if (phase === 'validating') return '正在校验输入';
  if (phase === 'uploading') return '正在上传参考图';
  if (phase === 'generating') return '正在生成素材';
  if (phase === 'saving') return '正在保存到本机历史';
  return undefined;
}

function safeFailureMessage(stage: 'uploading' | 'generating'): string {
  return stage === 'uploading'
    ? '参考图上传失败，请稍后重试。'
    : '素材生成失败，请稍后重试。';
}

export function CreateForm({
  template,
  initialPrompt = '',
  uploadFiles,
  generate,
  saveResult,
  onComplete,
  onPhaseChange,
}: CreateFormProps) {
  const [draft, setDraft] = useState<CreateDraft>(() => ({
    templateId: template.id,
    userPrompt: initialPrompt,
    files: [],
  }));
  const [phase, setPhaseState] = useState<CreatePhase>('idle');
  const [fieldError, setFieldError] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const [uploadStatus, setUploadStatus] = useState<ReferenceUploadStatus>('pending');
  const mountedRef = useRef(true);
  const submittingRef = useRef(false);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  function setPhase(nextPhase: CreatePhase) {
    if (!mountedRef.current) return;
    setPhaseState(nextPhase);
    onPhaseChange?.(nextPhase);
  }

  function validatePrompt(prompt: string): string | undefined {
    if (prompt.length < 2) return '请至少输入 2 个字，让系统知道你想生成什么。';
    if (prompt.length > 500) return '最多输入 500 个字，请精简后再生成。';
    return undefined;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;

    const normalizedDraft: CreateDraft = {
      ...draft,
      userPrompt: draft.userPrompt.trim(),
      files: [...draft.files],
    };
    setOperationError(undefined);
    setPhase('validating');

    const nextFieldError = validatePrompt(normalizedDraft.userPrompt);
    if (nextFieldError) {
      setFieldError(nextFieldError);
      submittingRef.current = false;
      setPhase('idle');
      return;
    }

    setFieldError(undefined);
    let assets: ReferenceAsset[] = [];
    let operationStage: 'uploading' | 'generating' = 'generating';
    try {
      if (normalizedDraft.files.length > 0) {
        operationStage = 'uploading';
        setUploadStatus('uploading');
        setPhase('uploading');
        assets = await uploadFiles(normalizedDraft.files);
        if (!mountedRef.current) return;
        if (assets.length !== normalizedDraft.files.length) {
          throw new Error('参考图上传结果数量不一致');
        }
        setUploadStatus('uploaded');
      }

      operationStage = 'generating';
      setPhase('generating');
      const response = await generate({
        templateId: normalizedDraft.templateId,
        userPrompt: normalizedDraft.userPrompt,
        referenceAssetIds: assets.map(asset => asset.assetId),
      });
      if (!mountedRef.current) return;

      const createdAt = new Date().toISOString();
      setPhase('saving');
      let historySaveWarning: string | undefined;
      try {
        await saveResult(response, normalizedDraft, assets, createdAt);
      } catch {
        historySaveWarning = HISTORY_SAVE_WARNING;
      }
      if (!mountedRef.current) return;

      onComplete(response.requestId, historySaveWarning, response, normalizedDraft, createdAt);
    } catch {
      if (!mountedRef.current) return;
      if (operationStage === 'uploading') setUploadStatus('failed');
      setOperationError(safeFailureMessage(operationStage));
      submittingRef.current = false;
      setPhase('error');
    }
  }

  const isBusy = activePhase(phase);
  const currentPhaseLabel = phaseLabel(phase);
  const promptLength = draft.userPrompt.length;
  const countWarning = promptLength >= 450;

  return (
    <form className="create-form" noValidate onSubmit={handleSubmit}>
      <section className="create-form__section">
        <div className="create-form__field-heading">
          <div>
            <label htmlFor="create-user-prompt">一句话需求</label>
            <p id="create-user-prompt-help">{template.inputAdvice}</p>
          </div>
          <span className={countWarning ? 'create-form__count create-form__count--warning' : 'create-form__count'}>
            {promptLength}/500
          </span>
        </div>
        <textarea
          aria-describedby={`create-user-prompt-help${fieldError ? ' create-user-prompt-error' : ''}`}
          aria-invalid={Boolean(fieldError)}
          disabled={isBusy}
          id="create-user-prompt"
          maxLength={520}
          onChange={event => {
            const userPrompt = event.target.value;
            setDraft(current => ({...current, userPrompt}));
            if (fieldError) setFieldError(undefined);
          }}
          placeholder="例如：为贵州山地避暑季制作一套面向年轻游客的周末推广素材"
          value={draft.userPrompt}
        />
        {fieldError ? <p className="create-form__error" id="create-user-prompt-error" role="alert">{fieldError}</p> : null}
        {countWarning && !fieldError ? (
          <p className="create-form__warning">
            <WarningCircle aria-hidden="true" size={18} />
            已接近 500 字上限，建议保留最重要的信息。
          </p>
        ) : null}
      </section>

      <ReferenceUploader
        disabled={isBusy}
        onFilesChange={files => {
          setDraft(current => ({...current, files}));
          setUploadStatus('pending');
        }}
        status={uploadStatus}
      />

      <section aria-labelledby="create-data-title" className="create-form__notice">
        <Info aria-hidden="true" size={21} weight="duotone" />
        <div>
          <h2 id="create-data-title">生成与保存说明</h2>
          <p>参考图会在生成时上传。生成结果与参考图副本会保存在当前浏览器，便于稍后继续使用。</p>
          <p>参考图用于辅助表达，不承诺人物、角色或画面完全一致。</p>
        </div>
      </section>

      {operationError ? (
        <div className="create-form__operation-error" role="alert">
          <WarningCircle aria-hidden="true" size={20} weight="fill" />
          <div>
            <strong>生成失败</strong>
            <p>{operationError}</p>
          </div>
        </div>
      ) : null}

      {currentPhaseLabel ? (
        <p aria-live="polite" className="create-form__phase" role="status">
          <CheckCircle aria-hidden="true" size={18} />
          {currentPhaseLabel}
        </p>
      ) : null}

      <div className="create-form__action-bar">
        <Button
          className="create-form__submit"
          disabled={isBusy}
          loading={isBusy}
          loadingLabel={currentPhaseLabel}
          type="submit"
        >
          {phase === 'error' ? '重新生成' : '开始生成'}
        </Button>
      </div>
    </form>
  );
}
