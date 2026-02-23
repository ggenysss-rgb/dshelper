import { useQuery } from '@tanstack/react-query';
import { fetchLogs } from '../api/stats';
import { motion } from 'framer-motion';
import { ScrollText, MessageSquare, Clock, Link2, Shield, Settings } from 'lucide-react';

const typeConfig: Record<string, { icon: any; color: string; label: string }> = {
    message: { icon: MessageSquare, color: 'text-blue-400', label: 'Сообщение' },
    shift: { icon: Clock, color: 'text-green-400', label: 'Смена' },
    bind: { icon: Link2, color: 'text-purple-400', label: 'Бинд' },
    ticket: { icon: Shield, color: 'text-yellow-400', label: 'Тикет' },
    system: { icon: Settings, color: 'text-muted-foreground', label: 'Система' },
};

function getRelativeTime(ts: string) {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'только что';
    if (mins < 60) return `${mins} мин назад`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}ч назад`;
    return `${Math.floor(hours / 24)}д назад`;
}

export default function Logs() {
    const { data: logs, isLoading } = useQuery({
        queryKey: ['logs'],
        queryFn: () => fetchLogs(100),
        refetchInterval: 5000,
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <ScrollText className="w-6 h-6 text-primary" />
                <h1 className="text-2xl font-bold">Логи</h1>
                <span className="text-sm text-muted-foreground ml-2">
                    Последние {logs?.length || 0} действий
                </span>
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
                {(!logs || logs.length === 0) ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <ScrollText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>Пока нет логов</p>
                        <p className="text-sm mt-1">Действия будут появляться здесь в реальном времени</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {logs.map((log: any, i: number) => {
                            const cfg = typeConfig[log.type] || typeConfig.system;
                            const Icon = cfg.icon;
                            return (
                                <motion.div
                                    key={`${log.ts}-${i}`}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.02 }}
                                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-secondary/30 transition-colors"
                                >
                                    <div className={`w-8 h-8 rounded-lg bg-secondary/50 flex items-center justify-center shrink-0 ${cfg.color}`}>
                                        <Icon className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-sm font-medium block truncate">{log.message}</span>
                                        <span className={`text-xs ${cfg.color} font-medium`}>{cfg.label}</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                                        {getRelativeTime(log.ts)}
                                    </span>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
