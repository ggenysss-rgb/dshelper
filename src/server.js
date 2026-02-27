/**
 * server.js — Multi-Tenant SaaS Entry Point
 * 
 * This replaces bot.js as the main entry when running in multi-tenant mode.
 * It initializes the database, sets up Express with all API routes,
 * creates the BotManager, and starts all user bot instances.
 * 
 * Usage: node src/server.js
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const { initDb } = require('./dbManager');
const BotManager = require('./BotManager');
const { createAuthRoutes, authenticateToken, JWT_SECRET, sendTelegramMessage } = require('./api/auth');
const { createProfileRoutes } = require('./api/profile');
const { createAdminRoutes } = require('./api/admin');
const { invalidateSystemPromptCache } = require('./bot/gateway');

// Prefer Railway persistent volume (/data), then env var, then local ./data
const DATA_DIR = process.env.DATA_DIR || (require('fs').existsSync('/data') ? '/data' : path.join(__dirname, '..', 'data'));
try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { }

const LOG = '[Server]';
const APP_BUILD = String(process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RAILWAY_DEPLOYMENT_ID || process.env.SOURCE_COMMIT || 'local');
const INDEX_NO_CACHE = 'no-store, no-cache, must-revalidate';
const AUTH_ME_NO_CACHE = 'no-store';
const SYSTEM_PROMPT_FILE = path.join(__dirname, '..', 'neuro_style_prompt.txt');

async function main() {
    console.log(`${LOG} ═══════════════════════════════════════`);
    console.log(`${LOG}  Telegram Ticket Notifier — SaaS Mode`);
    console.log(`${LOG} ═══════════════════════════════════════`);

    // 1. Initialize Database
    const db = initDb(DATA_DIR);
    console.log(`${LOG} ✅ Database initialized.`);

    // 2. Create Bot Manager
    const botManager = new BotManager(db, DATA_DIR);

    // 3. Set up Express
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: { origin: '*', methods: ['GET', 'POST', 'DELETE', 'PATCH'] }
    });

    app.use(cors());
    app.use(express.json({ limit: '2mb' }));
    app.use((req, res, next) => {
        res.setHeader('X-App-Build', APP_BUILD);
        next();
    });
    app.use('/api/auth/me', (req, res, next) => {
        res.setHeader('Cache-Control', AUTH_ME_NO_CACHE);
        next();
    });

    // Read Telegram credentials for admin notifications
    let _cfg = {};
    try { _cfg = require('../config.json'); } catch (_) { }
    const ADMIN_TG_TOKEN = process.env.TG_TOKEN || _cfg.tgToken || '';
    const ADMIN_TG_CHAT_ID = process.env.ADMIN_TG_CHAT_ID || _cfg.tgChatId || '';

    // -- Public Auth Routes --
    app.use('/api/auth', createAuthRoutes(db, ADMIN_TG_TOKEN, ADMIN_TG_CHAT_ID));

    // -- Protected Routes (all require JWT) --
    app.use('/api/profile', createProfileRoutes(db, botManager));

    // -- Admin Routes --
    app.use('/api/admin', createAdminRoutes(db));

    // -- Helper: get bot for authenticated user --
    function getBot(req, res) {
        const userId = req.user?.userId;
        if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return null; }
        return botManager.bots.get(userId) || null;
    }

    // ═══════════════════════════════════════════════════════
    //  ALL PROTECTED API ROUTES — matching dashboard client
    //  Dashboard client uses baseURL: '/api', so:
    //  client.get('/stats')        → GET /api/stats
    //  client.get('/tickets')      → GET /api/tickets
    //  client.get('/binds')        → GET /api/binds
    //  client.get('/members')      → GET /api/members
    //  client.get('/users')        → GET /api/users
    //  client.get('/logs')         → GET /api/logs
    //  client.get('/settings')     → GET /api/settings
    //  client.get('/autoreplies')  → GET /api/autoreplies
    //  etc.
    // ═══════════════════════════════════════════════════════

    // ── Tickets ──────────────────────────────────────────
    app.get('/api/tickets', authenticateToken, (req, res) => {
        const bot = getBot(req, res); if (!bot) return res.json([]);
        const tickets = Array.from(bot.activeTickets.values()).map(r => ({
            ...r,
            priority: bot.config.priorityKeywords?.some?.(kw =>
                (r.channelName || '').toLowerCase().includes(String(kw).toLowerCase())
            ) ? 'high' : 'normal'
        }));
        res.json(tickets);
    });

    app.get('/api/tickets/:id/messages', authenticateToken, async (req, res) => {
        const bot = getBot(req, res); if (!bot) return res.status(400).json({ error: 'Bot not running' });
        const channelId = req.params.id;
        const record = bot.activeTickets.get(channelId);
        if (!record) return res.status(404).json({ error: 'Ticket not found' });
        try {
            const messages = await bot.fetchChannelMessages(channelId, 100);
            const DEFAULT_STAFF_ROLES = ['1475932249017946133', '1475961602619478116'];
            const cfgRoles = Array.isArray(bot.config.staffRoleIds) ? bot.config.staffRoleIds : [];
            const staffRoleIds = (cfgRoles.length > 0 ? cfgRoles : DEFAULT_STAFF_ROLES).map(String);
            const selfUserId = bot.selfUserId ? String(bot.selfUserId) : null;
            const ownerAliases = new Set(
                [req.user?.username, bot.config.userName]
                    .map(v => String(v || '').trim().toLowerCase())
                    .filter(Boolean)
            );

            const mentionMap = {};
            for (const [id, r] of bot.guildRolesCache) mentionMap[`role:${id}`] = r.name || id;
            for (const [id, m] of bot.guildMembersCache) mentionMap[`user:${id}`] = m.user?.global_name || m.user?.username || m.nick || id;

            // Update ticket record with data from fetched messages
            if (messages.length > 0) {
                const lastMsg = messages[0]; // messages are newest-first before reverse
                const lastMsgTime = new Date(lastMsg.timestamp).getTime();
                if (!record.lastMessageAt || lastMsgTime > record.lastMessageAt) {
                    const embedText = lastMsg.embeds?.length ? (lastMsg.embeds[0].title || lastMsg.embeds[0].description || '📎 Вложение') : '📎 Вложение';
                    record.lastMessage = lastMsg.content?.slice(0, 120) || embedText;
                    record.lastMessageAt = lastMsgTime;
                }
                // Find opener (first non-bot message = oldest)
                if (!record.openerId) {
                    for (let i = messages.length - 1; i >= 0; i--) {
                        if (!messages[i].author.bot) {
                            record.openerId = messages[i].author.id;
                            record.openerUsername = messages[i].author.global_name || messages[i].author.username;
                            break;
                        }
                    }
                }
                // Find first staff reply
                if (record.firstStaffReplyAt === null && record.openerId) {
                    for (let i = messages.length - 1; i >= 0; i--) {
                        const m = messages[i];
                        if (!m.author.bot && m.author.id !== record.openerId) {
                            record.firstStaffReplyAt = new Date(m.timestamp).getTime();
                            break;
                        }
                    }
                }
                bot.markDirty();
                if (typeof bot.emitToDashboard === 'function') {
                    bot.emitToDashboard('ticket:updated', { channelId });
                }
            }

            const ordered = [...messages].reverse().map(msg => {
                const authorId = String(msg.author?.id || '');
                const authorUsername = String(msg.author?.username || '').trim().toLowerCase();
                const authorGlobal = String(msg.author?.global_name || '').trim().toLowerCase();
                const isSelf = !!selfUserId && authorId === selfUserId;
                const isAliasOwner = ownerAliases.has(authorUsername) || ownerAliases.has(authorGlobal);
                const hasStaffRole = Array.isArray(msg.member?.roles) && msg.member.roles.some(r => staffRoleIds.includes(String(r)));
                const isMine = isSelf || isAliasOwner;
                const isStaff = isMine || hasStaffRole;
                return { ...msg, _isMine: isMine, _isStaff: isStaff };
            });

            res.json({ messages: ordered, mentionMap });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.post('/api/tickets/:id/send', authenticateToken, async (req, res) => {
        const bot = getBot(req, res); if (!bot) return res.status(400).json({ error: 'Bot not running' });
        const channelId = req.params.id;
        const { content, replyTo } = req.body;
        const record = bot.activeTickets.get(channelId);
        if (!record) return res.status(404).json({ error: 'Ticket not found' });
        try {
            const result = await bot.sendDiscordMessage(channelId, content, replyTo || undefined);
            if (!result.ok) throw new Error(`Discord API ${result.status}`);
            try { const j = JSON.parse(result.body); if (j.id) bot.sentByBot.add(j.id); } catch { }
            bot.addLog('message', `Сообщение отправлено в тикет ${channelId}`);
            res.json({ ok: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.patch('/api/tickets/:id/messages/:msgId', authenticateToken, async (req, res) => {
        const bot = getBot(req, res); if (!bot) return res.status(400).json({ error: 'Bot not running' });
        const { id: channelId, msgId } = req.params;
        const { content } = req.body;
        const record = bot.activeTickets.get(channelId);
        if (!record) return res.status(404).json({ error: 'Ticket not found' });
        try {
            const result = await bot.editDiscordMessage(channelId, msgId, content);
            if (!result.ok) throw new Error(`Discord API ${result.status}`);
            bot.addLog('message', `Сообщение отредактировано в тикете ${channelId}`);
            res.json({ ok: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ── Stats ────────────────────────────────────────────
    app.get('/api/stats', authenticateToken, (req, res) => {
        const bot = getBot(req, res);
        if (!bot) return res.json({ totalCreated: 0, totalClosed: 0, hourlyBuckets: {}, closedTickets: [], activeTicketsCount: 0, uptime: process.uptime(), botActive: false });
        res.json({ ...bot.getStats(), botActive: true });
    });

    // ── Logs ─────────────────────────────────────────────
    app.get('/api/logs', authenticateToken, (req, res) => {
        const bot = getBot(req, res);
        const limit = Math.min(parseInt(req.query.limit) || 200, 5000);
        if (!bot) return res.json([]);
        res.json(bot.getLogs(limit));
    });

    // ── Conversation Log (AI learning) ──────────────────
    app.get('/api/conversation-log', authenticateToken, (req, res) => {
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        const type = req.query.type || 'all'; // 'manual', 'ai_question', 'all'
        try {
            const logPath = path.join(DATA_DIR, 'conversation_log.json');
            if (!fs.existsSync(logPath)) return res.json({ entries: [], stats: { total: 0, manual: 0, ai: 0 } });
            const entries = JSON.parse(fs.readFileSync(logPath, 'utf8'));
            const filtered = type === 'all' ? entries : entries.filter(e => e.type === type);
            const recent = filtered.slice(-limit).reverse(); // newest first
            const stats = {
                total: entries.length,
                manual: entries.filter(e => e.type === 'manual').length,
                ai: entries.filter(e => e.type === 'ai_question').length,
            };
            res.json({ entries: recent, stats });
        } catch (e) {
            res.json({ entries: [], stats: { total: 0, manual: 0, ai: 0 }, error: e.message });
        }
    });

    // ── Extra examples (AI learning file) ────────────────
    app.get('/api/extra-examples', authenticateToken, (req, res) => {
        try {
            const knowledgePath = path.join(DATA_DIR, 'learned_knowledge.json');
            if (!fs.existsSync(knowledgePath)) return res.json({ entries: [], qa: 0, facts: 0, total: 0 });
            const knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));
            const qa = knowledge.filter(k => k.type === 'qa');
            const facts = knowledge.filter(k => k.type === 'fact');
            res.json({ entries: knowledge, qa: qa.length, facts: facts.length, total: knowledge.length });
        } catch (e) {
            res.json({ entries: [], qa: 0, facts: 0, total: 0, error: e.message });
        }
    });

    // ── Users (workers) ──────────────────────────────────
    app.get('/api/users', authenticateToken, (req, res) => {
        const bot = getBot(req, res);
        if (!bot) return res.json([]);
        res.json(bot.getUsers());
    });

    // ── Shifts ───────────────────────────────────────────
    app.post('/api/smena', authenticateToken, async (req, res) => {
        const bot = getBot(req, res); if (!bot) return res.status(400).json({ error: 'Bot not running' });
        const { userId } = req.body;
        const chatId = userId || String(bot.config.tgChatId);
        const result = await bot.handleSmena(chatId);
        res.json({ ok: result.startsWith('✅'), message: result });
    });

    app.post('/api/smenoff', authenticateToken, async (req, res) => {
        const bot = getBot(req, res); if (!bot) return res.status(400).json({ error: 'Bot not running' });
        const { userId } = req.body;
        const chatId = userId || String(bot.config.tgChatId);
        const result = await bot.handleSmenoff(chatId);
        res.json({ ok: result.startsWith('✅'), message: result });
    });

    // ── Binds ────────────────────────────────────────────
    app.get('/api/binds', authenticateToken, (req, res) => {
        const bot = getBot(req, res);
        if (!bot) return res.json([]);
        res.json(bot.getBinds());
    });

    app.post('/api/binds', authenticateToken, (req, res) => {
        const bot = getBot(req, res); if (!bot) return res.status(400).json({ error: 'Bot not running' });
        const { name, message } = req.body;
        if (!name || !message) return res.status(400).json({ error: 'name and message required' });
        if (!bot.config.binds) bot.config.binds = {};
        bot.config.binds[name] = { name, message };
        bot.saveConfigToDb();
        bot.addLog('bind', `Бинд добавлен: ${name}`);
        res.json({ ok: true, bind: bot.config.binds[name] });
    });

    app.delete('/api/binds/:name', authenticateToken, (req, res) => {
        const bot = getBot(req, res); if (!bot) return res.status(400).json({ error: 'Bot not running' });
        const { name } = req.params;
        if (bot.config.binds?.[name]) {
            delete bot.config.binds[name];
            bot.saveConfigToDb();
            bot.addLog('bind', `Бинд удалён: ${name}`);
        }
        res.json({ ok: true });
    });

    // ── Members ──────────────────────────────────────────
    app.get('/api/members', authenticateToken, (req, res) => {
        const bot = getBot(req, res);
        if (!bot) return res.json([]);
        try { res.json(bot.getMembers()); }
        catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ── Profiles (bot workers) ───────────────────────────
    app.get('/api/profiles', authenticateToken, (req, res) => {
        const bot = getBot(req, res);
        if (!bot) return res.json([]);
        res.json(bot.getUsers());
    });

    // ── Settings ─────────────────────────────────────────
    app.get('/api/settings', authenticateToken, (req, res) => {
        const bot = getBot(req, res);
        if (!bot) return res.json({});
        res.json(bot.getSettings());
    });

    app.post('/api/settings', authenticateToken, (req, res) => {
        const bot = getBot(req, res); if (!bot) return res.status(400).json({ error: 'Bot not running' });
        bot.updateSettings(req.body);
        bot.saveConfigToDb();
        res.json({ ok: true });
    });

    // ── Prompt Editor ────────────────────────────────────
    app.get('/api/prompt', authenticateToken, (_req, res) => {
        try {
            if (!fs.existsSync(SYSTEM_PROMPT_FILE)) {
                return res.status(404).json({ error: 'Prompt file not found' });
            }
            const prompt = fs.readFileSync(SYSTEM_PROMPT_FILE, 'utf8');
            const stat = fs.statSync(SYSTEM_PROMPT_FILE);
            res.json({
                prompt,
                bytes: Buffer.byteLength(prompt, 'utf8'),
                updatedAt: stat.mtime.toISOString(),
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/prompt', authenticateToken, (req, res) => {
        try {
            const prompt = String(req.body?.prompt ?? '');
            if (Buffer.byteLength(prompt, 'utf8') > 1024 * 1024) {
                return res.status(400).json({ error: 'Prompt too large (max 1MB)' });
            }
            fs.writeFileSync(SYSTEM_PROMPT_FILE, prompt, 'utf8');
            invalidateSystemPromptCache();
            const stat = fs.statSync(SYSTEM_PROMPT_FILE);
            res.json({
                ok: true,
                bytes: Buffer.byteLength(prompt, 'utf8'),
                updatedAt: stat.mtime.toISOString(),
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── Auto-Replies ─────────────────────────────────────
    app.get('/api/autoreplies', authenticateToken, (req, res) => {
        const bot = getBot(req, res);
        if (!bot) return res.json([]);
        res.json(bot.getAutoReplies());
    });

    app.post('/api/autoreplies', authenticateToken, (req, res) => {
        const bot = getBot(req, res); if (!bot) return res.status(400).json({ error: 'Bot not running' });
        const { autoReplies } = req.body;
        if (!Array.isArray(autoReplies)) return res.status(400).json({ error: 'autoReplies must be an array' });
        bot.updateAutoReplies(autoReplies);
        bot.saveConfigToDb();
        res.json({ ok: true, count: autoReplies.length });
    });

    app.post('/api/autoreplies/simulate', authenticateToken, (req, res) => {
        const bot = getBot(req, res); if (!bot) return res.status(400).json({ error: 'Bot not running' });
        const { content = '', guildId = '', channelId = '' } = req.body || {};
        const text = String(content || '').trim();
        if (!text) return res.status(400).json({ error: 'content is required' });
        const decision = bot.simulateAutoReply({
            content: text,
            guildId: String(guildId || bot.config.guildId || ''),
            channelId: String(channelId || ''),
        });
        res.json({
            ok: true,
            input: {
                content: text,
                guildId: String(guildId || bot.config.guildId || ''),
                channelId: String(channelId || ''),
            },
            decision,
        });
    });

    // ── Closed Tickets ───────────────────────────────────
    app.get('/api/closed-tickets', authenticateToken, (req, res) => {
        const bot = getBot(req, res);
        if (!bot) return res.json({ tickets: [], total: 0, page: 1, totalPages: 0 });
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const search = (req.query.search || '');
        res.json(bot.dbGetClosedTickets({ page, limit, search }));
    });

    app.get('/api/closed-tickets/:id/messages', authenticateToken, (req, res) => {
        const bot = getBot(req, res); if (!bot) return res.status(400).json({ error: 'Bot not running' });
        const channelId = req.params.id;
        const messages = bot.dbGetTicketMessages(channelId);
        if (messages.length === 0) return res.status(404).json({ error: 'Archive not found' });
        let ticketMeta = null;
        try {
            ticketMeta = bot.db.prepare(`
                SELECT channel_name, opener_id, opener_username, created_at, closed_at
                FROM closed_tickets
                WHERE channel_id = ?
                ORDER BY closed_at DESC
                LIMIT 1
            `).get(channelId);
        } catch { }
        res.json({
            channelId,
            channelName: ticketMeta?.channel_name || channelId,
            openerId: ticketMeta?.opener_id || '',
            openerUsername: ticketMeta?.opener_username || '',
            createdAt: ticketMeta?.created_at || null,
            archivedAt: ticketMeta?.closed_at || null,
            messages
        });
    });

    // ── Socket.IO Auth Middleware ────────────────────────
    io.use((socket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
        if (!token) return next(new Error('Authentication error'));
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const userId = Number(decoded?.userId);
            if (!userId) return next(new Error('Authentication error'));
            socket.data.userId = userId;
            next();
        }
        catch (err) { next(new Error('Authentication error')); }
    });

    io.on('connection', (socket) => {
        const userId = socket.data.userId;
        const room = `user:${userId}`;
        socket.join(room);
        console.log(`${LOG} 🌐 Dashboard client connected: ${socket.id} (user ${userId})`);
        socket.on('disconnect', () => console.log(`${LOG} 🌐 Dashboard client disconnected: ${socket.id} (user ${userId})`));
    });

    // Store io reference in botManager so bots can emit events
    botManager.io = io;

    // -- Serve Dashboard static files --
    const dashboardDist = path.join(__dirname, '..', 'dashboard', 'dist');
    if (fs.existsSync(dashboardDist)) {
        app.use(express.static(dashboardDist, {
            setHeaders: (res, filePath) => {
                const normalized = String(filePath).replace(/\\/g, '/');
                if (/\/assets\/.+\.(js|css)$/.test(normalized)) {
                    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                    return;
                }
                if (normalized.endsWith('/index.html') || normalized.endsWith('index.html')) {
                    res.setHeader('Cache-Control', INDEX_NO_CACHE);
                }
            }
        }));
        // SPA fallback — only for non-API routes
        app.get('*', (req, res) => {
            if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
            res.setHeader('Cache-Control', INDEX_NO_CACHE);
            res.sendFile(path.join(dashboardDist, 'index.html'));
        });
    }

    // 4. Start HTTP server
    const port = process.env.PORT || 3001;
    server.listen(port, () => {
        console.log(`${LOG} 🚀 SaaS API running on port ${port}`);
    });

    // 5. Start all user bots
    await botManager.startAll();

    // 6. Telegram callback polling for approve/reject buttons
    //    IMPORTANT: Only run separate admin polling if the admin token is NOT
    //    already used by any running bot instance. If the same token is shared,
    //    two competing getUpdates consumers will conflict and steal each other's
    //    updates, breaking all bot commands.
    if (ADMIN_TG_TOKEN) {
        // Build the admin callback handler (shared between standalone polling and bot hook)
        const handleAdminCallback = async (cq) => {
            const [action, userIdStr] = (cq.data || '').split(':');
            if (action !== 'approve_user' && action !== 'reject_user') return false;
            const targetUserId = parseInt(userIdStr);
            if (!targetUserId) return false;
            try {
                const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(targetUserId);
                if (!user) {
                    await sendTelegramMessage(ADMIN_TG_TOKEN, cq.from.id, `⚠️ Пользователь #${targetUserId} не найден.`);
                    return true;
                }
                if (action === 'approve_user') {
                    if (user.role !== 'pending') {
                        await sendTelegramMessage(ADMIN_TG_TOKEN, cq.from.id, `ℹ️ Пользователь <b>${user.username}</b> уже обработан (роль: ${user.role}).`);
                    } else {
                        db.prepare("UPDATE users SET role = 'user' WHERE id = ?").run(targetUserId);
                        await sendTelegramMessage(ADMIN_TG_TOKEN, cq.from.id, `✅ Пользователь <b>${user.username}</b> одобрен и может войти в систему.`);
                        console.log(`[TG Approval] Approved user ${user.username} (id=${targetUserId})`);
                    }
                } else if (action === 'reject_user') {
                    if (user.role !== 'pending') {
                        await sendTelegramMessage(ADMIN_TG_TOKEN, cq.from.id, `ℹ️ Пользователь <b>${user.username}</b> уже обработан (роль: ${user.role}).`);
                    } else {
                        db.prepare('DELETE FROM users WHERE id = ?').run(targetUserId);
                        await sendTelegramMessage(ADMIN_TG_TOKEN, cq.from.id, `❌ Регистрация пользователя <b>${user.username}</b> отклонена и аккаунт удалён.`);
                        console.log(`[TG Approval] Rejected user ${user.username} (id=${targetUserId})`);
                    }
                }
                fetch(`https://api.telegram.org/bot${ADMIN_TG_TOKEN}/answerCallbackQuery?callback_query_id=${cq.id}`).catch(() => { });
            } catch (err) {
                console.error('[TG Approval] Error processing callback:', err.message);
            }
            return true;
        };

        // Check if any running bot uses the same TG token as admin
        let adminTokenShared = false;
        for (const [, bot] of botManager.bots) {
            if (bot.config.tgToken === ADMIN_TG_TOKEN) {
                // Register the admin callback handler on this bot so it processes
                // admin approval callbacks within its own polling loop
                bot._adminCallbackHandler = handleAdminCallback;
                adminTokenShared = true;
                console.log(`${LOG} ✅ Admin approval callbacks routed through bot polling (shared token).`);
                break;
            }
        }

        if (!adminTokenShared) {
            // Admin uses a separate token — safe to poll independently
            let tgOffset = 0;
            const pollTelegram = async () => {
                try {
                    const url = `https://api.telegram.org/bot${ADMIN_TG_TOKEN}/getUpdates?offset=${tgOffset}&timeout=30&allowed_updates=["callback_query"]`;
                    const resp = await fetch(url);
                    const data = await resp.json();
                    if (!data.ok) return;
                    for (const update of (data.result || [])) {
                        tgOffset = update.update_id + 1;
                        const cq = update.callback_query;
                        if (!cq) continue;
                        await handleAdminCallback(cq);
                    }
                } catch (err) {
                    if (!err.message?.includes('aborted')) {
                        console.error('[TG Approval] Poll error:', err.message);
                    }
                } finally {
                    setTimeout(pollTelegram, 1000);
                }
            };
            pollTelegram();
            console.log(`${LOG} ✅ Telegram approval polling started (separate token).`);
        }
    }
    // 6. Graceful shutdown
    const shutdown = () => {
        console.log(`${LOG} 🛑 Shutting down...`);
        botManager.stopAll();
        db.close();
        setTimeout(() => process.exit(0), 1000);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch(err => {
    console.error('[Server] Fatal error:', err);
    process.exit(1);
});
