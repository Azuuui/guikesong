import {ArrowRight, ImageSquare} from '@phosphor-icons/react';
import {useState} from 'react';
import {Link} from 'react-router-dom';
import type {TemplateConfig} from '../../config/templates';

type TemplateCardProps = {
  template: TemplateConfig;
  compact?: boolean;
  headingLevel?: 2 | 3;
};

export function TemplateCard({template, compact = false, headingLevel = 2}: TemplateCardProps) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <article className={`template-card${compact ? ' template-card--compact' : ''}`}>
      <div className="template-card__media">
        {imageFailed ? (
          <div
            aria-label={`${template.name}模板预览暂时无法显示`}
            className="template-card__image-placeholder"
            role="img"
          >
            <ImageSquare aria-hidden="true" size={32} weight="regular" />
            <span>预览图片暂不可用</span>
          </div>
        ) : (
          <img
            alt={`${template.name}模板预览：${template.description}`}
            className="template-card__image"
            loading="lazy"
            onError={() => setImageFailed(true)}
            src={template.previewUrl}
          />
        )}
      </div>

      <div className="template-card__content">
        <div className="template-card__heading">
          {headingLevel === 3 ? <h3>{template.name}</h3> : <h2>{template.name}</h2>}
          <p>{template.description}</p>
        </div>

        <div className="template-card__details">
          <div>
            <h3>适用场景</h3>
            <p>{template.suitableFor.join('、')}</p>
          </div>
          <div>
            <h3>输出内容</h3>
            <p>生成标题、正文、标签和按需求动态组织的图片页面。</p>
          </div>
          <div>
            <h3>参考图片</h3>
            <p>{template.referenceAdvice}</p>
          </div>
        </div>

        <p className="template-card__compact-summary">
          动态组织图片页面，可选上传参考图
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
