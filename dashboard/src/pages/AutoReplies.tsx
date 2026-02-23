import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAutoReplies, updateAutoReplies } from '../api/stats';
import { Bot, Plus, Trash2, Save, Loader2, Check, ChevronDown, ChevronUp, Power, PowerOff } from 'lucide-react';
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
}

function TagEditor({ tags, onChange, placeholder }: { tags: string[]; onChange: (t: string[]) => void; placeholder: string }) {
    const [input, setInput] = useState('');
    const addTag = () => {
        const t = input.trim();
        if (t && !tags.includes(t)) { onChange([...tags, t]); setInput(''); }
    };
    return (
        <div>
            <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map((tag, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-xs text-foreground border border-border">
                        {tag}
                        <button onClick={() => onChange(tags.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-400 ml-0.5">×</button>
                    </span>
                ))}
            </div>
            <div className="flex gap-2">
                <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder={placeholder}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                    className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
                <button onClick={addTag} className="px-3 py-1.5 bg-secondary text-xs rounded-lg hover:bg-secondary/80 transition-colors border border-border">+</button>
            </div>
        </div>
    );
}

function RuleCard({ rule, index, onChange, onDelete }: { rule: AutoReplyRule; index: number; onChange: (r: AutoReplyRule) => void; onDelete: () => void }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className={`bg-card border rounded-xl overflow-hidden transition-colors ${rule.enabled ? 'border-border' : 'border-border/30 opacity-60'}`}>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-secondary/30 transition-colors" onClick={() => setExpanded(!expanded)}>
                <button onClick={e => { e.stopPropagation(); onChange({ ...rule, enabled: !rule.enabled }); }}
                    className="shrink-0" title={rule.enabled ? 'Выключить' : 'Включить'}>
                    {rule.enabled ? <Power className="w-4 h-4 text-emerald-500" /> : <PowerOff className="w-4 h-4 text-red-400" />}
                </button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{rule.name || `Правило ${index + 1}`}</span>
                        <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{rule.guildId?.slice(-4)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{rule.response?.slice(0, 60)}...</p>
                </div>
                <span className="text-[10px] bg-secondary px-2 py-0.5 rounded text-muted-foreground shrink-0">
                    {(rule.includeAny?.length || 0) + (rule.includeAll?.flat().length || 0)} слов
                </span>
                {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
            </div>

            {/* Expanded Content */}
            <AnimatePresence>
                {expanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden">
                        <div className="px-4 pb-4 space-y-4 border-t border-border/50 pt-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">Название</label>
                                    <input type="text" value={rule.name} onChange={e => onChange({ ...rule, name: e.target.value })}
                                        className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">Guild ID</label>
                                    <input type="text" value={rule.guildId} onChange={e => onChange({ ...rule, guildId: e.target.value })}
                                        className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">Channel ID</label>
                                    <input type="text" value={rule.channelId} onChange={e => onChange({ ...rule, channelId: e.target.value })}
                                        className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1.5 block">Включающие слова (includeAny)</label>
                                <TagEditor tags={rule.includeAny || []} onChange={t => onChange({ ...rule, includeAny: t })} placeholder="Добавить ключевое слово..." />
                            </div>

                            <div>
                                <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1.5 block">Исключающие слова (excludeAny)</label>
                                <TagEditor tags={rule.excludeAny || []} onChange={t => onChange({ ...rule, excludeAny: t })} placeholder="Добавить исключение..." />
                            </div>

                            <div>
                                <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">Ответ</label>
                                <textarea value={rule.response} onChange={e => onChange({ ...rule, response: e.target.value })}
                                    className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary min-h-[80px] resize-y" />
                            </div>

                            <button onClick={onDelete} className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10">
                                <Trash2 className="w-3.5 h-3.5" /> Удалить правило
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

export default function AutoReplies() {
    const queryClient = useQueryClient();
    const { data: rules, isLoading } = useQuery({ queryKey: ['autoreplies'], queryFn: fetchAutoReplies });
    const [local, setLocal] = useState<AutoReplyRule[] | null>(null);
    const [saved, setSaved] = useState(false);

    const mutation = useMutation({
        mutationFn: updateAutoReplies,
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['autoreplies'] }); setLocal(null); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    });

    const list: AutoReplyRule[] = local || rules || [];
    const hasChanges = local !== null;

    const updateRule = (index: number, rule: AutoReplyRule) => {
        const newList = [...list];
        newList[index] = rule;
        setLocal(newList);
    };

    const deleteRule = (index: number) => setLocal(list.filter((_, i) => i !== index));

    const addRule = () => {
        setLocal([...list, { name: 'Новое правило', guildId: '', channelId: '', includeAny: [], excludeAny: [], response: '', enabled: true }]);
    };

    if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-600/5 border border-violet-500/20 flex items-center justify-center">
                        <Bot className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-rajdhani font-bold">Авто-ответы</h1>
                        <p className="text-xs text-muted-foreground">{list.length} правил • {list.filter(r => r.enabled).length} активных</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={addRule} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-secondary text-sm font-medium hover:bg-secondary/80 transition-colors border border-border">
                        <Plus className="w-4 h-4" /> Добавить
                    </button>
                    <button onClick={() => mutation.mutate(local || [])} disabled={!hasChanges || mutation.isPending}
                        className={`flex items-center gap-2 px-5 py-2 rounded-xl font-medium text-sm transition-all ${hasChanges ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20' : 'bg-secondary text-muted-foreground'}`}>
                        {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                        {saved ? 'Сохранено!' : 'Сохранить'}
                    </button>
                </div>
            </div>

            <div className="space-y-3">
                <AnimatePresence>
                    {list.map((rule, i) => (
                        <RuleCard key={`${rule.name}-${i}`} rule={rule} index={i} onChange={r => updateRule(i, r)} onDelete={() => deleteRule(i)} />
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}
