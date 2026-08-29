import type {TemplateConfig} from '../../config/templates';

type TemplatePreviewProps={
  variant:TemplateConfig['previewVariant'];
  imageUrl:string;
  name:string;
  description:string;
};

export function TemplatePreview({variant,imageUrl,name,description}:TemplatePreviewProps){
  return (
    <div className={`template-preview template-preview--${variant}`}>
      <img alt={`${name}模板预览：${description}`} className="template-preview__image" src={imageUrl} />
    </div>
  );
}
