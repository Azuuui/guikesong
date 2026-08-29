import {CheckCircle, Info, WarningCircle} from '@phosphor-icons/react';
import {useEffect, useRef, useState, type FormEvent} from 'react';
import {travelGuideDestinationError} from '../../../../../shared/workflowSchemas';
import {Button} from '../../../components/Button';
import type {TemplateConfig} from '../../../config/templates';
import {generateAssets} from '../../generation/api';
import {
  HISTORY_SAVE_WARNING,
  isActivePhase,
  type CreatePhase,
  type WorkflowFormProps,
} from '../types';

const DESTINATION_MAX_LENGTH = 30;
const GENERATE_FAILURE_MESSAGE = '素材生成失败，请稍后重试。';

export type TravelGuideCreateFormProps = WorkflowFormProps & {
  template: TemplateConfig;
  /** 结果页"再来一次"回传的目的地。 */
  initialDestination?: string;
};

export function TravelGuideCreateForm({
  onComplete,
  onPhaseChange,
  saveResult,
  template,
  initialDestination = '',
}: TravelGuideCreateFormProps) {
  const [destination, setDestination] = useState(initialDestination);
  const [phase, setPhaseState] = useState<CreatePhase>('idle');
  const [fieldError, setFieldError] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
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

    const normalizedDestination = destination.trim();
    setOperationError(undefined);
    setPhase('validating');

    const nextFieldError = travelGuideDestinationError(normalizedDestination);
    if (nextFieldError) {
      setFieldError(nextFieldError);
      submittingRef.current = false;
      setPhase('idle');
      return;
    }

    setFieldError(undefined);
    const submissionController = new AbortController();
    submissionControllerRef.current = submissionController;
    try {
      setPhase('generating');
      const result = await generateAssets(
        {
          workflowId: 'travel-guide',
          destination: normalizedDestination,
        },
        submissionController.signal,
      );
      if (!mountedRef.current) return;

      const createdAt = new Date().toISOString();
      setPhase('saving');
      let historySaveWarning: string | undefined;
      try {
        await saveResult({
          workflowId: 'travel-guide',
          result,
          userPrompt: normalizedDestination,
          referenceFiles: [],
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
        userPrompt: normalizedDestination,
      });
    } catch {
      if (!mountedRef.current) return;
      setOperationError(GENERATE_FAILURE_MESSAGE);
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
    : phase === 'generating'
      ? '正在生成手绘攻略'
      : phase === 'saving'
        ? '正在保存到本机历史'
        : undefined;

  return (
    <form className="create-form" noValidate onSubmit={handleSubmit}>
      <section className="create-form__section">
        <div className="create-form__field-heading">
          <div>
            <label htmlFor="travel-guide-destination">目的地</label>
            <p id="travel-guide-destination-help">{template.inputAdvice}</p>
          </div>
          <span>{destination.length}/{DESTINATION_MAX_LENGTH}</span>
        </div>
        <input
          aria-describedby={`travel-guide-destination-help${fieldError ? ' travel-guide-destination-error' : ''}`}
          aria-invalid={Boolean(fieldError)}
          className="create-form__text-input"
          disabled={isBusy}
          id="travel-guide-destination"
          maxLength={DESTINATION_MAX_LENGTH}
          onChange={event => {
            const nextDestination = event.target.value;
            setDestination(nextDestination);
            if (fieldError) setFieldError(undefined);
          }}
          placeholder="例如：成都"
          type="text"
          value={destination}
        />
        {fieldError ? (
          <p className="create-form__error" id="travel-guide-destination-error" role="alert">{fieldError}</p>
        ) : null}
      </section>

      <section aria-labelledby="travel-guide-notice-title" className="create-form__notice">
        <Info aria-hidden="true" size={21} weight="duotone" />
        <div>
          <h2 id="travel-guide-notice-title">生成与保存说明</h2>
          <p>行程天数（1～3 天）、每日主题与路线顺序由系统自动规划，目的地信息会结合联网搜索获取。</p>
          <p>生成结果会保存在当前浏览器，共产出封面、每日路线图与交通、住宿、美食专题页。</p>
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
