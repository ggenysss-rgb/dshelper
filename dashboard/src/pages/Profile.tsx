import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import client from '../api/client';
import { motion } from 'framer-motion';
import { Bot, Key, MessageCircle, Save, Power, PowerOff, RefreshCw, Server } from 'lucide-react';

export default function Profile() {
    const { user } = useAuth();
    const [discordToken, setDiscordToken] = useState('');
    const [tgToken, setTgToken] = useState('');
    const [tgChatId, setTgChatId] = useState('');
    const [guildId, setGuildId] = useState('');
    const [botActive, setBotActive] = useState(false);
    const [saving, setSaving] = useState(false);
    const [starting, setStarting] = useState(false);
    const [stopping, setStopping] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        try {
            const { data } = await client.get('/profile');
            setDiscordToken(data.discordToken || '');
            setTgToken(data.tgToken || '');
            setTgChatId(data.tgChatId || '');
            setGuildId(data.guildId || '');
            setBotActive(data.botActive || false);
        } catch {
            setMessage({ text: 'Не удалось загрузить профиль', type: 'error' });
        }
        setLoading(false);
    };

    const saveTokens = async () => {
        setSaving(true);
        setMessage({ text: '', type: '' });
        try {
            await client.post('/profile/tokens', { discordToken, tgToken, tgChatId, guildId });
            setMessage({ text: 'Токены сохранены!', type: 'success' });
            loadProfile();
        } catch (err: any) {
            setMessage({ text: err.response?.data?.error || 'Ошибка сохранения', type: 'error' });
        }
        setSaving(false);
    };

    const startBot = async () => {
        setStarting(true);
        setMessage({ text: '', type: '' });
        try {
            await client.post('/profile/start');
            setMessage({ text: 'Бот запущен!', type: 'success' });
            setBotActive(true);
        } catch (err: any) {
            setMessage({ text: err.response?.data?.error || 'Не удалось запустить бот', type: 'error' });
        }
        setStarting(false);
    };

    const stopBot = async () => {
        setStopping(true);
        setMessage({ text: '', type: '' });
        try {
            await client.post('/profile/stop');
            setMessage({ text: 'Бот остановлен', type: 'success' });
            setBotActive(false);
        } catch (err: any) {
            setMessage({ text: err.response?.data?.error || 'Не удалось остановить бот', type: 'error' });
        }
        setStopping(false);
    };

    if (loading) {
        return <div className="flex items-center justify-center py-20 text-muted-foreground">Загрузка профиля...</div>;
    }

    return (
        <div className="space-y-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="text-2xl font-rajdhani font-bold text-foreground flex items-center gap-3">
                    <Bot className="w-6 h-6 text-primary" />
                    Профиль
                </h1>
                <p className="text-muted-foreground mt-1">Управление токенами и настройка подключения</p>
            </motion.div>

            {/* Bot Status Card */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="bg-card border border-border rounded-xl p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${botActive ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                        <span className="text-foreground font-medium text-lg">
                            {botActive ? 'Бот работает' : 'Бот остановлен'}
                        </span>
                    </div>
                    <div className="flex gap-2">
                        {botActive ? (
                            <button onClick={stopBot} disabled={stopping}
                                className="flex items-center gap-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 px-4 py-2 rounded-lg transition-all disabled:opacity-50">
                                <PowerOff className="w-4 h-4" />
                                {stopping ? 'Останавливаю...' : 'Остановить'}
                            </button>
                        ) : (
                            <button onClick={startBot} disabled={starting}
                                className="flex items-center gap-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 px-4 py-2 rounded-lg transition-all disabled:opacity-50">
                                <Power className="w-4 h-4" />
                                {starting ? 'Запускаю...' : 'Запустить'}
                            </button>
                        )}
                    </div>
                </div>
            </motion.div>

            {/* Token Settings */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="bg-card border border-border rounded-xl p-6 space-y-5">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Key className="w-5 h-5 text-amber-400" />
                    Токены подключения
                </h2>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1.5">Discord Token (Bot или User)</label>
                        <input type="password" value={discordToken} onChange={(e) => setDiscordToken(e.target.value)}
                            placeholder="Bot MTIzNDU2Nzg5MDEyMzQ1Njc4OQ..."
                            className="w-full bg-secondary/50 border border-border text-foreground px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all font-mono text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1.5">Telegram Bot Token</label>
                        <input type="password" value={tgToken} onChange={(e) => setTgToken(e.target.value)}
                            placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u..."
                            className="w-full bg-secondary/50 border border-border text-foreground px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all font-mono text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                                <MessageCircle className="w-3.5 h-3.5 inline mr-1" />Telegram Chat ID
                            </label>
                            <input type="text" value={tgChatId} onChange={(e) => setTgChatId(e.target.value)}
                                placeholder="-1001234567890"
                                className="w-full bg-secondary/50 border border-border text-foreground px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all font-mono text-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                                <Server className="w-3.5 h-3.5 inline mr-1" />Discord Guild ID
                            </label>
                            <input type="text" value={guildId} onChange={(e) => setGuildId(e.target.value)}
                                placeholder="1234567890123456789"
                                className="w-full bg-secondary/50 border border-border text-foreground px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all font-mono text-sm" />
                        </div>
                    </div>
                </div>

                {message.text && (
                    <div className={`p-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                        {message.text}
                    </div>
                )}

                <button onClick={saveTokens} disabled={saving}
                    className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 px-5 rounded-lg transition-all disabled:opacity-50">
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Сохраняю...' : 'Сохранить токены'}
                </button>
            </motion.div>

            {/* User info */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-lg font-semibold text-foreground mb-3">Аккаунт</h2>
                <div className="text-muted-foreground text-sm space-y-1">
                    <p>Пользователь: <span className="text-foreground font-medium">{user?.username || '—'}</span></p>
                    <p>ID: <span className="text-foreground font-mono">{user?.id || '—'}</span></p>
                </div>
            </motion.div>
        </div>
    );
}
