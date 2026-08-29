import type {XhsAtlasResult} from '../../../../shared/types';
import {CopyButton} from './ResultDetail';

/** 图鉴文案面板：3 个候选标题、正文、标签与完整清单。 */
export function XhsAtlasResultPanel({result}: {result: XhsAtlasResult}) {
  const {copy, list} = result;
  return (
    <aside aria-label="生成文案" className="result-detail__copy">
      <section>
        <div className="result-detail__copy-heading">
          <h2>候选标题</h2>
        </div>
        <ul className="result-detail__title-candidates">
          {copy.titles.map((title, index) => (
            <li className="result-detail__title-candidate" key={`${title}-${index}`}>
              <p className="result-detail__copy-title">{title}</p>
              <CopyButton label={`候选标题 ${index + 1}`} value={title} />
            </li>
          ))}
        </ul>
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
      <section>
        <div className="result-detail__copy-heading">
          <h2>清单</h2>
        </div>
        <p className="result-detail__list-summary">
          {list.meta.userTitle} · 共{list.meta.count}{list.meta.measureWord} · {list.meta.domainType} · {list.meta.orgDimension}
        </p>
        <ol className="result-detail__list-items">
          {list.items.map(item => (
            <li className="result-detail__list-item" key={item.no}>
              <div className="result-detail__list-item-head">
                <strong>{item.no} {item.name}</strong>
                <span className="result-detail__list-item-tag">{item.tag}</span>
              </div>
              <p>{list.meta.fieldLabels[0]}：{item.line1}</p>
              <p>{list.meta.fieldLabels[1]}：{item.line2}</p>
              <p className="result-detail__list-punch">{item.punch}</p>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}
