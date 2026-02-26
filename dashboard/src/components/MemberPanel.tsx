import { useQuery } from '@tanstack/react-query';
import { fetchMembers } from '../api/stats';
import { motion } from 'framer-motion';
import { Users, ChevronDown, ChevronRight } from 'lucide-react';
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

export default function MemberPanel() {
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
            ) : (
                <div className="py-2">
                    {groups?.map((group, gi) => (
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
                            {!collapsed[group.roleId] && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: gi * 0.05 }}
                                >
                                    {group.members.map(member => (
                                        <div
                                            key={member.id}
                                            className="flex items-center gap-2.5 px-4 py-1.5 hover:bg-secondary/30 rounded-lg mx-1 transition-colors cursor-default group"
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
                                                <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card ${member.status === 'online' ? 'bg-green-500' :
                                                        member.status === 'idle' ? 'bg-yellow-500' :
                                                            member.status === 'dnd' ? 'bg-red-500' :
                                                                'bg-gray-500'
                                                    }`} />
                                            </div>
                                            {/* Name */}
                                            <span className="text-sm truncate text-muted-foreground group-hover:text-foreground transition-colors">
                                                {member.displayName}
                                            </span>
                                        </div>
                                    ))}
                                </motion.div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
