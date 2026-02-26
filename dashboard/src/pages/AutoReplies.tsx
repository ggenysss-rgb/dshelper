import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAutoReplies, updateAutoReplies, simulateAutoReply } from '../api/stats';
import { Bot, Plus, Trash2, Save, Loader2, Check, ChevronDown, Power, PowerOff, Search, Copy, FlaskConical, WandSparkles, ArrowRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
    const styles: Record<string, string> = {
        emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500',
        red: 'bg-red-500/10 border-red-500/20 text-red-500',
        blue: 'bg-blue-500/10 border-blue-500/20 text-blue-500',
    };
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2 min-h-[28px]">
                <AnimatePresence>
                    {tags.map((tag, i) => (
                        <motion.span
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            key={`${tag}-${i}`}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border ${styles[color] || styles.emerald}`}
                        >
                            {tag}
                            <button onClick={() => onChange(tags.filter((_, j) => j !== i))} className="hover:text-foreground ml-1 opacity-50 hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>
                        </motion.span>
                    ))}
                </AnimatePresence>
            </div>
            <div className="flex gap-2">
                <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder={placeholder} 
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                    className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                <button onClick={addTag} className="px-3 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors border border-primary/20">
                    <Plus className="w-4 h-4" />
                </button>
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
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`bg-card border rounded-xl overflow-hidden transition-all duration-200 ${rule.enabled ? 'border-border shadow-sm' : 'border-border/50 opacity-60'}`}
        >
            {/* Header — clickable to expand/collapse */}
            <div className="flex items-center gap-4 px-5 py-4 cursor-pointer select-none hover:bg-secondary/30 transition-colors"
                onClick={onToggleExpand}>
                {/* Toggle enabled */}
                <button
                    onClick={e => { e.stopPropagation(); handleFieldChange('enabled', !rule.enabled); }}
                    className={`shrink-0 p-2 rounded-lg transition-colors ${rule.enabled ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'}`}
                    title={rule.enabled ? 'Выключить' : 'Включить'}
                >
                    {rule.enabled ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                </button>
                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-base font-semibold text-foreground truncate">{rule.name || `Правило ${index + 1}`}</span>
                        {rule.channelId && <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded font-mono">#{rule.channelId.slice(-4)}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{rule.response?.slice(0, 100) || <span className="italic opacity-50">Нет ответа...</span>}</p>
                </div>
                {/* Badges */}
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">
                        {wordCount} слов
                    </span>
                    {(rule.excludeAny?.length || 0) > 0 && (
                        <span className="text-[10px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full border border-red-500/20 font-medium">
                            -{rule.excludeAny!.length}
                        </span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
                </div>
            </div>

            {/* Expanded Content */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div
                            className="px-5 pb-5 space-y-5 border-t border-border/50 pt-5"
                            onClick={e => e.stopPropagation()}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            {/* Row 1: name, guild, channel, delay */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1.5 block tracking-wider">Название</label>
                                    <input type="text" value={rule.name}
                                        onChange={e => handleFieldChange('name', e.target.value)}
                                        className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1.5 block tracking-wider">Guild ID</label>
                                    <input type="text" value={rule.guildId}
                                        onChange={e => handleFieldChange('guildId', e.target.value)}
                                        className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1.5 block tracking-wider">Channel ID</label>
                                    <input type="text" value={rule.channelId}
                                        onChange={e => handleFieldChange('channelId', e.target.value)}
                                        placeholder="Все каналы"
                                        className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1.5 block tracking-wider">Задержка (сек)</label>
                                    <input type="number" value={rule.delay || 2}
                                        onChange={e => handleFieldChange('delay', parseInt(e.target.value) || 2)}
                                        className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" min={0} max={60} />
                                </div>
                            </div>

                            {/* Keywords */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="text-[10px] text-muted-foreground uppercase font-bold mb-2 block tracking-wider">
                                        ✅ Включающие слова <span className="normal-case font-normal opacity-70">(includeAny)</span>
                                    </label>
                                    <TagEditor tags={rule.includeAny || []} onChange={t => handleFieldChange('includeAny', t)} placeholder="Добавить слово..." color="emerald" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-muted-foreground uppercase font-bold mb-2 block tracking-wider">
                                        ❌ Исключающие слова <span className="normal-case font-normal opacity-70">(excludeAny)</span>
                                    </label>
                                    <TagEditor tags={rule.excludeAny || []} onChange={t => handleFieldChange('excludeAny', t)} placeholder="Добавить исключение..." color="red" />
                                </div>
                            </div>

                            {/* Response */}
                            <div>
                                <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1.5 block tracking-wider">💬 Ответ</label>
                                <textarea value={rule.response}
                                    onChange={e => handleFieldChange('response', e.target.value)}
                                    rows={3}
                                    className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y transition-all" />
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 pt-2">
                                <button onClick={onDuplicate} className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-400 transition-colors px-3 py-2 rounded-lg hover:bg-blue-500/10 border border-transparent hover:border-blue-500/20">
                                    <Copy className="w-3.5 h-3.5" /> Дублировать
                                </button>
                                <button onClick={onDelete} className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-400 transition-colors px-3 py-2 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20">
                                    <Trash2 className="w-3.5 h-3.5" /> Удалить
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
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
        <div className="max-w-6xl mx-auto h-full flex flex-col gap-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-violet-600/5 border border-violet-500/20 flex items-center justify-center">
                        <Bot className="w-6 h-6 text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-rajdhani font-bold text-foreground">Авто-ответы</h1>
                        <p className="text-sm text-muted-foreground">
                            {effectiveList.length} правил • <span className="text-emerald-500">{activeCount} активных</span>
                            {hasChanges && <span className="text-amber-500 ml-2">• Есть несохранённые изменения</span>}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={addRule} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-card text-sm font-medium hover:bg-secondary transition-colors border border-border shadow-sm">
                        <Plus className="w-4 h-4" /> Добавить
                    </button>
                    <button onClick={handleSave} disabled={!hasChanges || mutation.isPending}
                        className={`flex items-center gap-2 px-5 py-2 rounded-xl font-medium text-sm transition-all ${hasChanges ? 'bg-primary text-primary-foreground hover:brightness-110 shadow-lg shadow-primary/20' : 'bg-secondary text-muted-foreground cursor-not-allowed'}`}>
                        {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                        {saved ? 'Сохранено!' : 'Сохранить'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Search & Rules */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Search */}
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по правилам..."
                            className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-sm" />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Rules List */}
                    <div className="space-y-3">
                        <AnimatePresence initial={false}>
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
                        </AnimatePresence>
                        {filtered.length === 0 && (
                            <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                                <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p className="font-medium">Ничего не найдено</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: Simulator */}
                <div className="lg:col-span-1">
                    <div className="sticky top-6">
                        <div className="bg-card border border-border rounded-xl p-5 space-y-5 shadow-sm">
                            <div className="flex items-center gap-2 pb-3 border-b border-border/50">
                                <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                                    <FlaskConical className="w-4 h-4 text-violet-500" />
                                </div>
                                <h2 className="text-base font-bold font-rajdhani">Симулятор</h2>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1.5 block tracking-wider">Guild ID</label>
                                    <input type="text" value={simGuildId} onChange={e => setSimGuildId(e.target.value)}
                                        className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1.5 block tracking-wider">Channel ID</label>
                                    <input type="text" value={simChannelId} onChange={e => setSimChannelId(e.target.value)} placeholder="Опционально"
                                        className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1.5 block tracking-wider">Сообщение</label>
                                    <textarea value={simMessage} onChange={e => setSimMessage(e.target.value)} rows={4}
                                        placeholder="Текст игрока..."
                                        className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y transition-all" />
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-2">
                                <button
                                    onClick={handleSimulate}
                                    disabled={!simMessage.trim() || simulateMutation.isPending}
                                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-violet-500/10 text-violet-500 border border-violet-500/20 hover:bg-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
                                >
                                    {simulateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <WandSparkles className="w-4 h-4" />}
                                    Проверить
                                </button>
                            </div>

                            {simulateResult?.decision && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`rounded-lg border p-3 space-y-2.5 ${simulateResult.decision.action === 'send' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-500/30 bg-slate-500/5'}`}
                                >
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                        <span className={`px-2 py-1 rounded-md border font-medium ${simulateResult.decision.action === 'send' ? 'border-emerald-500/40 text-emerald-500 bg-emerald-500/10' : 'border-slate-500/40 text-slate-500 bg-slate-500/10'}`}>
                                            {simulateResult.decision.action === 'send' ? 'Сработает' : 'Не сработает'}
                                        </span>
                                        <span className="px-2 py-1 rounded-md border border-border text-muted-foreground">
                                            src: {simulateResult.decision.source}
                                        </span>
                                    </div>
                                    <p className="text-sm">
                                        <span className="text-muted-foreground text-xs uppercase font-bold tracking-wider">Причина:</span><br/>
                                        <span className="font-medium text-foreground">{simulateResult.decision.reason}</span>
                                    </p>
                                    {simulateResult.decision.ruleName && (
                                        <p className="text-sm">
                                            <span className="text-muted-foreground text-xs uppercase font-bold tracking-wider">Правило:</span><br/>
                                            <span className="font-medium text-foreground">{simulateResult.decision.ruleName}</span>
                                        </p>
                                    )}
                                    {!!simulateResult.decision.keywords?.length && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {simulateResult.decision.keywords.map((k, i) => (
                                                <span key={`${k}-${i}`} className="text-[10px] px-1.5 py-0.5 rounded border border-violet-500/30 text-violet-500 bg-violet-500/10">{k}</span>
                                            ))}
                                        </div>
                                    )}
                                    {simulateResult.decision.response && (
                                        <div className="text-xs bg-background border border-border rounded-md p-2 whitespace-pre-wrap">
                                            <span className="inline-flex items-center gap-1 text-muted-foreground mb-1 font-bold"><ArrowRight className="w-3 h-3" /> Ответ:</span>
                                            <div className="text-foreground/90">{simulateResult.decision.response}</div>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
