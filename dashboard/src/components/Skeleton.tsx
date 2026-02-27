import { motion } from 'framer-motion';

type SkeletonProps = {
    className?: string;
    delay?: number;
};

export default function Skeleton({ className = "", delay = 0 }: SkeletonProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay, duration: 0.3 }}
            className={`animate-pulse bg-secondary/60 rounded-xl ${className}`}
        />
    );
}
