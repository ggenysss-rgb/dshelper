const express = require('express');
const { authenticateToken } = require('./auth');

function createProfileRoutes(db, botManager) {
    const router = express.Router();

    // Use auth middleware for all profile routes
    router.use(authenticateToken);

    // Get current user profile and config
    router.get('/', (req, res) => {
        try {
            const userId = req.user.userId;
            const config = botManager.getUserConfig(userId);

            // For new users with no config, return safe defaults
            const safeConfig = {
                discordToken: '',
                tgToken: '',
                tgChatId: '',
                guildId: '',
                botActive: false,
            };

            if (config) {
                // Mask tokens for security (only show first 10 chars)
                safeConfig.discordToken = config.discordToken ? config.discordToken.substring(0, 10) + '...' : '';
                safeConfig.tgToken = config.tgToken ? config.tgToken.substring(0, 10) + '...' : '';
                safeConfig.tgChatId = config.tgChatId || '';
                safeConfig.guildId = config.guildId || '';
                safeConfig.botActive = botManager.bots.has(userId);
            }

            res.json(safeConfig);
        } catch (error) {
            console.error('[Profile API] Get profile error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Update tokens and core config
    router.post('/tokens', async (req, res) => {
        try {
            const userId = req.user.userId;
            const { discordToken, tgToken, tgChatId, guildId } = req.body;

            const updates = [];
            const params = [];

            if (discordToken !== undefined) {
                // If it's a masked token, ignore the update
                if (!discordToken.includes('...')) {
                    updates.push('discord_token = ?');
                    params.push(discordToken);
                }
            }
            if (tgToken !== undefined) {
                if (!tgToken.includes('...')) {
                    updates.push('tg_token = ?');
                    params.push(tgToken);
                }
            }
            if (tgChatId !== undefined) {
                updates.push('tg_chat_id = ?');
                params.push(tgChatId);
            }
            if (guildId !== undefined) {
                updates.push('discord_guild_id = ?');
                params.push(guildId);
            }

            if (updates.length > 0) {
                params.push(userId);
                db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

                // Reload config in bot manager
                await botManager.reloadConfig(userId);

                // Auto-start bot if not running and tokens are now configured
                if (!botManager.bots.has(userId)) {
                    await botManager.startBot(userId);
                }
            }

            res.json({ ok: true, message: 'Settings updated successfully' });
        } catch (error) {
            console.error('[Profile API] Update tokens error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Start bot instance
    router.post('/start', async (req, res) => {
        const userId = req.user.userId;
        const success = await botManager.startBot(userId);

        if (success) {
            res.json({ ok: true, message: 'Bot started successfully' });
        } else {
            res.status(400).json({ error: 'Failed to start bot. Check your tokens and configuration.' });
        }
    });

    // Stop bot instance
    router.post('/stop', async (req, res) => {
        const userId = req.user.userId;
        const success = await botManager.stopBot(userId);

        if (success) {
            res.json({ ok: true, message: 'Bot stopped successfully' });
        } else {
            res.status(400).json({ error: 'Bot is not running or failed to stop.' });
        }
    });

    // Update remaining settings (auto replies, bind, timers, etc)
    router.post('/settings', async (req, res) => {
        // Implementation for additional settings updates
        const userId = req.user.userId;
        const allowed = [
            'autoGreetEnabled', 'autoGreetText', 'autoGreetRoleIds', 'autoGreetAllChannels',
            'includeFirstUserMessage', 'notifyOnClose', 'mentionOnHighPriority',
            'activityCheckMin', 'closingCheckMin', 'closingPhrase',
            'ticketPrefix', 'pollingIntervalSec', 'rateLimitMs',
            'maxMessageLength', 'forumMode', 'priorityKeywords',
            'ticketsCategoryId', 'staffRoleIds', 'shiftChannelId',
            'geminiApiKeys'
        ];

        const body = req.body;
        const updates = [];
        const params = [];

        // Map JS camelCase to SQL snake_case keys
        const camelToSnake = (str) => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

        for (const key of allowed) {
            if (body[key] !== undefined) {
                const snakeKey = camelToSnake(key);
                let val = body[key];

                if (typeof val === 'boolean') val = val ? 1 : 0;
                else if (typeof val === 'object') val = JSON.stringify(val);

                updates.push(`${snakeKey} = ?`);
                params.push(val);
            }
        }

        if (updates.length > 0) {
            try {
                params.push(userId);
                db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
                await botManager.reloadConfig(userId);
                res.json({ ok: true, message: 'Settings updated' });
            } catch (error) {
                console.error('[Profile API] Update settings error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        } else {
            res.json({ ok: true, message: 'No changes provided' });
        }
    });

    return router;
}

module.exports = { createProfileRoutes };
