import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import client from '../api/client';

type AuthContextType = {
    token: string | null;
    user: any;
    login: (username: string, password: string) => Promise<{ success: boolean; pending?: boolean; error?: string }>;
    register: (username: string, password: string) => Promise<{ success: boolean; pending?: boolean; error?: string }>;
    logout: () => void;
    loading: boolean;
};

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [token, setToken] = useState<string | null>(localStorage.getItem('dashboard_token'));
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token) {
            client.get('/auth/me')
                .then(res => setUser(res.data.user))
                .catch(() => {
                    localStorage.removeItem('dashboard_token');
                    setToken(null);
                    setUser(null);
                })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [token]);

    const login = async (username: string, password: string) => {
        try {
            const { data } = await client.post('/auth/login', { username, password });
            if (data.pending) {
                return { success: false, pending: true };
            }
            localStorage.setItem('dashboard_token', data.token);
            setToken(data.token);
            setUser(data.user);
            return { success: true };
        } catch (err: any) {
            const message = err.response?.data?.error || 'Login failed';
            const isPending = message.includes('ожидает') || message.includes('pending');
            return { success: false, pending: isPending, error: message };
        }
    };

    const register = async (username: string, password: string) => {
        try {
            const { data } = await client.post('/auth/register', { username, password });
            if (data.pending) {
                return { success: true, pending: true };
            }
            // Legacy fallback if token is returned
            if (data.token) {
                localStorage.setItem('dashboard_token', data.token);
                setToken(data.token);
                setUser(data.user);
            }
            return { success: true };
        } catch (err: any) {
            const message = err.response?.data?.error || 'Registration failed';
            return { success: false, error: message };
        }
    };

    const logout = () => {
        localStorage.removeItem('dashboard_token');
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ token, user, login, register, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
};
