const express = require('express');
const { authenticateToken } = require('./auth');
const { generateTicketSummary } = require('../bot/gateway');

function createTicketRoutes(db, botManager) {
    const router = express.Router();
    router.use(authenticateToken);

    // Get active tickets for the user
    router.get('/', (req, res) => {
        const userId = req.user.userId;
        const bot = botManager.bots.get(userId);

        if (!bot) {
            // Bot not running, return 0 active tickets, or fetch from DB if we persist active state
            return res.json([]);
        }

        const tickets = Array.from(bot.activeTickets.values()).map(r => {
            // Priority logic should ideally be abstracted or moved to the bot instance
            const isHighPriority = bot.config.priorityKeywords?.high?.some(kw =>
                (r.channelName || '').toLowerCase().includes(kw.toLowerCase())
            ) || false;

            return {
                ...r,
                priority: isHighPriority ? 'high' : 'normal'
            };
        });
        res.json(tickets);
    });

    // Get messages for a specific active ticket
    router.get('/:id/messages', async (req, res) => {
        const userId = req.user.userId;
        const channelId = req.params.id;
        const bot = botManager.bots.get(userId);

        if (!bot) return res.status(400).json({ error: 'Bot is not running' });

        const record = bot.activeTickets.get(channelId);
        if (!record) return res.status(404).json({ error: 'Ticket not found' });

        try {
            const rawMessages = await bot.fetchChannelMessages(channelId, 100);
            const DEFAULT_STAFF_ROLES = ['1475932249017946133', '1475961602619478116'];
            const cfgRoles = bot.config.staffRoleIds;
            const staffRoleIds = (Array.isArray(cfgRoles) && cfgRoles.length > 0) ? cfgRoles : DEFAULT_STAFF_ROLES;
            const selfId = bot.selfUserId || null;

            // DEBUG: Log what data we have for staff detection
            if (rawMessages.length > 0) {
                const sample = rawMessages[0];
                bot.log(`🔍 DEBUG messages API: staffRoleIds=${JSON.stringify(staffRoleIds)}, selfId=${selfId}, sample_author=${sample.author?.username}(${sample.author?.id}), sample_member_roles=${JSON.stringify(sample.member?.roles || 'NO_MEMBER')}`);
            }

            // Tag each message with _isStaff on the server (definitive source of truth)
            const messages = rawMessages.reverse().map(msg => {
                let isStaff = false;
                // 1. Is selfbot user
                if (selfId && msg.author?.id === selfId) isStaff = true;
                // 2. Has staff role
                else if (msg.member?.roles?.length > 0 && staffRoleIds.length > 0) {
                    isStaff = msg.member.roles.some(r => staffRoleIds.includes(r));
                }
                return { ...msg, _isStaff: isStaff };
            });

            // Build mention lookup map
            const mentionMap = {};
            for (const [id, r] of bot.guildRolesCache) {
                mentionMap[`role:${id}`] = r.name || id;
            }
            for (const [id, m] of bot.guildMembersCache) {
                mentionMap[`user:${id}`] = m.user?.global_name || m.user?.username || m.nick || id;
            }
            res.json({ messages, mentionMap });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Send a message to a ticket
    router.post('/:id/send', async (req, res) => {
        const userId = req.user.userId;
        const channelId = req.params.id;
        const { content, replyTo } = req.body;

        const bot = botManager.bots.get(userId);
        if (!bot) return res.status(400).json({ error: 'Bot is not running' });

        const record = bot.activeTickets.get(channelId);
        if (!record) return res.status(404).json({ error: 'Ticket not found' });

        try {
            const result = await bot.sendDiscordMessage(channelId, content, replyTo || undefined);
            if (!result.ok) throw new Error(`Discord API ${result.status}`);

            try {
                const j = JSON.parse(result.body);
                if (j.id) bot.sentByBot.add(j.id);
            } catch (e) { }

            bot.addLog('message', `Сообщение отправлено в тикет ${channelId}`);
            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Edit a message
    router.patch('/:id/messages/:msgId', async (req, res) => {
        const userId = req.user.userId;
        const { id: channelId, msgId } = req.params;
        const { content } = req.body;

        const bot = botManager.bots.get(userId);
        if (!bot) return res.status(400).json({ error: 'Bot is not running' });

        const record = bot.activeTickets.get(channelId);
        if (!record) return res.status(404).json({ error: 'Ticket not found' });

        try {
            const result = await bot.editDiscordMessage(channelId, msgId, content);
            if (!result.ok) throw new Error(`Discord API ${result.status}`);

            bot.addLog('message', `Сообщение отредактировано в тикете ${channelId}`);
            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Generate AI Summary for a ticket
    router.post('/:id/summary', async (req, res) => {
        const userId = req.user.userId;
        const channelId = req.params.id;
        const bot = botManager.bots.get(userId);

        if (!bot) return res.status(400).json({ error: 'Bot is not running' });

        const record = bot.activeTickets.get(channelId);
        if (!record) return res.status(404).json({ error: 'Ticket not found' });

        try {
            if (record.summary) {
                return res.json({ summary: record.summary });
            }

            const rawMessages = await bot.fetchChannelMessages(channelId, 50);
            const messages = rawMessages.reverse();

            const summaryText = await generateTicketSummary(bot, channelId, messages);
            record.summary = summaryText;

            res.json({ summary: summaryText });
        } catch (err) {
            bot.log(`❌ AI Summary Error for ${channelId}: ${err.message}`);
            res.status(500).json({ error: err.message });
        }
    });

    // Get CRM Profile for a specific user (openerId)
    router.get('/user/:openerId', (req, res) => {
        const userId = req.user.userId;
        const openerId = req.params.openerId;
        const bot = botManager.bots.get(userId);

        if (!bot) return res.status(400).json({ error: 'Bot is not running' });

        try {
            const allClosed = bot.getClosedTickets ? bot.getClosedTickets() : [];
            const allActive = Array.from(bot.activeTickets.values());

            const userClosed = allClosed.filter(t => t.openerId === openerId);
            const userActive = allActive.filter(t => t.openerId === openerId);

            const totalCreated = userClosed.length + userActive.length;
            const isBanned = bot.config.bannedUsers && bot.config.bannedUsers.includes(openerId);

            const history = userClosed.map(t => ({
                id: t.channelId,
                name: t.channelName || 'Ticket',
                createdAt: t.createdAt,
                closedAt: t.closedAt
            })).sort((a, b) => b.createdAt - a.createdAt);

            const active = userActive.map(t => ({
                id: t.channelId,
                name: t.channelName || 'Ticket',
                createdAt: t.createdAt
            }));

            // Calculate some basic stats
            const highPriorityCount = userClosed.filter(t => t.priority === 'high').length +
                userActive.filter(t => t.priority === 'high').length;

            res.json({
                openerId,
                isBanned,
                stats: {
                    totalCreated,
                    closed: userClosed.length,
                    active: userActive.length,
                    highPriority: highPriorityCount
                },
                activeTickets: active,
                historyTickets: history.slice(0, 10) // Send top 10 most recent
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}

module.exports = { createTicketRoutes };
