import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ToastProvider } from './toast/ToastContext';
import { Layout } from './components/Layout';
import { AuthPage } from './pages/AuthPage';
import { QuizListPage } from './pages/QuizListPage';
import { QuizGeneratePage } from './pages/QuizGeneratePage';
import { QuizEditorPage } from './pages/QuizEditorPage';
import { QuizStatsPage } from './pages/QuizStatsPage';
import { SessionDetailsPage } from './pages/SessionDetailsPage';
import { QuizPrintPage } from './pages/QuizPrintPage';
import { PlayerPage } from './pages/PlayerPage';
import { GroupJoinPage } from './pages/GroupJoinPage'; // ← ДОБАВИТЬ ЭТУ СТРОКУ
import { PageSpinner } from './components/Spinner';

function Private({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <PageSpinner />;
  return user ? children : <Navigate to="/auth" replace />;
}

function PlayerShell() {
  return (
    <div className="container-app py-8">
      <PlayerPage />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/play/:token" element={<PlayerShell />} />
            <Route path="/group/:accessCode" element={<GroupJoinPage />} /> {/* ← ДОБАВИТЬ ЭТУ СТРОКУ */}

            <Route
              path="/*"
              element={
                <Private>
                  <Layout>
                    <Routes>
                      <Route path="/" element={<QuizListPage />} />
                      <Route path="/generate" element={<QuizGeneratePage />} />
                      <Route path="/quizzes/:id" element={<QuizEditorPage />} />
                      <Route path="/quizzes/:id/stats" element={<QuizStatsPage />} />
                      <Route path="/quizzes/:id/sessions/:sessionId" element={<SessionDetailsPage />} />
                      <Route path="/quizzes/:id/print" element={<QuizPrintPage />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </Layout>
                </Private>
              }
            />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}