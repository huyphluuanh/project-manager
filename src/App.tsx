import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ConfirmProvider, ToastProvider } from './components/feedback';
import { Spinner } from './components/ui';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { UIProvider } from './hooks/useUI';
import { useWorkspace, WorkspaceProvider } from './hooks/useWorkspace';
import { supabaseConfigured } from './lib/supabase';
import { applyTheme } from './lib/theme';
import { AuthPage, UpdatePasswordPage } from './pages/AuthPage';
import { MyDay } from './pages/MyDay';
import { Tasks } from './pages/Tasks';
import { Projects } from './pages/Projects';
import { ErrorBoundary } from './components/ErrorBoundary';

// Trang nặng (biểu đồ, xuất file) chỉ tải khi mở
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })));
const Calendar = lazy(() => import('./pages/Calendar').then((m) => ({ default: m.Calendar })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail').then((m) => ({ default: m.ProjectDetail })));
const Notifications = lazy(() => import('./pages/Notifications').then((m) => ({ default: m.Notifications })));
const Archive = lazy(() => import('./pages/Archive').then((m) => ({ default: m.Archive })));

function Page({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="flex justify-center p-10"><Spinner className="size-6" /></div>}>{children}</Suspense>
    </ErrorBoundary>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <Root />
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

function Root() {
  const { loading, session, recovery } = useAuth();

  if (!supabaseConfigured) {
    return (
      <div className="mx-auto max-w-lg p-8 text-sm">
        <h1 className="mb-2 text-lg font-semibold">Chưa cấu hình Supabase</h1>
        <p>Tạo file <code>.env.local</code> với <code>VITE_SUPABASE_URL</code> và <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> rồi chạy lại (xem docs/SETUP.md).</p>
      </div>
    );
  }
  if (loading) return <div className="flex h-full items-center justify-center"><Spinner className="size-8" /></div>;
  if (recovery && session) return <UpdatePasswordPage />;
  if (!session) return <AuthPage />;

  return (
    <WorkspaceProvider userId={session.user.id}>
      <ThemeSync />
      <UIProvider>
        <HashRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Page><Dashboard /></Page>} />
              <Route path="my-day" element={<Page><MyDay /></Page>} />
              <Route path="tasks" element={<Page><Tasks /></Page>} />
              <Route path="projects" element={<Page><Projects /></Page>} />
              <Route path="projects/:id" element={<Page><ProjectDetail /></Page>} />
              <Route path="calendar" element={<Page><Calendar /></Page>} />
              <Route path="reports" element={<Page><Reports /></Page>} />
              <Route path="notifications" element={<Page><Notifications /></Page>} />
              <Route path="archive" element={<Page><Archive /></Page>} />
              <Route path="settings" element={<Page><Settings /></Page>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </UIProvider>
    </WorkspaceProvider>
  );
}

/** Theme lưu trên server -> đồng bộ giữa các thiết bị */
function ThemeSync() {
  const ws = useWorkspace();
  useEffect(() => {
    if (ws.loaded) applyTheme(ws.theme);
  }, [ws.loaded, ws.theme]);
  return null;
}
