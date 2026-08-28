import {RouterProvider} from 'react-router-dom';
import {createRoot} from 'react-dom/client';
import {appRouter} from './app/AppRouter';
import './styles/tokens.css';
import './styles/global.css';
import './styles/shell.css';
import './styles/pages.css';

createRoot(document.getElementById('root')!).render(<RouterProvider router={appRouter} />);
