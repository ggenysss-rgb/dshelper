import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

interface StatCardProps {
    title: string;
    value: string | number;
    icon: ReactNode;
    trend?: string;
    trendUp?: boolean;
    className?: string;
    delay?: number;
}

export default function StatCard({ title, value, icon, trend, trendUp, className, delay = 0 }: StatCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            className={cn("bg-card border border-border rounded-xl p-6 relative overflow-hidden group", className)}
        >
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/10 transition-colors"></div>

            <div className="flex items-center justify-between mb-4 relative z-10">
                <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
                <div className="p-2 bg-secondary rounded-lg text-primary">
                    {icon}
                </div>
            </div>

            <div className="relative z-10">
                <div className="text-3xl font-rajdhani font-bold mb-1 group-hover:scale-[1.02] origin-left transition-transform">
                    {value}
                </div>
                {trend && (
                    <p className={cn("text-xs flex items-center gap-1", trendUp ? "text-green-500" : "text-red-500")}>
                        <span className="font-medium">{trend}</span>
                        <span className="text-muted-foreground ml-1">по сравнению с прошлой неделей</span>
                    </p>
                )}
            </div>
        </motion.div>
    );
}
