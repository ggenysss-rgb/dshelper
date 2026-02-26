const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const https = require('https');

const JWT_SECRET = process.env.JWT_SECRET || 'ticket-dashboard-secret-key-2026';

// Send a Telegram message to a specific chat
function sendTelegramMessage(tgToken, chatId, text, replyMarkup) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            reply_markup: replyMarkup || undefined
        });
        const url = new URL(`https://api.telegram.org/bot${tgToken}/sendMessage`);
        const req = https.request({
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function createAuthRoutes(db, tgToken, adminChatId) {
    const router = express.Router();

    const ADMIN_ALIASES = new Set(['d1reevo', 'd1reevof']);
    const normalizeUsername = (v) => String(v || '').trim().toLowerCase();
    const isFallbackAdminUser = (user) =>
        user?.id === 1 || ADMIN_ALIASES.has(normalizeUsername(user?.username));

    const getEffectiveRole = (user) => {
        // Keep explicit bans intact, but force known owner accounts to admin.
        if (user?.role === 'banned') return 'banned';
        if (isFallbackAdminUser(user)) return 'admin';
        if (user?.role) return user.role;
        return 'user';
    };

    router.post('/register', async (req, res) => {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        try {
            const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
            if (existingUser) {
                return res.status(400).json({ error: 'Username already exists' });
            }

            const saltRounds = 10;
            const password_hash = await bcrypt.hash(password, saltRounds);

            const result = db.prepare(`
                INSERT INTO users (username, password_hash, role)
                VALUES (?, ?, 'pending')
            `).run(username, password_hash);

            const newUserId = result.lastInsertRowid;

            // Notify admin via Telegram
            if (tgToken && adminChatId) {
                try {
                    const timeStr = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
                    await sendTelegramMessage(
                        tgToken,
                        adminChatId,
                        `🆕 <b>Новый пользователь хочет зарегистрироваться</b>\n\n👤 Логин: <code>${username}</code>\n🕐 Время: ${timeStr}`,
                        {
                            inline_keyboard: [[
                                { text: '✅ Одобрить', callback_data: `approve_user:${newUserId}` },
                                { text: '❌ Отклонить', callback_data: `reject_user:${newUserId}` }
                            ]]
                        }
                    );
                } catch (tgErr) {
                    console.error('[Auth API] Failed to send Telegram notification:', tgErr.message);
                }
            }

            res.json({ pending: true, message: 'Ожидайте подтверждения администратора' });
        } catch (error) {
            console.error('[Auth API] Register error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    router.post('/login', async (req, res) => {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        try {
            const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const match = await bcrypt.compare(password, user.password_hash);
            if (!match) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const role = getEffectiveRole(user);

            if (role === 'pending') {
                return res.status(403).json({ error: 'Аккаунт ожидает подтверждения администратора' });
            }
            if (role === 'banned') {
                return res.status(403).json({ error: 'Аккаунт заблокирован' });
            }

            const token = jwt.sign({ userId: user.id, username: user.username, role }, JWT_SECRET, { expiresIn: '7d' });

            res.json({ token, user: { id: user.id, username: user.username, role } });
        } catch (error) {
            console.error('[Auth API] Login error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    router.get('/me', authenticateToken, (req, res) => {
        try {
            const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
            if (!user) return res.status(404).json({ error: 'User not found' });
            const role = getEffectiveRole(user);
            // Check banned again on /me
            if (role === 'banned') return res.status(403).json({ error: 'Аккаунт заблокирован' });
            res.json({
                user: {
                    id: user.id,
                    username: user.username,
                    discord_token: user.discord_token,
                    tg_token: user.tg_token,
                    tg_chat_id: user.tg_chat_id,
                    role,
                }
            });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.status(401).json({ error: 'No token provided' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    });
}

module.exports = { createAuthRoutes, authenticateToken, JWT_SECRET, sendTelegramMessage };
