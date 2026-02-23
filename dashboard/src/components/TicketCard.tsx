import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Ticket as TicketIcon, Clock, MessageSquare } from 'lucide-react';
import type { Ticket } from '../api/tickets';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';

export default function TicketCard({ ticket }: { ticket: Ticket }) {
    const isHighPriority = ticket.priority === 'high';
    const isWaiting = ticket.waitingForReply;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -2 }}
            className={cn(
                "group relative bg-card rounded-xl border p-5 transition-all hover:shadow-lg",
                isHighPriority ? "border-primary/50 hover:border-primary shadow-primary/5" : "border-border hover:border-muted-foreground/30"
            )}
        >
            {isHighPriority && (
                <div className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2">
                    <span className="flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                    </span>
                </div>
            )}

            <Link to={`/tickets/${ticket.channelId}`} className="absolute inset-0 z-10" />

            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg", isHighPriority ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground")}>
                        <TicketIcon className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-rajdhani text-lg font-bold flex items-center gap-2">
                            #{ticket.channelName}
                            {isWaiting && <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-500 font-inter font-medium tracking-normal">Ожидает ответа</span>}
                        </h3>
                        <p className="text-sm text-muted-foreground">{ticket.openerUsername || 'Пользователь'}</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/30 px-2 py-1 rounded">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDistanceToNow(ticket.createdAt, { addSuffix: true, locale: ru })}
                    </div>
                </div>
            </div>

            <div className="bg-background/50 rounded-lg p-3 border border-border/50 flex items-start gap-3">
                <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                    {ticket.lastMessage || 'Нет сообщений...'}
                </p>
            </div>
        </motion.div>
    );
}
