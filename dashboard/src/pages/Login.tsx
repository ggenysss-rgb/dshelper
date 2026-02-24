import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { motion } from 'framer-motion';
import { Lock, ArrowRight, User } from 'lucide-react';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        const success = await login(username, password);
        if (success) {
            navigate('/tickets');
        } else {
            setError('Неверный логин или пароль');
        }
        setIsLoading(false);
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute inset-0 z-0 opacity-20 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/40 via-background to-background"></div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md bg-card/80 backdrop-blur-xl border border-border rounded-2xl p-8 relative z-10 shadow-2xl"
            >
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mb-4 text-primary">
                        <Lock className="w-8 h-8" />
                    </div>
                    <h1 className="text-3xl font-rajdhani font-bold text-foreground tracking-wide uppercase">Notifier</h1>
                    <p className="text-muted-foreground mt-2">Войти в панель управления</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Имя пользователя"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-secondary/50 border border-border text-foreground pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                        />
                    </div>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="password"
                            placeholder="Пароль"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-secondary/50 border border-border text-foreground pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                        />
                    </div>
                    {error && <p className="text-destructive text-sm font-medium">{error}</p>}

                    <button
                        type="submit"
                        disabled={isLoading || !username || !password}
                        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                        {isLoading ? 'Вход...' : 'Войти'}
                        {!isLoading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <p className="text-muted-foreground text-sm">
                        Нет аккаунта?{' '}
                        <Link to="/register" className="text-primary hover:text-primary/80 font-medium transition-colors">
                            Зарегистрироваться
                        </Link>
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
