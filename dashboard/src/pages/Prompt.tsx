import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Loader2, Check, FileText } from 'lucide-react';
import { fetchPrompt, updatePrompt } from '../api/stats';

export default function Prompt() {
    const queryClient = useQueryClient();
    const { data, isLoading } = useQuery({ queryKey: ['prompt'], queryFn: fetchPrompt });
    const [prompt, setPrompt] = useState('');
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (data?.prompt !== undefined) {
            setPrompt(data.prompt);
        }
    }, [data?.prompt]);

    const saveMutation = useMutation({
        mutationFn: () => updatePrompt(prompt),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['prompt'] });
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
        },
    });

    const hasChanges = useMemo(() => {
        return (data?.prompt ?? '') !== prompt;
    }, [data?.prompt, prompt]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-rajdhani font-bold">Промпт</h1>
                        <p className="text-xs text-muted-foreground">Редактор `neuro_style_prompt.txt`</p>
                    </div>
                </div>
                <button
                    onClick={() => saveMutation.mutate()}
                    disabled={!hasChanges || saveMutation.isPending}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${hasChanges ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20' : 'bg-secondary text-muted-foreground'}`}
                >
                    {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                    {saved ? 'Сохранено' : 'Сохранить'}
                </button>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 md:p-6 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>Размер: {new Blob([prompt]).size} байт</span>
                    <span>
                        Обновлено:{' '}
                        {data?.updatedAt ? new Date(data.updatedAt).toLocaleString() : 'неизвестно'}
                    </span>
                </div>
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="w-full min-h-[65vh] bg-secondary/50 border border-border rounded-xl p-4 text-sm leading-relaxed font-mono focus:outline-none focus:border-primary resize-y"
                    spellCheck={false}
                    placeholder="Введите системный промпт..."
                />
                <p className="text-xs text-muted-foreground">
                    После сохранения промпт применяется сразу, без перезапуска.
                </p>
            </div>
        </div>
    );
}
