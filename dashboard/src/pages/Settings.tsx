import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSettings, updateSettings } from '../api/stats';
import { Settings as SettingsIcon, Save, Loader2, Check, ToggleLeft, ToggleRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from '../hooks/useTheme';

type SettingsData = Record<string, any>;

function Toggle({ value, onChange, label, desc }: { value: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
    return (
        <div className="flex items-center justify-between py-3 border-b border-border/30 last:border-0">
            <div>
                <span className="text-sm font-medium text-foreground">{label}</span>
                {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
            </div>
            <button onClick={() => onChange(!value)} className="transition-colors">
                {value ? <ToggleRight className="w-8 h-8 text-emerald-500" /> : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
            </button>
        </div>
    );
}

function NumberField({ value, onChange, label, desc, min, max }: { value: number; onChange: (v: number) => void; label: string; desc?: string; min?: number; max?: number }) {
    return (
        <div className="flex items-center justify-between py-3 border-b border-border/30 last:border-0">
            <div className="flex-1">
                <span className="text-sm font-medium text-foreground">{label}</span>
                {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
            </div>
            <input type="number" value={value} min={min} max={max}
                onChange={e => onChange(Number(e.target.value))}
                className="w-24 bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
    );
}

function TextField({ value, onChange, label, desc }: { value: string; onChange: (v: string) => void; label: string; desc?: string }) {
    return (
        <div className="py-3 border-b border-border/30 last:border-0">
            <span className="text-sm font-medium text-foreground">{label}</span>
            {desc && <p className="text-xs text-muted-foreground mt-0.5 mb-2">{desc}</p>}
            <input type="text" value={value} onChange={e => onChange(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary mt-1" />
        </div>
    );
}

export default function Settings() {
    const queryClient = useQueryClient();
    const { cycleDesign, designLabel } = useTheme();
    const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
    const [local, setLocal] = useState<SettingsData | null>(null);
    const [saved, setSaved] = useState(false);

    const mutation = useMutation({
        mutationFn: updateSettings,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['settings'] });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        }
    });

    const s = local || settings;
    const update = (key: string, val: any) => setLocal(prev => ({ ...(prev || settings), [key]: val }));
    const hasChanges = local !== null;

    if (isLoading || !s) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
                        <SettingsIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-rajdhani font-bold">Настройки</h1>
                        <p className="text-xs text-muted-foreground">Конфигурация бота</p>
                    </div>
                </div>
                <button onClick={() => mutation.mutate(local || {})} disabled={!hasChanges || mutation.isPending}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${hasChanges ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20' : 'bg-secondary text-muted-foreground'}`}>
                    {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                    {saved ? 'Сохранено!' : 'Сохранить'}
                </button>
            </div>

            {/* Design Switch */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-xl p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1">Внешний вид</h2>
                        <p className="text-sm text-foreground">Один клик переключает дизайн панели целиком.</p>
                        <p className="text-xs text-muted-foreground mt-1">Текущий пресет: <span className="text-primary font-semibold">{designLabel}</span></p>
                    </div>
                    <button
                        onClick={cycleDesign}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all text-sm font-medium"
                    >
                        <Sparkles className="w-4 h-4" />
                        Поменять дизайн
                    </button>
                </div>
            </motion.div>

            {/* Toggles Group */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">Основные переключатели</h2>
                <Toggle label="Авто-приветствие" desc="Автоматически приветствовать пользователей при открытии тикета" value={s.autoGreetEnabled} onChange={v => update('autoGreetEnabled', v)} />
                <Toggle label="Приветствие во всех каналах" desc="Авто-приветствие работает во всех каналах, а не только в тикетах" value={s.autoGreetAllChannels} onChange={v => update('autoGreetAllChannels', v)} />
                <Toggle label="Первое сообщение" desc="Включать первое сообщение пользователя в уведомление" value={s.includeFirstUserMessage} onChange={v => update('includeFirstUserMessage', v)} />
                <Toggle label="Уведомление при закрытии" desc="Отправлять уведомление когда тикет закрывается" value={s.notifyOnClose} onChange={v => update('notifyOnClose', v)} />
                <Toggle label="Упоминание при приоритете" desc="Упоминать при высокоприоритетных тикетах" value={s.mentionOnHighPriority} onChange={v => update('mentionOnHighPriority', v)} />
                <Toggle label="Форум-режим" desc="Отслеживать тикеты в формате форума (threads)" value={s.forumMode} onChange={v => update('forumMode', v)} />
            </motion.div>

            {/* Numbers Group */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">Таймеры и лимиты</h2>
                <NumberField label="Проверка активности (мин)" desc="Через сколько минут проверять нет ли ответа" value={s.activityCheckMin} onChange={v => update('activityCheckMin', v)} min={1} max={60} />
                <NumberField label="Таймер закрытия (мин)" desc="Через сколько минут предлагать закрыть тикет" value={s.closingCheckMin} onChange={v => update('closingCheckMin', v)} min={1} max={120} />
                <NumberField label="Интервал поллинга (сек)" desc="Частота проверки новых сообщений" value={s.pollingIntervalSec} onChange={v => update('pollingIntervalSec', v)} min={1} max={60} />
                <NumberField label="Rate Limit (мс)" desc="Минимальный интервал между сообщениями" value={s.rateLimitMs} onChange={v => update('rateLimitMs', v)} min={500} max={10000} />
                <NumberField label="Макс. длина сообщения" desc="Максимальная длина сообщения в уведомлении" value={s.maxMessageLength} onChange={v => update('maxMessageLength', v)} min={50} max={2000} />
            </motion.div>

            {/* Text Fields Group */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">Текстовые настройки</h2>
                <TextField label="Текст приветствия" desc="Автоматическое приветствие при открытии тикета" value={s.autoGreetText} onChange={v => update('autoGreetText', v)} />
                <TextField label="Фраза закрытия" desc="Фразы-триггеры для предложения закрыть тикет (через запятую)" value={s.closingPhrase} onChange={v => update('closingPhrase', v)} />
                <TextField label="Префикс тикетов" desc="Название каналов начинается с этого префикса" value={s.ticketPrefix} onChange={v => update('ticketPrefix', v)} />
                <TextField label="Ключевые слова приоритета" desc="Слова для определения высокого приоритета (через запятую)"
                    value={(() => { const pk = s.priorityKeywords; if (Array.isArray(pk)) return pk.join(', '); if (pk && typeof pk === 'object') return (pk.high || []).join(', '); return String(pk || ''); })()}
                    onChange={v => update('priorityKeywords', v)} />
                <TextField label="ID ролей стаффа" desc="ID ролей стаффа (через запятую) — определяет кто справа в чате"
                    value={Array.isArray(s.staffRoleIds) ? s.staffRoleIds.join(', ') : String(s.staffRoleIds || '')}
                    onChange={v => update('staffRoleIds', v)} />
                <TextField label="ID категории тикетов" desc="ID дискорд-категории где создаются тикеты" value={s.ticketsCategoryId || ''} onChange={v => update('ticketsCategoryId', v.trim())} />
                <TextField label="Канал смены (ID)" desc="ID дискорд-канала для отметки смен" value={s.shiftChannelId || ''} onChange={v => update('shiftChannelId', v.trim())} />
                <TextField label="Роли для авто-приветствия" desc="ID ролей (через запятую), при пинге которых отправляется приветствие"
                    value={Array.isArray(s.autoGreetRoleIds) ? s.autoGreetRoleIds.join(', ') : String(s.autoGreetRoleIds || '')}
                    onChange={v => update('autoGreetRoleIds', v)} />
            </motion.div>

            {/* AI Settings Group */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">Настройки ИИ (OpenRouter)</h2>
                <div className="py-3 border-b border-border/30 last:border-0">
                    <span className="text-sm font-medium text-foreground">API Ключ OpenRouter</span>
                    <p className="text-xs text-muted-foreground mt-0.5 mb-2">Введите ключ OpenRouter (sk-or-...). Модель: stepfun/step-3.5-flash:free</p>
                    <textarea
                        value={typeof s.geminiApiKeys === 'string' ? s.geminiApiKeys : (Array.isArray(s.geminiApiKeys) ? s.geminiApiKeys.join('\n') : '')}
                        onChange={e => update('geminiApiKeys', e.target.value)}
                        rows={4}
                        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary mt-1 font-mono resize-y"
                        placeholder={"sk-or-v1-..."}
                    />
                </div>
            </motion.div>
        </div>
    );
}
