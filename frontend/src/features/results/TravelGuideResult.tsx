import type {TravelGuideResult} from '../../../../shared/types';
import {CopyButton} from './ResultDetail';

/** 手绘攻略文案面板：3 个候选标题、正文、标签与按天行程。 */
export function TravelGuideResultPanel({result}: {result: TravelGuideResult}) {
  const {copy, destination, days, trip} = result;
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
          <h2>行程概览</h2>
        </div>
        <p className="result-detail__list-summary">
          {destination} · {days} 天 · {trip.vibe}
        </p>
        <p className="result-detail__trip-note">{trip.tocNote}</p>
        <ol className="result-detail__list-items">
          {trip.dayPlans.map(plan => (
            <li className="result-detail__list-item" key={plan.day}>
              <div className="result-detail__list-item-head">
                <strong>第 {plan.day} 天 · {plan.theme}</strong>
                <span className="result-detail__list-item-tag">{plan.route.length} 站</span>
              </div>
              {plan.route.map(stop => (
                <p key={`${plan.day}-${stop.order}`}>{stop.order}. {stop.spot} · {stop.desc}</p>
              ))}
              <p className="result-detail__list-punch">{plan.slogan}</p>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <div className="result-detail__copy-heading">
          <h2>交通与住宿</h2>
        </div>
        <p className="result-detail__list-punch">{trip.transport.pitfall}</p>
        <p>{trip.stay.logic}</p>
      </section>
    </aside>
  );
}
