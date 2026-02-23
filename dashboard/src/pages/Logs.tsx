import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchLogs } from '../api/stats';
import { useSocket } from '../hooks/useSocket';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ScrollText, MessageSquare, Clock, Link2, Shield, Settings,
    Search, Zap, Bot, AlertTriangle, Wifi, WifiOff, Timer,
    MessageCircle, SmilePlus, Sparkles, Filter, X
} from 'lucide-react';

const typeConfig: Record<string, {
    icon: any; gradient: string; bg: string; border: string; label: string; labelColor: string;
}> = {
    ticket: { icon: Shield, gradient: 'from-amber-500/20 to-amber-600/5', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'Тикет', labelColor: 'text-amber-400' },
    autoreply: { icon: Bot, gradient: 'from-violet-500/20 to-violet-600/5', bg: 'bg-violet-500/10', border: 'border-violet-500/20', label: 'Авто-ответ', labelColor: 'text-violet-400' },
    ai: { icon: Sparkles, gradient: 'from-fuchsia-500/20 to-fuchsia-600/5', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20', label: 'AI', labelColor: 'text-fuchsia-400' },
    greet: { icon: SmilePlus, gradient: 'from-emerald-500/20 to-emerald-600/5', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'Приветствие', labelColor: 'text-emerald-400' },
    message: { icon: MessageSquare, gradient: 'from-blue-500/20 to-blue-600/5', bg: 'bg-blue-500/10', border: 'border-blue-500/20', label: 'Сообщение', labelColor: 'text-blue-400' },
    bind: { icon: Link2, gradient: 'from-purple-500/20 to-purple-600/5', bg: 'bg-purple-500/10', border: 'border-purple-500/20', label: 'Бинд', labelColor: 'text-purple-400' },
    shift: { icon: Clock, gradient: 'from-green-500/20 to-green-600/5', bg: 'bg-green-500/10', border: 'border-green-500/20', label: 'Смена', labelColor: 'text-green-400' },
    timer: { icon: Timer, gradient: 'from-orange-500/20 to-orange-600/5', bg: 'bg-orange-500/10', border: 'border-orange-500/20', label: 'Таймер', labelColor: 'text-orange-400' },
    system: { icon: Settings, gradient: 'from-slate-500/20 to-slate-600/5', bg: 'bg-slate-500/10', border: 'border-slate-500/20', label: 'Система', labelColor: 'text-slate-400' },
    error: { icon: AlertTriangle, gradient: 'from-red-500/20 to-red-600/5', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'Ошибка', labelColor: 'text-red-400' },
    gateway: { icon: Wifi, gradient: 'from-cyan-500/20 to-cyan-600/5', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', label: 'Gateway', labelColor: 'text-cyan-400' },
    command: { icon: MessageCircle, gradient: 'from-indigo-500/20 to-indigo-600/5', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', label: 'Команда', labelColor: 'text-indigo-400' },
};
const defaultConfig = { icon: Settings, gradient: 'from-slate-500/20 to-slate-600/5', bg: 'bg-slate-500/10', border: 'border-slate-500/20', label: 'Другое', labelColor: 'text-slate-400' };

const filterGroups = [
    { key: 'all', label: 'Все', icon: Filter },
    { key: 'ticket', label: 'Тикеты', icon: Shield },
    { key: 'autoreply', label: 'Авто-ответы', icon: Bot },
    { key: 'greet', label: 'Приветствия', icon: SmilePlus },
    { key: 'message', label: 'Сообщения', icon: MessageSquare },
    { key: 'shift', label: 'Смены', icon: Clock },
    { key: 'system', label: 'Система', icon: Settings },
    { key: 'error', label: 'Ошибки', icon: AlertTriangle },
    { key: 'gateway', label: 'Gateway', icon: Wifi },
];

function getRelativeTime(ts: string) {
    const diff = Date.now() - new Date(ts).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 5) return 'только что';
    if (secs < 60) return `${secs}с назад`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins} мин назад`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}ч назад`;
    return `${Math.floor(hours / 24)}д назад`;
}

function getTimeStr(ts: string) {
    return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getDateLabel(ts: string) {
    const d = new Date(ts);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const logDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (logDate.getTime() === today.getTime()) return 'Сегодня';
    if (logDate.getTime() === yesterday.getTime()) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' });
}

interface LogEntry { ts: string; type: string; message: string; }

export default function Logs() {
    const queryClient = useQueryClient();
    const socket = useSocket();
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [newLogIds, setNewLogIds] = useState<Set<string>>(new Set());
    const listRef = useRef<HTMLDivElement>(null);

    const { data: logs, isLoading } = useQuery({
        queryKey: ['logs'],
        queryFn: () => fetchLogs(200),
        refetchInterval: 30000,
    });

    useEffect(() => {
        if (!socket) return;
        const handleNewLog = (entry: LogEntry) => {
            queryClient.setQueryData<LogEntry[]>(['logs'], (old) => {
                if (!old) return [entry];
                return [entry, ...old].slice(0, 200);
            });
            const id = `${entry.ts}-${entry.type}`;
            setNewLogIds(prev => new Set(prev).add(id));
            setTimeout(() => setNewLogIds(prev => { const next = new Set(prev); next.delete(id); return next; }), 2000);
        };
        socket.on('log:new', handleNewLog);
        return () => { socket.off('log:new', handleNewLog); };
    }, [socket, queryClient]);

    const filteredLogs = useMemo(() => {
        if (!logs) return [];
        return logs.filter((log: LogEntry) => {
            if (filter !== 'all' && log.type !== filter) return false;
            if (search.trim()) {
                const q = search.toLowerCase();
                return log.message.toLowerCase().includes(q) || log.type.toLowerCase().includes(q);
            }
            return true;
        });
    }, [logs, filter, search]);

    const groupedLogs = useMemo(() => {
        const groups: { label: string; logs: LogEntry[] }[] = [];
        let currentLabel = '';
        for (const log of filteredLogs) {
            const label = getDateLabel(log.ts);
            if (label !== currentLabel) { currentLabel = label; groups.push({ label, logs: [] }); }
            groups[groups.length - 1].logs.push(log);
        }
        return groups;
    }, [filteredLogs]);

    const typeCounts = useMemo(() => {
        if (!logs) return {};
        const counts: Record<string, number> = {};
        for (const log of logs) counts[log.type] = (counts[log.type] || 0) + 1;
        return counts;
    }, [logs]);

    const clearSearch = useCallback(() => setSearch(''), []);

    if (isLoading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto h-full flex flex-col gap-4 md:gap-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
                        <ScrollText className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl md:text-2xl font-rajdhani font-bold text-foreground">Журнал действий</h1>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {filteredLogs.length} из {logs?.length || 0} записей
                            {socket ? (
                                <span className="inline-flex items-center gap-1 ml-2 text-emerald-400">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 ml-2 text-muted-foreground">
                                    <WifiOff className="w-3 h-3" /> Оффлайн
                                </span>
                            )}
                        </p>
                    </div>
                </div>
                <div className="relative group">
                    <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-primary transition-colors" />
                    <input type="text" placeholder="Поиск по логам..." value={search} onChange={e => setSearch(e.target.value)}
                        className="pl-9 pr-8 py-2 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary w-full sm:w-64 transition-all" />
                    {search && (
                        <button onClick={clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Filter chips */}
            <div className="flex flex-wrap gap-1.5 md:gap-2">
                {filterGroups.map((f) => {
                    const Icon = f.icon;
                    const count = f.key === 'all' ? (logs?.length || 0) : (typeCounts[f.key] || 0);
                    const isActive = filter === f.key;
                    const cfg = typeConfig[f.key];
                    return (
                        <button key={f.key} onClick={() => setFilter(f.key)}
                            className={`inline-flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-[11px] md:text-xs font-medium transition-all duration-200 border
                                ${isActive ? `${cfg?.bg || 'bg-primary/10'} ${cfg?.border || 'border-primary/30'} ${cfg?.labelColor || 'text-primary'} shadow-sm` : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
                            <Icon className="w-3 h-3 md:w-3.5 md:h-3.5" />
                            <span className="hidden sm:inline">{f.label}</span>
                            {count > 0 && <span className={`ml-0.5 px-1 md:px-1.5 py-0.5 rounded-md text-[10px] font-bold ${isActive ? 'bg-white/10' : 'bg-secondary'}`}>{count}</span>}
                        </button>
                    );
                })}
            </div>

            {/* Log list */}
            <div ref={listRef} className="flex-1 overflow-y-auto pr-1 pb-6 custom-scrollbar">
                {filteredLogs.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-xl">
                        <ScrollText className="w-12 h-12 mb-4 opacity-30" />
                        <p className="font-medium text-lg">{search ? 'Ничего не найдено' : 'Пока нет логов'}</p>
                        <p className="text-sm mt-1">{search ? 'Попробуйте изменить поисковый запрос' : 'Действия будут появляться здесь в реальном времени'}</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {groupedLogs.map((group) => (
                            <div key={group.label}>
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</span>
                                    <div className="flex-1 h-px bg-border/50" />
                                    <span className="text-[10px] text-muted-foreground/60">{group.logs.length} записей</span>
                                </div>
                                <div className="space-y-1.5">
                                    <AnimatePresence initial={false}>
                                        {group.logs.map((log: LogEntry, i: number) => {
                                            const cfg = typeConfig[log.type] || defaultConfig;
                                            const Icon = cfg.icon;
                                            const logId = `${log.ts}-${log.type}`;
                                            const isNew = newLogIds.has(logId);
                                            return (
                                                <motion.div key={`${log.ts}-${i}`}
                                                    initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}
                                                    className={`group relative flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-xl border transition-all duration-300
                                                        ${isNew ? `bg-gradient-to-r ${cfg.gradient} ${cfg.border} shadow-lg shadow-primary/5` : 'bg-card/50 border-border/50 hover:bg-card hover:border-border'}`}>
                                                    <div className={`w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg} border ${cfg.border} transition-transform duration-200 group-hover:scale-110`}>
                                                        <Icon className={`w-3.5 h-3.5 md:w-4 md:h-4 ${cfg.labelColor}`} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.labelColor}`}>{cfg.label}</span>
                                                            {isNew && (
                                                                <motion.span initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-0.5 text-[10px] text-emerald-400 font-medium">
                                                                    <Zap className="w-3 h-3" /> NEW
                                                                </motion.span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs md:text-sm text-foreground/90 leading-snug truncate">{log.message}</p>
                                                    </div>
                                                    <div className="text-right shrink-0 hidden sm:block">
                                                        <span className="text-[11px] text-muted-foreground font-mono block">{getTimeStr(log.ts)}</span>
                                                        <span className="text-[10px] text-muted-foreground/60 block">{getRelativeTime(log.ts)}</span>
                                                    </div>
                                                    {isNew && (
                                                        <motion.div initial={{ opacity: 0.6 }} animate={{ opacity: 0 }} transition={{ duration: 2 }}
                                                            className={`absolute inset-0 rounded-xl border-2 ${cfg.border} pointer-events-none`} />
                                                    )}
                                                </motion.div>
                                            );
                                        })}
                                    </AnimatePresence>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
