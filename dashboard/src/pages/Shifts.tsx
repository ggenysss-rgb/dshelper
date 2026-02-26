import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchUsers, startShift, endShift } from '../api/stats';
import { Clock, Play, Square, UserCheck, Shield, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export default function Shifts() {
    const { data: users, isLoading } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
    const queryClient = useQueryClient();
    const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

    const showFeedback = (type: 'ok' | 'error', text: string) => {
        setFeedback({ type, text });
        setTimeout(() => setFeedback(null), 5000);
    };

    const startMut = useMutation({
        mutationFn: async (userId: string) => {
            const res = await startShift(userId);
            if (!res.ok) throw new Error(res.message || 'Ошибка при начале смены');
            return res;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            showFeedback('ok', data.message || 'Смена начата');
        },
        onError: (err: Error) => showFeedback('error', err.message),
    });

    const endMut = useMutation({
        mutationFn: async (userId: string) => {
            const res = await endShift(userId);
            if (!res.ok) throw new Error(res.message || 'Ошибка при закрытии смены');
            return res;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            showFeedback('ok', data.message || 'Смена закрыта');
        },
        onError: (err: Error) => showFeedback('error', err.message),
    });

    if (isLoading) return <div className="p-8 text-center animate-pulse">Загрузка...</div>;

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-rajdhani font-bold text-foreground">Управление сменами</h1>
                <p className="text-muted-foreground mt-1 text-sm">Отслеживание статуса модераторов</p>
            </div>

            <AnimatePresence>
                {feedback && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={cn(
                            "flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium",
                            feedback.type === 'ok'
                                ? "bg-green-500/10 border-green-500/20 text-green-500"
                                : "bg-destructive/10 border-destructive/20 text-destructive"
                        )}
                    >
                        {feedback.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                        {feedback.text}
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {users?.map((u: any, i: number) => (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        key={u.id}
                        className="bg-card border border-border rounded-xl p-6 flex flex-col items-center text-center shadow-sm relative overflow-hidden group"
                    >
                        {u.shiftActive && (
                            <div className="absolute top-0 inset-x-0 h-1 bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                        )}

                        <div className="relative mb-4 mt-2">
                            <div className={cn(
                                "w-20 h-20 rounded-full flex items-center justify-center border-4 transition-colors",
                                u.shiftActive ? "border-green-500 bg-green-500/10 text-green-500" : "border-secondary bg-secondary text-muted-foreground group-hover:bg-secondary/80 group-hover:text-foreground"
                            )}>
                                <UserCheck className="w-8 h-8" />
                            </div>
                            {u.shiftActive && (
                                <div className="absolute bottom-0 right-0 w-6 h-6 bg-background rounded-full flex items-center justify-center">
                                    <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse z-10"></div>
                                </div>
                            )}
                        </div>

                        <h3 className="font-rajdhani font-bold text-xl mb-1 flex items-center gap-1.5 justify-center">
                            {u.name || 'Аноним'}
                            <Shield className="w-4 h-4 text-primary" />
                        </h3>

                        <p className="text-sm font-medium mb-6">
                            {u.shiftActive ? (
                                <span className="text-green-500 flex items-center justify-center gap-1.5 bg-green-500/10 px-3 py-1 rounded-full">
                                    <Clock className="w-3.5 h-3.5" />
                                    На смене
                                </span>
                            ) : (
                                <span className="text-muted-foreground flex items-center justify-center gap-1.5 bg-secondary px-3 py-1 rounded-full">
                                    <Clock className="w-3.5 h-3.5" />
                                    Не на смене
                                </span>
                            )}
                        </p>

                        <div className="w-full flex gap-3 mt-auto pt-4 border-t border-border/50">
                            {!u.shiftActive ? (
                                <button
                                    onClick={() => startMut.mutate(u.id)}
                                    disabled={startMut.isPending || endMut.isPending}
                                    className="flex-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50"
                                >
                                    <Play className="w-4 h-4" /> Начать
                                </button>
                            ) : (
                                <button
                                    onClick={() => endMut.mutate(u.id)}
                                    disabled={startMut.isPending || endMut.isPending}
                                    className="flex-1 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50"
                                >
                                    <Square className="w-4 h-4" /> Закончить
                                </button>
                            )}
                        </div>
                    </motion.div>
                ))}
                {(!users || users.length === 0) && !isLoading && (
                    <div className="col-span-full p-8 text-center text-muted-foreground border-2 border-dashed border-border rounded-xl">
                        Модераторы не найдены в конфигурации
                    </div>
                )}
            </div>
        </div>
    );
}
