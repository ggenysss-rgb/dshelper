import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { motion } from 'framer-motion';
import { UserPlus, ArrowRight, User, Lock, Clock } from 'lucide-react';

export default function Register() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isPending, setIsPending] = useState(false);
    const { register } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Пароли не совпадают');
            return;
        }
        if (password.length < 4) {
            setError('Пароль должен быть не менее 4 символов');
            return;
        }
        if (username.length < 3) {
            setError('Имя пользователя — минимум 3 символа');
            return;
        }

        setIsLoading(true);
        const result = await register(username, password);
        if (result.success && result.pending) {
            setIsPending(true);
        } else if (result.success) {
            navigate('/profile');
        } else {
            setError(result.error || 'Ошибка регистрации');
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
                {isPending ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center gap-4 py-6 text-center"
                    >
                        <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center border border-yellow-500/30">
                            <Clock className="w-8 h-8 text-yellow-400" />
                        </div>
                        <h2 className="text-xl font-bold text-foreground">Заявка отправлена!</h2>
                        <p className="text-muted-foreground text-sm leading-relaxed">
                            Аккаунт <span className="text-foreground font-medium">{username}</span> создан и ожидает одобрения администратора.
                            Как только вас одобрят — вы сможете войти.
                        </p>
                        <Link to="/login" className="mt-2 text-primary text-sm hover:underline font-medium">
                            Перейти ко входу
                        </Link>
                    </motion.div>
                ) : (
                    <>
                        <div className="flex flex-col items-center mb-8">
                            <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mb-4 text-emerald-400">
                                <UserPlus className="w-8 h-8" />
                            </div>
                            <h1 className="text-3xl font-rajdhani font-bold text-foreground tracking-wide uppercase">Регистрация</h1>
                            <p className="text-muted-foreground mt-2">Создайте аккаунт для управления ботом</p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input
                                    type="text"
                                    placeholder="Имя пользователя"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full bg-secondary/50 border border-border text-foreground pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                                />
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input
                                    type="password"
                                    placeholder="Пароль"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-secondary/50 border border-border text-foreground pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                                />
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input
                                    type="password"
                                    placeholder="Подтвердите пароль"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full bg-secondary/50 border border-border text-foreground pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                                />
                            </div>
                            {error && <p className="text-destructive text-sm font-medium">{error}</p>}

                            <button
                                type="submit"
                                disabled={isLoading || !username || !password || !confirmPassword}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                            >
                                {isLoading ? 'Регистрация...' : 'Создать аккаунт'}
                                {!isLoading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                            </button>
                        </form>

                        <div className="mt-6 text-center">
                            <p className="text-muted-foreground text-sm">
                                Уже есть аккаунт?{' '}
                                <Link to="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
                                    Войти
                                </Link>
                            </p>
                        </div>
                    </>
                )}
            </motion.div>
        </div>
    );
}
