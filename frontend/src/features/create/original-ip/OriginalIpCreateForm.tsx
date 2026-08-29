import {CheckCircle, Info, LockKey, WarningCircle} from '@phosphor-icons/react';
import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import type {IpProfilePublicOutput, ReferenceAsset} from '../../../../../shared/types';
import {Button} from '../../../components/Button';
import type {TemplateConfig} from '../../../config/templates';
import {generateAssets, getActiveIpProfile, uploadReferenceFiles} from '../../generation/api';
import {
  HISTORY_SAVE_WARNING,
  isActivePhase,
  type CreatePhase,
  type WorkflowFormProps,
} from '../types';
import {ReferenceUploader, type ReferenceUploadStatus} from '../ReferenceUploader';
import {IpProfileSetup} from './IpProfileSetup';

const PRODUCT_DESCRIPTION_MAX_LENGTH = 500;
const UPLOAD_FAILURE_MESSAGE = '产品图上传失败，请稍后重试。';
const GENERATE_FAILURE_MESSAGE = '素材生成失败，请稍后重试。';

/** 生成阶段文案：与后端工作流的分析→规划→首图→后三图编排对应。 */
const GENERATION_STAGE_LABELS = [
  '正在分析产品图与 IP 形象',
  '正在规划四张画面',
  '正在生成首图',
  '正在生成其余三图',
];
const GENERATION_STAGE_INTERVAL_MS = 2000;

type ProfileState =
  | {status: 'loading'}
  | {status: 'error'}
  | {status: 'ready'; profile: IpProfilePublicOutput | null};

export type OriginalIpCreateFormProps = WorkflowFormProps & {
  template: TemplateConfig;
  initialProductDescription?: string;
};

export function OriginalIpCreateForm({
  onComplete,
  onPhaseChange,
  saveResult,
  template,
  initialProductDescription = '',
}: OriginalIpCreateFormProps) {
  const [profileState, setProfileState] = useState<ProfileState>({status: 'loading'});
  const [productDescription, setProductDescription] = useState(initialProductDescription);
  const [productFiles, setProductFiles] = useState<File[]>([]);
  const [phase, setPhaseState] = useState<CreatePhase>('idle');
  const [stageIndex, setStageIndex] = useState(0);
  const [fieldError, setFieldError] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const [uploadStatus, setUploadStatus] = useState<ReferenceUploadStatus>('pending');
  const mountedRef = useRef(true);
  const submittingRef = useRef(false);
  const submissionControllerRef = useRef<AbortController | undefined>(undefined);

  const setPhase = useCallback((nextPhase: CreatePhase) => {
    if (!mountedRef.current) return;
    setPhaseState(nextPhase);
    onPhaseChange?.(nextPhase);
  }, [onPhaseChange]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      submissionControllerRef.current?.abort();
      submissionControllerRef.current = undefined;
    };
  }, []);

  const reloadProfile = useCallback(async () => {
    setProfileState({status: 'loading'});
    try {
      const profile = await getActiveIpProfile();
      if (!mountedRef.current) return;
      setProfileState({status: 'ready', profile});
    } catch {
      if (!mountedRef.current) return;
      setProfileState({status: 'error'});
    }
  }, []);

  useEffect(() => {
    void reloadProfile();
  }, [reloadProfile]);

  useEffect(() => {
    if (phase !== 'generating') {
      setStageIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setStageIndex(current => Math.min(current + 1, GENERATION_STAGE_LABELS.length - 1));
    }, GENERATION_STAGE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [phase]);

  if (profileState.status === 'loading') {
    return <p className="create-form__phase" role="status">正在读取 IP 档案…</p>;
  }

  if (profileState.status === 'error') {
    return (
      <div className="create-form" role="alert">
        <div className="create-form__operation-error">
          <WarningCircle aria-hidden="true" size={20} weight="fill" />
          <div>
            <strong>IP 档案读取失败</strong>
            <p>暂时无法读取 IP 档案，请稍后重试。</p>
          </div>
        </div>
        <div className="create-form__action-bar">
          <Button onClick={() => void reloadProfile()} type="button">重新读取</Button>
        </div>
      </div>
    );
  }

  const {profile} = profileState;

  if (!profile || profile.status === 'draft') {
    return (
      <IpProfileSetup
        draftProfile={profile && profile.status === 'draft' ? profile : null}
        onLocked={lockedProfile => {
          setProfileState({status: 'ready', profile: lockedProfile});
          onPhaseChange?.('idle');
        }}
        onPhaseChange={onPhaseChange}
      />
    );
  }

  function validateInput(description: string, files: File[]): string | undefined {
    if (files.length !== 1) return '请上传一张产品图';
    if (description.length === 0) return '请输入产品描述';
    if (description.length > PRODUCT_DESCRIPTION_MAX_LENGTH) return '产品描述不超过 500 字';
    return undefined;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || !profile) return;
    submittingRef.current = true;

    const description = productDescription.trim();
    const files = [...productFiles];
    setOperationError(undefined);
    setPhase('validating');

    const nextFieldError = validateInput(description, files);
    if (nextFieldError) {
      setFieldError(nextFieldError);
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
      assets = await uploadReferenceFiles(files, submissionController.signal);
      if (!mountedRef.current) return;
      if (assets.length !== files.length) {
        throw new Error('产品图上传结果数量不一致');
      }
      setUploadStatus('uploaded');

      operationStage = 'generating';
      setPhase('generating');
      const result = await generateAssets(
        {
          workflowId: 'original-ip',
          ipProfileId: profile.ipProfileId,
          productAssetId: assets[0]!.assetId,
          productDescription: description,
        },
        submissionController.signal,
      );
      if (!mountedRef.current) return;

      const createdAt = new Date().toISOString();
      setPhase('saving');
      let historySaveWarning: string | undefined;
      try {
        await saveResult({
          workflowId: 'original-ip',
          result,
          userPrompt: description,
          referenceFiles: assets.map((asset, index) => ({asset, blob: files[index]!})),
          createdAt,
          signal: submissionController.signal,
        });
      } catch {
        if (submissionController.signal.aborted || !mountedRef.current) return;
        historySaveWarning = HISTORY_SAVE_WARNING;
      }
      if (!mountedRef.current) return;

      onComplete({requestId: result.requestId, createdAt, historySaveWarning, result, userPrompt: description});
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
      ? '正在上传产品图'
      : phase === 'generating'
        ? GENERATION_STAGE_LABELS[stageIndex]
        : phase === 'saving'
          ? '正在保存到本机历史'
          : undefined;
  const descriptionLength = productDescription.length;
  const countWarning = descriptionLength >= 450;

  return (
    <form className="create-form" noValidate onSubmit={handleSubmit}>
      <section aria-labelledby="ip-profile-card-title" className="ip-profile-card">
        <span className="ip-profile-card__image">
          <img alt={`${profile.name} IP 标准图`} src={profile.referenceImageUrl} />
        </span>
        <div className="ip-profile-card__copy">
          <p className="ip-profile-card__eyebrow">
            <LockKey aria-hidden="true" size={14} weight="fill" />
            已锁定 IP 档案 · 版本 {profile.version}
          </p>
          <h2 id="ip-profile-card-title">{profile.name}</h2>
          <p>{profile.description}</p>
        </div>
      </section>

      <ReferenceUploader
        description="只需 1 张主打产品图，支持 JPG、PNG、WebP，单张不超过 10MB。"
        disabled={isBusy}
        emptyLabel="还没有选择产品图"
        maxFiles={1}
        onFilesChange={files => {
          setProductFiles(files);
          setUploadStatus('pending');
        }}
        selectHint={template.referenceAdvice}
        selectLabel="选择产品图片"
        status={uploadStatus}
        title="产品图片，必选"
      />

      <section className="create-form__section">
        <div className="create-form__field-heading">
          <div>
            <label htmlFor="product-description">产品描述</label>
            <p id="product-description-help">{template.inputAdvice}</p>
          </div>
          <span className={countWarning ? 'create-form__count create-form__count--warning' : 'create-form__count'}>
            {descriptionLength}/{PRODUCT_DESCRIPTION_MAX_LENGTH}
          </span>
        </div>
        <textarea
          aria-describedby={`product-description-help${fieldError ? ' product-description-error' : ''}`}
          aria-invalid={Boolean(fieldError)}
          disabled={isBusy}
          id="product-description"
          maxLength={PRODUCT_DESCRIPTION_MAX_LENGTH}
          onChange={event => {
            const description = event.target.value;
            setProductDescription(description);
            if (fieldError) setFieldError(undefined);
          }}
          placeholder="例如：米白陶瓷马克杯，杯身可印 IP 形象，主打文旅伴手礼场景"
          value={productDescription}
        />
        {fieldError ? (
          <p className="create-form__error" id="product-description-error" role="alert">{fieldError}</p>
        ) : null}
        {countWarning && !fieldError ? (
          <p className="create-form__warning">
            <WarningCircle aria-hidden="true" size={18} />
            已接近 500 字上限，建议保留最重要的信息。
          </p>
        ) : null}
      </section>

      <section aria-labelledby="original-ip-notice-title" className="create-form__notice">
        <Info aria-hidden="true" size={21} weight="duotone" />
        <div>
          <h2 id="original-ip-notice-title">生成与保存说明</h2>
          <p>将固定使用上方锁定的 IP 标准图与本张产品图生成四张画面，生成完成后自动保存到当前浏览器。</p>
          <p>IP 档案锁定后不可修改；如需更换形象，请联系管理员重置档案。</p>
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
