import type {TemplateConfig} from '../../config/templates';

type TemplatePreviewProps = {
  variant: TemplateConfig['previewVariant'];
  name: string;
  description: string;
};

/** 纯 CSS 模板预览视觉；不依赖旧四模板预览图资源。 */
export function TemplatePreview({variant, name, description}: TemplatePreviewProps) {
  return (
    <div
      aria-label={`${name}模板预览：${description}`}
      className={`template-preview template-preview--${variant}`}
      role="img"
    >
      {variant === 'original-ip' ? (
        <span aria-hidden="true" className="template-preview__ip-grid">
          <span className="template-preview__ip-cell template-preview__ip-cell--primary" />
          <span className="template-preview__ip-cell" />
          <span className="template-preview__ip-cell" />
          <span className="template-preview__ip-cell" />
        </span>
      ) : (
        <span aria-hidden="true" className="template-preview__atlas">
          <span className="template-preview__atlas-cover" />
          <span className="template-preview__atlas-rows">
            <span className="template-preview__atlas-row" />
            <span className="template-preview__atlas-row" />
            <span className="template-preview__atlas-row" />
          </span>
        </span>
      )}
      <span aria-hidden="true" className="template-preview__caption">{name}</span>
    </div>
  );
}
