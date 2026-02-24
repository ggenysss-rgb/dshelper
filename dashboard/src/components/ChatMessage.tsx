import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { DiscordMessage } from '../api/tickets';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';

const IMAGE_URL_RE = /(https?:\/\/[^\s]+\.(?:gif|png|jpg|jpeg|webp)(?:\?[^\s]*)?)/gi;
const URL_RE = /(https?:\/\/[^\s]+)/gi;

function renderContent(text: string) {
    // Split by image URLs first
    const parts = text.split(IMAGE_URL_RE);
    return parts.map((part, i) => {
        if (IMAGE_URL_RE.test(part)) {
            IMAGE_URL_RE.lastIndex = 0;
            return (
                <img key={i} src={part} alt="" className="rounded-lg max-h-64 mt-1 mb-1 object-contain" />
            );
        }
        // For non-image parts, linkify remaining URLs
        const subParts = part.split(URL_RE);
        return subParts.map((sub, j) => {
            if (URL_RE.test(sub)) {
                URL_RE.lastIndex = 0;
                return (
                    <a key={`${i}-${j}`} href={sub} target="_blank" rel="noreferrer"
                        className="underline opacity-80 hover:opacity-100 break-all">{sub}</a>
                );
            }
            return sub;
        });
    });
}

export default function ChatMessage({ message, isStaff }: { message: DiscordMessage; isStaff: boolean }) {
    const isBot = message.author.bot;
    const contentIsImageOnly = message.content && IMAGE_URL_RE.test(message.content) && message.content.trim().match(IMAGE_URL_RE)?.join('').length === message.content.trim().length;
    IMAGE_URL_RE.lastIndex = 0;

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

                    {message.content ? (
                        contentIsImageOnly ? (
                            <div className="rounded-2xl overflow-hidden">
                                {renderContent(message.content)}
                            </div>
                        ) : (
                            <div className={cn(
                                "p-3.5 rounded-2xl relative shadow-sm text-sm whitespace-pre-wrap leading-relaxed",
                                isStaff
                                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                                    : "bg-secondary text-foreground rounded-tl-sm border border-border/50"
                            )}>
                                {renderContent(message.content)}
                            </div>
                        )
                    ) : null}

                    {message.embeds && message.embeds.length > 0 && message.embeds.map((embed, ei) => {
                        const borderColor = embed.color ? `#${embed.color.toString(16).padStart(6, '0')}` : 'hsl(var(--border))';
                        return (
                            <div key={ei} className="mt-1 rounded-lg bg-secondary/80 border border-border/50 overflow-hidden max-w-md"
                                style={{ borderLeftWidth: '3px', borderLeftColor: borderColor }}>
                                <div className="p-3 space-y-1.5">
                                    {embed.author && <p className="text-xs font-semibold text-muted-foreground">{embed.author.name}</p>}
                                    {embed.title && <p className="text-sm font-bold text-foreground">{embed.title}</p>}
                                    {embed.description && <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{embed.description}</p>}
                                    {embed.fields && embed.fields.length > 0 && (
                                        <div className="grid grid-cols-1 gap-1.5 mt-2">
                                            {embed.fields.map((f, fi) => (
                                                <div key={fi}>
                                                    <p className="text-[10px] font-bold text-muted-foreground uppercase">{f.name}</p>
                                                    <p className="text-xs text-foreground/80 whitespace-pre-wrap">{f.value}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {embed.image && <img src={embed.image.url} alt="" className="rounded mt-2 max-h-48 object-cover" />}
                                    {embed.thumbnail && <img src={embed.thumbnail.url} alt="" className="rounded mt-1 max-h-16 object-cover" />}
                                    {embed.footer && <p className="text-[10px] text-muted-foreground mt-2">{embed.footer.text}</p>}
                                </div>
                            </div>
                        );
                    })}

                    {!message.content && (!message.embeds || message.embeds.length === 0) && (
                        <div className="p-3.5 rounded-2xl bg-secondary border border-border/50 rounded-tl-sm">
                            <span className="italic text-muted-foreground text-xs">[без текста]</span>
                        </div>
                    )}

                    {message.attachments && message.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
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
        </motion.div>
    );
}
