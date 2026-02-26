import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, User, Clock, Ban, CheckCircle, Trash2, UserCheck, Search, RefreshCw } from 'lucide-react';
import client from '../api/client';

type DashUser = {
    id: number;
    username: string;
    role: 'admin' | 'user' | 'pending' | 'banned';
    created_at: number;
};

const roleBadge: Record<string, { label: string; color: string }> = {
    admin: { label: 'Админ', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    user: { label: 'Активный', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
    pending: { label: 'Ожидает', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    banned: { label: 'Заблокирован', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

export default function AdminPanel() {
    const [users, setUsers] = useState<DashUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const { data } = await client.get('/admin/users');
            setUsers(data);
        } catch (e: any) {
            showToast(e.response?.data?.error || 'Ошибка загрузки', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchUsers(); }, []);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const doAction = async (userId: number, action: string, method: 'post' | 'delete' = 'post') => {
        setActionLoading(userId);
        try {
            if (method === 'delete') {
                await client.delete(`/admin/users/${userId}`);
            } else {
                await client.post(`/admin/users/${userId}/${action}`);
            }
            showToast('Готово', 'success');
            fetchUsers();
        } catch (e: any) {
            showToast(e.response?.data?.error || 'Ошибка', 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const filtered = users.filter(u =>
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        u.role.toLowerCase().includes(search.toLowerCase())
    );

    const formatDate = (ts: number) =>
        ts ? new Date(ts * 1000).toLocaleString('ru-RU') : '—';

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: -30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -30 }}
                        className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl border text-sm font-medium shadow-2xl ${toast.type === 'success'
                                ? 'bg-green-900/80 border-green-500/40 text-green-300'
                                : 'bg-red-900/80 border-red-500/40 text-red-300'
                            }`}
                    >
                        {toast.message}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-purple-600/20 rounded-xl flex items-center justify-center border border-purple-500/30">
                    <Shield className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Администрирование</h1>
                    <p className="text-muted-foreground text-sm">Управление пользователями системы</p>
                </div>
                <button
                    onClick={fetchUsers}
                    disabled={loading}
                    className="ml-auto p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded-lg transition-colors disabled:opacity-50"
                    title="Обновить"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                {(['admin', 'user', 'pending', 'banned'] as const).map(role => {
                    const count = users.filter(u => u.role === role).length;
                    const badge = roleBadge[role];
                    return (
                        <div key={role} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full border w-fit ${badge.color}`}>{badge.label}</span>
                            <span className="text-2xl font-bold text-foreground">{count}</span>
                        </div>
                    );
                })}
            </div>

            {/* Search */}
            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                    type="text"
                    placeholder="Поиск по логину или роли..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-secondary/40 border border-border text-foreground pl-9 pr-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                />
            </div>

            {/* Table */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-5 py-3 border-b border-border text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                    <span>#</span>
                    <span>Пользователь</span>
                    <span>Роль</span>
                    <span className="text-right pr-2">Дата</span>
                    <span className="text-right">Действия</span>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                        Загрузка...
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                        <User className="w-8 h-8 opacity-40" />
                        <p className="text-sm">Пользователи не найдены</p>
                    </div>
                ) : (
                    <AnimatePresence>
                        {filtered.map((u, i) => {
                            const badge = roleBadge[u.role] ?? roleBadge.user;
                            const isMe = actionLoading === u.id;
                            return (
                                <motion.div
                                    key={u.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 10 }}
                                    transition={{ delay: i * 0.03 }}
                                    className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 items-center px-5 py-4 border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors"
                                >
                                    <span className="text-xs text-muted-foreground w-6">{u.id}</span>

                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                                            {u.username[0].toUpperCase()}
                                        </div>
                                        <span className="font-medium text-foreground truncate">{u.username}</span>
                                    </div>

                                    <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${badge.color}`}>
                                        {badge.label}
                                    </span>

                                    <span className="text-xs text-muted-foreground text-right whitespace-nowrap">
                                        <span className="flex items-center gap-1 justify-end">
                                            <Clock className="w-3 h-3" />
                                            {formatDate(u.created_at)}
                                        </span>
                                    </span>

                                    <div className="flex items-center gap-1 justify-end">
                                        {u.role === 'pending' && (
                                            <button
                                                title="Одобрить"
                                                disabled={isMe}
                                                onClick={() => doAction(u.id, 'approve')}
                                                className="p-1.5 text-green-400 hover:bg-green-500/15 rounded-lg transition-colors disabled:opacity-40"
                                            >
                                                <UserCheck className="w-4 h-4" />
                                            </button>
                                        )}
                                        {(u.role === 'user' || u.role === 'pending') && (
                                            <button
                                                title="Заблокировать"
                                                disabled={isMe}
                                                onClick={() => doAction(u.id, 'ban')}
                                                className="p-1.5 text-orange-400 hover:bg-orange-500/15 rounded-lg transition-colors disabled:opacity-40"
                                            >
                                                <Ban className="w-4 h-4" />
                                            </button>
                                        )}
                                        {u.role === 'banned' && (
                                            <button
                                                title="Разблокировать"
                                                disabled={isMe}
                                                onClick={() => doAction(u.id, 'unban')}
                                                className="p-1.5 text-blue-400 hover:bg-blue-500/15 rounded-lg transition-colors disabled:opacity-40"
                                            >
                                                <CheckCircle className="w-4 h-4" />
                                            </button>
                                        )}
                                        {u.role !== 'admin' && (
                                            <button
                                                title="Удалить"
                                                disabled={isMe}
                                                onClick={() => { if (confirm(`Удалить пользователя ${u.username}?`)) doAction(u.id, '', 'delete'); }}
                                                className="p-1.5 text-red-400 hover:bg-red-500/15 rounded-lg transition-colors disabled:opacity-40"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                )}
            </div>
        </div>
    );
}
