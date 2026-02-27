import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, User, Clock, Ban, CheckCircle, Trash2, UserCheck, Search, RefreshCw, Brain, Zap, Globe, Gem, RotateCcw, ArrowUp, ArrowDown } from 'lucide-react';
import client from '../api/client';

type DashUser = {
    id: number;
    username: string;
    role: 'admin' | 'user' | 'pending' | 'banned';
    created_at: number;
};

type ModelStats = { requests: number; tokens: number };
type ProviderStats = {
    requests: number;
    errors: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    models: Record<string, ModelStats>;
};
type AiStats = {
    totalRequests: number;
    totalErrors: number;
    totalTokens: number;
    startedAt: string | null;
    lastRequestAt: string | null;
    providers: Record<string, ProviderStats>;
};

const roleBadge: Record<string, { label: string; color: string }> = {
    admin: { label: 'Админ', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    user: { label: 'Активный', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
    pending: { label: 'Ожидает', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    banned: { label: 'Заблокирован', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

const providerIcons: Record<string, { icon: typeof Globe; color: string; label: string }> = {
    openrouter: { icon: Globe, color: 'text-blue-400', label: 'OpenRouter' },
    groq: { icon: Zap, color: 'text-yellow-400', label: 'Groq' },
    gemini: { icon: Gem, color: 'text-purple-400', label: 'Gemini' },
};

const TAB_USERS = 'users';
const TAB_AI = 'ai';

function formatNumber(n: number): string {
    return n.toLocaleString('ru-RU');
}

function formatDate(ts: number | string | null): string {
    if (!ts) return '—';
    const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function AdminPanel() {
    const [tab, setTab] = useState(TAB_USERS);
    const [users, setUsers] = useState<DashUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // AI Stats
    const [aiStats, setAiStats] = useState<AiStats | null>(null);
    const [aiLoading, setAiLoading] = useState(false);

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

    const fetchAiStats = async () => {
        setAiLoading(true);
        try {
            const { data } = await client.get('/ai-stats');
            setAiStats(data);
        } catch (e: any) {
            showToast(e.response?.data?.error || 'Ошибка загрузки AI статистики', 'error');
        } finally {
            setAiLoading(false);
        }
    };

    const resetAiStats = async () => {
        if (!confirm('Сбросить статистику AI? Это действие нельзя отменить.')) return;
        try {
            await client.post('/ai-stats/reset');
            showToast('Статистика сброшена', 'success');
            fetchAiStats();
        } catch (e: any) {
            showToast(e.response?.data?.error || 'Ошибка сброса', 'error');
        }
    };

    useEffect(() => { fetchUsers(); }, []);
    useEffect(() => { if (tab === TAB_AI && !aiStats) fetchAiStats(); }, [tab]);

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

    const tabs = [
        { id: TAB_USERS, label: 'Пользователи', icon: User },
        { id: TAB_AI, label: 'AI Статистика', icon: Brain },
    ];

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
                    <p className="text-muted-foreground text-sm">Управление системой</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-secondary/30 p-1 rounded-xl border border-border w-fit">
                {tabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-sm'
                                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50 border border-transparent'
                            }`}
                    >
                        <t.icon className="w-4 h-4" />
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Tab: Users */}
            {tab === TAB_USERS && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
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

                    {/* Search + Refresh */}
                    <div className="flex gap-2 mb-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Поиск по логину или роли..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full bg-secondary/40 border border-border text-foreground pl-9 pr-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                            />
                        </div>
                        <button
                            onClick={fetchUsers}
                            disabled={loading}
                            className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded-xl border border-border transition-colors disabled:opacity-50"
                            title="Обновить"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
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
                                                    <button title="Одобрить" disabled={isMe} onClick={() => doAction(u.id, 'approve')}
                                                        className="p-1.5 text-green-400 hover:bg-green-500/15 rounded-lg transition-colors disabled:opacity-40">
                                                        <UserCheck className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {(u.role === 'user' || u.role === 'pending') && (
                                                    <button title="Заблокировать" disabled={isMe} onClick={() => doAction(u.id, 'ban')}
                                                        className="p-1.5 text-orange-400 hover:bg-orange-500/15 rounded-lg transition-colors disabled:opacity-40">
                                                        <Ban className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {u.role === 'banned' && (
                                                    <button title="Разблокировать" disabled={isMe} onClick={() => doAction(u.id, 'unban')}
                                                        className="p-1.5 text-blue-400 hover:bg-blue-500/15 rounded-lg transition-colors disabled:opacity-40">
                                                        <CheckCircle className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {u.role !== 'admin' && (
                                                    <button title="Удалить" disabled={isMe}
                                                        onClick={() => { if (confirm(`Удалить пользователя ${u.username}?`)) doAction(u.id, '', 'delete'); }}
                                                        className="p-1.5 text-red-400 hover:bg-red-500/15 rounded-lg transition-colors disabled:opacity-40">
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
                </motion.div>
            )}

            {/* Tab: AI Stats */}
            {tab === TAB_AI && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                    {/* Action bar */}
                    <div className="flex items-center gap-2 mb-6">
                        <button onClick={fetchAiStats} disabled={aiLoading}
                            className="flex items-center gap-2 px-4 py-2 text-sm bg-secondary/40 hover:bg-secondary/60 border border-border rounded-xl transition-colors disabled:opacity-50">
                            <RefreshCw className={`w-4 h-4 ${aiLoading ? 'animate-spin' : ''}`} />
                            Обновить
                        </button>
                        <button onClick={resetAiStats}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 border border-red-500/20 rounded-xl transition-colors">
                            <RotateCcw className="w-4 h-4" />
                            Сбросить
                        </button>
                        {aiStats?.startedAt && (
                            <span className="text-xs text-muted-foreground ml-auto">
                                Отсчёт с {formatDate(aiStats.startedAt)}
                            </span>
                        )}
                    </div>

                    {aiLoading && !aiStats ? (
                        <div className="flex items-center justify-center py-16 text-muted-foreground">
                            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Загрузка...
                        </div>
                    ) : aiStats ? (
                        <>
                            {/* Summary cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                <div className="bg-card border border-border rounded-xl p-4">
                                    <div className="text-xs text-muted-foreground mb-1">Всего запросов</div>
                                    <div className="text-2xl font-bold text-foreground">{formatNumber(aiStats.totalRequests)}</div>
                                </div>
                                <div className="bg-card border border-border rounded-xl p-4">
                                    <div className="text-xs text-muted-foreground mb-1">Ошибок</div>
                                    <div className="text-2xl font-bold text-red-400">{formatNumber(aiStats.totalErrors)}</div>
                                </div>
                                <div className="bg-card border border-border rounded-xl p-4">
                                    <div className="text-xs text-muted-foreground mb-1">Всего токенов</div>
                                    <div className="text-2xl font-bold text-foreground">{formatNumber(aiStats.totalTokens)}</div>
                                </div>
                                <div className="bg-card border border-border rounded-xl p-4">
                                    <div className="text-xs text-muted-foreground mb-1">Последний запрос</div>
                                    <div className="text-sm font-medium text-foreground">{formatDate(aiStats.lastRequestAt)}</div>
                                </div>
                            </div>

                            {/* Provider breakdown */}
                            <div className="space-y-4">
                                {Object.entries(aiStats.providers).map(([name, prov]) => {
                                    const pi = providerIcons[name] || { icon: Globe, color: 'text-blue-400', label: name.toUpperCase() };
                                    const Icon = pi.icon;
                                    const successRate = prov.requests > 0 ? Math.round((prov.requests / (prov.requests + prov.errors)) * 100) : 0;
                                    const models = Object.entries(prov.models || {}).sort((a, b) => b[1].tokens - a[1].tokens);

                                    return (
                                        <motion.div key={name} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                            className="bg-card border border-border rounded-xl overflow-hidden">
                                            {/* Provider header */}
                                            <div className="flex items-center gap-3 px-5 py-4 border-b border-border/50">
                                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${name === 'gemini' ? 'bg-purple-500/15 border border-purple-500/25' :
                                                        name === 'groq' ? 'bg-yellow-500/15 border border-yellow-500/25' :
                                                            'bg-blue-500/15 border border-blue-500/25'
                                                    }`}>
                                                    <Icon className={`w-5 h-5 ${pi.color}`} />
                                                </div>
                                                <div className="flex-1">
                                                    <h3 className="font-semibold text-foreground">{pi.label}</h3>
                                                    <p className="text-xs text-muted-foreground">
                                                        {prov.requests} запросов · {successRate}% успешных
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-lg font-bold text-foreground">{formatNumber(prov.totalTokens)}</div>
                                                    <div className="text-xs text-muted-foreground">токенов</div>
                                                </div>
                                            </div>

                                            {/* Token breakdown */}
                                            <div className="grid grid-cols-3 gap-4 px-5 py-3 border-b border-border/30 bg-secondary/10">
                                                <div className="flex items-center gap-1.5 text-sm">
                                                    <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
                                                    <span className="text-muted-foreground">Prompt:</span>
                                                    <span className="font-medium text-foreground">{formatNumber(prov.promptTokens)}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-sm">
                                                    <ArrowDown className="w-3.5 h-3.5 text-green-400" />
                                                    <span className="text-muted-foreground">Completion:</span>
                                                    <span className="font-medium text-foreground">{formatNumber(prov.completionTokens)}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-sm">
                                                    <span className="text-muted-foreground">Ошибки:</span>
                                                    <span className={`font-medium ${prov.errors > 0 ? 'text-red-400' : 'text-green-400'}`}>{prov.errors}</span>
                                                </div>
                                            </div>

                                            {/* Models table */}
                                            {models.length > 0 && (
                                                <div className="px-5 py-3">
                                                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2 font-semibold">Модели</div>
                                                    <div className="space-y-1.5">
                                                        {models.map(([modelName, ms]) => {
                                                            const pct = prov.totalTokens > 0 ? (ms.tokens / prov.totalTokens) * 100 : 0;
                                                            return (
                                                                <div key={modelName} className="flex items-center gap-3 text-sm">
                                                                    <code className="text-xs bg-secondary/60 px-2 py-0.5 rounded font-mono text-foreground/80 flex-1 min-w-0 truncate">{modelName}</code>
                                                                    <span className="text-muted-foreground whitespace-nowrap">{ms.requests}×</span>
                                                                    <span className="font-medium text-foreground whitespace-nowrap w-20 text-right">{formatNumber(ms.tokens)} tok</span>
                                                                    <div className="w-16 h-1.5 bg-secondary/40 rounded-full overflow-hidden flex-shrink-0">
                                                                        <div className={`h-full rounded-full ${name === 'gemini' ? 'bg-purple-400' : name === 'groq' ? 'bg-yellow-400' : 'bg-blue-400'
                                                                            }`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </motion.div>
                                    );
                                })}

                                {Object.keys(aiStats.providers).length === 0 && (
                                    <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
                                        <Brain className="w-10 h-10 opacity-30" />
                                        <p className="text-sm">Нет данных об использовании AI</p>
                                        <p className="text-xs">Статистика появится после первого AI запроса</p>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : null}
                </motion.div>
            )}
        </div>
    );
}
