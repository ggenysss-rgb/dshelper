import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchStats } from '../api/stats';
import { Bell, User, Sun, Moon, BellRing } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useSocket } from '../hooks/useSocket';
import { motion, AnimatePresence } from 'framer-motion';
import ProfileModal, { useProfile } from './ProfileModal';

export default function Topbar() {
    const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 10000 });
    useAuth();
    const { theme, toggleTheme } = useTheme();
    const { profile, updateProfile } = useProfile();
    const [profileModalOpen, setProfileModalOpen] = useState(false);
    const socket = useSocket();

    // ── Browser Notifications ─────────────────────────────────
    const [notifEnabled, setNotifEnabled] = useState(Notification.permission === 'granted');
    const [unreadCount, setUnreadCount] = useState(0);

    const requestNotifPermission = useCallback(async () => {
        if (!('Notification' in window)) return;
        const perm = await Notification.requestPermission();
        setNotifEnabled(perm === 'granted');
    }, []);

    useEffect(() => {
        if (!socket || !notifEnabled) return;

        const handleNewTicket = (data: any) => {
            setUnreadCount(prev => prev + 1);
            if (document.hidden && Notification.permission === 'granted') {
                const n = new Notification('🎫 Новый тикет', {
                    body: `#${data.channelName || 'ticket'} от ${data.openerUsername || 'пользователя'}`,
                    icon: '/favicon.ico',
                    tag: `ticket-${data.channelId}`,
                });
                n.onclick = () => { window.focus(); n.close(); };
                setTimeout(() => n.close(), 8000);
            }
        };

        socket.on('ticket:new', handleNewTicket);
        return () => { socket.off('ticket:new', handleNewTicket); };
    }, [socket, notifEnabled]);

    // Reset unread on focus
    useEffect(() => {
        const onFocus = () => setUnreadCount(0);
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, []);

    return (
        <>
            <header className="h-16 bg-background/80 backdrop-blur-md border-b border-border sticky top-0 z-40 px-4 md:px-6 flex items-center justify-between">
                <div className="flex items-center gap-4 md:gap-6">
                    {/* Mobile hamburger */}
                    <button
                        className="md:hidden p-2 hover:bg-secondary rounded-lg transition-colors text-muted-foreground"
                        onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>

                    <h2 className="text-lg md:text-xl font-rajdhani font-semibold text-muted-foreground tracking-wide hidden sm:block">
                        Панель Управления
                    </h2>
                    {stats && (
                        <div className="flex items-center gap-4 text-sm font-medium">
                            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/50 text-secondary-foreground border border-border/50">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                <span className="hidden sm:inline">Активных тикетов:</span>
                                <span className="text-foreground ml-0.5">{stats.activeTicketsCount}</span>
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 md:gap-3">
                    {/* Theme toggle */}
                    <button
                        onClick={toggleTheme}
                        className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-all hover:bg-secondary/80"
                        title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
                    >
                        <motion.div
                            key={theme}
                            initial={{ rotate: -90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            transition={{ duration: 0.2 }}
                        >
                            {theme === 'dark' ? <Sun className="w-4 h-4 md:w-5 md:h-5" /> : <Moon className="w-4 h-4 md:w-5 md:h-5" />}
                        </motion.div>
                    </button>

                    {/* Notifications bell */}
                    <button
                        onClick={notifEnabled ? () => setUnreadCount(0) : requestNotifPermission}
                        className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors relative"
                        title={notifEnabled ? 'Уведомления включены' : 'Включить уведомления'}
                    >
                        <AnimatePresence mode="wait">
                            {unreadCount > 0 ? (
                                <motion.div key="ring" initial={{ rotate: -15 }} animate={{ rotate: [0, -15, 15, -10, 10, 0] }} transition={{ duration: 0.5 }}>
                                    <BellRing className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                                </motion.div>
                            ) : (
                                <Bell className="w-4 h-4 md:w-5 md:h-5" />
                            )}
                        </AnimatePresence>
                        {unreadCount > 0 && (
                            <motion.span
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1"
                            >
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </motion.span>
                        )}
                        {!notifEnabled && (
                            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-yellow-500 border border-secondary" />
                        )}
                    </button>

                    {/* Profile */}
                    <button
                        onClick={() => setProfileModalOpen(true)}
                        className="flex items-center gap-2 md:gap-3 pl-3 md:pl-4 border-l border-border hover:bg-secondary/30 rounded-r-lg pr-2 md:pr-3 py-1.5 transition-colors cursor-pointer"
                    >
                        <div className="text-right hidden sm:flex flex-col justify-center">
                            <span className="text-sm font-medium leading-none">{profile.displayName}</span>
                            <span className="text-xs text-muted-foreground mt-1">{profile.status}</span>
                        </div>
                        <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary overflow-hidden">
                            {profile.avatarUrl ? (
                                <img src={profile.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                            ) : (
                                <User className="w-4 h-4 md:w-5 md:h-5 relative" />
                            )}
                        </div>
                    </button>
                </div>
            </header>

            <ProfileModal
                isOpen={profileModalOpen}
                onClose={() => setProfileModalOpen(false)}
                profile={profile}
                onSave={updateProfile}
            />
        </>
    );
}
