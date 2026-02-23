import { useState, useMemo, useEffect } from 'react';
import { useTickets } from '../hooks/useTickets';
import { useSocket } from '../hooks/useSocket';
import { useQueryClient } from '@tanstack/react-query';
import TicketCard from '../components/TicketCard';
import { Search, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Tickets() {
    const { data: tickets, isLoading } = useTickets();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'high' | 'waiting'>('all');

    const socket = useSocket();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!socket) return;

        const handleUpdate = () => {
            queryClient.invalidateQueries({ queryKey: ['tickets'] });
        };

        socket.on('ticket:new', handleUpdate);
        socket.on('ticket:updated', handleUpdate);
        socket.on('ticket:closed', handleUpdate);

        return () => {
            socket.off('ticket:new', handleUpdate);
            socket.off('ticket:updated', handleUpdate);
            socket.off('ticket:closed', handleUpdate);
        };
    }, [socket, queryClient]);

    const filteredTickets = useMemo(() => {
        if (!tickets) return [];

        return tickets
            .filter(t => {
                if (filter === 'high') return t.priority === 'high';
                if (filter === 'waiting') return t.waitingForReply;
                return true;
            })
            .filter(t =>
                t.channelName.toLowerCase().includes(search.toLowerCase()) ||
                t.openerUsername.toLowerCase().includes(search.toLowerCase())
            )
            .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    }, [tickets, search, filter]);

    return (
        <div className="max-w-6xl mx-auto h-full flex flex-col">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-rajdhani font-bold text-foreground">Активные тикеты</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Всего тикетов: {tickets?.length || 0}</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-primary transition-colors" />
                        <input
                            type="text"
                            placeholder="Поиск по нику или #..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary w-64 transition-all"
                        />
                    </div>

                    <div className="flex bg-secondary border border-border rounded-lg p-1">
                        {(['all', 'high', 'waiting'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filter === f
                                        ? 'bg-background text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                                    }`}
                            >
                                {f === 'all' ? 'Все' : f === 'high' ? 'Высокий приоритет' : 'Ожидают'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 pb-6 custom-scrollbar">
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="h-40 bg-secondary/50 rounded-xl animate-pulse"></div>
                        ))}
                    </div>
                ) : filteredTickets.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-xl">
                        <Filter className="w-12 h-12 mb-4 opacity-50" />
                        <p className="font-medium text-lg">Тикеты не найдены</p>
                        <p className="text-sm mt-1">Попробуйте изменить параметры фильтрации</p>
                    </div>
                ) : (
                    <motion.div
                        layout
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                    >
                        <AnimatePresence>
                            {filteredTickets.map(ticket => (
                                <motion.div
                                    key={ticket.channelId}
                                    layout
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                                >
                                    <TicketCard ticket={ticket} />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
