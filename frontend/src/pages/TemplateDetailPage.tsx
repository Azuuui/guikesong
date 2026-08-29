import {ArrowLeft,ArrowRight} from '@phosphor-icons/react';
import {Link,useParams} from 'react-router-dom';
import {TEMPLATE_CONFIGS_BY_ID,type TemplateConfig} from '../config/templates';
import {TemplatePreview} from '../features/templates/TemplatePreview';

export function TemplateDetailPage(){
  const {templateId=''}=useParams();
  const template=TEMPLATE_CONFIGS_BY_ID.get(templateId as TemplateConfig['id']);

  if(!template){
    return (
      <section aria-labelledby="template-not-found-title" className="empty-state template-detail__not-found">
        <h1 id="template-not-found-title">没有找到这个模板</h1>
        <p>模板可能已调整，请返回全部模板重新选择。</p>
        <Link className="button empty-state__action" to="/templates">
          <ArrowLeft aria-hidden="true" size={18} weight="bold" />
          返回全部模板
        </Link>
      </section>
    );
  }

  return (
    <article aria-labelledby="template-detail-title" className="template-detail">
      <Link className="template-detail__back" to="/templates">
        <ArrowLeft aria-hidden="true" size={17} />
        全部模板
      </Link>
      <div className="template-detail__hero">
        <div className="template-detail__media">
          <TemplatePreview description={template.description} name={template.name} variant={template.previewVariant} />
        </div>
        <div className="template-detail__intro">
          <p className="template-detail__eyebrow">QIANSCAPE AI TEMPLATE</p>
          <h1 id="template-detail-title">{template.name}</h1>
          <p className="template-detail__description">{template.description}</p>
          <Link className="button template-detail__primary-action" to={`/?template=${template.id}#composer`}>
            用此模板创作
            <ArrowRight aria-hidden="true" size={18} weight="bold" />
          </Link>
        </div>
      </div>
      <div className="template-detail__facts">
        <section><h2>适用场景</h2><p>{template.suitableFor.join('、')}</p></section>
        <section><h2>输入建议</h2><p>{template.inputAdvice}</p></section>
        <section><h2>示例输入</h2><p>“{template.examplePrompt}”</p></section>
        <section><h2>生成内容</h2><p>{template.outputs}</p></section>
      </div>
    </article>
  );
}
