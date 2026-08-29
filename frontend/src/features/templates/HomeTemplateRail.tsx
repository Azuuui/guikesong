import {Check} from '@phosphor-icons/react';
import {Link} from 'react-router-dom';
import type {WorkflowId} from '../../../../shared/workflows';
import {TEMPLATE_CONFIGS} from '../../config/templates';
import {TemplatePreview} from './TemplatePreview';

export type HomeTemplateRailProps={
  /** 当前选中模板；undefined 表示尚未选择任何模板。 */
  selectedWorkflowId:WorkflowId|undefined;
  onSelect:(workflowId:WorkflowId)=>void;
};

export function HomeTemplateRail({selectedWorkflowId,onSelect}:HomeTemplateRailProps){
  return (
    <section aria-labelledby="home-template-title" className="home-template-rail">
      <div className="home-template-rail__heading">
        <h2 id="home-template-title">常用模板</h2>
      </div>
      <div className="home-template-rail__track">
        {TEMPLATE_CONFIGS.map(template=>{
          const selected=template.id===selectedWorkflowId;
          return (
            <article className={`home-template-card${selected?' home-template-card--selected':''}`} key={template.id}>
              <div className="home-template-card__heading">
                <h3>{template.name}</h3>
                <Link aria-label={`查看${template.name}详情`} to={`/templates/${template.id}`}>详情</Link>
              </div>
              <button
                aria-label={`选择模板：${template.name}`}
                aria-pressed={selected}
                className="home-template-card__select"
                onClick={()=>onSelect(template.id)}
                type="button"
              >
                <TemplatePreview description={template.description} imageUrl={template.previewImageUrl} name={template.name} variant={template.previewVariant} />
                {selected?<span aria-hidden="true" className="home-template-card__check"><Check size={14} weight="bold" /></span>:null}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
