import type {OriginalIpResult} from '../../../../shared/types';
import {CopyButton} from './ResultDetail';

/** 原创 IP 文案面板：单标题、正文、标签。 */
export function OriginalIpResultPanel({result}: {result: OriginalIpResult}) {
  const {copy} = result;
  return (
    <aside aria-label="生成文案" className="result-detail__copy">
      <section>
        <div className="result-detail__copy-heading">
          <h2>标题</h2>
          <CopyButton label="标题" value={copy.title} />
        </div>
        <p className="result-detail__copy-title">{copy.title}</p>
      </section>
      <section>
        <div className="result-detail__copy-heading">
          <h2>正文</h2>
          <CopyButton label="正文" value={copy.body} />
        </div>
        <p className="result-detail__copy-body">{copy.body}</p>
      </section>
      <section>
        <div className="result-detail__copy-heading">
          <h2>标签</h2>
          <CopyButton label="标签" value={copy.tags.join(' ')} />
        </div>
        <div className="result-detail__tags">
          {copy.tags.map((tag, index) => (
            <span className="result-detail__tag" key={`${tag}-${index}`}>{tag}</span>
          ))}
        </div>
      </section>
    </aside>
  );
}
