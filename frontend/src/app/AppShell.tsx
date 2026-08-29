import {Outlet} from 'react-router-dom';
import {ProductTopNavigation} from '../features/navigation/ProductTopNavigation';

export function AppShell(){
  return (
    <div className="app-shell">
      <ProductTopNavigation />
      <main className="app-shell__main">
        <div className="app-shell__content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
