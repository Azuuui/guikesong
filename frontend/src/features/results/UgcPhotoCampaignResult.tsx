import type {UgcPhotoCampaignResult} from '../../../../shared/types';
import {CopyButton} from './ResultDetail';

/** 游客返图文案面板：3 个候选标题、共同情绪、正文与标签。 */
export function UgcPhotoCampaignResultPanel({result}: {result: UgcPhotoCampaignResult}) {
  const {copy, mood, campaignTheme} = result;
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
      {campaignTheme ? (
        <section>
          <div className="result-detail__copy-heading">
            <h2>活动主题</h2>
          </div>
          <p className="result-detail__copy-title">{campaignTheme}</p>
        </section>
      ) : null}
      <section>
        <div className="result-detail__copy-heading">
          <h2>共同情绪</h2>
          <CopyButton label="共同情绪" value={mood} />
        </div>
        <p className="result-detail__copy-body">{mood}</p>
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
