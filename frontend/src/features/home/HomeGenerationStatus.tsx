import type {GenerationJobSnapshot, GenerationJobPhase} from '../../../../shared/generationJobs';
import type {GenerationJobConnectionState} from '../generation/GenerationJobProvider';

export type HomeGenerationStatusProps={
  job:GenerationJobSnapshot|null;
  connectionState:GenerationJobConnectionState;
  /** 历史写入失败时的提示文案；保留结果并可重试。 */
  historySaveWarning?:string;
  /** 任务过期或不存在时提示重新生成。 */
  jobExpired?:boolean;
  onOpenResult:()=>void;
  /** 失败终态的重新生成入口：由主页重新提交当前输入。 */
  onRetry?:()=>void;
  /** 历史保存失败后的重试入口。 */
  onRetryHistorySave?:()=>void;
};

const PHASE_LABELS:Record<GenerationJobPhase,string>={
  preparing:'正在整理选题',
  content:'正在生成内容清单',
  copy:'正在生成文案',
  images:'正在生成图片',
  finalizing:'正在整理生成结果',
};

const JOB_EXPIRED_NOTICE='生成任务已过期或不存在，请重新生成。';

type StatusTone='running'|'succeeded'|'partial'|'failed'|'expired';

function isTerminal(status:GenerationJobSnapshot['status']):boolean{
  return status==='succeeded'||status==='partial'||status==='failed';
}

function runningText(job:GenerationJobSnapshot):string{
  if(job.phase==='images'){
    if(job.totalImages<=0) return PHASE_LABELS.images;
    const current=Math.min(job.completedImages+1,job.totalImages);
    return `正在生成图片 ${current}/${job.totalImages}`;
  }
  return PHASE_LABELS[job.phase];
}

export function HomeGenerationStatus({
  job,
  connectionState,
  historySaveWarning,
  jobExpired=false,
  onOpenResult,
  onRetry,
  onRetryHistorySave,
}:HomeGenerationStatusProps){
  if(!job){
    if(!jobExpired) return null;
    return (
      <div className="home-generation-status home-generation-status--expired" role="status">
        <span aria-hidden="true" className="home-generation-status__dot" />
        <p className="home-generation-status__text">{JOB_EXPIRED_NOTICE}</p>
      </div>
    );
  }

  let tone:StatusTone;
  let text:string;
  if(job.status==='succeeded'){
    tone='succeeded';
    text='素材已生成';
  }else if(job.status==='partial'){
    tone='partial';
    text='部分素材已完成';
  }else if(job.status==='failed'){
    tone='failed';
    text=job.error?.message??'素材生成失败，请稍后重试。';
  }else if(connectionState==='reconnecting'){
    tone='running';
    text='正在重新连接';
  }else{
    tone='running';
    text=runningText(job);
  }

  const showProgress=!isTerminal(job.status)&&job.totalImages>0;
  const progressPercent=job.totalImages>0
    ?Math.round(Math.min(job.completedImages/job.totalImages,1)*100)
    :0;

  return (
    <div className={`home-generation-status home-generation-status--${tone}`} role="status">
      <span aria-hidden="true" className="home-generation-status__dot" />
      <div className="home-generation-status__body">
        <p className="home-generation-status__text">{text}</p>
        {showProgress?(
          <div aria-hidden="true" className="home-generation-status__progress">
            <span
              className="home-generation-status__progress-bar"
              style={{width:`${progressPercent}%`}}
            />
          </div>
        ):null}
        {historySaveWarning&&job.result?(
          <p className="home-generation-status__warning" role="alert">{historySaveWarning}</p>
        ):null}
      </div>
      {job.status==='succeeded'||job.status==='partial'?(
        <button
          className="home-generation-status__action"
          onClick={()=>onOpenResult()}
          type="button"
        >
          查看结果
        </button>
      ):null}
      {job.status==='failed'&&onRetry?(
        <button
          className="home-generation-status__action"
          onClick={()=>onRetry()}
          type="button"
        >
          重新生成
        </button>
      ):null}
      {historySaveWarning&&job.result&&onRetryHistorySave?(
        <button
          className="home-generation-status__action home-generation-status__action--secondary"
          onClick={()=>onRetryHistorySave()}
          type="button"
        >
          重试保存
        </button>
      ):null}
    </div>
  );
}
