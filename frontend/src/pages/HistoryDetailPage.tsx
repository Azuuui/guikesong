import {ArrowLeft, ClockCounterClockwise} from '@phosphor-icons/react';
import {useEffect, useState} from 'react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {ConfirmDialog} from '../components/ConfirmDialog';
import {ResultDetail} from '../features/results/ResultDetail';
import {historyRepository} from '../features/history/historyRepository';
import {materializeHistoryResult} from '../features/history/resultMaterializer';
import type {HistoryRecord} from '../features/history/historyTypes';
import {NotFoundPage} from './NotFoundPage';

type HistoryDetailState =
  | {recordId: string; status: 'loading'}
  | {recordId: string; status: 'ready'; record: HistoryRecord; result: ReturnType<typeof materializeHistoryResult>['result']}
  | {recordId: string; status: 'missing'}
  | {recordId: string; status: 'error'};

function MissingHistoryResult() {
  return (
    <NotFoundPage
      actions={(
        <>
          <Link className="button button--secondary" to="/">
            <ArrowLeft aria-hidden="true" size={18} weight="bold" />
            返回工作台
          </Link>
          <Link className="button" to="/history">
            <ClockCounterClockwise aria-hidden="true" size={18} weight="bold" />
            查看历史
          </Link>
        </>
      )}
      message={'这条生成结果已经不在当前浏览器中\n它可能已被删除，或当前浏览器不是生成时使用的浏览器。'}
      title="这条生成结果已经不在当前浏览器中"
    />
  );
}

export function HistoryDetailPage() {
  const {recordId} = useParams();
  const navigate = useNavigate();
  const normalizedRecordId = recordId?.trim() ?? '';
  const [state, setState] = useState<HistoryDetailState>(() => (
    normalizedRecordId ? {recordId: normalizedRecordId, status: 'loading'} : {recordId: '', status: 'missing'}
  ));
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (!normalizedRecordId) {
      setState({recordId: '', status: 'missing'});
      return;
    }

    let active = true;
    let revoke: (() => void) | undefined;
    setState({recordId: normalizedRecordId, status: 'loading'});

    historyRepository.get(normalizedRecordId).then(record => {
      if (!record) {
        if (active) setState({recordId: normalizedRecordId, status: 'missing'});
        return;
      }
      const materialized = materializeHistoryResult(record);
      revoke = materialized.revoke;
      if (!active) {
        revoke();
        return;
      }
      setState({recordId: normalizedRecordId, status: 'ready', record, result: materialized.result});
    }).catch(() => {
      if (active) setState({recordId: normalizedRecordId, status: 'error'});
    });

    return () => {
      active = false;
      revoke?.();
    };
  }, [normalizedRecordId]);

  async function deleteRecord() {
    if (state.status !== 'ready') return;
    setDeleteError('');
    try {
      await historyRepository.delete(state.record.id);
      navigate('/history');
    } catch {
      setDeleteError('删除失败，请稍后重试。');
      throw new Error('删除本机历史失败');
    }
  }

  if (state.recordId !== normalizedRecordId || state.status === 'loading') {
    return <section aria-live="polite" className="result-page__loading">正在读取本机历史…</section>;
  }
  if (state.status === 'missing') return <MissingHistoryResult />;
  if (state.status === 'error') {
    return <NotFoundPage message="暂时无法读取这条本机历史，请返回工作台后再试。" title="暂时无法读取本机历史" />;
  }

  return (
    <section className="history-detail-page">
      <header className="history-detail-page__source">
        <p>来自本机历史</p>
        <ConfirmDialog
          confirmLabel="删除本机记录"
          description="这条记录将从当前浏览器中删除。后端保存的参考图不会被删除。"
          onConfirm={deleteRecord}
          title="删除这条本机历史？"
          triggerLabel="删除本机记录"
          triggerVariant="danger"
        />
      </header>
      {deleteError ? <p className="history-detail-page__error" role="alert">{deleteError}</p> : null}
      <ResultDetail
        createdAt={state.record.createdAt}
        onRegenerate={() => navigate(`/templates/${state.record.workflowId}/create`, {
          state: {initialPrompt: state.record.userPrompt, regenerationNotice: '参考图片需要重新上传'},
        })}
        result={state.result}
        source="history"
        userPrompt={state.record.userPrompt}
      />
    </section>
  );
}
