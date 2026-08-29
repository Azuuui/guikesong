import {ArrowRight} from '@phosphor-icons/react';
import {Link} from 'react-router-dom';
import type {TemplateConfig} from '../../config/templates';
import {TemplatePreview} from './TemplatePreview';

type TemplateCardProps = {
  template: TemplateConfig;
  compact?: boolean;
  headingLevel?: 2 | 3;
};

export function TemplateCard({template, compact = false, headingLevel = 2}: TemplateCardProps) {
  return (
    <article className={`template-card${compact ? ' template-card--compact' : ''}`}>
      <div className="template-card__media">
        <TemplatePreview
          description={template.description}
          name={template.name}
          variant={template.previewVariant}
        />
      </div>

      <div className="template-card__content">
        <div className="template-card__heading">
          {headingLevel === 3 ? <h3>{template.name}</h3> : <h2>{template.name}</h2>}
          <p>{template.description}</p>
        </div>

        <dl className="template-card__details">
          <div>
            <dt>适用场景</dt>
            <dd>{template.suitableFor.join('、')}</dd>
          </div>
          <div>
            <dt>输出内容</dt>
            <dd>{template.outputs}</dd>
          </div>
          <div>
            <dt>参考图片</dt>
            <dd>{template.referenceAdvice}</dd>
          </div>
        </dl>

        <p className="template-card__compact-summary">
          {template.inputAdvice}
        </p>

        <Link
          aria-label={`使用模板：${template.name}`}
          className="template-card__action"
          to={`/templates/${template.id}/create`}
        >
          <span>使用模板</span>
          <ArrowRight aria-hidden="true" size={18} weight="bold" />
        </Link>
      </div>
    </article>
  );
}
