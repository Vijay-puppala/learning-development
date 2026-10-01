/**
 * Entry point for the single-file artifact build.
 *
 * Differs from main.tsx in one way: it uses a memory router. An artifact is
 * served from a single URL that cannot carry a path, and only a bare #anchor
 * survives the viewer, so routing is kept entirely in memory. Navigation
 * happens through the in-page links (breadcrumb, pager, cards) instead of the
 * browser's back button.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { PatternPage } from './pages/PatternPage';
import { SchemaPage } from './pages/SchemaPage';
import { NotFoundPage } from './pages/NotFoundPage';
import './styles.css';

const router = createMemoryRouter(
  [
    {
      path: '/',
      element: <Layout />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'pattern/:slug', element: <PatternPage /> },
        { path: 'schema', element: <SchemaPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { initialEntries: ['/'] },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
