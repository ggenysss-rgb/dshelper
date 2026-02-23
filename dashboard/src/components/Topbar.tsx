import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchStats, fetchProfiles } from '../api/stats';
import { Bell, User, Sun, Moon, ChevronDown, Check } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { motion, AnimatePresence } from 'framer-motion';

export default function Topbar() {
    const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 10000 });
    const { data: profiles } = useQuery({ queryKey: ['profiles'], queryFn: fetchProfiles });
    const { user } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [profileOpen, setProfileOpen] = useState(false);
    const [activeProfile, setActiveProfile] = useState<string | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const saved = localStorage.getItem('active_profile');
        if (saved) setActiveProfile(saved);
        else if (profiles && profiles.length > 0) setActiveProfile(profiles[0].id);
    }, [profiles]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setProfileOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const currentProfile = profiles?.find((p: any) => p.id === activeProfile) || profiles?.[0];

    const selectProfile = (id: string) => {
        setActiveProfile(id);
        localStorage.setItem('active_profile', id);
        setProfileOpen(false);
    };

    return (
        <header className="h-16 bg-background/80 backdrop-blur-md border-b border-border sticky top-0 z-40 px-6 flex items-center justify-between">
            <div className="flex items-center gap-6">
                <h2 className="text-xl font-rajdhani font-semibold text-muted-foreground tracking-wide">
                    Панель Управления
                </h2>
                {stats && (
                    <div className="flex items-center gap-4 text-sm font-medium">
                        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/50 text-secondary-foreground border border-border/50">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            Активных тикетов: <span className="text-foreground ml-1">{stats.activeTicketsCount}</span>
                        </span>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-3">
                {/* Theme toggle */}
                <button
                    onClick={toggleTheme}
                    className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-all hover:bg-secondary/80"
                    title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
                >
                    <motion.div
                        key={theme}
                        initial={{ rotate: -90, opacity: 0 }}
                        animate={{ rotate: 0, opacity: 1 }}
                        transition={{ duration: 0.2 }}
                    >
                        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    </motion.div>
                </button>

                <button className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors relative">
                    <Bell className="w-5 h-5" />
                    <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-primary border-2 border-secondary"></span>
                </button>

                {/* Profile area */}
                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={() => setProfileOpen(!profileOpen)}
                        className="flex items-center gap-3 pl-4 border-l border-border hover:bg-secondary/30 rounded-r-lg pr-3 py-1.5 transition-colors cursor-pointer"
                    >
                        <div className="text-right flex flex-col justify-center">
                            <span className="text-sm font-medium leading-none">
                                {currentProfile?.name || 'Профиль'}
                            </span>
                            <span className="text-xs text-muted-foreground mt-1">
                                {user?.role === 'admin' ? 'Администратор' : 'Модератор'}
                            </span>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                            <User className="w-5 h-5 relative" />
                        </div>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                        {profileOpen && profiles && (
                            <motion.div
                                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                                transition={{ duration: 0.15 }}
                                className="absolute right-0 top-full mt-2 w-56 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50"
                            >
                                <div className="px-3 py-2 border-b border-border">
                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Профили
                                    </span>
                                </div>
                                {profiles.map((p: any) => (
                                    <button
                                        key={p.id}
                                        onClick={() => selectProfile(p.id)}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/50 transition-colors"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold">
                                            {p.name.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="flex-1 text-left text-sm font-medium">{p.name}</span>
                                        {p.id === activeProfile && (
                                            <Check className="w-4 h-4 text-primary" />
                                        )}
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </header>
    );
}
