import {ClockCounterClockwise} from '@phosphor-icons/react';
import {Link,NavLink,useLocation} from 'react-router-dom';
import {BRAND} from '../../config/brand';
import '../../styles/product-top-navigation.css';

function tabClassName({isActive}:{isActive:boolean}):string{
  return `product-top-navigation__tab${isActive?' product-top-navigation__tab--active':''}`;
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
      </Link>
    </header>
  );
}
