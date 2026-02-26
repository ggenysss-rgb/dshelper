import { useQuery } from '@tanstack/react-query';
import { fetchMembers } from '../api/stats';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, ChevronDown, ChevronRight, PanelRightClose } from 'lucide-react';
import { useState } from 'react';

type Member = {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
    status: string;
};

type RoleGroup = {
    roleId: string;
    roleName: string;
    roleColor: string;
    position: number;
    members: Member[];
};

type MemberPanelProps = {
    onClose?: () => void;
};

const STATUS_ORDER: Record<string, number> = {
    online: 0,
    idle: 1,
    dnd: 2,
    offline: 3,
};

const normalizeStatus = (status: string | undefined) => {
    if (status === 'online' || status === 'idle' || status === 'dnd') return status;
    return 'offline';
};

export default function MemberPanel({ onClose }: MemberPanelProps) {
    const { data: groups, isLoading } = useQuery<RoleGroup[]>({
        queryKey: ['members'],
        queryFn: fetchMembers,
        refetchInterval: 60000,
    });
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    const toggle = (roleId: string) => {
        setCollapsed(prev => ({ ...prev, [roleId]: !prev[roleId] }));
    };

    const totalMembers = groups?.reduce((s, g) => s + g.members.length, 0) ?? 0;

    return (
        <div className="member-panel-shell w-64 shrink-0 bg-card border-l border-border h-full overflow-y-auto custom-scrollbar">
            {/* Header */}
            <div className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2 text-sm font-rajdhani font-bold uppercase tracking-wider text-muted-foreground">
                    <Users className="w-4 h-4" />
                    <span>Участники</span>
                    {!isLoading && (
                        <span className="ml-auto text-xs bg-secondary px-2 py-0.5 rounded-full">{totalMembers}</span>
                    )}
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="ml-1 w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors"
                            title="Скрыть панель участников"
                            aria-label="Скрыть панель участников"
                        >
                            <PanelRightClose className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {isLoading ? (
                <div className="p-4 space-y-3">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex items-center gap-2 animate-pulse">
                            <div className="w-8 h-8 bg-secondary rounded-full" />
                            <div className="h-3 bg-secondary rounded w-24" />
                        </div>
                    ))}
                </div>
            ) : !groups || groups.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                    Участники пока не загружены.
                </div>
            ) : (
                <div className="py-2">
                    {groups.map((group) => (
                        <div key={group.roleId}>
                            {/* Role Header */}
                            <button
                                onClick={() => toggle(group.roleId)}
                                className="w-full flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-secondary/50 transition-colors"
                                style={{ color: group.roleColor }}
                            >
                                {collapsed[group.roleId] ? (
                                    <ChevronRight className="w-3 h-3 shrink-0" />
                                ) : (
                                    <ChevronDown className="w-3 h-3 shrink-0" />
                                )}
                                <span className="truncate">{group.roleName}</span>
                                <span className="ml-auto opacity-60">— {group.members.length}</span>
                            </button>

                            {/* Members */}
                            <AnimatePresence initial={false}>
                                {!collapsed[group.roleId] && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                                        className="overflow-hidden"
                                    >
                                        {[...group.members]
                                            .sort((a, b) => {
                                                const statusDiff = STATUS_ORDER[normalizeStatus(a.status)] - STATUS_ORDER[normalizeStatus(b.status)];
                                                if (statusDiff !== 0) return statusDiff;
                                                return (a.displayName || '').localeCompare(b.displayName || '', 'ru');
                                            })
                                            .map(member => {
                                                const status = normalizeStatus(member.status);
                                                const statusColor = status === 'online'
                                                    ? 'bg-green-500'
                                                    : status === 'idle'
                                                        ? 'bg-yellow-500'
                                                        : status === 'dnd'
                                                            ? 'bg-red-500'
                                                            : 'bg-gray-500';

                                                return (
                                            <div
                                                key={`${group.roleId}-${member.id}`}
                                                className="flex items-center gap-2.5 px-4 py-1.5 hover:bg-secondary/30 rounded-lg mx-1 transition-colors cursor-default group min-w-0"
                                            >
                                                {/* Avatar with status indicator */}
                                                <div className="relative shrink-0">
                                                    <img
                                                        src={member.avatar}
                                                        alt={member.displayName}
                                                        className="w-8 h-8 rounded-full object-cover bg-secondary"
                                                        loading="lazy"
                                                        onError={(e) => {
                                                            (e.target as HTMLImageElement).src = `https://cdn.discordapp.com/embed/avatars/0.png`;
                                                        }}
                                                    />
                                                    <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card ${statusColor}`} />
                                                </div>
                                                {/* Name */}
                                                <div className="min-w-0">
                                                    <div className="text-sm truncate text-muted-foreground group-hover:text-foreground transition-colors">
                                                        {member.displayName || member.username || member.id}
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground/70 truncate">
                                                        @{member.username || 'unknown'}
                                                    </div>
                                                </div>
                                            </div>
                                                );
                                            })}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
