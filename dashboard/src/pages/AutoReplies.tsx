import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAutoReplies, updateAutoReplies, simulateAutoReply } from '../api/stats';
import { Bot, Plus, Trash2, Save, Loader2, Check, ChevronDown, Power, PowerOff, Search, Copy, FlaskConical, WandSparkles, Target, ArrowRight } from 'lucide-react';

interface AutoReplyRule {
    name: string;
    guildId: string;
    channelId: string;
    includeAny?: string[];
    includeAll?: string[][];
    excludeAny?: string[];
    response: string;
    enabled: boolean;
    delay?: number;
}

// Internal rule with stable ID for React reconciliation
interface InternalRule extends AutoReplyRule {
    _id: string;
}

interface SimulateDecision {
    action: 'send' | 'none';
    source: string;
    ruleId: string | null;
    ruleName: string | null;
    response: string | null;
    reason: string;
    keywords: string[];
    confidence: number;
    checkedRules: number;
}

interface SimulateResponse {
    ok: boolean;
    input: {
        content: string;
        guildId: string;
        channelId: string;
    };
    decision: SimulateDecision;
}

let _nextId = 1;
function genId() { return `ar_${Date.now()}_${_nextId++}`; }

function addIds(rules: AutoReplyRule[]): InternalRule[] {
    return rules.map(r => ({ ...r, _id: genId() }));
}

function stripIds(rules: InternalRule[]): AutoReplyRule[] {
    return rules.map(({ _id, ...rest }) => rest);
}

// ─── Tag Editor ─────────────────────────────────────────
function TagEditor({ tags, onChange, placeholder, color = 'emerald' }: {
    tags: string[]; onChange: (t: string[]) => void; placeholder: string; color?: string;
}) {
    const [input, setInput] = useState('');
    const addTag = () => {
        const t = input.trim();
        if (t && !tags.includes(t)) { onChange([...tags, t]); setInput(''); }
    };
    const colorClasses: Record<string, string> = {
        emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
        red: 'bg-red-500/10 border-red-500/20 text-red-400',
        blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    };
    return (
        <div>
            {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {tags.map((tag, i) => (
                        <span key={`${tag}-${i}`} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border ${colorClasses[color] || colorClasses.emerald}`}>
                            {tag}
                            <button onClick={() => onChange(tags.filter((_, j) => j !== i))} className="hover:text-white ml-0.5 opacity-60 hover:opacity-100 transition-opacity">×</button>
                        </span>
                    ))}
                </div>
            )}
            <div className="flex gap-2">
                <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder={placeholder}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                    className="flex-1 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
                <button onClick={addTag} className="px-3 py-1.5 bg-[var(--color-accent)]/10 text-xs rounded-lg hover:bg-[var(--color-accent)]/20 transition-colors border border-[var(--color-accent)]/20 text-[var(--color-accent)]">+</button>
            </div>
        </div>
    );
}

// ─── Rule Card ──────────────────────────────────────────
function RuleCard({ rule, index, expanded, onToggleExpand, onChange, onDelete, onDuplicate }: {
    rule: InternalRule; index: number;
    expanded: boolean;
    onToggleExpand: () => void;
    onChange: (r: InternalRule) => void;
    onDelete: () => void;
    onDuplicate: () => void;
}) {
    const wordCount = (rule.includeAny?.length || 0) + (rule.includeAll?.flat().length || 0);

    const handleFieldChange = useCallback((field: string, value: unknown) => {
        onChange({ ...rule, [field]: value });
    }, [onChange, rule]);

    return (
        <div className={`bg-[var(--color-bg-secondary)] border rounded-xl overflow-hidden transition-all duration-200 ${rule.enabled ? 'border-[var(--color-border)]' : 'border-[var(--color-border)]/30 opacity-50'}`}>
            {/* Header — clickable to expand/collapse */}
            <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-[var(--color-bg-primary)]/50 transition-colors"
                onClick={onToggleExpand}>
                {/* Toggle enabled */}
                <button
                    onClick={e => { e.stopPropagation(); handleFieldChange('enabled', !rule.enabled); }}
                    className="shrink-0 p-1 rounded-lg hover:bg-[var(--color-bg-primary)] transition-colors"
                    title={rule.enabled ? 'Выключить' : 'Включить'}
                >
                    {rule.enabled ? <Power className="w-4 h-4 text-emerald-500" /> : <PowerOff className="w-4 h-4 text-red-400" />}
                </button>
                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{rule.name || `Правило ${index + 1}`}</span>
                        {rule.channelId && <span className="text-[10px] text-[var(--color-text-secondary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 rounded font-mono">#{rule.channelId.slice(-4)}</span>}
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)] truncate mt-0.5">{rule.response?.slice(0, 80)}</p>
                </div>
                {/* Badges */}
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        {wordCount} слов
                    </span>
                    {(rule.excludeAny?.length || 0) > 0 && (
                        <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full border border-red-500/20">
                            -{rule.excludeAny!.length}
                        </span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-[var(--color-text-secondary)] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
                </div>
            </div>

            {/* Expanded Content */}
            {expanded && (
                <div
                    className="px-4 pb-4 space-y-4 border-t border-[var(--color-border)]/50 pt-4"
                    onClick={e => e.stopPropagation()}
                    onMouseDown={e => e.stopPropagation()}
                >
                    {/* Row 1: name, guild, channel, delay */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                            <label className="text-[10px] text-[var(--color-text-secondary)] uppercase font-bold mb-1 block tracking-wider">Название</label>
                            <input type="text" value={rule.name}
                                onChange={e => handleFieldChange('name', e.target.value)}
                                onMouseDown={e => e.stopPropagation()}
                                onKeyDown={e => e.stopPropagation()}
                                className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
                        </div>
                        <div>
                            <label className="text-[10px] text-[var(--color-text-secondary)] uppercase font-bold mb-1 block tracking-wider">Guild ID</label>
                            <input type="text" value={rule.guildId}
                                onChange={e => handleFieldChange('guildId', e.target.value)}
                                onMouseDown={e => e.stopPropagation()}
                                onKeyDown={e => e.stopPropagation()}
                                className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
                        </div>
                        <div>
                            <label className="text-[10px] text-[var(--color-text-secondary)] uppercase font-bold mb-1 block tracking-wider">Channel ID</label>
                            <input type="text" value={rule.channelId}
                                onChange={e => handleFieldChange('channelId', e.target.value)}
                                onMouseDown={e => e.stopPropagation()}
                                onKeyDown={e => e.stopPropagation()}
                                placeholder="Все каналы"
                                className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
                        </div>
                        <div>
                            <label className="text-[10px] text-[var(--color-text-secondary)] uppercase font-bold mb-1 block tracking-wider">Задержка (сек)</label>
                            <input type="number" value={rule.delay || 2}
                                onChange={e => handleFieldChange('delay', parseInt(e.target.value) || 2)}
                                onMouseDown={e => e.stopPropagation()}
                                onKeyDown={e => e.stopPropagation()}
                                className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" min={0} max={60} />
                        </div>
                    </div>

                    {/* Keywords */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] text-[var(--color-text-secondary)] uppercase font-bold mb-1.5 block tracking-wider">
                                ✅ Включающие слова <span className="normal-case font-normal">(includeAny)</span>
                            </label>
                            <TagEditor tags={rule.includeAny || []} onChange={t => handleFieldChange('includeAny', t)} placeholder="Добавить слово..." color="emerald" />
                        </div>
                        <div>
                            <label className="text-[10px] text-[var(--color-text-secondary)] uppercase font-bold mb-1.5 block tracking-wider">
                                ❌ Исключающие слова <span className="normal-case font-normal">(excludeAny)</span>
                            </label>
                            <TagEditor tags={rule.excludeAny || []} onChange={t => handleFieldChange('excludeAny', t)} placeholder="Добавить исключение..." color="red" />
                        </div>
                    </div>

                    {/* Response */}
                    <div>
                        <label className="text-[10px] text-[var(--color-text-secondary)] uppercase font-bold mb-1 block tracking-wider">💬 Ответ</label>
                        <textarea value={rule.response}
                            onChange={e => handleFieldChange('response', e.target.value)}
                            onMouseDown={e => e.stopPropagation()}
                            onKeyDown={e => e.stopPropagation()}
                            rows={3}
                            className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] resize-y" />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                        <button onClick={onDuplicate} className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-blue-500/10">
                            <Copy className="w-3.5 h-3.5" /> Дублировать
                        </button>
                        <button onClick={onDelete} className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/10">
                            <Trash2 className="w-3.5 h-3.5" /> Удалить
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main Page ──────────────────────────────────────────
export default function AutoReplies() {
    const queryClient = useQueryClient();
    const { data: serverRules, isLoading } = useQuery({ queryKey: ['autoreplies'], queryFn: fetchAutoReplies });

    // Internal list with stable _id per rule
    const [list, setList] = useState<InternalRule[] | null>(null);
    const [saved, setSaved] = useState(false);
    const [search, setSearch] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [simMessage, setSimMessage] = useState('');
    const [simGuildId, setSimGuildId] = useState('690362306395111444');
    const [simChannelId, setSimChannelId] = useState('');

    // Sync server data → internal list (only on first load or after save)
    const effectiveList: InternalRule[] = useMemo(() => {
        if (list !== null) return list;
        if (!serverRules) return [];
        return addIds(serverRules);
    }, [list, serverRules]);

    // Detect unsaved changes
    const hasChanges = list !== null;

    // Search filter — uses stable references from effectiveList
    const filtered = useMemo(() => {
        if (!search.trim()) return effectiveList;
        const q = search.toLowerCase();
        return effectiveList.filter(r =>
            r.name.toLowerCase().includes(q) ||
            r.response.toLowerCase().includes(q) ||
            r.includeAny?.some(w => w.toLowerCase().includes(q))
        );
    }, [effectiveList, search]);

    const mutation = useMutation({
        mutationFn: (rules: AutoReplyRule[]) => updateAutoReplies(rules),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['autoreplies'] });
            setList(null); // reset to "synced" state
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        }
    });

    const simulateMutation = useMutation({
        mutationFn: (payload: { content: string; guildId?: string; channelId?: string; }) => simulateAutoReply(payload),
    });

    useEffect(() => {
        if (!serverRules?.length) return;
        const firstWithGuild = serverRules.find((r: AutoReplyRule) => !!r.guildId);
        if (firstWithGuild?.guildId) setSimGuildId(firstWithGuild.guildId);
        const firstWithChannel = serverRules.find((r: AutoReplyRule) => !!r.channelId);
        if (firstWithChannel?.channelId) setSimChannelId(firstWithChannel.channelId);
    }, [serverRules]);

    const updateRule = useCallback((id: string, updated: InternalRule) => {
        setList(prev => {
            const base = prev || addIds(serverRules || []);
            return base.map(r => r._id === id ? { ...updated, _id: id } : r);
        });
    }, [serverRules]);

    const deleteRule = useCallback((id: string) => {
        setList(prev => {
            const base = prev || addIds(serverRules || []);
            return base.filter(r => r._id !== id);
        });
        if (expandedId === id) setExpandedId(null);
    }, [serverRules, expandedId]);

    const duplicateRule = useCallback((id: string) => {
        setList(prev => {
            const base = prev || addIds(serverRules || []);
            const idx = base.findIndex(r => r._id === id);
            if (idx === -1) return base;
            const newId = genId();
            const copy: InternalRule = { ...base[idx], _id: newId, name: base[idx].name + ' (копия)' };
            const newList = [...base];
            newList.splice(idx + 1, 0, copy);
            return newList;
        });
    }, [serverRules]);

    const addRule = useCallback(() => {
        const newId = genId();
        setList(prev => [...(prev || addIds(serverRules || [])), {
            _id: newId,
            name: 'Новое правило',
            guildId: '690362306395111444',
            channelId: '',
            includeAny: [],
            excludeAny: [],
            response: '',
            enabled: true,
            delay: 2,
        }]);
        // Auto-expand the new rule
        setExpandedId(newId);
    }, [serverRules]);

    const handleSave = useCallback(() => {
        if (!list) return;
        mutation.mutate(stripIds(list));
    }, [list, mutation]);

    const handleSimulate = useCallback(() => {
        if (!simMessage.trim()) return;
        simulateMutation.mutate({
            content: simMessage.trim(),
            guildId: simGuildId.trim(),
            channelId: simChannelId.trim(),
        });
    }, [simMessage, simGuildId, simChannelId, simulateMutation]);

    const toggleExpand = useCallback((id: string) => {
        setExpandedId(prev => prev === id ? null : id);
    }, []);

    if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full" /></div>;

    const activeCount = effectiveList.filter(r => r.enabled).length;
    const simulateResult = simulateMutation.data as SimulateResponse | undefined;

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/10 border border-violet-500/20 flex items-center justify-center">
                        <Bot className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">Авто-ответы</h1>
                        <p className="text-xs text-[var(--color-text-secondary)]">
                            {effectiveList.length} правил • <span className="text-emerald-400">{activeCount} активных</span>
                            {hasChanges && <span className="text-amber-400 ml-2">• Есть несохранённые изменения</span>}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={addRule} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--color-bg-secondary)] text-sm font-medium hover:bg-[var(--color-bg-primary)] transition-colors border border-[var(--color-border)]">
                        <Plus className="w-4 h-4" /> Добавить
                    </button>
                    <button onClick={handleSave} disabled={!hasChanges || mutation.isPending}
                        className={`flex items-center gap-2 px-5 py-2 rounded-xl font-medium text-sm transition-all ${hasChanges ? 'bg-[var(--color-accent)] text-white hover:brightness-110 shadow-lg shadow-[var(--color-accent)]/20' : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] cursor-not-allowed'}`}>
                        {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                        {saved ? 'Сохранено!' : 'Сохранить'}
                    </button>
                </div>
            </div>

            {/* Search */}
            {effectiveList.length > 3 && (
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-secondary)]" />
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по правилам..."
                        className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
                </div>
            )}

            {/* Simulator */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-4 space-y-4">
                <div className="flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-violet-400" />
                    <h2 className="text-sm font-semibold">Симулятор авто-ответов</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="text-[10px] text-[var(--color-text-secondary)] uppercase font-bold mb-1 block tracking-wider">Guild ID</label>
                        <input type="text" value={simGuildId} onChange={e => setSimGuildId(e.target.value)}
                            className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
                    </div>
                    <div>
                        <label className="text-[10px] text-[var(--color-text-secondary)] uppercase font-bold mb-1 block tracking-wider">Channel ID</label>
                        <input type="text" value={simChannelId} onChange={e => setSimChannelId(e.target.value)} placeholder="Опционально"
                            className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
                    </div>
                </div>

                <div>
                    <label className="text-[10px] text-[var(--color-text-secondary)] uppercase font-bold mb-1 block tracking-wider">Тестовое сообщение</label>
                    <textarea value={simMessage} onChange={e => setSimMessage(e.target.value)} rows={3}
                        placeholder="Вставь текст игрока, чтобы проверить, что сработает..."
                        className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] resize-y" />
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleSimulate}
                        disabled={!simMessage.trim() || simulateMutation.isPending}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/15 text-violet-300 border border-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {simulateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <WandSparkles className="w-4 h-4" />}
                        Проверить
                    </button>
                    {simulateMutation.isError && (
                        <span className="text-xs text-red-400">Не удалось выполнить симуляцию</span>
                    )}
                </div>

                {simulateResult?.decision && (
                    <div className={`rounded-lg border p-3 space-y-2 ${simulateResult.decision.action === 'send' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-500/30 bg-slate-500/5'}`}>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className={`px-2 py-1 rounded-md border ${simulateResult.decision.action === 'send' ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' : 'border-slate-500/40 text-slate-300 bg-slate-500/10'}`}>
                                {simulateResult.decision.action === 'send' ? 'Сработает' : 'Не сработает'}
                            </span>
                            <span className="px-2 py-1 rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)]">
                                source: {simulateResult.decision.source}
                            </span>
                            <span className="px-2 py-1 rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] inline-flex items-center gap-1">
                                <Target className="w-3 h-3" />
                                confidence: {Number(simulateResult.decision.confidence || 0).toFixed(2)}
                            </span>
                        </div>
                        <p className="text-sm">
                            <span className="text-[var(--color-text-secondary)]">Причина:</span>{' '}
                            <span className="font-medium">{simulateResult.decision.reason}</span>
                        </p>
                        {simulateResult.decision.ruleName && (
                            <p className="text-sm">
                                <span className="text-[var(--color-text-secondary)]">Правило:</span>{' '}
                                <span className="font-medium">{simulateResult.decision.ruleName}</span>{' '}
                                <span className="text-[var(--color-text-secondary)]">({simulateResult.decision.ruleId})</span>
                            </p>
                        )}
                        {!!simulateResult.decision.keywords?.length && (
                            <div className="flex flex-wrap gap-1.5">
                                {simulateResult.decision.keywords.map((k, i) => (
                                    <span key={`${k}-${i}`} className="text-[11px] px-2 py-0.5 rounded-md border border-violet-500/30 text-violet-300 bg-violet-500/10">{k}</span>
                                ))}
                            </div>
                        )}
                        {simulateResult.decision.response && (
                            <div className="text-xs bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-md p-2 whitespace-pre-wrap">
                                <span className="inline-flex items-center gap-1 text-[var(--color-text-secondary)] mb-1"><ArrowRight className="w-3 h-3" /> Ответ:</span>
                                <div>{simulateResult.decision.response}</div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Rules List */}
            <div className="space-y-3">
                {filtered.map((rule) => (
                    <RuleCard
                        key={rule._id}
                        rule={rule}
                        index={effectiveList.indexOf(rule)}
                        expanded={expandedId === rule._id}
                        onToggleExpand={() => toggleExpand(rule._id)}
                        onChange={r => updateRule(rule._id, r)}
                        onDelete={() => deleteRule(rule._id)}
                        onDuplicate={() => duplicateRule(rule._id)}
                    />
                ))}
                {filtered.length === 0 && search && (
                    <div className="text-center py-12 text-[var(--color-text-secondary)]">
                        <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Ничего не найдено по запросу «{search}»</p>
                    </div>
                )}
            </div>
        </div>
    );
}
