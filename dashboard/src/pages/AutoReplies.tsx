import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAutoReplies, updateAutoReplies } from '../api/stats';
import { Bot, Plus, Trash2, Save, Loader2, Check, ChevronDown, Power, PowerOff, Search, Copy } from 'lucide-react';

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

function TagEditor({ tags, onChange, placeholder, color = 'emerald' }: { tags: string[]; onChange: (t: string[]) => void; placeholder: string; color?: string }) {
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
                        <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border ${colorClasses[color] || colorClasses.emerald}`}>
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

function RuleCard({ rule, index, onChange, onDelete, onDuplicate }: {
    rule: AutoReplyRule; index: number;
    onChange: (r: AutoReplyRule) => void;
    onDelete: () => void;
    onDuplicate: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const wordCount = (rule.includeAny?.length || 0) + (rule.includeAll?.flat().length || 0);

    return (
        <div className={`bg-[var(--color-bg-secondary)] border rounded-xl overflow-hidden transition-all duration-200 ${rule.enabled ? 'border-[var(--color-border)]' : 'border-[var(--color-border)]/30 opacity-50'}`}>
            {/* Header — clickable */}
            <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-[var(--color-bg-primary)]/50 transition-colors"
                onClick={() => setExpanded(!expanded)}>
                {/* Toggle */}
                <button onClick={e => { e.stopPropagation(); onChange({ ...rule, enabled: !rule.enabled }); }}
                    className="shrink-0 p-1 rounded-lg hover:bg-[var(--color-bg-primary)] transition-colors" title={rule.enabled ? 'Выключить' : 'Включить'}>
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

            {/* Expanded Content — no Framer Motion, use CSS */}
            {expanded && (
                <div onClick={e => e.stopPropagation()} className="px-4 pb-4 space-y-4 border-t border-[var(--color-border)]/50 pt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Row 1: name, guild, channel, delay */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                            <label className="text-[10px] text-[var(--color-text-secondary)] uppercase font-bold mb-1 block tracking-wider">Название</label>
                            <input type="text" value={rule.name} onChange={e => onChange({ ...rule, name: e.target.value })}
                                className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
                        </div>
                        <div>
                            <label className="text-[10px] text-[var(--color-text-secondary)] uppercase font-bold mb-1 block tracking-wider">Guild ID</label>
                            <input type="text" value={rule.guildId} onChange={e => onChange({ ...rule, guildId: e.target.value })}
                                className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
                        </div>
                        <div>
                            <label className="text-[10px] text-[var(--color-text-secondary)] uppercase font-bold mb-1 block tracking-wider">Channel ID</label>
                            <input type="text" value={rule.channelId} onChange={e => onChange({ ...rule, channelId: e.target.value })} placeholder="Все каналы"
                                className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
                        </div>
                        <div>
                            <label className="text-[10px] text-[var(--color-text-secondary)] uppercase font-bold mb-1 block tracking-wider">Задержка (сек)</label>
                            <input type="number" value={rule.delay || 2} onChange={e => onChange({ ...rule, delay: parseInt(e.target.value) || 2 })}
                                className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" min={0} max={60} />
                        </div>
                    </div>

                    {/* Keywords */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] text-[var(--color-text-secondary)] uppercase font-bold mb-1.5 block tracking-wider">
                                ✅ Включающие слова <span className="normal-case font-normal">(includeAny)</span>
                            </label>
                            <TagEditor tags={rule.includeAny || []} onChange={t => onChange({ ...rule, includeAny: t })} placeholder="Добавить слово..." color="emerald" />
                        </div>
                        <div>
                            <label className="text-[10px] text-[var(--color-text-secondary)] uppercase font-bold mb-1.5 block tracking-wider">
                                ❌ Исключающие слова <span className="normal-case font-normal">(excludeAny)</span>
                            </label>
                            <TagEditor tags={rule.excludeAny || []} onChange={t => onChange({ ...rule, excludeAny: t })} placeholder="Добавить исключение..." color="red" />
                        </div>
                    </div>

                    {/* Response */}
                    <div>
                        <label className="text-[10px] text-[var(--color-text-secondary)] uppercase font-bold mb-1 block tracking-wider">💬 Ответ</label>
                        <textarea value={rule.response} onChange={e => onChange({ ...rule, response: e.target.value })} rows={3}
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

export default function AutoReplies() {
    const queryClient = useQueryClient();
    const { data: rules, isLoading } = useQuery({ queryKey: ['autoreplies'], queryFn: fetchAutoReplies });
    const [local, setLocal] = useState<AutoReplyRule[] | null>(null);
    const [saved, setSaved] = useState(false);
    const [search, setSearch] = useState('');

    const mutation = useMutation({
        mutationFn: updateAutoReplies,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['autoreplies'] });
            setLocal(null);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        }
    });

    const list: AutoReplyRule[] = local || rules || [];
    const hasChanges = local !== null;

    const filtered = useMemo(() => {
        if (!search.trim()) return list;
        const q = search.toLowerCase();
        return list.filter(r =>
            r.name.toLowerCase().includes(q) ||
            r.response.toLowerCase().includes(q) ||
            r.includeAny?.some(w => w.toLowerCase().includes(q))
        );
    }, [list, search]);

    const updateRule = useCallback((index: number, rule: AutoReplyRule) => {
        setLocal(prev => {
            const base = prev || rules || [];
            const newList = [...base];
            newList[index] = rule;
            return newList;
        });
    }, [rules]);

    const deleteRule = useCallback((index: number) => {
        setLocal(prev => {
            const base = prev || rules || [];
            return base.filter((_, i) => i !== index);
        });
    }, [rules]);

    const duplicateRule = useCallback((index: number) => {
        setLocal(prev => {
            const base = prev || rules || [];
            const copy = { ...base[index], name: base[index].name + ' (копия)' };
            const newList = [...base];
            newList.splice(index + 1, 0, copy);
            return newList;
        });
    }, [rules]);

    const addRule = useCallback(() => {
        setLocal(prev => [...(prev || rules || []), {
            name: 'Новое правило',
            guildId: '690362306395111444',
            channelId: '',
            includeAny: [],
            excludeAny: [],
            response: '',
            enabled: true,
            delay: 2,
        }]);
    }, [rules]);

    if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full" /></div>;

    const activeCount = list.filter(r => r.enabled).length;

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
                            {list.length} правил • <span className="text-emerald-400">{activeCount} активных</span>
                            {hasChanges && <span className="text-amber-400 ml-2">• Есть несохранённые изменения</span>}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={addRule} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--color-bg-secondary)] text-sm font-medium hover:bg-[var(--color-bg-primary)] transition-colors border border-[var(--color-border)]">
                        <Plus className="w-4 h-4" /> Добавить
                    </button>
                    <button onClick={() => mutation.mutate(local || [])} disabled={!hasChanges || mutation.isPending}
                        className={`flex items-center gap-2 px-5 py-2 rounded-xl font-medium text-sm transition-all ${hasChanges ? 'bg-[var(--color-accent)] text-white hover:brightness-110 shadow-lg shadow-[var(--color-accent)]/20' : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] cursor-not-allowed'}`}>
                        {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                        {saved ? 'Сохранено!' : 'Сохранить'}
                    </button>
                </div>
            </div>

            {/* Search */}
            {list.length > 3 && (
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-secondary)]" />
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по правилам..."
                        className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
                </div>
            )}

            {/* Rules List */}
            <div className="space-y-3">
                {filtered.map((rule, i) => {
                    const realIndex = list.indexOf(rule);
                    return (
                        <RuleCard
                            key={`rule-${realIndex}`}
                            rule={rule}
                            index={realIndex}
                            onChange={r => updateRule(realIndex, r)}
                            onDelete={() => deleteRule(realIndex)}
                            onDuplicate={() => duplicateRule(realIndex)}
                        />
                    );
                })}
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
