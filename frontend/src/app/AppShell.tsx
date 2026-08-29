import {useEffect} from 'react';
import {Outlet,useLocation} from 'react-router-dom';
import {ProductTopNavigation} from '../features/navigation/ProductTopNavigation';

function RouteScrollManager(){
  const {hash,pathname}=useLocation();

  useEffect(()=>{
    if(hash){
      const frame=window.requestAnimationFrame(()=>{
        const target=document.getElementById(decodeURIComponent(hash.slice(1)));
        target?.scrollIntoView?.({block:'center'});
      });
      return ()=>window.cancelAnimationFrame(frame);
    }
    document.documentElement.scrollTop=0;
    document.body.scrollTop=0;
  },[hash,pathname]);

  return null;
}

export function AppShell(){
  return (
    <div className="app-shell">
      <RouteScrollManager />
      <ProductTopNavigation />
      <main className="app-shell__main">
        <div className="app-shell__content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
