import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchClosedTickets, fetchArchivedMessages } from '../api/stats';
import { Search, TicketX, Clock, User, Hash, ChevronLeft, ChevronRight, X, MessageSquare, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ArchivedMessage {
    id: string;
    content: string;
    author: { id: string; username: string; global_name: string; avatar: string; bot: boolean };
    timestamp: string;
    attachments: { id: string; filename: string; url: string; content_type: string }[];
}

interface ArchiveData {
    channelId: string;
    channelName: string;
    openerId: string;
    openerUsername: string;
    createdAt: number;
    archivedAt: number;
    messages: ArchivedMessage[];
}

interface ClosedTicketsResponse {
    tickets: any[];
    total: number;
    page: number;
    totalPages: number;
}

// ── Chat Viewer ───────────────────────────────────────────────
function ChatViewer({ channelId, channelName, onClose }: { channelId: string; channelName: string; onClose: () => void }) {
    const { data: archive, isLoading, error } = useQuery<ArchiveData>({
        queryKey: ['archive', channelId],
        queryFn: () => fetchArchivedMessages(channelId),
        enabled: !!channelId,
    });

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card/80 backdrop-blur shrink-0">
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="p-1.5 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h3 className="font-rajdhani font-bold text-lg">#{channelName}</h3>
                            <p className="text-xs text-muted-foreground">
                                {archive ? `${archive.messages.length} сообщений • ${archive.openerUsername}` : 'Загрузка...'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
                    {isLoading && (
                        <div className="flex items-center justify-center py-16">
                            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
                        </div>
                    )}
                    {error && (
                        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                            <MessageSquare className="w-12 h-12 mb-4 opacity-30" />
                            <p className="font-medium text-lg">Нет записей</p>
                            <p className="text-sm mt-1 text-center max-w-xs">Сообщения этого тикета не были сохранены. Архивация работает только для тикетов, закрытых после обновления.</p>
                        </div>
                    )}
                    {archive?.messages.map((msg) => {
                        const isBot = msg.author.bot;
                        const isOpener = msg.author.id === archive.openerId;

                        return (
                            <div key={msg.id} className={`flex gap-3 ${!isOpener ? 'flex-row-reverse' : ''}`}>
                                {/* Avatar */}
                                <div className="shrink-0 mt-0.5">
                                    {msg.author.avatar ? (
                                        <img
                                            src={`https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png?size=64`}
                                            className="w-8 h-8 rounded-full bg-secondary object-cover"
                                            alt="" />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground">
                                            {(msg.author.username || '?')[0].toUpperCase()}
                                        </div>
                                    )}
                                </div>

                                {/* Bubble */}
                                <div className={`max-w-[75%] ${!isOpener ? 'items-end' : 'items-start'}`}>
                                    <div className={`flex items-baseline gap-2 mb-0.5 ${!isOpener ? 'justify-end' : ''}`}>
                                        <span className={`text-xs font-semibold ${!isOpener ? 'text-primary' : 'text-foreground'}`}>
                                            {msg.author.global_name || msg.author.username}
                                        </span>
                                        {isBot && <span className="text-[9px] bg-[#5865F2] text-white px-1 py-0.5 rounded font-medium">BOT</span>}
                                        <span className="text-[10px] text-muted-foreground">
                                            {new Date(msg.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <div className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${!isOpener
                                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                                        : 'bg-secondary text-foreground rounded-tl-sm border border-border/50'
                                        }`}>
                                        {msg.content || <span className="italic text-muted-foreground text-xs">[без текста]</span>}
                                    </div>

                                    {msg.attachments.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                                            {msg.attachments.map(att => (
                                                <a key={att.id} href={att.url} target="_blank" rel="noreferrer"
                                                    className="block rounded-lg overflow-hidden border border-border/50 hover:opacity-80 transition-opacity">
                                                    {att.content_type?.startsWith('image/') ? (
                                                        <img src={att.url} alt="" className="max-h-32 object-cover" />
                                                    ) : (
                                                        <div className="px-3 py-2 bg-secondary text-xs underline">{att.filename}</div>
                                                    )}
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </motion.div>
        </motion.div>
    );
}

// ── Main Page ─────────────────────────────────────────────────
export default function ClosedTickets() {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [searchDebounced, setSearchDebounced] = useState('');
    const [viewTicket, setViewTicket] = useState<{ channelId: string; channelName: string } | null>(null);

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

    const openChat = (t: any) => {
        setViewTicket({ channelId: t.channelId || t.channelName || 'unknown', channelName: t.channelName || t.channelId || 'ticket' });
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/5 border border-red-500/20 flex items-center justify-center">
                        <TicketX className="w-5 h-5 text-red-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-rajdhani font-bold">Закрытые тикеты</h1>
                        <p className="text-xs text-muted-foreground">{total} записей • кликните для просмотра чата</p>
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
                                    <th className="w-10"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {tickets.map((t: any, i: number) => (
                                    <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                                        onClick={() => openChat(t)}
                                        className="border-b border-border/30 transition-colors hover:bg-primary/5 cursor-pointer">
                                        <td className="px-4 py-3 font-medium text-foreground">#{t.channelName || t.channelId?.slice(-6)}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{t.openerUsername || '-'}</td>
                                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{formatDate(t.createdAt)}</td>
                                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{formatDate(t.closedAt)}</td>
                                        <td className="px-4 py-3"><span className="px-2 py-0.5 bg-secondary rounded text-xs font-medium">{formatDuration(t.createdAt, t.closedAt)}</span></td>
                                        <td className="px-4 py-3">{t.channelId && <MessageSquare className="w-4 h-4 text-muted-foreground" />}</td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-3">
                        {tickets.map((t: any, i: number) => (
                            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                                onClick={() => openChat(t)}
                                className="bg-card border border-border rounded-xl p-4 space-y-2 cursor-pointer hover:border-primary/30 active:bg-primary/5 transition-colors">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-sm">#{t.channelName || t.channelId?.slice(-6)}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 bg-secondary rounded text-xs">{formatDuration(t.createdAt, t.closedAt)}</span>
                                        {t.channelId && <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />}
                                    </div>
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

            {/* Chat Viewer Modal */}
            <AnimatePresence>
                {viewTicket && (
                    <ChatViewer channelId={viewTicket.channelId} channelName={viewTicket.channelName} onClose={() => setViewTicket(null)} />
                )}
            </AnimatePresence>
        </div>
    );
}
