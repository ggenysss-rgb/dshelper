import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Ticket, Keyboard, Clock, ScrollText, LogOut } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';

const navItems = [
    { to: '/tickets', icon: Ticket, label: 'Тикеты' },
    { to: '/analytics', icon: LayoutDashboard, label: 'Аналитика' },
    { to: '/binds', icon: Keyboard, label: 'Биндлы' },
    { to: '/shifts', icon: Clock, label: 'Смены' },
    { to: '/logs', icon: ScrollText, label: 'Логи' },
];

export default function Sidebar() {
    const { logout } = useAuth();

    return (
        <aside className="w-64 h-screen bg-card border-r border-border flex flex-col p-4 fixed left-0 top-0 z-50">
            <div className="flex items-center gap-3 px-2 mb-8 mt-2">
                <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl">T</div>
                <h1 className="text-2xl font-rajdhani font-bold tracking-wider uppercase text-foreground">Notifier</h1>
            </div>

            <nav className="flex-1 space-y-1 relative">
                {navItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
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
            </nav>

            <button
                onClick={logout}
                className="flex items-center gap-3 px-3 py-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors font-medium mt-auto"
            >
                <LogOut className="w-5 h-5" />
                <span>Выйти</span>
            </button>
        </aside>
    );
}
