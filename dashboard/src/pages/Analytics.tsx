import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchStats } from '../api/stats';
import StatCard from '../components/StatCard';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
    PieChart, Pie, Cell, Area, AreaChart
} from 'recharts';
import { Activity, TicketCheck, TrendingUp, Clock, Zap, Timer, Settings, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const COLORS = ['hsl(355, 80%, 50%)', 'hsl(200, 80%, 50%)', 'hsl(145, 80%, 40%)', 'hsl(45, 90%, 50%)', 'hsl(280, 70%, 55%)'];

export default function Analytics() {
    const [widgets, setWidgets] = useState(() => {
        const saved = localStorage.getItem('analytics_widgets');
        if (saved) {
            try { return JSON.parse(saved); } catch (e) { }
        }
        return {
            statCards: true,
            additional: true,
            weeklyTrend: true,
            priorities: true,
            hourly: true
        };
    });
    const [showSettings, setShowSettings] = useState(false);

    useEffect(() => {
        localStorage.setItem('analytics_widgets', JSON.stringify(widgets));
    }, [widgets]);

    const toggleWidget = (key: keyof typeof widgets) => {
        setWidgets((p: typeof widgets) => ({ ...p, [key]: !p[key] }));
    };

    const { data: stats, isLoading } = useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 60000 });

    if (isLoading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Загрузка аналитики...</div>;
    if (!stats) return <div className="p-8 text-center text-destructive">Ошибка загрузки данных</div>;

    const hourlyData = Object.entries(stats.hourlyBuckets || {}).map(([hour, count]) => ({
        name: `${hour}:00`,
        'Запросов': count as number
    }));

    // Generate weekly trend from closed tickets
    const closedTickets = stats.closedTickets || [];
    const now = Date.now();
    const dayLabels = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const weeklyData = Array.from({ length: 7 }, (_, i) => {
        const dayStart = new Date(now - (6 - i) * 86400000);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart.getTime() + 86400000);
        const created = closedTickets.filter((t: any) => {
            const ts = new Date(t.createdAt).getTime();
            return ts >= dayStart.getTime() && ts < dayEnd.getTime();
        }).length;
        const closed = closedTickets.filter((t: any) => {
            const ts = new Date(t.closedAt).getTime();
            return ts >= dayStart.getTime() && ts < dayEnd.getTime();
        }).length;
        return { name: dayLabels[dayStart.getDay()], Создано: created, Закрыто: closed };
    });

    // Priority distribution
    const highPriority = closedTickets.filter((t: any) => t.priority === 'high').length;
    const normalPriority = closedTickets.length - highPriority;
    const pieData = [
        { name: 'Обычные', value: normalPriority || 1 },
        { name: 'Высокий приоритет', value: highPriority },
    ];

    // Avg response time calculation (rough estimate)
    const responseTimes = closedTickets
        .filter((t: any) => t.firstStaffReplyAt && t.createdAt)
        .map((t: any) => (new Date(t.firstStaffReplyAt).getTime() - new Date(t.createdAt).getTime()) / 60000);
    const avgResponseMin = responseTimes.length > 0 ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length) : 0;
    const avgResponse = avgResponseMin > 60 ? `${Math.floor(avgResponseMin / 60)}ч ${avgResponseMin % 60}м` : `${avgResponseMin || '—'} мин`;

    const uptimeHrs = Math.floor((stats.uptime || 0) / 3600);
    const uptimeMins = Math.floor(((stats.uptime || 0) % 3600) / 60);

    return (
        <div className="max-w-6xl mx-auto space-y-6 relative">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl md:text-3xl font-rajdhani font-bold text-foreground">Аналитика</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Статистика за всё время</p>
                </div>
                <button onClick={() => setShowSettings(true)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-xl transition-colors text-sm font-medium">
                    <Settings className="w-5 h-5 md:w-4 md:h-4" />
                    <span className="hidden md:inline">Настройка виджетов</span>
                </button>
            </div>

            <AnimatePresence>
                {showSettings && (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute top-16 right-0 w-full md:w-80 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
                        <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/30">
                            <h3 className="font-rajdhani font-bold text-lg uppercase">Внешний вид</h3>
                            <button onClick={() => setShowSettings(false)} className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-secondary rounded-lg transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-2">
                            {[
                                { key: 'statCards', label: 'Главные цифры (создано/закрыто)' },
                                { key: 'additional', label: 'Дополнительно (аптайм/сегодня)' },
                                { key: 'weeklyTrend', label: 'График: Тренд за неделю' },
                                { key: 'priorities', label: 'График: Приоритеты' },
                                { key: 'hourly', label: 'График: Активность по часам' }
                            ].map(item => (
                                <button key={item.key} onClick={() => toggleWidget(item.key as any)}
                                    className="w-full text-left px-4 min-h-[44px] flex items-center justify-between hover:bg-secondary/50 rounded-lg transition-colors text-sm">
                                    <span>{item.label}</span>
                                    <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${widgets[item.key as keyof typeof widgets] ? 'bg-primary border-primary' : 'border-input'}`}>
                                        {widgets[item.key as keyof typeof widgets] && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Stat cards */}
            {widgets.statCards && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                    <StatCard title="Всего создано" value={stats.totalCreated} icon={<Activity />} delay={0.1} />
                    <StatCard title="Всего закрыто" value={stats.totalClosed} icon={<TicketCheck />} delay={0.2} />
                    <StatCard title="В работе" value={stats.activeTicketsCount} icon={<TrendingUp />} delay={0.3} />
                    <StatCard title="Ср. ответ" value={avgResponse} icon={<Clock />} delay={0.4} />
                </div>
            )}

            {/* Additional stats */}
            {widgets.additional && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                        className="bg-card border border-border rounded-xl p-4 md:p-6 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                            <Timer className="w-6 h-6 text-cyan-400" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Аптайм</p>
                            <p className="text-xl md:text-2xl font-bold font-rajdhani">{uptimeHrs}ч {uptimeMins}м</p>
                        </div>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                        className="bg-card border border-border rounded-xl p-4 md:p-6 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                            <Zap className="w-6 h-6 text-amber-400" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Закрыто сегодня</p>
                            <p className="text-xl md:text-2xl font-bold font-rajdhani">{weeklyData[6]?.['Закрыто'] || 0}</p>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Weekly Trend */}
                {widgets.weeklyTrend && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                        className="lg:col-span-2 bg-card border border-border rounded-xl p-4 md:p-6 shadow-sm">
                        <h2 className="text-sm md:text-lg font-rajdhani font-bold mb-4 md:mb-6">Тренд за неделю</h2>
                        <div className="h-64 md:h-72 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={weeklyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip cursor={{ fill: 'hsl(var(--secondary))' }}
                                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                                    <Area type="monotone" dataKey="Создано" stackId="1" stroke="hsl(200, 80%, 50%)" fill="hsl(200, 80%, 50%)" fillOpacity={0.2} strokeWidth={2} />
                                    <Area type="monotone" dataKey="Закрыто" stackId="2" stroke="hsl(145, 80%, 40%)" fill="hsl(145, 80%, 40%)" fillOpacity={0.2} strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>
                )}

                {/* Priority Pie */}
                {widgets.priorities && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                        className="bg-card border border-border rounded-xl p-4 md:p-6 shadow-sm">
                        <h2 className="text-sm md:text-lg font-rajdhani font-bold mb-4 md:mb-6">Приоритеты</h2>
                        <div className="h-48 md:h-56 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex justify-center gap-4 mt-2">
                            {pieData.map((entry, i) => (
                                <div key={entry.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                                    {entry.name}: {entry.value}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Hourly chart */}
            {widgets.hourly && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                    className="bg-card border border-border rounded-xl p-4 md:p-6 shadow-sm">
                    <h2 className="text-sm md:text-lg font-rajdhani font-bold mb-4 md:mb-6">Активность по часам</h2>
                    <div className="h-64 md:h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip cursor={{ fill: 'hsl(var(--secondary))' }}
                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                                    itemStyle={{ color: 'hsl(var(--foreground))' }} />
                                <Bar dataKey="Запросов" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
