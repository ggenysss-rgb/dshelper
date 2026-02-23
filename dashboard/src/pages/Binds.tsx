import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchBinds, addBind, deleteBind } from '../api/stats';
import { Trash2, Plus, Terminal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Binds() {
    const { data: binds, isLoading } = useQuery({ queryKey: ['binds'], queryFn: fetchBinds });
    const queryClient = useQueryClient();

    const [name, setName] = useState('');
    const [message, setMessage] = useState('');

    const addMut = useMutation({
        mutationFn: () => addBind(name, message),
        onSuccess: () => {
            setName('');
            setMessage('');
            queryClient.invalidateQueries({ queryKey: ['binds'] });
        }
    });

    const delMut = useMutation({
        mutationFn: (n: string) => deleteBind(n),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['binds'] });
        }
    });

    if (isLoading) return <div className="p-8 text-center animate-pulse">Загрузка...</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-rajdhani font-bold">Быстрые ответы (Биндлы)</h1>
                <p className="text-muted-foreground mt-1">Управление шаблонами ответов для тикетов</p>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                <h2 className="text-lg font-rajdhani font-bold mb-4 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-primary" />
                    Новый биндл
                </h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Название</label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Например: приветствие"
                            className="w-full bg-secondary/50 border border-border rounded-lg p-3 focus:outline-none focus:border-primary transition-colors text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Текст сообщения</label>
                        <textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            placeholder="Здравствуйте! Чем могу помочь?"
                            className="w-full bg-secondary/50 border border-border rounded-lg p-3 focus:outline-none focus:border-primary transition-colors min-h-[100px] text-sm resize-y"
                        />
                    </div>
                    <button
                        disabled={!name || !message || addMut.isPending}
                        onClick={() => addMut.mutate()}
                        className="bg-primary text-primary-foreground font-semibold px-6 py-2.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                        {addMut.isPending ? 'Добавление...' : 'Добавить биндл'}
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                <h2 className="text-lg font-rajdhani font-bold flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-muted-foreground" />
                    Сохраненные биндлы
                </h2>

                {(!binds || binds.length === 0) ? (
                    <div className="text-center p-8 bg-card/50 border border-dashed border-border rounded-xl text-muted-foreground">
                        Нет сохраненных биндлов
                    </div>
                ) : (
                    <motion.div layout className="grid gap-4">
                        <AnimatePresence>
                            {binds.map((b: any) => (
                                <motion.div
                                    layout
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    key={b.name}
                                    className="bg-card border border-border rounded-xl p-5 flex justify-between items-start group hover:border-muted-foreground/30 transition-colors shadow-sm"
                                >
                                    <div className="flex-1 mr-6">
                                        <h3 className="font-bold text-lg mb-2 text-foreground">{b.name}</h3>
                                        <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-inter bg-secondary/50 p-3 rounded-lg border border-border/50">
                                            {b.message}
                                        </pre>
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (confirm(`Удалить биндл "${b.name}"?`)) {
                                                delMut.mutate(b.name);
                                            }
                                        }}
                                        disabled={delMut.isPending}
                                        className="p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                        title="Удалить"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
