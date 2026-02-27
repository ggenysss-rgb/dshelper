import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useTicketMessages, useSendTicketMessage, useTickets, useEditTicketMessage, useUserProfile, useTicketSummary } from '../hooks/useTickets';
import { fetchBinds, fetchSettings } from '../api/stats';
import { useSocket } from '../hooks/useSocket';
import ChatMessage from '../components/ChatMessage';
import Skeleton from '../components/Skeleton';
import type { DiscordMessage } from '../api/tickets';
import { ArrowLeft, Send, AlertCircle, X, Reply, Pencil, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

export default function TicketDetail() {
    const { id } = useParams<{ id: string }>();
    const { data: msgData, isLoading } = useTicketMessages(id);
    const messages = msgData?.messages;
    const mentionMap = msgData?.mentionMap || {};
    const { data: tickets } = useTickets();
    const { mutateAsync: sendMessage, isPending } = useSendTicketMessage();
    const { mutateAsync: editMessage, isPending: isEditing } = useEditTicketMessage();
    const { mutateAsync: getSummary, isPending: isSummarizing } = useTicketSummary();
    const socket = useSocket();
    const queryClient = useQueryClient();
    const scrollRef = useRef<HTMLDivElement>(null);

    const [content, setContent] = useState('');
    const [binds, setBinds] = useState<Record<string, { name: string; message: string }>>({});
    const [showBinds, setShowBinds] = useState(false);
    const [slashQuery, setSlashQuery] = useState('');
    const [slashIndex, setSlashIndex] = useState(0);

    // Reply & Edit state
    const [replyTo, setReplyTo] = useState<DiscordMessage | null>(null);
    const [editingMsg, setEditingMsg] = useState<DiscordMessage | null>(null);

    const [summary, setSummary] = useState<string | null>(null);

    const ticket = tickets?.find(t => t.channelId === id);

    const bindList = Object.values(binds);
    const filteredBinds = slashQuery
        ? bindList.filter(b => b.name.toLowerCase().startsWith(slashQuery.toLowerCase()))
        : bindList;

    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { fetchBinds().then(setBinds).catch(console.error); }, []);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

    useEffect(() => {
        if (!socket || !id) return;
        const handleNewMessage = (data: any) => {
            if (!data.channelId || data.channelId === id) {
                queryClient.invalidateQueries({ queryKey: ['tickets', id, 'messages'] });
            }
            queryClient.invalidateQueries({ queryKey: ['tickets'] });
        };
        const handleTicketUpdated = () => {
            queryClient.invalidateQueries({ queryKey: ['tickets'] });
        };
        socket.on('ticket:message', handleNewMessage);
        socket.on('ticket:updated', handleTicketUpdated);
        socket.on('ticket:new', handleTicketUpdated);
        socket.on('ticket:closed', handleTicketUpdated);
        return () => {
            socket.off('ticket:message', handleNewMessage);
            socket.off('ticket:updated', handleTicketUpdated);
            socket.off('ticket:new', handleTicketUpdated);
            socket.off('ticket:closed', handleTicketUpdated);
        };
    }, [socket, id, queryClient]);

    const selectBind = async (bind: { name: string; message: string }) => {
        setContent(''); setShowBinds(false); setSlashQuery(''); setSlashIndex(0);
        if (!id) return;
        try { await sendMessage({ id, content: bind.message, replyTo: replyTo?.id }); setReplyTo(null); } catch (_e) { }
    };

    const handleContentChange = (val: string) => {
        setContent(val);
        if (val.startsWith('/') && !editingMsg) {
            const q = val.slice(1);
            setSlashQuery(q); setShowBinds(true); setSlashIndex(0);
            if (q.length > 0) {
                const exact = bindList.filter(b => b.name.toLowerCase() === q.toLowerCase());
                if (exact.length === 1) { selectBind(exact[0]); return; }
            }
        } else { setShowBinds(false); setSlashQuery(''); }
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim() || !id) return;

        if (editingMsg) {
            try {
                await editMessage({ ticketId: id, msgId: editingMsg.id, content });
                setContent('');
                setEditingMsg(null);
            } catch (_e) { }
        } else {
            try {
                await sendMessage({ id, content, replyTo: replyTo?.id });
                setContent('');
                setReplyTo(null);
            } catch (_e) { }
        }
    };

    const handleReply = (msg: DiscordMessage) => {
        setEditingMsg(null);
        setReplyTo(msg);
        setContent('');
        inputRef.current?.focus();
    };

    const handleEdit = (msg: DiscordMessage) => {
        setReplyTo(null);
        setEditingMsg(msg);
        setContent(msg.content);
        inputRef.current?.focus();
    };

    const cancelAction = () => {
        setReplyTo(null);
        setEditingMsg(null);
        setContent('');
    };

    const handleGenerateSummary = async () => {
        if (!id) return;
        try {
            const data = await getSummary({ ticketId: id });
            setSummary(data.summary);
        } catch (e) {
            console.error('Failed to generate summary', e);
        }
    };

    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
    const useSkeletons = settings?.useSkeletons ?? true;

    if (isLoading) {
        return useSkeletons ? (
            <div className="h-[calc(100vh-8rem)] flex flex-col md:flex-row gap-4 md:gap-6 max-w-7xl mx-auto">
                <div className="flex-1 flex flex-col bg-card border border-border rounded-xl overflow-hidden p-6 gap-6">
                    <div className="flex items-center gap-4 border-b border-border pb-4">
                        <Skeleton className="w-10 h-10 rounded-lg" />
                        <div>
                            <Skeleton className="w-32 h-6" />
                            <Skeleton className="w-20 h-4 mt-2" />
                        </div>
                    </div>
                    <div className="flex-1 flex flex-col gap-6">
                        <div className="flex gap-4">
                            <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                            <div className="flex-1">
                                <Skeleton className="w-24 h-4 mb-2" />
                                <Skeleton className="w-[80%] h-24 rounded-2xl rounded-tl-sm" />
                            </div>
                        </div>
                        <div className="flex gap-4 flex-row-reverse">
                            <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                            <div className="flex-1 flex flex-col items-end">
                                <Skeleton className="w-24 h-4 mb-2" />
                                <Skeleton className="w-[60%] h-16 rounded-2xl rounded-tr-sm bg-primary/20" />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="hidden lg:flex w-80 shrink-0 flex-col gap-6">
                    <Skeleton className="w-full h-64 rounded-xl" />
                    <Skeleton className="w-full h-48 rounded-xl" />
                </div>
            </div>
        ) : (
            <div className="h-full flex items-center justify-center"><span className="animate-pulse">Загрузка истории...</span></div>
        );
    }

    return (
        <div className="h-[calc(100vh-8rem)] flex flex-col md:flex-row gap-4 md:gap-6 max-w-7xl mx-auto">
            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col bg-card border border-border rounded-xl overflow-hidden shadow-sm relative">
                <div className="h-14 md:h-16 px-4 md:px-6 border-b border-border bg-card/50 backdrop-blur flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3 md:gap-4">
                        <Link to="/tickets" className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h2 className="font-rajdhani font-bold text-base md:text-lg leading-tight flex items-center gap-2">
                                #{ticket?.channelName || 'Ticket'}
                                {ticket?.priority === 'high' && (
                                    <span className="px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded text-[10px] font-semibold flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" /> ПРИОРИТЕТ
                                    </span>
                                )}
                            </h2>
                            <p className="text-xs text-muted-foreground truncate max-w-[150px] md:max-w-xs">{ticket?.openerUsername}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleGenerateSummary}
                            disabled={isSummarizing || !messages || messages.length < 2}
                            className="bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 border border-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold px-3 min-h-[44px] flex items-center justify-center rounded-lg gap-1.5 transition-colors"
                        >
                            {isSummarizing ? (
                                <span className="animate-pulse">Анализ...</span>
                            ) : (
                                <>
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>AI Саммари</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar scroll-smooth relative">
                    <AnimatePresence>
                        {summary && (
                            <motion.div
                                initial={{ opacity: 0, y: -20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="mb-4 bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 relative"
                            >
                                <button
                                    onClick={() => setSummary(null)}
                                    className="absolute top-2 right-2 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center text-purple-500/70 hover:text-purple-500 hover:bg-purple-500/10 rounded-md transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                                <h4 className="flex items-center gap-2 text-purple-500 font-bold mb-2 text-sm uppercase string-wide">
                                    <Sparkles className="w-4 h-4" />
                                    Краткое содержание от AI
                                </h4>
                                <p className="text-sm text-foreground/90 leading-relaxed">
                                    {summary}
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {(!messages || messages.length === 0) ? (
                        <div className="h-full flex flex-col justify-center items-center text-muted-foreground italic">Нет сообщений</div>
                    ) : messages.map((msg) => {
                        const isBotProxy = !!msg.author.bot && (msg.content || '').includes('[Саппорт]');
                        const taggedMine = typeof msg._isMine === 'boolean' ? msg._isMine : null;
                        const taggedStaff = typeof msg._isStaff === 'boolean' ? msg._isStaff : null;
                        const isOpenerMessage = !!ticket?.openerId && msg.author?.id === ticket.openerId;
                        const baseMine = taggedMine !== null
                            ? taggedMine
                            : (taggedStaff !== null
                                ? taggedStaff
                                : (!!ticket?.openerId && !isOpenerMessage));
                        const isMine = baseMine || isBotProxy;
                        return (
                            <ChatMessage
                                key={msg.id}
                                message={msg}
                                isStaff={isMine}
                                mentionMap={mentionMap}
                                onReply={handleReply}
                                onEdit={handleEdit}
                                canEdit={isMine || isBotProxy}
                            />
                        );
                    })}
                </div>

                <div className="p-3 md:p-4 bg-background border-t border-border shrink-0 relative">
                    {/* Reply/Edit indicator */}
                    <AnimatePresence>
                        {(replyTo || editingMsg) && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg bg-secondary/50 border border-border/50 text-sm">
                                    {replyTo ? (
                                        <>
                                            <Reply className="w-4 h-4 text-primary shrink-0" />
                                            <span className="text-muted-foreground">Ответ</span>
                                            <span className="font-semibold text-foreground truncate">
                                                {replyTo.author.global_name || replyTo.author.username}
                                            </span>
                                            <span className="text-muted-foreground truncate flex-1 text-xs">
                                                {replyTo.content?.slice(0, 60) || '[embed]'}{replyTo.content && replyTo.content.length > 60 ? '…' : ''}
                                            </span>
                                        </>
                                    ) : editingMsg ? (
                                        <>
                                            <Pencil className="w-4 h-4 text-yellow-500 shrink-0" />
                                            <span className="text-muted-foreground">Редактирование</span>
                                            <span className="text-muted-foreground truncate flex-1 text-xs">
                                                {editingMsg.content?.slice(0, 60) || ''}{editingMsg.content && editingMsg.content.length > 60 ? '…' : ''}
                                            </span>
                                        </>
                                    ) : null}
                                    <button onClick={cancelAction} className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors shrink-0">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {showBinds && content.startsWith('/') && filteredBinds.length > 0 && (
                            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                                className="absolute bottom-full left-3 right-3 md:left-4 md:right-4 mb-2 max-h-52 overflow-y-auto custom-scrollbar bg-card border border-border rounded-xl shadow-2xl z-50">
                                <div className="p-1.5">
                                    {filteredBinds.map((b, idx) => (
                                        <button key={b.name} type="button" onClick={() => selectBind(b)}
                                            className={`w-full text-left px-3 min-h-[44px] flex items-center gap-3 group rounded-lg transition-colors ${idx === slashIndex ? 'bg-primary/15 text-foreground' : 'hover:bg-secondary/70 text-muted-foreground hover:text-foreground'}`}>
                                            <span className="font-mono text-primary text-sm font-bold shrink-0">/{b.name}</span>
                                            <span className="text-xs truncate opacity-60 group-hover:opacity-90">{b.message.slice(0, 80)}{b.message.length > 80 ? '…' : ''}</span>
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <form onSubmit={handleSend} className="relative">
                        <textarea
                            ref={inputRef}
                            value={content}
                            onChange={e => handleContentChange(e.target.value)}
                            placeholder={editingMsg ? 'Введите новый текст...' : replyTo ? 'Напишите ответ...' : 'Напишите ответ или / для бинда...'}
                            className="w-full bg-secondary/50 border border-border rounded-xl pl-4 pr-16 py-3 custom-scrollbar min-h-[48px] md:min-h-[56px] max-h-32 resize-none focus:outline-none focus:border-primary transition-colors text-sm"
                            onKeyDown={e => {
                                if (showBinds && content.startsWith('/') && filteredBinds.length > 0) {
                                    if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex(prev => Math.min(prev + 1, filteredBinds.length - 1)); return; }
                                    if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex(prev => Math.max(prev - 1, 0)); return; }
                                    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); selectBind(filteredBinds[slashIndex]); return; }
                                    if (e.key === 'Escape') { e.preventDefault(); setShowBinds(false); setContent(''); return; }
                                }
                                if (e.key === 'Escape') { e.preventDefault(); cancelAction(); return; }
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as any); }
                            }} />
                        <div className="absolute right-2 top-2">
                            <button type="submit" disabled={(isPending || isEditing) || !content.trim()} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50">
                                {editingMsg ? <Pencil className="w-4 h-4 md:w-5 md:h-5" /> : <Send className="w-4 h-4 md:w-5 md:h-5" />}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Info Sidebar — hidden on mobile */}
            <div className="hidden lg:flex w-80 shrink-0 flex-col gap-4 overflow-y-auto custom-scrollbar">
                <TicketInfoSidebar ticket={ticket} />
            </div>
        </div>
    );
}

function TicketInfoSidebar({ ticket }: { ticket: any }) {
    const [now, setNow] = useState(Date.now());
    const { data: userProfile, isLoading: isProfileLoading } = useUserProfile(ticket?.openerId);
    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
    const useSkeletons = settings?.useSkeletons ?? true;

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    const formatAge = (ms: number) => {
        const s = Math.floor(ms / 1000);
        if (s < 60) return `${s}с назад`;
        const m = Math.floor(s / 60);
        if (m < 60) return `${m}м назад`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}ч ${m % 60}м назад`;
        const d = Math.floor(h / 24);
        return `${d}д ${h % 24}ч назад`;
    };

    const lastMsgAge = ticket?.lastMessageAt ? now - ticket.lastMessageAt : null;
    const ticketAge = ticket?.createdAt ? now - ticket.createdAt : null;
    const slaMs = ticket?.firstStaffReplyAt && ticket?.createdAt ? ticket.firstStaffReplyAt - ticket.createdAt : null;

    const getSlaColor = () => {
        if (ticket?.firstStaffReplyAt) return 'text-emerald-500';
        if (!ticketAge) return 'text-muted-foreground';
        if (ticketAge < 30 * 60 * 1000) return 'text-emerald-500'; // < 30m
        if (ticketAge < 2 * 60 * 60 * 1000) return 'text-yellow-500'; // < 2h
        return 'text-red-500';
    };

    return (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <h3 className="font-rajdhani font-bold text-lg mb-4 text-foreground uppercase tracking-wide">Информация</h3>
            <div className="space-y-4">
                <div>
                    <div className="text-xs text-muted-foreground mb-1 uppercase font-semibold">Автор тикета</div>
                    <div className="flex justify-between items-center text-sm font-medium">
                        {(() => {
                            let name = ticket?.openerUsername || '';
                            if (!name && ticket?.channelName) {
                                const m = ticket.channelName.match(/(?:тикет|ticket|тикeт)-(?:от|from)-(.+)/i);
                                if (m) name = m[1];
                            }
                            return name || '—';
                        })()}
                        {ticket?.openerId && <span className="text-xs text-muted-foreground bg-secondary px-2 rounded">{ticket.openerId}</span>}
                    </div>
                </div>

                <div className="pt-4 border-t border-border/50">
                    <div className="text-xs text-muted-foreground mb-1 uppercase font-semibold">Последнее сообщение</div>
                    {lastMsgAge !== null ? (
                        <div className="space-y-1">
                            <div className={`text-sm font-medium ${lastMsgAge > 30 * 60 * 1000 ? 'text-yellow-500' : lastMsgAge > 2 * 60 * 60 * 1000 ? 'text-red-500' : 'text-foreground'}`}>
                                {formatAge(lastMsgAge)}
                            </div>
                            {ticket?.lastMessage && (
                                <p className="text-xs text-muted-foreground truncate">{ticket.lastMessage}</p>
                            )}
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground italic">Нет данных</div>
                    )}
                </div>

                <div className="pt-4 border-t border-border/50">
                    <div className="text-xs text-muted-foreground mb-1 uppercase font-semibold">SLA • Первый ответ</div>
                    <div className={`text-sm font-medium ${getSlaColor()}`}>
                        {ticket?.firstStaffReplyAt ? (
                            <>✅ {formatAge(slaMs!).replace(' назад', '')}</>
                        ) : (
                            <>⏳ Ожидание {ticketAge ? formatAge(ticketAge).replace(' назад', '') : ''}</>
                        )}
                    </div>
                </div>

                <div className="pt-4 border-t border-border/50">
                    <div className="text-xs text-muted-foreground mb-1 uppercase font-semibold">Таймер активности</div>
                    <div className="text-sm">
                        {ticket?.activityTimerType === 'user' ? <span className="text-yellow-500 font-medium">⏳ Ожидается ответ юзера</span>
                            : ticket?.activityTimerType === 'closing' ? <span className="text-red-500 font-medium animate-pulse">🔒 Готовится к закрытию</span>
                                : ticket?.waitingForReply ? <span className="text-orange-400 font-medium">💬 Ожидает ответа</span>
                                    : <span className="text-muted-foreground italic">Таймеров нет</span>}
                    </div>
                </div>

                <div className="pt-4 border-t border-border/50">
                    <div className="text-xs text-muted-foreground mb-1 uppercase font-semibold">Создан</div>
                    <div className="text-sm font-medium">
                        {ticket?.createdAt ? format(new Date(ticket.createdAt), 'dd.MM.yyyy HH:mm', { locale: ru }) : '-'}
                    </div>
                    {ticketAge && (
                        <div className="text-xs text-muted-foreground mt-0.5">{formatAge(ticketAge)}</div>
                    )}
                </div>
            </div>

            {/* CRM Profile Section */}
            {ticket?.openerId && (
                <div className="mt-6 pt-6 border-t border-border">
                    <h3 className="font-rajdhani font-bold text-lg mb-4 text-foreground uppercase tracking-wide flex items-center gap-2">
                        <span className="bg-primary/10 text-primary p-1 rounded"><AlertCircle className="w-4 h-4" /></span>
                        Профиль Клиента
                    </h3>

                    {isProfileLoading ? (
                        useSkeletons ? (
                            <div className="space-y-4">
                                <Skeleton className="w-full h-8" />
                                <div className="grid grid-cols-2 gap-2">
                                    <Skeleton className="h-16 w-full" />
                                    <Skeleton className="h-16 w-full" />
                                </div>
                                <Skeleton className="w-full h-24" />
                            </div>
                        ) : (
                            <div className="space-y-3 animate-pulse">
                                <div className="h-4 bg-secondary/50 rounded w-3/4"></div>
                                <div className="h-4 bg-secondary/50 rounded w-1/2"></div>
                                <div className="h-4 bg-secondary/50 rounded w-full"></div>
                            </div>
                        )
                    ) : userProfile ? (
                        <div className="space-y-4">
                            {userProfile.isBanned && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs px-3 py-2 rounded-lg font-medium flex items-center justify-center">
                                    Пользователь ЗАБЛОКИРОВАН
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-2 text-center">
                                <div className="bg-secondary/30 rounded-lg p-2 border border-border/50">
                                    <div className="text-[10px] text-muted-foreground uppercase font-bold">Всего тикетов</div>
                                    <div className="text-lg font-rajdhani font-bold text-foreground">{userProfile.stats.totalCreated}</div>
                                </div>
                                <div className="bg-secondary/30 rounded-lg p-2 border border-border/50">
                                    <div className="text-[10px] text-muted-foreground uppercase font-bold">Закрытых</div>
                                    <div className="text-lg font-rajdhani font-bold text-foreground">{userProfile.stats.closed}</div>
                                </div>
                            </div>

                            {userProfile.stats.highPriority > 0 && (
                                <div className="text-xs text-muted-foreground flex items-center gap-1.5 bg-yellow-500/10 text-yellow-500/90 rounded px-2 py-1">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    Использовал высокий приоритет: {userProfile.stats.highPriority} раз
                                </div>
                            )}

                            {userProfile.historyTickets && userProfile.historyTickets.length > 0 && (
                                <div className="pt-2">
                                    <div className="text-xs text-muted-foreground mb-2 uppercase font-semibold">История обращений</div>
                                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                                        {userProfile.historyTickets.map((t: any) => (
                                            <div key={t.id} className="text-xs bg-secondary/20 border border-border/50 rounded p-2 flex justify-between items-center group hover:bg-secondary/40 transition-colors">
                                                <div className="truncate pr-2 text-muted-foreground group-hover:text-foreground transition-colors">#{t.name}</div>
                                                <div className="shrink-0 opacity-60 text-[10px]">{format(new Date(t.createdAt), 'dd.MM.yy', { locale: ru })}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground italic">Профиль не найден</div>
                    )}
                </div>
            )}
        </div>
    );
}
