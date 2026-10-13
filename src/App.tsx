import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';
import { flushOutbox, load, openIdeaCapture, useStore } from './store';
import { lastUserId } from './lib/outbox';
import { Layout, Wordmark } from './components/Layout';
import { IdeaCaptureHost } from './components/IdeaCapture';
import { Toasts } from './components/ui';
import { TodayPage } from './pages/Today';
import { UpcomingPage } from './pages/Upcoming';
import { InboxPage } from './pages/Inbox';
import { IdeasPage } from './pages/Ideas';
import { ProjectsPage } from './pages/Projects';
import { ProjectPage } from './pages/ProjectPage';
import { CalendarPage } from './pages/Calendar';
import { DailyPage } from './pages/Daily';
import { StatsPage } from './pages/Stats';
import { SettingsPage } from './pages/Settings';
import { LoginPage } from './pages/Login';

export function App() {
  const status = useStore((s) => s.status);

  useEffect(() => {
    void load();
    // Pick up changes from other devices when the tab comes back, and upload ideas saved offline.
    let hiddenAt = 0;
    const onVisible = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      flushOutbox();
      if (hiddenAt && Date.now() - hiddenAt > 60_000 && useStore.getState().status === 'ready') void load();
    };
    const onOnline = () => {
      flushOutbox();
      if (useStore.getState().status === 'error') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  if (status === 'loading') return <div className="splash"><Wordmark /></div>;
  if (status === 'anon') return <LoginPage />;

  return (
    <>
      {status === 'error' ? (
        <>
          <div className="splash">
            <div className="stack" style={{ justifyItems: 'center', textAlign: 'center' }}>
              <Wordmark />
              <p className="muted">تعذّر الوصول للخادم. تأكد من الاتصال.</p>
              <button className="btn btn-primary" onClick={() => { useStore.setState({ status: 'loading' }); void load(); }}>إعادة المحاولة</button>
              {lastUserId() && <button className="btn btn-soft" onClick={() => openIdeaCapture()}><Lightbulb />سجّل فكرة</button>}
            </div>
          </div>
          <Toasts />
        </>
      ) : (
        <Layout>
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/upcoming" element={<UpcomingPage />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/ideas" element={<IdeasPage />} />
            <Route path="/ideas/share" element={<IdeasPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/daily" element={<DailyPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      )}
      {/* One host for both screens, so a sheet opened offline stays open (text, session) when the app comes back. */}
      <IdeaCaptureHost />
    </>
  );
}
