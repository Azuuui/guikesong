import {useEffect} from 'react';
import {useNavigate,useSearchParams} from 'react-router-dom';
import type {WorkflowId} from '../../../shared/workflows';
import {TEMPLATE_CONFIGS_BY_ID, getTemplateConfig} from '../config/templates';
import {ParticleRevealBackground} from '../features/background/ParticleRevealBackground';
import {HomeComposer} from '../features/home/HomeComposer';
import {useHomeGeneration} from '../features/home/useHomeGeneration';
import {HomeTemplateRail} from '../features/templates/HomeTemplateRail';

/** 未选择模板时的通用灰字提示。 */
const GENERIC_COMPOSER_PLACEHOLDER='输入地点、主题和想要传达的感觉';

function initialWorkflow(searchParams:URLSearchParams):WorkflowId|undefined{
  const requested=searchParams.get('template') as WorkflowId|null;
  return requested&&TEMPLATE_CONFIGS_BY_ID.has(requested)?requested:undefined;
}

export function DashboardPage(){
  const navigate=useNavigate();
  const [searchParams]=useSearchParams();
  const generation=useHomeGeneration({initialWorkflowId:initialWorkflow(searchParams),navigate});

  useEffect(()=>{
    if(window.location.hash!=='#composer') return;
    const frame=window.requestAnimationFrame(()=>{
      document.querySelector<HTMLTextAreaElement>('.home-composer__textarea')?.focus();
    });
    return ()=>window.cancelAnimationFrame(frame);
  },[]);

  return (
    <section aria-labelledby="dashboard-title" className="dashboard-page dashboard-page--creative-home">
      <ParticleRevealBackground />
      <div className="dashboard-page__veil" aria-hidden="true" />
      <div className="dashboard-page__content">
        <header className="dashboard-page__hero">
          <h1 id="dashboard-title">你给一个选题<br />它还你一座城的流量</h1>
        </header>

        <div id="composer">
          <HomeComposer
            attachments={generation.attachments}
            busy={generation.busy}
            error={generation.error}
            onAddFiles={generation.addFiles}
            onPromptChange={generation.setPrompt}
            onRemoveAttachment={generation.removeAttachment}
            onSubmit={()=>void generation.submit()}
            placeholder={generation.selectedWorkflowId
              ?getTemplateConfig(generation.selectedWorkflowId).inputAdvice
              :GENERIC_COMPOSER_PLACEHOLDER}
            prompt={generation.prompt}
          />
          <p className="dashboard-page__composer-note">一次灵感输入，全套图文输出，文旅爆款即刻启程。</p>
        </div>

        <p aria-live="polite" className="dashboard-page__selection-status">
          {generation.selectedWorkflowId
            ?`当前使用：${TEMPLATE_CONFIGS_BY_ID.get(generation.selectedWorkflowId)?.name}`
            :'尚未选择模板，点击下方模板开始'}
        </p>

        <HomeTemplateRail
          onSelect={generation.selectWorkflow}
          selectedWorkflowId={generation.selectedWorkflowId}
        />
      </div>
    </section>
  );
}
