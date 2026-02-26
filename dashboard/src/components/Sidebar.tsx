import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Ticket, Keyboard, Clock, ScrollText, LogOut, Settings, Bot, TicketX, X, User, Brain, ShieldCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const navItems = [
    { to: '/tickets', icon: Ticket, label: 'Тикеты' },
    { to: '/analytics', icon: LayoutDashboard, label: 'Аналитика' },
    { to: '/binds', icon: Keyboard, label: 'Биндлы' },
    { to: '/shifts', icon: Clock, label: 'Смены' },
    { to: '/logs', icon: ScrollText, label: 'Логи' },
    { to: '/closed-tickets', icon: TicketX, label: 'Архив' },
    { to: '/autoreplies', icon: Bot, label: 'Авто-ответы' },
    { to: '/ai-learning', icon: Brain, label: 'Обучение ИИ' },
    { to: '/profile', icon: User, label: 'Профиль' },
    { to: '/settings', icon: Settings, label: 'Настройки' },
];

export default function Sidebar() {
    const { logout, user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.id === 1;
    const [mobileOpen, setMobileOpen] = useState(false);

    // Listen for hamburger toggle from Topbar
    useEffect(() => {
        const handler = () => setMobileOpen(prev => !prev);
        window.addEventListener('toggle-sidebar', handler);
        return () => window.removeEventListener('toggle-sidebar', handler);
    }, []);

    // Close on route change
    useEffect(() => {
        setMobileOpen(false);
    }, []);

    const sidebarContent = (
        <>
            <div className="flex items-center justify-between px-2 mb-8 mt-2">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl">T</div>
                    <h1 className="text-2xl font-rajdhani font-bold tracking-wider uppercase text-foreground">Notifier</h1>
                </div>
                <button onClick={() => setMobileOpen(false)} className="md:hidden p-1.5 hover:bg-secondary rounded-lg transition-colors text-muted-foreground">
                    <X className="w-5 h-5" />
                </button>
            </div>

            <nav className="flex-1 space-y-1 relative">
                {navItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileOpen(false)}
                        className={({ isActive }) =>
                            cn(
                                'flex items-center gap-3 px-3 py-3 rounded-md transition-colors relative group font-medium',
                                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                            )
                        }
                    >
                        {({ isActive }) => (
                            <>
                                {isActive && (
                                    <motion.div
                                        layoutId="sidebar-active"
                                        className="absolute inset-0 bg-primary/10 border-l-2 border-primary rounded-r-md"
                                        initial={false}
                                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                    />
                                )}
                                <item.icon className={cn('w-5 h-5 relative z-10', isActive && 'text-primary')} />
                                <span className="relative z-10">{item.label}</span>
                            </>
                        )}
                    </NavLink>
                ))}

                {isAdmin && (
                    <NavLink
                        to="/admin"
                        onClick={() => setMobileOpen(false)}
                        className={({ isActive }) =>
                            cn(
                                'flex items-center gap-3 px-3 py-3 rounded-md transition-colors relative group font-medium',
                                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                            )
                        }
                    >
                        {({ isActive }) => (
                            <>
                                {isActive && (
                                    <motion.div
                                        layoutId="sidebar-active"
                                        className="absolute inset-0 bg-purple-500/10 border-l-2 border-purple-500 rounded-r-md"
                                        initial={false}
                                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                    />
                                )}
                                <ShieldCheck className={cn('w-5 h-5 relative z-10', isActive ? 'text-purple-400' : '')} />
                                <span className="relative z-10">Администрирование</span>
                            </>
                        )}
                    </NavLink>
                )}
            </nav>

            <button
                onClick={logout}
                className="flex items-center gap-3 px-3 py-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors font-medium mt-auto"
            >
                <LogOut className="w-5 h-5" />
                <span>Выйти</span>
            </button>
        </>
    );

    return (
        <>
            {/* Desktop sidebar */}
            <aside className="hidden md:flex w-64 h-screen bg-card border-r border-border flex-col p-4 fixed left-0 top-0 z-50">
                {sidebarContent}
            </aside>

            {/* Mobile sidebar overlay */}
            <AnimatePresence>
                {mobileOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setMobileOpen(false)}
                            className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
                        />
                        <motion.aside
                            initial={{ x: -280 }}
                            animate={{ x: 0 }}
                            exit={{ x: -280 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            className="md:hidden fixed left-0 top-0 w-72 h-screen bg-card border-r border-border flex flex-col p-4 z-[70]"
                        >
                            {sidebarContent}
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
