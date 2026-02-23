import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import client from '../api/client';

type AuthContextType = {
    token: string | null;
    user: any;
    login: (password: string) => Promise<boolean>;
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
            client.get('/auth')
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

    const login = async (password: string) => {
        try {
            const { data } = await client.post('/auth', { password });
            localStorage.setItem('dashboard_token', data.token);
            setToken(data.token);
            return true;
        } catch {
            return false;
        }
    };

    const logout = () => {
        localStorage.removeItem('dashboard_token');
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value= {{ token, user, login, logout, loading }
}>
    { children }
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
};
