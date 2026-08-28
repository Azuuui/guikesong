import {
  ClockCounterClockwise,
  Compass,
  House,
  List,
  SquaresFour,
  X,
} from '@phosphor-icons/react';
import {useEffect, useRef, useState} from 'react';
import {NavLink, Outlet, useLocation} from 'react-router-dom';
import {Button} from '../components/Button';

const NAV_ITEMS = [
  {to: '/', label: '工作台', icon: House, end: true},
  {to: '/templates', label: '模板中心', icon: SquaresFour, end: false},
  {to: '/history', label: '历史记录', icon: ClockCounterClockwise, end: false},
] as const;

function Navigation({label, onNavigate}: {label: string; onNavigate?: () => void}) {
  return (
    <nav aria-label={label} className="app-shell__navigation">
      {NAV_ITEMS.map(({to, label: itemLabel, icon: Icon, end}) => (
        <NavLink
          className={({isActive}) =>
            `app-shell__nav-link${isActive ? ' app-shell__nav-link--active' : ''}`
          }
          end={end}
          key={to}
          onClick={onNavigate}
          title={itemLabel}
          to={to}
        >
          <Icon aria-hidden="true" size={22} weight="bold" />
          <span className="app-shell__nav-label">{itemLabel}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function getCurrentPageTitle(pathname: string) {
  if (pathname.startsWith('/templates/')) return '模板创建';
  if (pathname.startsWith('/templates')) return '模板中心';
  if (pathname.startsWith('/results/')) return '生成结果';
  if (pathname.startsWith('/history/')) return '历史详情';
  if (pathname.startsWith('/history')) return '历史记录';
  return '工作台';
}

export function AppShell() {
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const drawerCloseButtonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const pageTitle = getCurrentPageTitle(location.pathname);
  const providerMode = (
    import.meta as ImportMeta & {env?: {VITE_PROVIDER_MODE?: string}}
  ).env?.VITE_PROVIDER_MODE;
  const runtimeMode = providerMode === 'real' ? '真实模型' : 'Mock 模式';

  useEffect(() => {
    setIsMobileNavigationOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileNavigationOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    queueMicrotask(() => drawerCloseButtonRef.current?.focus());

    function handleDrawerKeyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMobileNavigationOpen(false);
        queueMicrotask(() => menuButtonRef.current?.focus());
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableElements = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const firstElement = focusableElements.at(0);
      const lastElement = focusableElements.at(-1);

      if (!firstElement || !lastElement) return;
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener('keydown', handleDrawerKeyboard);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleDrawerKeyboard);
    };
  }, [isMobileNavigationOpen]);

  function closeMobileNavigation({restoreFocus = false} = {}) {
    setIsMobileNavigationOpen(false);
    if (restoreFocus) queueMicrotask(() => menuButtonRef.current?.focus());
  }

  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <div className="app-shell__brand">
          <Compass aria-hidden="true" size={26} weight="duotone" />
          <span>文旅素材工作台</span>
        </div>
        <Navigation label="桌面主导航" />
        <div className="app-shell__sidebar-meta">
          <span className="app-shell__runtime-dot" aria-hidden="true" />
          <div>
            <strong>{runtimeMode}</strong>
            <span>记录保存在本机</span>
          </div>
        </div>
      </aside>

      <header className="app-shell__mobile-header">
        <Button
          aria-expanded={isMobileNavigationOpen}
          aria-label="打开导航"
          className="app-shell__menu-button"
          onClick={() => setIsMobileNavigationOpen(true)}
          ref={menuButtonRef}
          variant="ghost"
        >
          <List aria-hidden="true" size={24} weight="bold" />
        </Button>
        <strong>{pageTitle}</strong>
        <span aria-hidden="true" className="app-shell__mobile-header-spacer" />
      </header>

      {isMobileNavigationOpen ? (
        <>
          <button
            aria-label="关闭导航"
            className="app-shell__drawer-backdrop"
            onClick={() => closeMobileNavigation({restoreFocus: true})}
            type="button"
          />
          <aside
            aria-label="移动导航抽屉"
            aria-modal="true"
            className="app-shell__drawer"
            ref={drawerRef}
            role="dialog"
          >
            <div className="app-shell__drawer-header">
              <div className="app-shell__brand">
                <Compass aria-hidden="true" size={26} weight="duotone" />
                <span>文旅素材工作台</span>
              </div>
              <Button
                aria-label="关闭导航"
                className="app-shell__drawer-close"
                onClick={() => closeMobileNavigation({restoreFocus: true})}
                ref={drawerCloseButtonRef}
                variant="ghost"
              >
                <X aria-hidden="true" size={22} weight="bold" />
              </Button>
            </div>
            <Navigation
              label="移动主导航"
              onNavigate={() => closeMobileNavigation({restoreFocus: true})}
            />
            <div className="app-shell__sidebar-meta">
              <span className="app-shell__runtime-dot" aria-hidden="true" />
              <div>
                <strong>{runtimeMode}</strong>
                <span>记录保存在本机</span>
              </div>
            </div>
          </aside>
        </>
      ) : null}

      <main className="app-shell__main">
        <div className="app-shell__content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
