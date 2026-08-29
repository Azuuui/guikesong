import {Info, WarningCircle} from '@phosphor-icons/react';
import {useEffect, useRef, useState, type FormEvent} from 'react';
import type {IpProfilePublicOutput} from '../../../../../shared/workflows';
import {Button} from '../../../components/Button';
import {createIpProfile, lockIpProfile} from '../../generation/api';
import {isActivePhase, type CreatePhase} from '../types';
import {ReferenceUploader, type ReferenceUploadStatus} from '../ReferenceUploader';

const IP_NAME_MAX_LENGTH = 50;
const IP_DESCRIPTION_MAX_LENGTH = 500;
const SETUP_FAILURE_MESSAGE = 'IP 档案保存失败，请稍后重试。';

export type IpProfileSetupProps = {
  /** 已存在的草稿档案；提交后将覆盖并锁定。 */
  draftProfile?: IpProfilePublicOutput | null;
  onLocked: (profile: IpProfilePublicOutput) => void;
  onPhaseChange?: (phase: CreatePhase) => void;
};

type SetupFields = {
  file?: File;
  name: string;
  description: string;
};

export function IpProfileSetup({draftProfile, onLocked, onPhaseChange}: IpProfileSetupProps) {
  const [fields, setFields] = useState<SetupFields>({name: '', description: ''});
  const [phase, setPhaseState] = useState<CreatePhase>('idle');
  const [fieldError, setFieldError] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const [uploadStatus, setUploadStatus] = useState<ReferenceUploadStatus>('pending');
  const mountedRef = useRef(true);
  const submittingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function setPhase(nextPhase: CreatePhase) {
    if (!mountedRef.current) return;
    setPhaseState(nextPhase);
    onPhaseChange?.(nextPhase);
  }

  function validateFields(next: SetupFields): string | undefined {
    if (!next.file) return '请上传一张 IP 形象标准图';
    if (next.name.trim().length === 0) return '请输入 IP 名称';
    if (next.name.trim().length > IP_NAME_MAX_LENGTH) return 'IP 名称不超过 50 字';
    if (next.description.trim().length === 0) return '请输入 IP 描述';
    if (next.description.trim().length > IP_DESCRIPTION_MAX_LENGTH) return 'IP 描述不超过 500 字';
    return undefined;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;

    const next: SetupFields = {
      file: fields.file,
      name: fields.name.trim(),
      description: fields.description.trim(),
    };
    setOperationError(undefined);
    setPhase('validating');

    const nextFieldError = validateFields(next);
    if (nextFieldError) {
      setFieldError(nextFieldError);
      submittingRef.current = false;
      setPhase('idle');
      return;
    }

    setFieldError(undefined);
    setUploadStatus('uploading');
    setPhase('uploading');
    try {
      const profile = await createIpProfile({
        file: next.file!,
        name: next.name,
        description: next.description,
      });
      if (!mountedRef.current) return;
      setUploadStatus('uploaded');

      setPhase('saving');
      const locked = await lockIpProfile(profile.ipProfileId);
      if (!mountedRef.current) return;

      setPhase('idle');
      onLocked(locked);
    } catch {
      if (!mountedRef.current) return;
      setUploadStatus('failed');
      setOperationError(SETUP_FAILURE_MESSAGE);
      setPhase('error');
    } finally {
      submittingRef.current = false;
    }
  }

  const isBusy = isActivePhase(phase);
  const currentPhaseLabel = phase === 'validating'
    ? '正在校验输入'
    : phase === 'uploading'
      ? '正在上传 IP 标准图'
      : phase === 'saving'
        ? '正在锁定 IP 档案'
        : undefined;

  return (
    <form className="create-form" noValidate onSubmit={handleSubmit}>
      {draftProfile ? (
        <section aria-labelledby="ip-setup-draft-title" className="create-form__notice">
          <Info aria-hidden="true" size={21} weight="duotone" />
          <div>
            <h2 id="ip-setup-draft-title">检测到未锁定的 IP 档案</h2>
            <p>当前草稿：{draftProfile.name}（版本 {draftProfile.version}）。再次提交会覆盖草稿并锁定。</p>
          </div>
        </section>
      ) : null}

      <ReferenceUploader
        description="只需 1 张清晰的 IP 形象标准图，支持 JPG、PNG、WebP，单张不超过 10MB。"
        disabled={isBusy}
        emptyLabel="还没有选择 IP 标准图"
        maxFiles={1}
        onFilesChange={files => {
          setFields(current => ({...current, file: files[0]}));
          setUploadStatus('pending');
        }}
        selectHint="IP 标准图锁定后将用于所有生成"
        selectLabel="选择 IP 形象标准图"
        status={uploadStatus}
        title="IP 形象标准图，必选"
      />

      <section className="create-form__section">
        <div className="create-form__field-heading">
          <div>
            <label htmlFor="ip-profile-name">IP 名称</label>
            <p>用于品牌识别与文案称呼，例如“苗苗”“山灵君”。</p>
          </div>
          <span>{fields.name.length}/{IP_NAME_MAX_LENGTH}</span>
        </div>
        <input
          aria-invalid={fieldError ? 'true' : 'false'}
          className="create-form__text-input"
          disabled={isBusy}
          id="ip-profile-name"
          maxLength={IP_NAME_MAX_LENGTH}
          onChange={event => {
            const name = event.target.value;
            setFields(current => ({...current, name}));
            if (fieldError) setFieldError(undefined);
          }}
          placeholder="例如：山灵君"
          type="text"
          value={fields.name}
        />
      </section>

      <section className="create-form__section">
        <div className="create-form__field-heading">
          <div>
            <label htmlFor="ip-profile-description">IP 描述</label>
            <p>一句话说明形象性格与风格定位，例如“以贵州山地云雾为灵感的守护精灵”。</p>
          </div>
          <span>{fields.description.length}/{IP_DESCRIPTION_MAX_LENGTH}</span>
        </div>
        <textarea
          aria-invalid={fieldError ? 'true' : 'false'}
          disabled={isBusy}
          id="ip-profile-description"
          maxLength={IP_DESCRIPTION_MAX_LENGTH}
          onChange={event => {
            const description = event.target.value;
            setFields(current => ({...current, description}));
            if (fieldError) setFieldError(undefined);
          }}
          placeholder="例如：以贵州山地云雾为灵感的守护精灵，性格温和、喜欢陪伴旅人"
          value={fields.description}
        />
        {fieldError ? (
          <p className="create-form__error" id="ip-profile-error" role="alert">{fieldError}</p>
        ) : null}
      </section>

      {operationError ? (
        <div className="create-form__operation-error" role="alert">
          <WarningCircle aria-hidden="true" size={20} weight="fill" />
          <div>
            <strong>保存失败</strong>
            <p>{operationError}</p>
          </div>
        </div>
      ) : null}

      {currentPhaseLabel ? (
        <p aria-live="polite" className="create-form__phase" role="status">{currentPhaseLabel}</p>
      ) : null}

      <div className="create-form__action-bar">
        <Button className="create-form__submit" disabled={isBusy} loading={isBusy} loadingLabel={currentPhaseLabel} type="submit">
          保存并锁定 IP 档案
        </Button>
      </div>
    </form>
  );
}
