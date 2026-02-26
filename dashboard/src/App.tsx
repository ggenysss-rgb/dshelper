import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';

const DashboardLayout = lazy(() => import('./components/DashboardLayout'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Profile = lazy(() => import('./pages/Profile'));
const Tickets = lazy(() => import('./pages/Tickets'));
const TicketDetail = lazy(() => import('./pages/TicketDetail'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Binds = lazy(() => import('./pages/Binds'));
const Shifts = lazy(() => import('./pages/Shifts'));
const Logs = lazy(() => import('./pages/Logs'));
const Settings = lazy(() => import('./pages/Settings'));
const AutoReplies = lazy(() => import('./pages/AutoReplies'));
const ClosedTickets = lazy(() => import('./pages/ClosedTickets'));
const ConversationLog = lazy(() => import('./pages/ConversationLog'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));

export default function App() {
    const { token, loading } = useAuth();

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
    }

    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Загрузка интерфейса...</div>}>
            <Routes>
                {!token ? (
                    <>
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        <Route path="*" element={<Navigate to="/login" replace />} />
                    </>
                ) : (
                    <Route element={<DashboardLayout />}>
                        <Route path="/" element={<Navigate to="/tickets" replace />} />
                        <Route path="/tickets" element={<Tickets />} />
                        <Route path="/tickets/:id" element={<TicketDetail />} />
                        <Route path="/analytics" element={<Analytics />} />
                        <Route path="/binds" element={<Binds />} />
                        <Route path="/shifts" element={<Shifts />} />
                        <Route path="/logs" element={<Logs />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/autoreplies" element={<AutoReplies />} />
                        <Route path="/closed-tickets" element={<ClosedTickets />} />
                        <Route path="/ai-learning" element={<ConversationLog />} />
                        <Route path="/admin" element={<AdminPanel />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="*" element={<Navigate to="/tickets" replace />} />
                    </Route>
                )}
            </Routes>
        </Suspense>
    );
}
