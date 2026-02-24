const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const Bot = require('./Bot');
const defaultAutoReplies = require('./bot/defaultAutoReplies');

class BotManager {
    constructor(db, dataDir) {
        this.db = db;
        this.dataDir = dataDir;
        this.bots = new Map(); // userId -> Bot instance
        this.logsDir = path.join(dataDir, 'logs');
        this.stateDir = path.join(dataDir, 'states');

        try { if (!fs.existsSync(this.logsDir)) fs.mkdirSync(this.logsDir, { recursive: true }); } catch (e) { }
        try { if (!fs.existsSync(this.stateDir)) fs.mkdirSync(this.stateDir, { recursive: true }); } catch (e) { }
    }

    // Load user configuration from DB, with env var fallback
    getUserConfig(userId) {
        const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (!row) return null;

        // Helper: use DB value or fall back to env var
        const env = process.env;

        // Parse staff role IDs from env (comma-separated)
        let envStaffRoleIds = [];
        if (env.STAFF_ROLE_IDS) {
            try { envStaffRoleIds = JSON.parse(env.STAFF_ROLE_IDS); } catch { envStaffRoleIds = env.STAFF_ROLE_IDS.split(',').map(s => s.trim()).filter(Boolean); }
        }

        const config = {
            tgToken: row.tg_token || env.TG_TOKEN || '',
            tgChatId: row.tg_chat_id || env.TG_CHAT_ID || '',
            discordToken: row.discord_token || env.DISCORD_TOKEN || '',
            discordBotToken: env.DISCORD_BOT_TOKEN || '',
            guildId: row.discord_guild_id || env.GUILD_ID || '',
            ticketsCategoryId: row.tickets_category_id || env.TICKETS_CATEGORY_ID || '',
            staffRoleIds: row.staff_role_ids ? JSON.parse(row.staff_role_ids) : envStaffRoleIds,
            shiftChannelId: env.SHIFT_CHANNEL_ID || '',
            userName: row.username || '',

            autoGreetEnabled: row.auto_greet_enabled === 1,
            autoGreetText: row.auto_greet_text || '',
            autoGreetRoleIds: row.auto_greet_role_ids ? JSON.parse(row.auto_greet_role_ids) : [],

            activityCheckMin: row.activity_check_min || 10,
            closingCheckMin: row.closing_check_min || 15,

            notifyOnClose: row.notify_on_close === 1,
            includeFirstUserMessage: row.include_first_user_message === 1,
            mentionOnHighPriority: row.mention_on_high_priority === 1,
            forumMode: row.forum_mode === 1,

            closingPhrase: row.closing_phrase || env.CLOSING_PHRASE || 'остались вопросы',
            priorityKeywords: row.priority_keywords ? JSON.parse(row.priority_keywords) : [],
            ticketPrefix: (row.ticket_prefix && row.ticket_prefix !== 'ticket-') ? row.ticket_prefix : (env.TICKET_PREFIX || 'тикет-от'),
            autoReplies: (row.auto_replies && row.auto_replies !== '[]') ? JSON.parse(row.auto_replies) : defaultAutoReplies,
            binds: row.binds ? JSON.parse(row.binds) : {},

            pollingIntervalSec: row.polling_interval_sec || 3,
            rateLimitMs: row.rate_limit_ms || parseInt(env.RATE_LIMIT_MS || '200', 10),
            maxMessageLength: row.max_message_length || 300,
        };
        return config;
    }

    async startBot(userId) {
        if (this.bots.has(userId)) {
            console.log(`[Manager] Bot for user ${userId} is already running.`);
            return false;
        }

        const config = this.getUserConfig(userId);
        const hasDiscord = config && (config.discordToken || config.discordBotToken);
        if (!config || !hasDiscord || !config.tgToken || !config.tgChatId) {
            console.log(`[Manager] Unconfigured or missing tokens for user ${userId}. Cannot start bot.`);
            console.log(`[Manager]   discordToken: ${config?.discordToken ? 'SET' : 'MISSING'}, discordBotToken: ${config?.discordBotToken ? 'SET' : 'MISSING'}, tgToken: ${config?.tgToken ? 'SET' : 'MISSING'}, tgChatId: ${config?.tgChatId ? 'SET' : 'MISSING'}`);
            return false;
        }

        console.log(`[Manager] Starting bot for user ${userId}...`);

        const bot = new Bot(userId, config, this.dataDir, this.io);
        // Give bot a reference to the shared DB so it can persist config changes
        bot._sharedDb = this.db;
        this.bots.set(userId, bot);

        try {
            bot.start();
            return true;
        } catch (error) {
            console.error(`[Manager] Error starting bot for user ${userId}:`, error);
            this.bots.delete(userId);
            return false;
        }
    }

    async stopBot(userId) {
        const bot = this.bots.get(userId);
        if (!bot) return false;

        console.log(`[Manager] Stopping bot for user ${userId}...`);
        try {
            bot.stop(); // We will add stop() to Bot class
            this.bots.delete(userId);
            return true;
        } catch (error) {
            console.error(`[Manager] Error stopping bot for user ${userId}:`, error);
            return false;
        }
    }

    async restartBot(userId) {
        await this.stopBot(userId);
        return await this.startBot(userId);
    }

    async reloadConfig(userId) {
        const bot = this.bots.get(userId);
        if (!bot) return false;

        const config = this.getUserConfig(userId);
        if (config) {
            bot.updateConfig(config);
            return true;
        }
        return false;
    }

    async startAll() {
        const users = this.db.prepare('SELECT id FROM users').all();
        console.log(`[Manager] Attempting to start bots for ${users.length} users...`);
        let startCount = 0;
        for (const user of users) {
            const success = await this.startBot(user.id);
            if (success) startCount++;
        }
        console.log(`[Manager] Successfully started ${startCount} bots.`);
    }

    stopAll() {
        console.log(`[Manager] Stopping all bots...`);
        for (const [userId, bot] of this.bots.entries()) {
            try {
                bot.stop();
            } catch (e) {
                console.error(`[Manager] Error stopping bot for user ${userId}:`, e);
            }
        }
        this.bots.clear();
    }
}

module.exports = BotManager;
