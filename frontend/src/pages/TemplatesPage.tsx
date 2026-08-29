import {TemplateGallery} from '../features/templates/TemplateGallery';

export function TemplatesPage() {
  return (
    <section aria-labelledby="templates-title" className="templates-page">
      <header className="page-header page-header--stacked">
        <div>
          <p className="templates-page__eyebrow">QIANSCAPE AI TEMPLATE LIBRARY</p>
          <h1 id="templates-title">全部模板</h1>
          <p>根据本次表达目标选择工作流。使用模板会回到主页，并保留一句话生成入口。</p>
        </div>
      </header>

      <TemplateGallery />
    </section>
  );
}
