import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTicketMessages, useSendTicketMessage, useTickets } from '../hooks/useTickets';
import { fetchBinds } from '../api/stats';
import { useSocket } from '../hooks/useSocket';
import ChatMessage from '../components/ChatMessage';
import { ArrowLeft, Send, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

export default function TicketDetail() {
    const { id } = useParams<{ id: string }>();
    const { data: messages, isLoading } = useTicketMessages(id);
    const { data: tickets } = useTickets();
    const { mutateAsync: sendMessage, isPending } = useSendTicketMessage();
    const socket = useSocket();
    const queryClient = useQueryClient();
    const scrollRef = useRef<HTMLDivElement>(null);

    const [content, setContent] = useState('');
    const [binds, setBinds] = useState<Record<string, { name: string, message: string }>>({});
    const [showBinds, setShowBinds] = useState(false);
    const [slashQuery, setSlashQuery] = useState('');
    const [slashIndex, setSlashIndex] = useState(0);

    const ticket = tickets?.find(t => t.channelId === id);

    // Filtered binds based on slash query
    const bindList = Object.values(binds);
    const filteredBinds = slashQuery
        ? bindList.filter(b => b.name.toLowerCase().startsWith(slashQuery.toLowerCase()))
        : bindList;

    useEffect(() => {
        fetchBinds().then(setBinds).catch(console.error);
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    useEffect(() => {
        if (!socket || !id) return;

        const handleNewMessage = (data: any) => {
            if (data.channelId === id) {
                queryClient.invalidateQueries({ queryKey: ['tickets', id, 'messages'] });
            }
        };

        socket.on('ticket:message', handleNewMessage);
        return () => {
            socket.off('ticket:message', handleNewMessage);
        };
    }, [socket, id, queryClient]);

    // Auto-send when exactly one bind matches the typed slash command
    const selectBind = async (bind: { name: string; message: string }) => {
        setContent('');
        setShowBinds(false);
        setSlashQuery('');
        setSlashIndex(0);
        if (!id) return;
        try {
            await sendMessage({ id, content: bind.message });
        } catch (_e) { }
    };

    const handleContentChange = (val: string) => {
        setContent(val);
        if (val.startsWith('/')) {
            const q = val.slice(1);
            setSlashQuery(q);
            setShowBinds(true);
            setSlashIndex(0);

            // Auto-send on exact single match
            if (q.length > 0) {
                const exact = bindList.filter(b => b.name.toLowerCase() === q.toLowerCase());
                if (exact.length === 1) {
                    selectBind(exact[0]);
                    return;
                }
            }
        } else {
            setShowBinds(false);
            setSlashQuery('');
        }
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim() || !id) return;
        try {
            await sendMessage({ id, content });
            setContent('');
        } catch (_e) { }
    };



    if (isLoading) {
        return <div className="h-full flex items-center justify-center"><span className="animate-pulse">Загрузка истории...</span></div>;
    }

    return (
        <div className="h-[calc(100vh-8rem)] flex gap-6 max-w-7xl mx-auto">
            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col bg-card border border-border rounded-xl overflow-hidden shadow-sm relative">
                {/* Header */}
                <div className="h-16 px-6 border-b border-border bg-card/50 backdrop-blur flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-4">
                        <Link to="/tickets" className="p-2 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h2 className="font-rajdhani font-bold text-lg leading-tight">#{ticket?.channelName || 'Ticket'}</h2>
                            <p className="text-xs text-muted-foreground truncate max-w-xs">{ticket?.openerUsername}</p>
                        </div>
                    </div>
                    {ticket?.priority === 'high' && (
                        <div className="px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded text-xs font-semibold flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            ВЫСОКИЙ ПРИОРИТЕТ
                        </div>
                    )}
                </div>

                {/* Messages */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 custom-scrollbar scroll-smooth">
                    {(!messages || messages.length === 0) ? (
                        <div className="h-full flex flex-col justify-center items-center text-muted-foreground italic">
                            Нет сообщений для отображения
                        </div>
                    ) : (
                        messages.map((msg) => {
                            // Hacky way to guess if it's staff (either bot itself or someone with certain roles, or just admin)
                            // Since we don't have full context here, we assume if it's NOT the opener, it's staff
                            const isStaff = ticket ? msg.author.id !== ticket.openerId && !msg.author.bot : false;
                            // But bot messages sent on behalf of staff should be right-aligned
                            const isBotProxy = !!msg.author.bot && msg.content.includes('[Саппорт]');

                            return <ChatMessage key={msg.id} message={msg} isStaff={isStaff || isBotProxy} />;
                        })
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 bg-background border-t border-border shrink-0 relative">
                    {/* Slash Command Autocomplete Popup */}
                    <AnimatePresence>
                        {showBinds && content.startsWith('/') && filteredBinds.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 8 }}
                                className="absolute bottom-full left-4 right-4 mb-2 max-h-52 overflow-y-auto custom-scrollbar bg-card border border-border rounded-xl shadow-2xl z-50"
                            >
                                <div className="p-1.5">
                                    {filteredBinds.map((b, idx) => (
                                        <button
                                            key={b.name}
                                            type="button"
                                            onClick={() => selectBind(b)}
                                            className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center gap-3 group ${idx === slashIndex
                                                ? 'bg-primary/15 text-foreground'
                                                : 'hover:bg-secondary/70 text-muted-foreground hover:text-foreground'
                                                }`}
                                        >
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
                            value={content}
                            onChange={e => handleContentChange(e.target.value)}
                            placeholder="Напишите ответ или / для быстрых команд..."
                            className="w-full bg-secondary/50 border border-border rounded-xl pl-4 pr-24 py-3 custom-scrollbar min-h-[56px] max-h-32 resize-none focus:outline-none focus:border-primary transition-colors text-sm"
                            onKeyDown={e => {
                                // Slash autocomplete keyboard nav
                                if (showBinds && content.startsWith('/') && filteredBinds.length > 0) {
                                    if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        setSlashIndex(prev => Math.min(prev + 1, filteredBinds.length - 1));
                                        return;
                                    }
                                    if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        setSlashIndex(prev => Math.max(prev - 1, 0));
                                        return;
                                    }
                                    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                                        e.preventDefault();
                                        selectBind(filteredBinds[slashIndex]);
                                        return;
                                    }
                                    if (e.key === 'Escape') {
                                        e.preventDefault();
                                        setShowBinds(false);
                                        setContent('');
                                        return;
                                    }
                                }
                                // Normal Enter = send
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend(e as any);
                                }
                            }}
                        />

                        <div className="absolute right-2 top-2 flex items-center gap-1">
                            <button
                                type="submit"
                                disabled={isPending || !content.trim()}
                                className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                            >
                                <Send className="w-5 h-5" />
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Info Sidebar */}
            <div className="w-80 shrink-0 flex flex-col gap-4">
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <h3 className="font-rajdhani font-bold text-lg mb-4 text-foreground uppercase tracking-wide">Информация</h3>
                    <div className="space-y-4">
                        <div>
                            <div className="text-xs text-muted-foreground mb-1 uppercase font-semibold">Автор тикета</div>
                            <div className="flex justify-between items-center text-sm font-medium">
                                {ticket?.openerUsername}
                                <span className="text-xs text-muted-foreground bg-secondary px-2 rounded">{ticket?.openerId}</span>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-border/50">
                            <div className="text-xs text-muted-foreground mb-1 uppercase font-semibold">Таймер активности</div>
                            <div className="text-sm">
                                {ticket?.activityTimerType === 'user' ? (
                                    <span className="text-yellow-500 font-medium">Ожидается ответ юзера</span>
                                ) : ticket?.activityTimerType === 'close' ? (
                                    <span className="text-red-500 font-medium animate-pulse">Готовится к закрытию</span>
                                ) : (
                                    <span className="text-muted-foreground italic">Таймеров нет</span>
                                )}
                            </div>
                        </div>

                        <div className="pt-4 border-t border-border/50">
                            <div className="text-xs text-muted-foreground mb-1 uppercase font-semibold">Создан</div>
                            <div className="text-sm font-medium">
                                {ticket?.createdAt ? format(new Date(ticket.createdAt), 'dd.MM.yyyy HH:mm', { locale: ru }) : '-'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
