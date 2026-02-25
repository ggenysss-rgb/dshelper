import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchConversationLog } from '../api/stats';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, MessageSquare, Sparkles, Search, X, User, ArrowRight } from 'lucide-react';

interface ConvEntry {
    type: 'manual' | 'ai_question';
    channelId: string;
    question: string;
    answer?: string;
    authorUsername: string;
    timestamp: string;
}

function getRelativeTime(ts: string) {
    const diff = Date.now() - new Date(ts).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return 'только что';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins} мин назад`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}ч назад`;
    return `${Math.floor(hours / 24)}д назад`;
}

function getTimeStr(ts: string) {
    return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function getDateStr(ts: string) {
    const d = new Date(ts);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const logDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (logDate.getTime() === today.getTime()) return 'Сегодня';
    if (logDate.getTime() === yesterday.getTime()) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' });
}

export default function ConversationLog() {
    const [filter, setFilter] = useState<'all' | 'manual' | 'ai_question'>('all');
    const [search, setSearch] = useState('');

    const { data, isLoading } = useQuery({
        queryKey: ['conversation-log', filter],
        queryFn: () => fetchConversationLog(200, filter),
        refetchInterval: 30000,
    });

    const entries: ConvEntry[] = data?.entries || [];
    const stats = data?.stats || { total: 0, manual: 0, ai: 0 };

    const filtered = useMemo(() => {
        if (!search.trim()) return entries;
        const q = search.toLowerCase();
        return entries.filter(e =>
            (e.answer || '').toLowerCase().includes(q) ||
            (e.question || '').toLowerCase().includes(q) ||
            (e.authorUsername || '').toLowerCase().includes(q)
        );
    }, [entries, search]);

    const grouped = useMemo(() => {
        const groups: { label: string; items: ConvEntry[] }[] = [];
        let currentLabel = '';
        for (const entry of filtered) {
            const label = getDateStr(entry.timestamp);
            if (label !== currentLabel) { currentLabel = label; groups.push({ label, items: [] }); }
            groups[groups.length - 1].items.push(entry);
        }
        return groups;
    }, [filtered]);

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
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-fuchsia-500/5 border border-fuchsia-500/20 flex items-center justify-center">
                        <Brain className="w-5 h-5 text-fuchsia-400" />
                    </div>
                    <div>
                        <h1 className="text-xl md:text-2xl font-rajdhani font-bold text-foreground">Обучение ИИ</h1>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {stats.manual} ручных · {stats.ai} AI вопросов · {stats.total} всего
                        </p>
                    </div>
                </div>
                <div className="relative group">
                    <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-primary transition-colors" />
                    <input type="text" placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)}
                        className="pl-9 pr-8 py-2 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary w-full sm:w-64 transition-all" />
                    {search && (
                        <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-3 gap-3">
                <button onClick={() => setFilter('all')}
                    className={`p-3 rounded-xl border transition-all ${filter === 'all' ? 'bg-primary/10 border-primary/30 shadow-sm' : 'bg-card border-border hover:bg-secondary/50'}`}>
                    <div className="text-2xl font-bold text-foreground">{stats.total}</div>
                    <div className="text-xs text-muted-foreground mt-1">Все записи</div>
                </button>
                <button onClick={() => setFilter('manual')}
                    className={`p-3 rounded-xl border transition-all ${filter === 'manual' ? 'bg-emerald-500/10 border-emerald-500/30 shadow-sm' : 'bg-card border-border hover:bg-secondary/50'}`}>
                    <div className="text-2xl font-bold text-emerald-400">{stats.manual}</div>
                    <div className="text-xs text-muted-foreground mt-1">Мои ответы</div>
                </button>
                <button onClick={() => setFilter('ai_question')}
                    className={`p-3 rounded-xl border transition-all ${filter === 'ai_question' ? 'bg-fuchsia-500/10 border-fuchsia-500/30 shadow-sm' : 'bg-card border-border hover:bg-secondary/50'}`}>
                    <div className="text-2xl font-bold text-fuchsia-400">{stats.ai}</div>
                    <div className="text-xs text-muted-foreground mt-1">AI вопросы</div>
                </button>
            </div>

            {/* Entries list */}
            <div className="flex-1 overflow-y-auto pr-1 pb-6 custom-scrollbar">
                {filtered.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-xl">
                        <Brain className="w-12 h-12 mb-4 opacity-30" />
                        <p className="font-medium text-lg">{search ? 'Ничего не найдено' : 'Пока нет записей'}</p>
                        <p className="text-sm mt-1">Сообщения будут появляться здесь автоматически</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {grouped.map((group) => (
                            <div key={group.label}>
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</span>
                                    <div className="flex-1 h-px bg-border/50" />
                                    <span className="text-[10px] text-muted-foreground/60">{group.items.length} записей</span>
                                </div>
                                <div className="space-y-2">
                                    <AnimatePresence initial={false}>
                                        {group.items.map((entry, i) => {
                                            const isManual = entry.type === 'manual';
                                            return (
                                                <motion.div key={`${entry.timestamp}-${i}`}
                                                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                                                    className={`relative rounded-xl border p-3 md:p-4 transition-all hover:bg-card
                                                        ${isManual ? 'bg-card/50 border-emerald-500/15' : 'bg-card/30 border-fuchsia-500/15'}`}>
                                                    {/* Type badge + time */}
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded
                                                                ${isManual ? 'bg-emerald-500/10 text-emerald-400' : 'bg-fuchsia-500/10 text-fuchsia-400'}`}>
                                                                {isManual ? <User className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                                                                {isManual ? 'Ручной' : 'AI вопрос'}
                                                            </span>
                                                            {entry.authorUsername && (
                                                                <span className="text-[10px] text-muted-foreground">от {entry.authorUsername}</span>
                                                            )}
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <span className="text-[11px] text-muted-foreground font-mono">{getTimeStr(entry.timestamp)}</span>
                                                            <span className="text-[10px] text-muted-foreground/60 ml-2">{getRelativeTime(entry.timestamp)}</span>
                                                        </div>
                                                    </div>

                                                    {/* Question -> Answer flow */}
                                                    {entry.question && (
                                                        <div className="flex items-start gap-2 mb-1.5">
                                                            <MessageSquare className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                                            <p className="text-xs text-muted-foreground leading-relaxed">{entry.question.slice(0, 300)}</p>
                                                        </div>
                                                    )}

                                                    {isManual && entry.answer && (
                                                        <div className="flex items-start gap-2">
                                                            <ArrowRight className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                                                            <p className="text-sm text-foreground/90 leading-relaxed">{entry.answer.slice(0, 500)}</p>
                                                        </div>
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
