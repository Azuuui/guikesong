import {TEMPLATE_CONFIGS, type TemplateConfig} from '../../config/templates';
import {TemplateCard} from './TemplateCard';

type TemplateGalleryProps = {
  compact?: boolean;
  headingLevel?: 2 | 3;
  templates?: readonly TemplateConfig[];
};

export function TemplateGallery({
  compact = false,
  headingLevel = 2,
  templates = TEMPLATE_CONFIGS,
}: TemplateGalleryProps) {
  return (
    <div className={`template-gallery${compact ? ' template-gallery--compact' : ''}`}>
      {templates.map(template => (
        <TemplateCard
          compact={compact}
          headingLevel={headingLevel}
          key={template.id}
          template={template}
        />
      ))}
    </div>
  );
}
