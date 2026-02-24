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
const { createAuthRoutes, authenticateToken, JWT_SECRET } = require('./api/auth');
const { createProfileRoutes } = require('./api/profile');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { }

const LOG = '[Server]';

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
    app.use(express.json());

    // -- Public Auth Routes --
    app.use('/api/auth', createAuthRoutes(db));

    // -- Protected Routes (all require JWT) --
    app.use('/api/profile', createProfileRoutes(db, botManager));

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
            const mentionMap = {};
            for (const [id, r] of bot.guildRolesCache) mentionMap[`role:${id}`] = r.name || id;
            for (const [id, m] of bot.guildMembersCache) mentionMap[`user:${id}`] = m.user?.global_name || m.user?.username || m.nick || id;
            res.json({ messages: messages.reverse(), mentionMap });
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
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        if (!bot) return res.json([]);
        res.json(bot.getLogs(limit));
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
        bot.addLog('shift', 'Смена начата');
        res.json({ ok: result.startsWith('✅'), message: result });
    });

    app.post('/api/smenoff', authenticateToken, async (req, res) => {
        const bot = getBot(req, res); if (!bot) return res.status(400).json({ error: 'Bot not running' });
        const { userId } = req.body;
        const chatId = userId || String(bot.config.tgChatId);
        const result = await bot.handleSmenoff(chatId);
        bot.addLog('shift', 'Смена закрыта');
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
        res.json({ channelId, messages });
    });

    // ── Socket.IO Auth Middleware ────────────────────────
    io.use((socket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
        if (!token) return next(new Error('Authentication error'));
        try { jwt.verify(token, JWT_SECRET); next(); }
        catch (err) { next(new Error('Authentication error')); }
    });

    io.on('connection', (socket) => {
        console.log(`${LOG} 🌐 Dashboard client connected: ${socket.id}`);
        socket.on('disconnect', () => console.log(`${LOG} 🌐 Dashboard client disconnected: ${socket.id}`));
    });

    // Store io reference in botManager so bots can emit events
    botManager.io = io;

    // -- Serve Dashboard static files --
    const dashboardDist = path.join(__dirname, '..', 'dashboard', 'dist');
    if (fs.existsSync(dashboardDist)) {
        app.use(express.static(dashboardDist));
        // SPA fallback — only for non-API routes
        app.get('*', (req, res) => {
            if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
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
