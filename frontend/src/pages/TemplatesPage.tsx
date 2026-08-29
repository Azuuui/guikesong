import {TemplateGallery} from '../features/templates/TemplateGallery';

export function TemplatesPage() {
  return (
    <section aria-labelledby="templates-title" className="templates-page">
      <header className="page-header page-header--stacked">
        <div>
          <h1 id="templates-title">选择一个模板开始创作</h1>
          <p>根据本次传播目标选择模板，下一步只需输入一句话需求，并可添加参考图片。</p>
        </div>
      </header>

      <TemplateGallery />
    </section>
  );
}
