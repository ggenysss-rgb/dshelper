import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMembers } from '../api/stats';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, ChevronDown, ChevronRight, PanelRightClose } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSocket } from '../hooks/useSocket';

type Member = {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
    status: string;
    customStatus?: string | null;
    activityText?: string | null;
    nameColor?: string | null;
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

const STATUS_META: Record<string, { dotClass: string; label: string; }> = {
    online: { dotClass: 'bg-emerald-500', label: 'online' },
    idle: { dotClass: 'bg-amber-400', label: 'idle' },
    dnd: { dotClass: 'bg-red-500', label: 'dnd' },
    offline: { dotClass: 'bg-slate-500', label: 'offline' },
};

const normalizeStatus = (status: string | undefined) => {
    if (status === 'online' || status === 'idle' || status === 'dnd') return status;
    return 'offline';
};

const getMemberSubtitle = (member: Member) => {
    if (member.customStatus) return member.customStatus;
    if (member.activityText) return member.activityText;
    if (member.username) return `@${member.username}`;
    return member.id;
};

export default function MemberPanel({ onClose }: MemberPanelProps) {
    const queryClient = useQueryClient();
    const socket = useSocket();
    const { data: groups, isLoading } = useQuery<RoleGroup[]>({
        queryKey: ['members'],
        queryFn: fetchMembers,
        refetchInterval: 12000,
        refetchIntervalInBackground: true,
        staleTime: 5000,
        placeholderData: prev => prev,
    });
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [autoCollapsedApplied, setAutoCollapsedApplied] = useState(false);

    const preparedGroups = useMemo(() => {
        if (!groups) return [];
        return groups.map(group => ({
            ...group,
            members: [...group.members].sort((a, b) => {
                const statusDiff = STATUS_ORDER[normalizeStatus(a.status)] - STATUS_ORDER[normalizeStatus(b.status)];
                if (statusDiff !== 0) return statusDiff;
                return (a.displayName || '').localeCompare(b.displayName || '', 'ru');
            })
        }));
    }, [groups]);

    const toggle = (roleId: string) => {
        setCollapsed(prev => ({ ...prev, [roleId]: !prev[roleId] }));
    };

    useEffect(() => {
        if (!socket) return;
        const handleMembersUpdated = () => {
            queryClient.invalidateQueries({ queryKey: ['members'] });
        };
        socket.on('members:updated', handleMembersUpdated);
        return () => {
            socket.off('members:updated', handleMembersUpdated);
        };
    }, [socket, queryClient]);

    useEffect(() => {
        if (!preparedGroups.length || autoCollapsedApplied || Object.keys(collapsed).length > 0) return;
        const initialCollapsed: Record<string, boolean> = {};
        preparedGroups.forEach(group => {
            initialCollapsed[group.roleId] = group.members.length > 18;
        });
        setCollapsed(initialCollapsed);
        setAutoCollapsedApplied(true);
    }, [preparedGroups, autoCollapsedApplied, collapsed]);

    const totalMembers = groups?.reduce((s, g) => s + g.members.length, 0) ?? 0;

    return (
        <div className="member-panel-shell w-72 shrink-0 bg-card border-l border-border h-full overflow-y-auto custom-scrollbar">
            <div className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2.5 text-sm font-rajdhani font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    <Users className="w-4 h-4" />
                    <span>Участники</span>
                    {!isLoading && (
                        <span className="ml-auto text-xs bg-secondary px-2 py-0.5 rounded-full border border-border/70">{totalMembers}</span>
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
                <div className="p-3 space-y-2">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="flex items-center gap-2 animate-pulse">
                            <div className="w-9 h-9 bg-secondary rounded-full" />
                            <div className="space-y-1.5">
                                <div className="h-3 bg-secondary rounded w-28" />
                                <div className="h-2.5 bg-secondary/80 rounded w-20" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : preparedGroups.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                    Участники пока не загружены.
                </div>
            ) : (
                <div className="py-2">
                    {preparedGroups.map((group) => (
                        <div key={group.roleId} className="mb-1">
                            <button
                                onClick={() => toggle(group.roleId)}
                                className="w-full flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-rajdhani font-bold uppercase tracking-[0.08em] hover:bg-secondary/40 transition-colors"
                                style={{ color: group.roleColor }}
                            >
                                {collapsed[group.roleId] ? (
                                    <ChevronRight className="w-3 h-3 shrink-0" />
                                ) : (
                                    <ChevronDown className="w-3 h-3 shrink-0" />
                                )}
                                <span className="truncate">{group.roleName}</span>
                                <span className="ml-auto opacity-70">{group.members.length}</span>
                            </button>

                            <AnimatePresence initial={false}>
                                {!collapsed[group.roleId] && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.22, ease: 'easeInOut' }}
                                        className="overflow-hidden"
                                    >
                                        <div className="space-y-0.5 pb-1">
                                            {group.members.map(member => {
                                                const status = normalizeStatus(member.status);
                                                const meta = STATUS_META[status] || STATUS_META.offline;
                                                const subtitle = getMemberSubtitle(member);

                                                return (
                                                    <motion.div
                                                        key={`${group.roleId}-${member.id}`}
                                                        layout
                                                        initial={{ opacity: 0, x: -6 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        exit={{ opacity: 0, x: -6 }}
                                                        transition={{ duration: 0.16 }}
                                                        className="mx-2 rounded-xl px-2.5 py-1.5 hover:bg-secondary/45 transition-colors cursor-default group min-w-0"
                                                    >
                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                            <div className="relative shrink-0">
                                                                <img
                                                                    src={member.avatar}
                                                                    alt={member.displayName}
                                                                    className="w-9 h-9 rounded-full object-cover bg-secondary"
                                                                    loading="lazy"
                                                                    onError={(e) => {
                                                                        (e.target as HTMLImageElement).src = 'https://cdn.discordapp.com/embed/avatars/0.png';
                                                                    }}
                                                                />
                                                                <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card ${meta.dotClass}`} />
                                                            </div>

                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <span
                                                                        className="text-sm leading-tight truncate font-medium"
                                                                        style={member.nameColor ? { color: member.nameColor } : undefined}
                                                                    >
                                                                        {member.displayName || member.username || member.id}
                                                                    </span>
                                                                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 shrink-0">
                                                                        {meta.label}
                                                                    </span>
                                                                </div>
                                                                <div className="text-[11px] leading-tight text-muted-foreground/80 truncate">
                                                                    {subtitle}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                );
                                            })}
                                        </div>
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
