import { useState, useRef, useEffect } from 'react';
import { X, Camera, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type ProfileData = {
    displayName: string;
    avatarUrl: string;
    status: string;
};

const defaultProfile: ProfileData = {
    displayName: 'Администратор',
    avatarUrl: '',
    status: 'В сети',
};

function loadProfile(): ProfileData {
    try {
        const saved = localStorage.getItem('dashboard_profile');
        return saved ? { ...defaultProfile, ...JSON.parse(saved) } : defaultProfile;
    } catch {
        return defaultProfile;
    }
}

function saveProfile(p: ProfileData) {
    localStorage.setItem('dashboard_profile', JSON.stringify(p));
}

export function useProfile() {
    const [profile, setProfile] = useState<ProfileData>(loadProfile);

    const updateProfile = (p: ProfileData) => {
        setProfile(p);
        saveProfile(p);
    };

    return { profile, updateProfile };
}

export default function ProfileModal({
    isOpen,
    onClose,
    profile,
    onSave,
}: {
    isOpen: boolean;
    onClose: () => void;
    profile: ProfileData;
    onSave: (p: ProfileData) => void;
}) {
    const [name, setName] = useState(profile.displayName);
    const [status, setStatus] = useState(profile.status);
    const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
    const [avatarPreview, setAvatarPreview] = useState(profile.avatarUrl);
    const fileInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setName(profile.displayName);
            setStatus(profile.status);
            setAvatarUrl(profile.avatarUrl);
            setAvatarPreview(profile.avatarUrl);
        }
    }, [isOpen, profile]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result as string;
            setAvatarUrl(dataUrl);
            setAvatarPreview(dataUrl);
        };
        reader.readAsDataURL(file);
    };

    const handleSave = () => {
        onSave({ displayName: name, avatarUrl, status });
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                            <h3 className="text-lg font-bold">Настройки профиля</h3>
                            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-6">
                            {/* Avatar */}
                            <div className="flex flex-col items-center gap-3">
                                <div
                                    className="relative w-24 h-24 rounded-full bg-secondary flex items-center justify-center cursor-pointer group overflow-hidden border-2 border-border"
                                    onClick={() => fileInput.current?.click()}
                                >
                                    {avatarPreview ? (
                                        <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover rounded-full" />
                                    ) : (
                                        <span className="text-3xl font-bold text-primary">
                                            {name.charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                                        <Camera className="w-6 h-6 text-white" />
                                    </div>
                                </div>
                                <button
                                    onClick={() => fileInput.current?.click()}
                                    className="text-sm text-primary hover:underline"
                                >
                                    Сменить аватар
                                </button>
                                <input
                                    ref={fileInput}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                            </div>

                            {/* Display Name */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">Отображаемое имя</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                    placeholder="Введите имя"
                                />
                            </div>

                            {/* Status */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">Статус</label>
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                >
                                    <option value="В сети">🟢 В сети</option>
                                    <option value="Не беспокоить">🔴 Не беспокоить</option>
                                    <option value="Отошёл">🟡 Отошёл</option>
                                    <option value="Невидимый">⚫ Невидимый</option>
                                </select>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-secondary/20">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={handleSave}
                                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                            >
                                <Save className="w-4 h-4" />
                                Сохранить
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
