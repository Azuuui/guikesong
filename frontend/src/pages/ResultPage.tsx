import {useEffect, useState} from 'react';
import {useLocation, useNavigate, useParams} from 'react-router-dom';
import type {GenerateResponse} from '../../../shared/types';
import {ResultDetail} from '../features/results/ResultDetail';
import {historyRepository} from '../features/history/historyRepository';
import {materializeHistoryResult} from '../features/history/resultMaterializer';
import {NotFoundPage} from './NotFoundPage';

type ResultLocationState = {
  response?: GenerateResponse;
  userPrompt?: string;
  createdAt?: string;
  historySaveWarning?: string;
};

type ResultPageState =
  | {requestId: string; status: 'loading'}
  | {requestId: string; status: 'ready'; response: GenerateResponse; userPrompt: string; createdAt: string; historySaveWarning?: string}
  | {requestId: string; status: 'missing'}
  | {requestId: string; status: 'error'};

function currentResult(state: ResultLocationState | null, requestId: string): ResultPageState | undefined {
  if (
    !state?.response
    || state.response.requestId !== requestId
    || typeof state.userPrompt !== 'string'
    || typeof state.createdAt !== 'string'
  ) return undefined;
  return {
    requestId,
    status: 'ready',
    response: state.response,
    userPrompt: state.userPrompt,
    createdAt: state.createdAt,
    historySaveWarning: typeof state.historySaveWarning === 'string' ? state.historySaveWarning : undefined,
  };
}

export function ResultPage() {
  const {requestId = ''} = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as ResultLocationState | null;
  const [state, setState] = useState<ResultPageState>(
    () => currentResult(locationState, requestId) ?? {requestId, status: 'loading'},
  );

  useEffect(() => {
    const current = currentResult(locationState, requestId);
    if (current) {
      setState(current);
      return;
    }

    let active = true;
    let revoke: (() => void) | undefined;
    setState({requestId, status: 'loading'});

    historyRepository.get(requestId).then(record => {
      if (!record) {
        if (active) setState({requestId, status: 'missing'});
        return;
      }
      const materialized = materializeHistoryResult(record);
      revoke = materialized.revoke;
      if (!active) {
        revoke();
        return;
      }
      setState({
        requestId,
        status: 'ready',
        response: materialized.response,
        userPrompt: record.userPrompt,
        createdAt: record.createdAt,
      });
    }).catch(() => {
      if (active) setState({requestId, status: 'error'});
    });

    return () => {
      active = false;
      revoke?.();
    };
  }, [location.key, locationState, requestId]);

  if (state.requestId !== requestId || state.status === 'loading') {
    return <section aria-live="polite" className="result-page__loading">正在读取生成结果…</section>;
  }
  if (state.status === 'missing') return <NotFoundPage message="这条生成结果已经不在当前浏览器中。" />;
  if (state.status === 'error') {
    return <NotFoundPage message="暂时无法读取这条生成结果，请返回工作台后再试。" title="暂时无法读取生成结果" />;
  }

  return (
    <ResultDetail
      createdAt={state.createdAt}
      historySaveWarning={state.historySaveWarning}
      onRegenerate={() => navigate(`/templates/${state.response.templateId}/create`, {state: {initialPrompt: state.userPrompt}})}
      response={state.response}
      source="current"
      userPrompt={state.userPrompt}
    />
  );
}
