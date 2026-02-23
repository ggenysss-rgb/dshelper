import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchClosedTickets } from '../api/stats';
import { Search, TicketX, Clock, User, Hash, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface ClosedTicketsResponse {
    tickets: any[];
    total: number;
    page: number;
    totalPages: number;
}

export default function ClosedTickets() {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [searchDebounced, setSearchDebounced] = useState('');

    const { data, isLoading } = useQuery<ClosedTicketsResponse>({
        queryKey: ['closed-tickets', page, searchDebounced],
        queryFn: () => fetchClosedTickets(page, searchDebounced),
    });

    const handleSearch = (val: string) => {
        setSearch(val);
        clearTimeout((window as any).__closedSearch);
        (window as any).__closedSearch = setTimeout(() => { setSearchDebounced(val); setPage(1); }, 400);
    };

    const tickets = data?.tickets || [];
    const totalPages = data?.totalPages || 1;
    const total = data?.total || 0;

    function formatDate(ts: any) {
        if (!ts) return '-';
        const d = new Date(ts);
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }

    function formatDuration(start: any, end: any) {
        if (!start || !end) return '-';
        const diff = new Date(end).getTime() - new Date(start).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins} мин`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}ч ${mins % 60}м`;
        return `${Math.floor(hours / 24)}д ${hours % 24}ч`;
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/5 border border-red-500/20 flex items-center justify-center">
                        <TicketX className="w-5 h-5 text-red-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-rajdhani font-bold">Закрытые тикеты</h1>
                        <p className="text-xs text-muted-foreground">{total} записей</p>
                    </div>
                </div>
                <div className="relative group">
                    <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-primary transition-colors" />
                    <input type="text" placeholder="Поиск по нику или каналу..." value={search} onChange={e => handleSearch(e.target.value)}
                        className="pl-9 pr-4 py-2 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary w-full sm:w-72 transition-all" />
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>
            ) : tickets.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-xl">
                    <TicketX className="w-12 h-12 mb-4 opacity-30" />
                    <p className="font-medium text-lg">{search ? 'Ничего не найдено' : 'Нет закрытых тикетов'}</p>
                </div>
            ) : (
                <>
                    {/* Desktop Table */}
                    <div className="hidden md:block bg-card border border-border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border bg-secondary/30">
                                    <th className="text-left px-4 py-3 text-xs text-muted-foreground uppercase font-bold tracking-wider"><Hash className="w-3 h-3 inline mb-0.5" /> Канал</th>
                                    <th className="text-left px-4 py-3 text-xs text-muted-foreground uppercase font-bold tracking-wider"><User className="w-3 h-3 inline mb-0.5" /> Автор</th>
                                    <th className="text-left px-4 py-3 text-xs text-muted-foreground uppercase font-bold tracking-wider"><Clock className="w-3 h-3 inline mb-0.5" /> Создан</th>
                                    <th className="text-left px-4 py-3 text-xs text-muted-foreground uppercase font-bold tracking-wider">Закрыт</th>
                                    <th className="text-left px-4 py-3 text-xs text-muted-foreground uppercase font-bold tracking-wider">Длительность</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tickets.map((t: any, i: number) => (
                                    <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                                        className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                                        <td className="px-4 py-3 font-medium text-foreground">#{t.channelName || t.channelId?.slice(-6)}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{t.openerUsername || '-'}</td>
                                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{formatDate(t.createdAt)}</td>
                                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{formatDate(t.closedAt)}</td>
                                        <td className="px-4 py-3"><span className="px-2 py-0.5 bg-secondary rounded text-xs font-medium">{formatDuration(t.createdAt, t.closedAt)}</span></td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-3">
                        {tickets.map((t: any, i: number) => (
                            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                                className="bg-card border border-border rounded-xl p-4 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-sm">#{t.channelName || t.channelId?.slice(-6)}</span>
                                    <span className="px-2 py-0.5 bg-secondary rounded text-xs">{formatDuration(t.createdAt, t.closedAt)}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>{t.openerUsername || '-'}</span>
                                    <span className="font-mono">{formatDate(t.closedAt)}</span>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-3">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                                className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-30 transition-colors">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-sm text-muted-foreground">Стр. <span className="text-foreground font-medium">{page}</span> из {totalPages}</span>
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                                className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-30 transition-colors">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
