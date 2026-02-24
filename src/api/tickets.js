const express = require('express');
const { authenticateToken } = require('./auth');

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
            const staffRoleIds = bot.config.staffRoleIds || [];
            const selfId = bot.selfUserId || null;

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

    return router;
}

module.exports = { createTicketRoutes };
