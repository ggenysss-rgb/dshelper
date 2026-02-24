const express = require('express');
const { authenticateToken } = require('./auth');

function createStatsRoutes(db, botManager) {
    const router = express.Router();
    router.use(authenticateToken);

    // Get stats for the user's bot
    router.get('/', (req, res) => {
        const userId = req.user.userId;
        const bot = botManager.bots.get(userId);

        if (!bot) {
            return res.json({
                totalCreated: 0,
                totalClosed: 0,
                hourlyBuckets: new Array(24).fill(0),
                closedTickets: [],
                activeTicketsCount: 0,
                uptime: process.uptime(),
                botActive: false,
            });
        }

        const closedTickets = bot.dbGetClosedTickets({ page: 1, limit: 50 });
        res.json({
            totalCreated: bot.ps.totalCreated,
            totalClosed: bot.ps.totalClosed,
            hourlyBuckets: bot.ps.hourlyBuckets,
            closedTickets: closedTickets.tickets,
            activeTicketsCount: bot.activeTickets.size,
            uptime: process.uptime(),
            botActive: true,
        });
    });

    // Get logs
    router.get('/logs', (req, res) => {
        const userId = req.user.userId;
        const bot = botManager.bots.get(userId);
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);

        if (!bot) return res.json([]);
        res.json(bot.dashboardLogs.slice(0, limit));
    });

    // Get analytics
    router.get('/analytics', (req, res) => {
        const userId = req.user.userId;
        const bot = botManager.bots.get(userId);

        if (!bot) {
            return res.json({ totalCreated: 0, totalClosed: 0, activeCount: 0, avgDuration: null, avgResponse: null, topPlayers: [], peakHours: [] });
        }

        const closed = bot.dbGetAllClosedTickets();
        const avgDuration = closed.length > 0
            ? closed.reduce((a, t) => a + (t.closedAt - t.createdAt), 0) / closed.length
            : null;
        const replied = closed.filter(t => t.firstStaffReplyAt !== null);
        const avgResponse = replied.length > 0
            ? replied.reduce((a, t) => a + (t.firstStaffReplyAt - t.createdAt), 0) / replied.length
            : null;

        // Top players
        const counts = new Map();
        for (const t of [...closed, ...bot.activeTickets.values()]) {
            const id = t.openerId;
            const uname = t.openerUsername || '';
            if (!id) continue;
            const ex = counts.get(id);
            if (ex) ex.count++;
            else counts.set(id, { username: uname, count: 1 });
        }
        const topPlayers = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 5);

        // Peak hours
        const peakHours = bot.ps.hourlyBuckets
            .map((count, hour) => ({ hour, count }))
            .filter(x => x.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        res.json({
            totalCreated: bot.ps.totalCreated,
            totalClosed: closed.length,
            activeCount: bot.activeTickets.size,
            totalMessagesSent: bot.ps.totalMessagesSent,
            avgDuration,
            avgResponse,
            topPlayers,
            peakHours,
        });
    });

    // Closed tickets history with pagination
    router.get('/closed-tickets', (req, res) => {
        const userId = req.user.userId;
        const bot = botManager.bots.get(userId);
        if (!bot) return res.json({ tickets: [], total: 0, page: 1, totalPages: 0 });

        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const search = (req.query.search || '').toLowerCase();
        res.json(bot.dbGetClosedTickets({ page, limit, search }));
    });

    // Archived ticket messages
    router.get('/closed-tickets/:id/messages', (req, res) => {
        const userId = req.user.userId;
        const bot = botManager.bots.get(userId);
        const channelId = req.params.id;

        if (!bot) return res.status(400).json({ error: 'Bot is not running' });

        const messages = bot.dbGetTicketMessages(channelId);
        if (messages.length === 0) {
            return res.status(404).json({ error: 'Archive not found' });
        }
        res.json({ channelId, messages });
    });

    // Binds CRUD
    router.get('/binds', (req, res) => {
        const userId = req.user.userId;
        const bot = botManager.bots.get(userId);
        if (!bot) return res.json([]);
        res.json(Object.values(bot.config.binds || {}));
    });

    router.post('/binds', (req, res) => {
        const userId = req.user.userId;
        const bot = botManager.bots.get(userId);
        if (!bot) return res.status(400).json({ error: 'Bot is not running' });

        const { name, message } = req.body;
        if (!name || !message) return res.status(400).json({ error: 'name and message required' });

        if (!bot.config.binds) bot.config.binds = {};
        bot.config.binds[name] = { name, message };
        bot.saveConfigToDb();
        bot.addLog('bind', `Бинд добавлен: ${name}`);
        res.json({ ok: true, bind: bot.config.binds[name] });
    });

    router.delete('/binds/:name', (req, res) => {
        const userId = req.user.userId;
        const bot = botManager.bots.get(userId);
        if (!bot) return res.status(400).json({ error: 'Bot is not running' });

        const { name } = req.params;
        if (bot.config.binds && bot.config.binds[name]) {
            delete bot.config.binds[name];
            bot.saveConfigToDb();
            bot.addLog('bind', `Бинд удалён: ${name}`);
        }
        res.json({ ok: true });
    });

    // Settings
    router.get('/settings', (req, res) => {
        const userId = req.user.userId;
        const bot = botManager.bots.get(userId);
        if (!bot) return res.json({});

        res.json({
            autoGreetEnabled: bot.config.autoGreetEnabled ?? true,
            autoGreetText: bot.config.autoGreetText || '',
            autoGreetRoleIds: bot.config.autoGreetRoleIds || [],
            autoGreetAllChannels: bot.config.autoGreetAllChannels ?? false,
            includeFirstUserMessage: bot.config.includeFirstUserMessage ?? true,
            notifyOnClose: bot.config.notifyOnClose ?? true,
            mentionOnHighPriority: bot.config.mentionOnHighPriority ?? true,
            activityCheckMin: bot.config.activityCheckMin || 10,
            closingCheckMin: bot.config.closingCheckMin || 15,
            closingPhrase: bot.config.closingPhrase || '',
            ticketPrefix: bot.config.ticketPrefix || 'ticket-',
            pollingIntervalSec: bot.config.pollingIntervalSec || 3,
            rateLimitMs: bot.config.rateLimitMs || 1500,
            maxMessageLength: bot.config.maxMessageLength || 300,
            forumMode: bot.config.forumMode ?? false,
            priorityKeywords: bot.config.priorityKeywords || [],
            staffRoleIds: bot.config.staffRoleIds || [],
            ticketsCategoryId: bot.config.ticketsCategoryId || '',
            shiftChannelId: bot.config.shiftChannelId || '',
        });
    });

    router.post('/settings', (req, res) => {
        const userId = req.user.userId;
        const bot = botManager.bots.get(userId);
        if (!bot) return res.status(400).json({ error: 'Bot is not running' });

        const allowed = [
            'autoGreetEnabled', 'autoGreetText', 'autoGreetRoleIds', 'autoGreetAllChannels',
            'includeFirstUserMessage', 'notifyOnClose', 'mentionOnHighPriority',
            'activityCheckMin', 'closingCheckMin', 'closingPhrase',
            'ticketPrefix', 'pollingIntervalSec', 'rateLimitMs',
            'maxMessageLength', 'forumMode', 'priorityKeywords',
            'staffRoleIds', 'ticketsCategoryId', 'shiftChannelId',
        ];
        const body = req.body;
        let changed = 0;
        // Fields that should be arrays (comma-separated strings → arrays)
        const arrayFields = ['staffRoleIds', 'autoGreetRoleIds', 'priorityKeywords'];
        for (const key of allowed) {
            if (body[key] !== undefined) {
                let val = body[key];
                // Parse comma-separated strings into arrays
                if (arrayFields.includes(key) && typeof val === 'string') {
                    val = val.split(',').map(w => w.trim()).filter(Boolean);
                }
                bot.config[key] = val;
                changed++;
            }
        }
        if (changed > 0) {
            bot.saveConfigToDb();
            bot.addLog('system', `Настройки обновлены (${changed} полей)`);
        }
        res.json({ ok: true, changed });
    });

    // Auto-Replies
    router.get('/autoreplies', (req, res) => {
        const userId = req.user.userId;
        const bot = botManager.bots.get(userId);
        if (!bot) return res.json([]);
        res.json(bot.config.autoReplies || []);
    });

    router.post('/autoreplies', (req, res) => {
        const userId = req.user.userId;
        const bot = botManager.bots.get(userId);
        if (!bot) return res.status(400).json({ error: 'Bot is not running' });

        const { autoReplies } = req.body;
        if (!Array.isArray(autoReplies)) return res.status(400).json({ error: 'autoReplies must be an array' });
        bot.config.autoReplies = autoReplies;
        bot.saveConfigToDb();
        bot.addLog('system', `Авто-ответы обновлены (${autoReplies.length} правил)`);
        res.json({ ok: true, count: autoReplies.length });
    });

    // Members (from gateway cache)
    router.get('/members', (req, res) => {
        const userId = req.user.userId;
        const bot = botManager.bots.get(userId);
        if (!bot) return res.json([]);

        try {
            const roleMap = {};
            for (const [id, r] of bot.guildRolesCache) {
                roleMap[id] = { id: r.id, name: r.name, color: r.color, position: r.position, hoist: r.hoist };
            }

            const groups = {};
            for (const [uid, member] of bot.guildMembersCache) {
                if (!member.roles || member.roles.length === 0) continue;
                if (member.user?.bot) continue;

                let bestRole = null;
                for (const rid of member.roles) {
                    const role = roleMap[rid];
                    if (!role || !role.hoist) continue;
                    if (!bestRole || role.position > bestRole.position) bestRole = role;
                }
                if (!bestRole) continue;

                if (!groups[bestRole.id]) {
                    groups[bestRole.id] = {
                        roleId: bestRole.id,
                        roleName: bestRole.name,
                        roleColor: bestRole.color ? `#${bestRole.color.toString(16).padStart(6, '0')}` : '#99aab5',
                        position: bestRole.position,
                        members: []
                    };
                }

                const avatarHash = member.avatar || member.user?.avatar;
                const memberId = member.user?.id || uid;
                const avatarUrl = avatarHash
                    ? `https://cdn.discordapp.com/avatars/${memberId}/${avatarHash}.png?size=64`
                    : `https://cdn.discordapp.com/embed/avatars/0.png`;
                const status = bot.guildPresenceCache.get(memberId) || 'offline';

                groups[bestRole.id].members.push({
                    id: memberId,
                    username: member.user?.username,
                    displayName: member.nick || member.user?.global_name || member.user?.username,
                    avatar: avatarUrl,
                    status
                });
            }

            const result = Object.values(groups)
                .sort((a, b) => b.position - a.position)
                .map(g => ({
                    ...g,
                    members: g.members.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''))
                }));

            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}

module.exports = { createStatsRoutes };
