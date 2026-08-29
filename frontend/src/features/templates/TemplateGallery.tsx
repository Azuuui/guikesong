import {TEMPLATE_CONFIGS, type TemplateConfig} from '../../config/templates';
import {TemplateCard} from './TemplateCard';

type TemplateGalleryProps = {
  compact?: boolean;
  templates?: readonly TemplateConfig[];
};

export function TemplateGallery({compact = false, templates = TEMPLATE_CONFIGS}: TemplateGalleryProps) {
  return (
    <div className={`template-gallery${compact ? ' template-gallery--compact' : ''}`}>
      {templates.map(template => (
        <TemplateCard compact={compact} key={template.id} template={template} />
      ))}
    </div>
  );
}
