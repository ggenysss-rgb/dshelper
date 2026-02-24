import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Clock, MessageSquare, User, AlertCircle } from 'lucide-react';
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
                "group relative bg-card rounded-xl border transition-all hover:shadow-lg overflow-hidden",
                isHighPriority ? "border-primary/50 hover:border-primary shadow-primary/5" : "border-border hover:border-muted-foreground/30"
            )}
        >
            {isHighPriority && (
                <div className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 z-20">
                    <span className="flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                    </span>
                </div>
            )}

            <Link to={`/tickets/${ticket.channelId}`} className="absolute inset-0 z-10" />

            {/* Header */}
            <div className="px-4 pt-4 pb-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="font-rajdhani text-base font-bold truncate text-foreground">
                            #{ticket.channelName}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-1">
                            <User className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="text-xs text-muted-foreground truncate">
                                {ticket.openerUsername || 'Пользователь'}
                            </span>
                        </div>
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            <span>{formatDistanceToNow(ticket.createdAt, { addSuffix: true, locale: ru })}</span>
                        </div>
                        {isWaiting && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-yellow-500/15 text-yellow-500 font-medium whitespace-nowrap border border-yellow-500/20">
                                Ожидает ответа
                            </span>
                        )}
                        {isHighPriority && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary/15 text-primary font-medium whitespace-nowrap border border-primary/20 flex items-center gap-1">
                                <AlertCircle className="w-2.5 h-2.5" /> Приоритет
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Last message preview */}
            <div className="px-4 pb-4">
                <div className="bg-background/50 rounded-lg px-3 py-2.5 border border-border/40">
                    <div className="flex items-start gap-2">
                        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {ticket.lastMessage || 'Нет сообщений...'}
                        </p>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
