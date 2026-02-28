import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchStats } from '../api/stats';
import { Bell, User, Sun, Moon, BellRing, Volume2, VolumeX, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useSocket } from '../hooks/useSocket';
import { motion, AnimatePresence } from 'framer-motion';
import ProfileModal, { useProfile } from './ProfileModal';

import { Link } from 'react-router-dom';

type TopbarProps = {
    membersVisible?: boolean;
    onToggleMembers?: () => void;
};

export type NotificationItem = {
    id: string;
    type: 'ticket' | 'message';
    title: string;
    description: string;
    time: number;
    channelId: string;
    read: boolean;
};

function playNotificationSound(type: 'ticket' | 'message' = 'ticket') {
    try {
        const ctx = new AudioContext();
        const now = ctx.currentTime;

        if (type === 'ticket') {
            // Two-tone chime for new tickets
            [523.25, 659.25, 783.99].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.15, now + i * 0.15);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.4);
                osc.connect(gain).connect(ctx.destination);
                osc.start(now + i * 0.15);
                osc.stop(now + i * 0.15 + 0.4);
            });
        } else {
            // Soft ping for messages
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.connect(gain).connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.2);
        }
        setTimeout(() => ctx.close(), 2000);
    } catch { }
}

export default function Topbar({ membersVisible = true, onToggleMembers }: TopbarProps) {
    const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 10000 });
    useAuth();
    const { theme, toggleTheme } = useTheme();
    const { profile, updateProfile } = useProfile();
    const [profileModalOpen, setProfileModalOpen] = useState(false);
    const socket = useSocket();

    // ── Browser Notifications ─────────────────────────────────
    const [notifEnabled, setNotifEnabled] = useState(Notification.permission === 'granted');
    const [unreadCount, setUnreadCount] = useState(0);
    const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('soundEnabled') !== 'false');
    const soundEnabledRef = useRef(soundEnabled);

    // Notifications State
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => { soundEnabledRef.current = soundEnabled; localStorage.setItem('soundEnabled', String(soundEnabled)); }, [soundEnabled]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const requestNotifPermission = useCallback(async () => {
        if (!('Notification' in window)) return;
        const perm = await Notification.requestPermission();
        setNotifEnabled(perm === 'granted');
    }, []);

    useEffect(() => {
        if (!socket) return;

        const handleNewTicket = (data: any) => {
            setUnreadCount(prev => prev + 1);

            const newNotif: NotificationItem = {
                id: `t_${Date.now()}_${Math.random()}`,
                type: 'ticket',
                title: 'Новый тикет',
                description: `#${data.channelName || 'ticket'} от ${data.openerUsername || 'Пользователя'}`,
                time: Date.now(),
                channelId: data.channelId,
                read: false
            };
            setNotifications(prev => [newNotif, ...prev].slice(0, 50)); // Keep last 50

            if (soundEnabledRef.current) playNotificationSound('ticket');
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

        const handleNewMessage = (data: any) => {
            // Only notify if message is from a user, not bot
            if (data && data.authorId && data.authorId !== socket.id) {
                setUnreadCount(prev => prev + 1);
                const newNotif: NotificationItem = {
                    id: `m_${Date.now()}_${Math.random()}`,
                    type: 'message',
                    title: 'Новое сообщение',
                    description: `В тикете #${data.channelName || 'ticket'}`,
                    time: Date.now(),
                    channelId: data.channelId,
                    read: false
                };
                setNotifications(prev => [newNotif, ...prev].slice(0, 50));
            }
            if (soundEnabledRef.current && document.hidden) playNotificationSound('message');
        };

        socket.on('ticket:new', handleNewTicket);
        socket.on('ticket:message', handleNewMessage);
        return () => { socket.off('ticket:new', handleNewTicket); socket.off('ticket:message', handleNewMessage); };
    }, [socket]);

    // Reset unread on focus and menu open
    useEffect(() => {
        const onFocus = () => {
            if (unreadCount > 0 && !isDropdownOpen) {
                setUnreadCount(0);
                setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            }
        };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [unreadCount, isDropdownOpen]);

    const handleBellClick = () => {
        if (!notifEnabled) {
            requestNotifPermission();
        } else {
            setIsDropdownOpen(prev => !prev);
            if (!isDropdownOpen && unreadCount > 0) {
                setUnreadCount(0);
                setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            }
        }
    };

    const formatDate = (ts: number) => {
        const d = new Date(ts);
        const today = new Date();
        if (d.getDate() === today.getDate() && d.getMonth() === today.getMonth()) {
            return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        }
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <>
            <header className="topbar-shell h-16 bg-background/80 backdrop-blur-md border-b border-border sticky top-0 z-40 px-4 md:px-6 flex items-center justify-between">
                <div className="flex items-center gap-4 md:gap-6">
                    {/* Mobile hamburger */}
                    <button
                        className="md:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-secondary rounded-lg transition-colors text-muted-foreground"
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
                    {onToggleMembers && (
                        <button
                            onClick={onToggleMembers}
                            className="hidden lg:flex w-9 h-9 md:w-10 md:h-10 rounded-full bg-secondary items-center justify-center text-muted-foreground hover:text-foreground transition-colors hover:bg-secondary/80"
                            title={membersVisible ? 'Скрыть участников' : 'Показать участников'}
                            aria-label={membersVisible ? 'Скрыть участников' : 'Показать участников'}
                        >
                            {membersVisible ? <PanelRightClose className="w-4 h-4 md:w-5 md:h-5" /> : <PanelRightOpen className="w-4 h-4 md:w-5 md:h-5" />}
                        </button>
                    )}

                    {/* Theme toggle */}
                    <button
                        onClick={toggleTheme}
                        className="w-11 h-11 md:w-10 md:h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors hover:bg-secondary/80"
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

                    {/* Sound toggle */}
                    <button
                        onClick={() => setSoundEnabled(v => !v)}
                        className="w-11 h-11 md:w-10 md:h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors hover:bg-secondary/80"
                        title={soundEnabled ? 'Выключить звук' : 'Включить звук'}
                    >
                        {soundEnabled ? <Volume2 className="w-4 h-4 md:w-5 md:h-5" /> : <VolumeX className="w-4 h-4 md:w-5 md:h-5 opacity-50" />}
                    </button>

                    {/* Notifications bell dropdown container */}
                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={handleBellClick}
                            className={`w-11 h-11 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-colors relative ${isDropdownOpen ? 'bg-secondary/80 text-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'}`}
                            title={notifEnabled ? 'Уведомления' : 'Включить уведомления'}
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
                                    className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1 border-2 border-background"
                                >
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </motion.span>
                            )}
                            {!notifEnabled && (
                                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-yellow-500 border border-secondary" />
                            )}
                        </button>

                        {/* Dropdown Menu */}
                        <AnimatePresence>
                            {isDropdownOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    transition={{ duration: 0.2, ease: "easeOut" }}
                                    className="absolute right-0 mt-2 w-80 md:w-96 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50 flex flex-col"
                                >
                                    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
                                        <h3 className="font-semibold text-foreground">Уведомления</h3>
                                        {notifications.length > 0 && (
                                            <button
                                                onClick={() => setNotifications([])}
                                                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                            >
                                                Очистить всё
                                            </button>
                                        )}
                                    </div>

                                    <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                                        {notifications.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                                                <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
                                                    <Bell className="w-6 h-6 text-muted-foreground/50" />
                                                </div>
                                                <p className="text-sm font-medium text-foreground">Нет новых уведомлений</p>
                                                <p className="text-xs text-muted-foreground mt-1">Здесь будут появляться новые тикеты и сообщения</p>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col">
                                                {notifications.map((notif) => (
                                                    <Link
                                                        key={notif.id}
                                                        to={notif.channelId ? `/tickets/${notif.channelId}` : '#'}
                                                        onClick={() => setIsDropdownOpen(false)}
                                                        className={`flex items-start gap-3 p-3 lg:p-4 hover:bg-secondary/50 transition-colors border-b border-border/50 last:border-0 ${!notif.read ? 'bg-primary/5' : ''}`}
                                                    >
                                                        <div className={`mt-0.5 p-2 rounded-full shrink-0 ${notif.type === 'ticket' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                                            {notif.type === 'ticket' ? (
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>
                                                            ) : (
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex justify-between items-start gap-2 mb-0.5">
                                                                <p className={`text-sm font-medium truncate ${!notif.read ? 'text-foreground' : 'text-foreground/80'}`}>
                                                                    {notif.title}
                                                                </p>
                                                                <span className="text-[10px] text-muted-foreground whitespace-nowrap pt-0.5">
                                                                    {formatDate(notif.time)}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-muted-foreground line-clamp-2">
                                                                {notif.description}
                                                            </p>
                                                        </div>
                                                        {!notif.read && (
                                                            <div className="w-2 h-2 rounded-full bg-primary shrink-0 self-center" />
                                                        )}
                                                    </Link>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {notifications.length > 0 && (
                                        <div className="p-2 border-t border-border bg-muted/30">
                                            <button
                                                onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
                                                className="w-full py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors text-center"
                                            >
                                                Прочитать все
                                            </button>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Profile */}
                    <button
                        onClick={() => setProfileModalOpen(true)}
                        className="flex items-center gap-2 md:gap-3 pl-3 md:pl-4 border-l border-border hover:bg-secondary/30 rounded-r-lg pr-2 md:pr-3 py-1.5 min-h-[44px] transition-colors cursor-pointer"
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
