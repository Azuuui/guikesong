import {ClockCounterClockwise} from '@phosphor-icons/react';
import {Link,NavLink,useLocation} from 'react-router-dom';
import {BRAND} from '../../config/brand';
import {useGenerationJob} from '../generation/GenerationJobProvider';
import '../../styles/product-top-navigation.css';

function tabClassName({isActive}:{isActive:boolean}):string{
  return `product-top-navigation__tab${isActive?' product-top-navigation__tab--active':''}`;
}

/** 历史图标旁的生成状态圆点：运行中脉冲，完成且未查看时常亮，查看后消失。 */
function GenerationJobIndicator(){
  const {activeJob,resultViewed}=useGenerationJob();
  if(!activeJob) return null;

  const terminal=activeJob.status==='succeeded'||activeJob.status==='partial'||activeJob.status==='failed';
  if(terminal&&resultViewed) return null;

  const state=activeJob.status==='failed'?'failed':terminal?'complete':'running';
  return (
    <span
      className={`product-top-navigation__job-dot product-top-navigation__job-dot--${state}`}
      data-state={state}
      data-testid="generation-job-indicator"
    >
      <span className="product-top-navigation__job-dot-text">
        {state==='running'?'素材正在生成':state==='failed'?'素材生成失败':'素材生成完成'}
      </span>
    </span>
  );
}

export function ProductTopNavigation(){
  const {pathname}=useLocation();
  const historyActive=pathname==='/history'||pathname.startsWith('/history/');

  return (
    <header className="product-top-navigation">
      <Link aria-label={`${BRAND.nameZh}，返回主页`} className="product-top-navigation__brand" to="/">
        <img alt="" className="product-top-navigation__logo" src={BRAND.logoUrl} />
        <span className="product-top-navigation__brand-copy">
          <strong>{BRAND.nameZh}</strong>
          <small>{BRAND.nameEn}</small>
        </span>
      </Link>

      <nav aria-label="主导航" className="product-top-navigation__tabs">
        <NavLink className={tabClassName} end to="/">主页</NavLink>
        <NavLink className={tabClassName} to="/templates">全部模板</NavLink>
      </nav>

      <Link
        aria-current={historyActive?'page':undefined}
        aria-label="历史记录"
        className={`product-top-navigation__history${historyActive?' product-top-navigation__history--active':''}`}
        title="历史记录"
        to="/history"
      >
        <ClockCounterClockwise aria-hidden="true" size={20} weight="bold" />
        <GenerationJobIndicator />
      </Link>
    </header>
  );
}
