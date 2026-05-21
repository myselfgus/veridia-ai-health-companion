import '@/lib/errorReporter';
import { enableMapSet } from "immer";
enableMapSet();
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';
import '@/index.css'
import { HomePage } from '@/pages/HomePage'
import { MemoryPage } from '@/pages/MemoryPage'
import { CellPage } from '@/pages/CellPage'
import { PatientHomePage } from '@/pages/PatientHomePage'
const queryClient = new QueryClient();
const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <PatientHomePage />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: "/ops",
      element: <CellPage />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: "/companion",
      element: <HomePage />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: "/memory",
      element: <MemoryPage />,
      errorElement: <RouteErrorBoundary />,
    },
  ],
  {
    future: {
      v7_relativeSplatPath: true,
      v7_startTransition: true,
    },
  },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
)
