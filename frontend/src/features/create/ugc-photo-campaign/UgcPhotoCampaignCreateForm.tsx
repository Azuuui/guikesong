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

const MAX_PHOTOS = 7;
const CAMPAIGN_THEME_MAX_LENGTH = 50;
const UPLOAD_FAILURE_MESSAGE = '投稿照片上传失败，请稍后重试。';
const GENERATE_FAILURE_MESSAGE = '素材生成失败，请稍后重试。';

export type UgcPhotoCampaignCreateFormProps = WorkflowFormProps & {
  template: TemplateConfig;
  /** 结果页"再来一次"回传的活动主题。 */
  initialCampaignTheme?: string;
  /** 从本机历史恢复的投稿照片。 */
  initialPhotoFiles?: File[];
};

export function UgcPhotoCampaignCreateForm({
  onComplete,
  onPhaseChange,
  saveResult,
  initialCampaignTheme = '',
  initialPhotoFiles,
}: UgcPhotoCampaignCreateFormProps) {
  const [campaignTheme, setCampaignTheme] = useState(initialCampaignTheme);
  const [files, setFiles] = useState<File[]>(initialPhotoFiles ?? []);
  const [photoCredits, setPhotoCredits] = useState<string[]>(() =>
    (initialPhotoFiles ?? []).map(() => ''),
  );
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

    const normalizedTheme = campaignTheme.trim();
    const selectedFiles = [...files];
    setOperationError(undefined);
    setPhase('validating');

    if (selectedFiles.length === 0) {
      setFieldError('请上传 1～7 张投稿照片');
      submittingRef.current = false;
      setPhase('idle');
      return;
    }

    setFieldError(undefined);
    const submissionController = new AbortController();
    submissionControllerRef.current = submissionController;
    let assets: ReferenceAsset[];
    let operationStage: 'uploading' | 'generating' = 'generating';
    try {
      operationStage = 'uploading';
      setUploadStatus('uploading');
      setPhase('uploading');
      assets = await uploadReferenceFiles(selectedFiles, submissionController.signal);
      if (!mountedRef.current) return;
      if (assets.length !== selectedFiles.length) {
        throw new Error('投稿照片上传结果数量不一致');
      }
      setUploadStatus('uploaded');

      operationStage = 'generating';
      setPhase('generating');
      const result = await generateAssets(
        {
          workflowId: 'ugc-photo-campaign',
          photoAssetIds: assets.map(asset => asset.assetId),
          ...(normalizedTheme.length > 0 ? {campaignTheme: normalizedTheme} : {}),
          photoCredits: selectedFiles.map((_, index) => photoCredits[index]?.trim() ?? ''),
        },
        submissionController.signal,
      );
      if (!mountedRef.current) return;

      const createdAt = new Date().toISOString();
      setPhase('saving');
      let historySaveWarning: string | undefined;
      try {
        await saveResult({
          workflowId: 'ugc-photo-campaign',
          result,
          userPrompt: normalizedTheme,
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
        userPrompt: normalizedTheme,
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
      ? '正在上传投稿照片'
      : phase === 'generating'
        ? '正在生成心情海报'
        : phase === 'saving'
          ? '正在保存到本机历史'
          : undefined;

  return (
    <form className="create-form" noValidate onSubmit={handleSubmit}>
      <section className="create-form__section">
        <div className="create-form__field-heading">
          <div>
            <label htmlFor="ugc-campaign-theme">活动主题，可选</label>
            <p id="ugc-campaign-theme-help">一句话说明征集或活动主题，如“夏天的风”；留空则生成通用心情文案。</p>
          </div>
          <span>{campaignTheme.length}/{CAMPAIGN_THEME_MAX_LENGTH}</span>
        </div>
        <input
          aria-describedby="ugc-campaign-theme-help"
          className="create-form__text-input"
          disabled={isBusy}
          id="ugc-campaign-theme"
          maxLength={CAMPAIGN_THEME_MAX_LENGTH}
          onChange={event => {
            const nextTheme = event.target.value;
            setCampaignTheme(nextTheme);
          }}
          placeholder="例如：夏天的风"
          type="text"
          value={campaignTheme}
        />
      </section>

      <div className="create-form__section">
        <ReferenceUploader
          captions={photoCredits}
          captionLabel="投稿昵称"
          captionPlaceholder="这张照片的投稿昵称，可留空"
          disabled={isBusy}
          emptyLabel="还没有选择投稿照片"
          initialFiles={initialPhotoFiles}
          maxFiles={MAX_PHOTOS}
          onCaptionsChange={setPhotoCredits}
          onFilesChange={nextFiles => {
            setFiles(nextFiles);
            setUploadStatus('pending');
          }}
          selectLabel="选择投稿照片"
          selectHint="上传顺序即发布顺序，每张照片独立成一张海报"
          status={uploadStatus}
          title="投稿照片，必选"
        />
        {fieldError ? (
          <p className="create-form__error" id="ugc-photo-error" role="alert">{fieldError}</p>
        ) : null}
      </div>

      <section aria-labelledby="ugc-notice-title" className="create-form__notice">
        <Info aria-hidden="true" size={21} weight="duotone" />
        <div>
          <h2 id="ugc-notice-title">生成与保存说明</h2>
          <p>每张照片独立生成一张 3:4 竖版海报，单张失败会自动重跑一次，不影响其他照片。</p>
          <p>文案是整组照片共同的情绪底色，不重复描述画面里已经看得见的内容。</p>
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
