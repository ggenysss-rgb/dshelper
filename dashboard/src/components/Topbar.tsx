import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchStats } from '../api/stats';
import { Bell, User, Sun, Moon } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { motion } from 'framer-motion';
import ProfileModal, { useProfile } from './ProfileModal';

export default function Topbar() {
    const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 10000 });
    useAuth();
    const { theme, toggleTheme } = useTheme();
    const { profile, updateProfile } = useProfile();
    const [profileModalOpen, setProfileModalOpen] = useState(false);

    return (
        <>
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

                    {/* Profile area — click to edit */}
                    <button
                        onClick={() => setProfileModalOpen(true)}
                        className="flex items-center gap-3 pl-4 border-l border-border hover:bg-secondary/30 rounded-r-lg pr-3 py-1.5 transition-colors cursor-pointer"
                    >
                        <div className="text-right flex flex-col justify-center">
                            <span className="text-sm font-medium leading-none">
                                {profile.displayName}
                            </span>
                            <span className="text-xs text-muted-foreground mt-1">
                                {profile.status}
                            </span>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary overflow-hidden">
                            {profile.avatarUrl ? (
                                <img src={profile.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                            ) : (
                                <User className="w-5 h-5 relative" />
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
