import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';

import DashboardLayout from './components/DashboardLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';
import Tickets from './pages/Tickets';
import TicketDetail from './pages/TicketDetail';
import Analytics from './pages/Analytics';
import Binds from './pages/Binds';
import Shifts from './pages/Shifts';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import AutoReplies from './pages/AutoReplies';
import ClosedTickets from './pages/ClosedTickets';

export default function App() {
    const { token, loading } = useAuth();

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
    }

    return (
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
                    <Route path="/profile" element={<Profile />} />
                    <Route path="*" element={<Navigate to="/tickets" replace />} />
                </Route>
            )}
        </Routes>
    );
}
