import {CheckCircle, Info, WarningCircle} from '@phosphor-icons/react';
import {useEffect, useRef, useState, type FormEvent} from 'react';
import type {ReferenceAsset} from '../../../../../shared/types';
import {Button} from '../../../components/Button';
import type {TemplateConfig} from '../../../config/templates';
import {generateAssets, uploadReferenceFiles} from '../../generation/api';
import {
  HISTORY_SAVE_WARNING,
  isActivePhase,
  type CreatePhase,
  type WorkflowFormProps,
} from '../types';
import {ReferenceUploader, type ReferenceUploadStatus} from '../ReferenceUploader';

const TOPIC_MAX_LENGTH = 60;
const UPLOAD_FAILURE_MESSAGE = '参考图上传失败，请稍后重试。';
const GENERATE_FAILURE_MESSAGE = '素材生成失败，请稍后重试。';

export type XhsAtlasCreateFormProps = WorkflowFormProps & {
  template: TemplateConfig;
  initialTopic?: string;
};

/** 与后端 parseGenerateRequest 一致的选题校验：必须包含至少 2 的数量；超过 36 由工作流钳制。 */
function validateTopic(topic: string): string | undefined {
  if (topic.length === 0) return '请输入选题';
  const match = topic.match(/\d+/);
  if (!match) return '选题需包含数量，如"贵阳的12种美食"';
  if (Number(match[0]) < 2) return '选题数量至少为 2';
  return undefined;
}

export function XhsAtlasCreateForm({
  onComplete,
  onPhaseChange,
  saveResult,
  template,
  initialTopic = '',
}: XhsAtlasCreateFormProps) {
  const [topic, setTopic] = useState(initialTopic);
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhaseState] = useState<CreatePhase>('idle');
  const [fieldError, setFieldError] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const [uploadStatus, setUploadStatus] = useState<ReferenceUploadStatus>('pending');
  const mountedRef = useRef(true);
  const submittingRef = useRef(false);
  const submissionControllerRef = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      submissionControllerRef.current?.abort();
      submissionControllerRef.current = undefined;
    };
  }, []);

  function setPhase(nextPhase: CreatePhase) {
    if (!mountedRef.current) return;
    setPhaseState(nextPhase);
    onPhaseChange?.(nextPhase);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;

    const normalizedTopic = topic.trim();
    const selectedFiles = [...files];
    setOperationError(undefined);
    setPhase('validating');

    const nextFieldError = validateTopic(normalizedTopic);
    if (nextFieldError) {
      setFieldError(nextFieldError);
      submittingRef.current = false;
      setPhase('idle');
      return;
    }

    setFieldError(undefined);
    const submissionController = new AbortController();
    submissionControllerRef.current = submissionController;
    let assets: ReferenceAsset[] = [];
    let operationStage: 'uploading' | 'generating' = 'generating';
    try {
      if (selectedFiles.length > 0) {
        operationStage = 'uploading';
        setUploadStatus('uploading');
        setPhase('uploading');
        assets = await uploadReferenceFiles(selectedFiles, submissionController.signal);
        if (!mountedRef.current) return;
        if (assets.length !== selectedFiles.length) {
          throw new Error('参考图上传结果数量不一致');
        }
        setUploadStatus('uploaded');
      }

      operationStage = 'generating';
      setPhase('generating');
      const result = await generateAssets(
        {
          workflowId: 'xhs-atlas',
          topic: normalizedTopic,
          referenceAssetIds: assets.map(asset => asset.assetId),
        },
        submissionController.signal,
      );
      if (!mountedRef.current) return;

      const createdAt = new Date().toISOString();
      setPhase('saving');
      let historySaveWarning: string | undefined;
      try {
        await saveResult({
          workflowId: 'xhs-atlas',
          result,
          userPrompt: normalizedTopic,
          referenceFiles: assets.map((asset, index) => ({asset, blob: selectedFiles[index]!})),
          createdAt,
          signal: submissionController.signal,
        });
      } catch {
        if (submissionController.signal.aborted || !mountedRef.current) return;
        historySaveWarning = HISTORY_SAVE_WARNING;
      }
      if (!mountedRef.current) return;

      onComplete({
        requestId: result.requestId,
        createdAt,
        historySaveWarning,
        result,
        userPrompt: normalizedTopic,
      });
    } catch {
      if (!mountedRef.current) return;
      if (operationStage === 'uploading') setUploadStatus('failed');
      setOperationError(operationStage === 'uploading' ? UPLOAD_FAILURE_MESSAGE : GENERATE_FAILURE_MESSAGE);
      submittingRef.current = false;
      setPhase('error');
    } finally {
      if (submissionControllerRef.current === submissionController) {
        submissionControllerRef.current = undefined;
      }
    }
  }

  const isBusy = isActivePhase(phase);
  const currentPhaseLabel = phase === 'validating'
    ? '正在校验输入'
    : phase === 'uploading'
      ? '正在上传参考图'
      : phase === 'generating'
        ? '正在生成图鉴素材'
        : phase === 'saving'
          ? '正在保存到本机历史'
          : undefined;

  return (
    <form className="create-form" noValidate onSubmit={handleSubmit}>
      <section className="create-form__section">
        <div className="create-form__field-heading">
          <div>
            <label htmlFor="atlas-topic">图鉴选题</label>
            <p id="atlas-topic-help">{template.inputAdvice}</p>
          </div>
          <span>{topic.length}/{TOPIC_MAX_LENGTH}</span>
        </div>
        <input
          aria-describedby={`atlas-topic-help${fieldError ? ' atlas-topic-error' : ''}`}
          aria-invalid={Boolean(fieldError)}
          className="create-form__text-input"
          disabled={isBusy}
          id="atlas-topic"
          maxLength={TOPIC_MAX_LENGTH}
          onChange={event => {
            const nextTopic = event.target.value;
            setTopic(nextTopic);
            if (fieldError) setFieldError(undefined);
          }}
          placeholder="例如：贵阳的12种美食"
          type="text"
          value={topic}
        />
        {fieldError ? (
          <p className="create-form__error" id="atlas-topic-error" role="alert">{fieldError}</p>
        ) : null}
      </section>

      <ReferenceUploader
        disabled={isBusy}
        onFilesChange={nextFiles => {
          setFiles(nextFiles);
          setUploadStatus('pending');
        }}
        status={uploadStatus}
      />

      <section aria-labelledby="atlas-notice-title" className="create-form__notice">
        <Info aria-hidden="true" size={21} weight="duotone" />
        <div>
          <h2 id="atlas-notice-title">生成与保存说明</h2>
          <p>清单事实由模型根据选题整理，参考图只影响画面视觉。生成结果与参考图副本会保存在当前浏览器。</p>
          <p>数量会自动拆分到多张正文页，选题数量超过 36 时将自动收敛为 36。</p>
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
