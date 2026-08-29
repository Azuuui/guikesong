import {useEffect} from 'react';
import {useNavigate,useSearchParams} from 'react-router-dom';
import type {WorkflowId} from '../../../shared/workflows';
import {TEMPLATE_CONFIGS_BY_ID} from '../config/templates';
import {ParticleRevealBackground} from '../features/background/ParticleRevealBackground';
import {HomeComposer} from '../features/home/HomeComposer';
import {useHomeGeneration} from '../features/home/useHomeGeneration';
import {HomeTemplateRail} from '../features/templates/HomeTemplateRail';

function initialWorkflow(searchParams:URLSearchParams):WorkflowId{
  const requested=searchParams.get('template') as WorkflowId|null;
  return requested&&TEMPLATE_CONFIGS_BY_ID.has(requested)?requested:'xhs-atlas';
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
          <p className="dashboard-page__eyebrow">QIANSCAPE AI / TRAVEL CREATIVE STUDIO</p>
          <h1 id="dashboard-title">从一句话开始，<br />生成一套文旅表达。</h1>
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
            prompt={generation.prompt}
          />
        </div>

        <p aria-live="polite" className="dashboard-page__selection-status">
          当前使用：{TEMPLATE_CONFIGS_BY_ID.get(generation.selectedWorkflowId)?.name}
        </p>

        <HomeTemplateRail
          onSelect={generation.selectWorkflow}
          selectedWorkflowId={generation.selectedWorkflowId}
        />
      </div>
    </section>
  );
}
