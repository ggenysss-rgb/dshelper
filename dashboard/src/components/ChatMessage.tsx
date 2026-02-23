import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { DiscordMessage } from '../api/tickets';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';

export default function ChatMessage({ message, isStaff }: { message: DiscordMessage; isStaff: boolean }) {
    const isBot = message.author.bot;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className={cn("flex w-full mb-6", isStaff ? "justify-end" : "justify-start")}
        >
            <div className={cn("flex max-w-[80%] gap-4", isStaff && "flex-row-reverse")}>
                <div className="shrink-0 mt-1">
                    {message.author.avatar ? (
                        <img
                            src={`https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.png`}
                            className="w-10 h-10 rounded-full bg-secondary object-cover ring-2 ring-background"
                            alt="avatar"
                        />
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-bold text-muted-foreground ring-2 ring-background">
                            {message.author.username[0].toUpperCase()}
                        </div>
                    )}
                </div>

                <div className={cn("flex flex-col", isStaff ? "items-end" : "items-start")}>
                    <div className="flex items-baseline gap-2 mb-1.5 px-1">
                        <span className={cn("text-sm font-semibold", isStaff ? "text-primary" : "text-foreground")}>
                            {message.author.global_name || message.author.username}
                        </span>
                        {isBot && (
                            <span className="text-[10px] bg-[#5865F2] text-white px-1.5 py-0.5 rounded font-medium tracking-wide uppercase">
                                Bot
                            </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                            {format(new Date(message.timestamp), 'HH:mm • d MMM', { locale: ru })}
                        </span>
                    </div>

                    <div className={cn(
                        "p-3.5 rounded-2xl relative shadow-sm text-sm whitespace-pre-wrap leading-relaxed",
                        isStaff
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-secondary text-foreground rounded-tl-sm border border-border/50"
                    )}>
                        {message.content}

                        {message.attachments && message.attachments.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {message.attachments.map(att => (
                                    <a
                                        key={att.id}
                                        href={att.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block rounded-lg overflow-hidden border border-white/20 relative group"
                                    >
                                        {att.content_type?.startsWith('image/') ? (
                                            <img src={att.url} alt="attachment" className="max-h-48 object-cover group-hover:opacity-90 transition-opacity" />
                                        ) : (
                                            <div className="p-3 bg-black/20 italic text-sm underline group-hover:bg-black/30 transition-colors">
                                                Вложение: {att.filename}
                                            </div>
                                        )}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
