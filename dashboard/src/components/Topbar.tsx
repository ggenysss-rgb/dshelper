import { useQuery } from '@tanstack/react-query';
import { fetchStats } from '../api/stats';
import { Bell, User } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function Topbar() {
    const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 10000 });
    const { user } = useAuth();

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

            <div className="flex items-center gap-4">
                <button className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors relative">
                    <Bell className="w-5 h-5" />
                    <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-primary border-2 border-secondary"></span>
                </button>
                <div className="flex items-center gap-3 pl-4 border-l border-border">
                    <div className="text-right flex flex-col justify-center">
                        <span className="text-sm font-medium leading-none">{user?.role === 'admin' ? 'Администратор' : 'Модератор'}</span>
                        <span className="text-xs text-muted-foreground mt-1">В сети</span>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                        <User className="w-5 h-5 relative" />
                    </div>
                </div>
            </div>
        </header>
    );
}
