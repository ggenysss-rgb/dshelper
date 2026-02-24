const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');
const WebSocket = require('ws');

const LOG = '[Bot]';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function nowTime() { return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kiev' }); }
function formatDateTime(ts) { return new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kiev' }); }
function formatDuration(ms) {
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d > 0) return `${d}д ${h % 24}ч`;
    if (h > 0) return `${h}ч ${m % 60}м`;
    return `${m}м`;
}
function snowflakeToTimestamp(id) { return Number(BigInt(id) >> 22n) + 1420070400000; }
function channelLink(guildId, channelId) { return `https://discord.com/channels/${guildId}/${channelId}`; }

class Bot extends EventEmitter {
    constructor(userId, config, db, logsConfig) {
        super();
        this.userId = userId;
        this.config = config;
        this.db = db;
        this.logsConfig = logsConfig;

        this.activeTickets = new Map();
        this.channelCache = new Map();
        this.guildCache = new Map();
        this.guildRolesCache = new Map();
        this.guildMembersCache = new Map();
        this.guildPresenceCache = new Map();

        this.ws = null;
        this.sessionId = null;
        this.resumeGatewayUrl = null;
        this.seq = null;
        this.heartbeatTimer = null;
        this.receivedAck = true;
        this.gatewayReady = false;
        this.selfUserId = null;
        this.guildCreateHandled = false;
        this.channelsFetched = false;
        this.botPaused = false;

        this.pollingTimer = null;
        this.pollingRunning = false;
        this.pollingOffset = 0;
        this.processedUpdateIds = new Set();
        this.sendQueue = [];
        this.queueRunning = false;
        this.lastSendTime = 0;
        this.tgMsgToChannel = new Map();
        this.sentByBot = new Set();

        this.noReplyTimers = new Map();
        this.notifiedTicketIds = new Set();
        this.notifiedFirstMessage = new Set();
        this.autoGreetedChannels = new Set();
        this.autoRepliedBinds = new Set();
        this.shiftReminderTimer = null;
        this.shiftCloseReminderTimer = null;
        this.autosaveTimer = null;
        this.stateDirty = false;

        this.dashboardLogs = [];
        this.sessionStats = { messagesFailed: 0 };

        this.TELEGRAM_API = `https://api.telegram.org/bot${this.config.tgToken}`;
        this.IS_BOT_TOKEN = (this.config.discordToken || '').startsWith('Bot ');
        this.GATEWAY_TOKEN = this.config.discordToken;
        this.GATEWAY_URL = 'wss://gateway.discord.gg/?v=9&encoding=json';
        this.SAFE_MESSAGE_TYPES = new Set([0, 19, 20]);

        this.STATE_FILE = path.join(logsConfig.stateDir, `state_${userId}.json`);
        this.ARCHIVES_DIR = path.join(logsConfig.dataDir, 'ticket_archives', String(userId));
        try { if (!fs.existsSync(this.ARCHIVES_DIR)) fs.mkdirSync(this.ARCHIVES_DIR, { recursive: true }); } catch (e) { }

        this.ps = this.emptyState();

        // Prepare DB statements
        this.stmtInsertClosed = db.prepare(`INSERT INTO closed_tickets (user_id, channel_id, channel_name, opener_id, opener_username, created_at, closed_at, first_staff_reply_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        this.stmtInsertMessage = db.prepare(`INSERT INTO ticket_messages (user_id, channel_id, message_id, content, author_id, author_username, author_global_name, author_avatar, author_bot, timestamp, embeds, attachments, member_roles) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    }

    emptyState() {
        return { activeTickets: {}, closedTickets: [], hourlyBuckets: new Array(24).fill(0), totalCreated: 0, totalClosed: 0, totalMessagesSent: 0 };
    }
    markDirty() { this.stateDirty = true; }
    addLog(type, message) {
        this.dashboardLogs.unshift({ type, message, timestamp: Date.now() });
        if (this.dashboardLogs.length > 200) this.dashboardLogs.length = 200;
    }

    // ── State Persistence ─────────────────────────────
    loadState() {
        try {
            if (!fs.existsSync(this.STATE_FILE)) return;
            const raw = fs.readFileSync(this.STATE_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            this.ps = { ...this.emptyState(), ...parsed };
            for (const [id, rec] of Object.entries(this.ps.activeTickets)) {
                rec.lastStaffMessageAt = rec.lastStaffMessageAt ?? null;
                rec.waitingForReply = rec.waitingForReply ?? false;
                rec.activityTimerType = rec.activityTimerType ?? null;
                this.activeTickets.set(id, rec);
            }
            console.log(`${LOG} [${this.userId}] State loaded: ${this.activeTickets.size} active tickets`);
        } catch (e) {
            console.error(`${LOG} [${this.userId}] State load error:`, e.message);
            this.ps = this.emptyState();
        }
    }
    saveState() {
        try {
            this.ps.activeTickets = Object.fromEntries(this.activeTickets.entries());
            fs.writeFileSync(this.STATE_FILE, JSON.stringify(this.ps, null, 2), 'utf8');
            this.stateDirty = false;
        } catch (e) { console.error(`${LOG} [${this.userId}] State save error:`, e.message); }
    }
    saveConfigToDb() {
        try {
            const camelToSnake = s => s.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`);
            const fields = ['binds', 'autoReplies', 'autoGreetEnabled', 'autoGreetText', 'autoGreetRoleIds',
                'activityCheckMin', 'closingCheckMin', 'notifyOnClose', 'includeFirstUserMessage',
                'mentionOnHighPriority', 'forumMode', 'closingPhrase', 'priorityKeywords', 'ticketPrefix',
                'pollingIntervalSec', 'rateLimitMs', 'maxMessageLength'];
            const updates = []; const params = [];
            for (const k of fields) {
                let v = this.config[k]; if (v === undefined) continue;
                if (typeof v === 'boolean') v = v ? 1 : 0;
                else if (typeof v === 'object') v = JSON.stringify(v);
                updates.push(`${camelToSnake(k)} = ?`); params.push(v);
            }
            if (updates.length > 0) {
                params.push(this.userId);
                this.db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
            }
        } catch (e) { console.error(`${LOG} [${this.userId}] Config save error:`, e.message); }
    }

    // ── DB Helpers ─────────────────────────────────────
    dbInsertClosedTicket(t) {
        this.stmtInsertClosed.run(this.userId, t.channelId, t.channelName || '', t.openerId || '', t.openerUsername || '', t.createdAt || 0, t.closedAt || Date.now(), t.firstStaffReplyAt || null);
    }
    dbGetClosedTickets({ page = 1, limit = 50, search = '' } = {}) {
        let where = 'WHERE user_id = ?'; const params = [this.userId];
        if (search) { where += ' AND (channel_name LIKE ? OR opener_username LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
        const total = this.db.prepare(`SELECT COUNT(*) as cnt FROM closed_tickets ${where}`).get(...params).cnt;
        const offset = (page - 1) * limit; params.push(limit, offset);
        const rows = this.db.prepare(`SELECT * FROM closed_tickets ${where} ORDER BY closed_at DESC LIMIT ? OFFSET ?`).all(...params);
        return { tickets: rows.map(r => ({ channelId: r.channel_id, channelName: r.channel_name, openerId: r.opener_id, openerUsername: r.opener_username, createdAt: r.created_at, closedAt: r.closed_at, firstStaffReplyAt: r.first_staff_reply_at })), total, page, totalPages: Math.ceil(total / limit) };
    }
    dbGetAllClosedTickets() {
        return this.db.prepare('SELECT * FROM closed_tickets WHERE user_id = ? ORDER BY closed_at DESC').all(this.userId)
            .map(r => ({ channelId: r.channel_id, channelName: r.channel_name, openerId: r.opener_id, openerUsername: r.opener_username, createdAt: r.created_at, closedAt: r.closed_at, firstStaffReplyAt: r.first_staff_reply_at }));
    }
    dbGetTicketMessages(channelId) {
        return this.db.prepare('SELECT * FROM ticket_messages WHERE user_id = ? AND channel_id = ? ORDER BY id ASC').all(this.userId, channelId)
            .map(r => ({ id: r.message_id, content: r.content, author: { id: r.author_id, username: r.author_username, global_name: r.author_global_name, avatar: r.author_avatar, bot: !!r.author_bot }, timestamp: r.timestamp, embeds: r.embeds ? JSON.parse(r.embeds) : [], attachments: r.attachments ? JSON.parse(r.attachments) : [], member: r.member_roles ? { roles: JSON.parse(r.member_roles) } : undefined }));
    }
    dbGetClosedCount() { return this.db.prepare('SELECT COUNT(*) as cnt FROM closed_tickets WHERE user_id = ?').get(this.userId).cnt; }

    // ── HTTP Helpers ──────────────────────────────────
    httpPost(url, body) {
        return new Promise((resolve, reject) => {
            const u = new URL(url); const data = JSON.stringify(body);
            const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, res => {
                let chunks = ''; res.on('data', c => chunks += c); res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: chunks }));
            }); req.on('error', reject); req.write(data); req.end();
        });
    }
    httpGet(url, headers = {}) {
        return new Promise((resolve, reject) => {
            const u = new URL(url);
            const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers }, res => {
                let chunks = ''; res.on('data', c => chunks += c); res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: chunks }));
            }); req.on('error', reject); req.end();
        });
    }

    // ── Telegram API ─────────────────────────────────
    async tgSendMessage(chatId, text, replyMarkup, threadId) {
        const payload = { chat_id: chatId || this.config.tgChatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
        if (replyMarkup) payload.reply_markup = replyMarkup;
        if (threadId) payload.message_thread_id = threadId;
        try {
            const res = await this.httpPost(`${this.TELEGRAM_API}/sendMessage`, payload);
            if (!res.ok) { if (res.status === 429) { try { const j = JSON.parse(res.body); await sleep((j?.parameters?.retry_after ?? 5) * 1000); } catch { } } return { ok: false, messageId: null }; }
            let messageId = null; try { const j = JSON.parse(res.body); if (j.ok && j.result) messageId = j.result.message_id; } catch { }
            return { ok: true, messageId };
        } catch (e) { return { ok: false, messageId: null }; }
    }

    // ── Discord REST ─────────────────────────────────
    async sendDiscordMessage(channelId, content, replyToMessageId) {
        const url = `https://discord.com/api/v9/channels/${channelId}/messages`;
        const payload = { content }; if (replyToMessageId) payload.message_reference = { message_id: replyToMessageId };
        const body = JSON.stringify(payload);
        return new Promise((resolve, reject) => {
            const u = new URL(url);
            const req = https.request({ hostname: u.hostname, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Authorization': this.GATEWAY_TOKEN, 'User-Agent': 'Mozilla/5.0' } }, res => {
                let chunks = ''; res.on('data', c => chunks += c); res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: chunks }));
            }); req.on('error', reject); req.write(body); req.end();
        });
    }
    async editDiscordMessage(channelId, messageId, content) {
        const url = `https://discord.com/api/v9/channels/${channelId}/messages/${messageId}`;
        const body = JSON.stringify({ content });
        return new Promise((resolve, reject) => {
            const u = new URL(url);
            const req = https.request({ hostname: u.hostname, path: u.pathname, method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Authorization': this.GATEWAY_TOKEN, 'User-Agent': 'Mozilla/5.0' } }, res => {
                let chunks = ''; res.on('data', c => chunks += c); res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: chunks }));
            }); req.on('error', reject); req.write(body); req.end();
        });
    }
    async fetchChannelMessages(channelId, limit = 100) {
        try {
            const res = await this.httpGet(`https://discord.com/api/v9/channels/${channelId}/messages?limit=${limit}`, { Authorization: this.GATEWAY_TOKEN });
            if (!res.ok) return [];
            return JSON.parse(res.body);
        } catch { return []; }
    }

    // ── Queue & Send ─────────────────────────────────
    enqueue(item) { this.sendQueue.push({ retries: 0, ...item }); if (!this.queueRunning) this.runQueue(); }
    async runQueue() {
        if (this.queueRunning) return; this.queueRunning = true;
        while (this.sendQueue.length > 0) {
            const item = this.sendQueue[0];
            const wait = (this.config.rateLimitMs || 1500) - (Date.now() - this.lastSendTime);
            if (wait > 0) await sleep(wait);
            this.lastSendTime = Date.now();
            const result = await this.tgSendMessage(item.chatId || this.config.tgChatId, item.text, item.replyMarkup, item.threadId);
            if (result.ok) {
                this.sendQueue.shift(); this.ps.totalMessagesSent++; this.markDirty();
                if (result.messageId && item.channelId) { this.tgMsgToChannel.set(result.messageId, { channelId: item.channelId, chatId: item.chatId }); if (this.tgMsgToChannel.size > 400) { const ks = [...this.tgMsgToChannel.keys()]; for (let i = 0; i < ks.length - 200; i++)this.tgMsgToChannel.delete(ks[i]); } }
            } else {
                item.retries = (item.retries || 0) + 1;
                if (item.retries >= 3) { this.sendQueue.shift(); this.sessionStats.messagesFailed++; } else { await sleep(2000 * item.retries); }
            }
        }
        this.queueRunning = false;
    }

    // ── Ticket helpers ───────────────────────────────
    isTicketChannel(ch) {
        const prefix = this.config.ticketPrefix || 'ticket-';
        const catId = this.config.ticketsCategoryId;
        if (catId && ch.parent_id === catId) return true;
        return (ch.name || '').startsWith(prefix);
    }
    isStaffFromMember(member) {
        if (!member?.roles) return false;
        return member.roles.some(r => (this.config.staffRoleIds || []).includes(r));
    }
    getPriority(name, content = '') {
        const kws = this.config.priorityKeywords || { high: [], medium: [] };
        const lower = `${name} ${content}`.toLowerCase();
        const high = (kws.high || []).some(k => lower.includes(k.toLowerCase()));
        const medium = (kws.medium || []).some(k => lower.includes(k.toLowerCase()));
        return { high, medium, emoji: high ? '🔴' : medium ? '🟡' : '🟢', badge: high ? 'ВЫСОКИЙ' : medium ? 'Средний' : 'Обычный' };
    }
    registerTicket(channel, silent = false) {
        if (this.activeTickets.has(channel.id)) return this.activeTickets.get(channel.id);
        if (!this.isTicketChannel(channel)) return null;
        const guild = this.guildCache.get(channel.guild_id || this.config.guildId);
        const record = { channelId: channel.id, channelName: channel.name || channel.id, guildId: channel.guild_id || this.config.guildId, guildName: guild?.name || 'Unknown', createdAt: snowflakeToTimestamp(channel.id), tgThreadId: null, lastMessage: '', lastMessageAt: 0, firstStaffReplyAt: null, openerId: '', openerUsername: '', lastStaffMessageAt: null, waitingForReply: false, activityTimerType: null };
        this.activeTickets.set(channel.id, record);
        if (!silent) { this.ps.totalCreated++; this.ps.hourlyBuckets[new Date().getHours()]++; }
        this.markDirty();
        return record;
    }

    // ── Gateway ──────────────────────────────────────
    connectGateway() {
        const url = this.resumeGatewayUrl ? `${this.resumeGatewayUrl}/?v=9&encoding=json` : this.GATEWAY_URL;
        console.log(`${LOG} [${this.userId}] 🔌 Connecting to Gateway...`);
        this.ws = new WebSocket(url);
        this.ws.on('open', () => { console.log(`${LOG} [${this.userId}] 🔌 Connected.`); this.addLog('gateway', 'Connected to Discord Gateway'); });
        this.ws.on('message', raw => { try { this.handleGatewayMessage(JSON.parse(raw)); } catch (e) { } });
        this.ws.on('close', (code) => {
            console.log(`${LOG} [${this.userId}] 🔌 Disconnected: ${code}`);
            this.cleanupGateway();
            if (code === 4004) { console.error(`${LOG} [${this.userId}] Invalid token!`); return; }
            if (code === 4002) { this.sessionId = null; this.resumeGatewayUrl = null; this.seq = null; }
            // Only reconnect if not manually stopped
            if (!this._stopped) { setTimeout(() => this.connectGateway(), 5000); }
        });
        this.ws.on('error', err => { console.error(`${LOG} [${this.userId}] WS error:`, err.message); });
    }
    handleGatewayMessage(msg) {
        const { op, d, s, t } = msg;
        if (s !== null && s !== undefined) this.seq = s;
        switch (op) {
            case 10: this.startHeartbeat(d.heartbeat_interval); this.sessionId ? this.sendResume() : this.sendIdentify(); break;
            case 11: this.receivedAck = true; break;
            case 0: this.handleDispatch(t, d); break;
            case 7: this.ws.close(4000); break;
            case 9: this.sessionId = null; this.resumeGatewayUrl = null; setTimeout(() => this.sendIdentify(), Math.random() * 4000 + 1000); break;
        }
    }
    handleDispatch(event, data) {
        switch (event) {
            case 'READY':
                this.sessionId = data.session_id; this.resumeGatewayUrl = data.resume_gateway_url;
                this.gatewayReady = true; this.selfUserId = data.user.id;
                console.log(`${LOG} [${this.userId}] ✅ Authorized as ${data.user.username}`);
                this.addLog('gateway', `Authorized as ${data.user.username}`);
                if (!this.pollingTimer) this.schedulePolling();
                if (data.guilds) { for (const g of data.guilds) { if (g.id === this.config.guildId && (g.channels || g.name)) { this.onGuildCreate(g); this.guildCreateHandled = true; } } }
                break;
            case 'RESUMED':
                console.log(`${LOG} [${this.userId}] ✅ Session resumed.`); break;
            case 'GUILD_CREATE':
                if (data.id === this.config.guildId && this.guildCreateHandled) break;
                this.onGuildCreate(data); break;
            case 'MESSAGE_CREATE': this.onMessageCreate(data); break;
            case 'CHANNEL_CREATE': this.onChannelCreate(data); break;
            case 'CHANNEL_UPDATE': if (data.guild_id === this.config.guildId) this.channelCache.set(data.id, data); break;
            case 'CHANNEL_DELETE': this.onChannelDelete(data); break;
            case 'THREAD_CREATE': this.onThreadCreate(data); break;
            case 'GUILD_MEMBER_LIST_UPDATE':
                if (data.guild_id !== this.config.guildId) break;
                if (data.ops) for (const op of data.ops) {
                    if (op.items) for (const item of op.items) { if (item.member?.user) { this.guildMembersCache.set(item.member.user.id, item.member); if (item.member.presence) this.guildPresenceCache.set(item.member.user.id, item.member.presence.status || 'offline'); } }
                    if (op.item?.member?.user) { this.guildMembersCache.set(op.item.member.user.id, op.item.member); if (op.item.member.presence) this.guildPresenceCache.set(op.item.member.user.id, op.item.member.presence.status || 'offline'); }
                } break;
            case 'PRESENCE_UPDATE':
                if (data.guild_id === this.config.guildId && data.user?.id) this.guildPresenceCache.set(data.user.id, data.status || 'offline'); break;
        }
    }
    sendIdentify() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const payload = this.IS_BOT_TOKEN
            ? { token: this.GATEWAY_TOKEN, intents: 33283, properties: { os: 'linux', browser: 'ticket-notifier', device: 'ticket-notifier' }, compress: false, large_threshold: 250 }
            : { token: this.GATEWAY_TOKEN, properties: { os: 'Windows', browser: 'Chrome', device: '' }, presence: { status: 'online', activities: [], since: 0, afk: false }, compress: false, large_threshold: 250 };
        this.ws.send(JSON.stringify({ op: 2, d: payload }));
    }
    sendResume() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({ op: 6, d: { token: this.GATEWAY_TOKEN, session_id: this.sessionId, seq: this.seq } }));
    }
    startHeartbeat(interval) {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.receivedAck = true;
        const jitter = Math.floor(interval * Math.random());
        setTimeout(() => {
            if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ op: 1, d: this.seq }));
            this.heartbeatTimer = setInterval(() => {
                if (!this.receivedAck) { if (this.ws) this.ws.close(4000); return; }
                this.receivedAck = false;
                if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ op: 1, d: this.seq }));
            }, interval);
        }, jitter);
    }
    cleanupGateway() { if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; } this.receivedAck = true; this.guildCreateHandled = false; }

    // ── Event Handlers ───────────────────────────────
    onGuildCreate(guild) {
        if (guild.id !== this.config.guildId) return;
        this.guildCache.set(guild.id, { id: guild.id, name: guild.name || 'Unknown' });
        if (guild.roles) for (const r of guild.roles) this.guildRolesCache.set(r.id, r);
        if (guild.members) for (const m of guild.members) { if (m.user) this.guildMembersCache.set(m.user.id, m); }
        if (guild.presences) for (const p of guild.presences) { if (p.user?.id) this.guildPresenceCache.set(p.user.id, p.status || 'offline'); }
        let chCount = 0;
        for (const ch of guild.channels || []) { this.channelCache.set(ch.id, { ...ch, guild_id: guild.id }); chCount++; }
        for (const th of guild.threads || []) { this.channelCache.set(th.id, { ...th, guild_id: guild.id }); chCount++; }
        console.log(`${LOG} [${this.userId}] 🏠 Guild ${guild.name}: ${chCount} channels, ${this.guildRolesCache.size} roles, ${this.guildMembersCache.size} members`);
        this.scanExistingTickets();
        if (!this.IS_BOT_TOKEN) this.fetchGuildChannelsREST(guild.id);
    }
    onChannelCreate(data) {
        if ((data.guild_id || this.config.guildId) !== this.config.guildId) return;
        data.guild_id = this.config.guildId;
        this.channelCache.set(data.id, data);
        if (this.activeTickets.has(data.id)) return;
        const record = this.registerTicket(data);
        if (!record || this.botPaused) return;
        if (this.notifiedTicketIds.has(data.id)) return;
        this.notifiedTicketIds.add(data.id); setTimeout(() => this.notifiedTicketIds.delete(data.id), 60000);
        console.log(`${LOG} [${this.userId}] ✅ New ticket: #${data.name}`);
        this.addLog('ticket', `New ticket: #${data.name || data.id}`);
        const guild = this.guildCache.get(this.config.guildId);
        const msg = this.buildTicketCreatedMessage(data, guild);
        this.enqueue({ ...msg, channelId: data.id });
    }
    onChannelDelete(data) {
        if ((data.guild_id || this.channelCache.get(data.id)?.guild_id) !== this.config.guildId) return;
        this.channelCache.delete(data.id);
        if (!this.config.notifyOnClose) return;
        const record = this.activeTickets.get(data.id);
        if (!record && !this.isTicketChannel(data)) return;
        const fallback = record || { channelId: data.id, channelName: data.name || data.id, guildId: this.config.guildId, guildName: this.guildCache.get(this.config.guildId)?.name || 'Unknown', createdAt: Date.now() - 60000 };
        this.dbInsertClosedTicket({ channelId: data.id, channelName: fallback.channelName, openerId: fallback.openerId || '', openerUsername: fallback.openerUsername || '', createdAt: fallback.createdAt, closedAt: Date.now(), firstStaffReplyAt: fallback.firstStaffReplyAt || null });
        this.activeTickets.delete(data.id); this.ps.totalClosed++; this.markDirty();
        this.addLog('ticket', `Ticket closed: #${fallback.channelName}`);
        if (!this.botPaused) { this.enqueue(this.buildTicketClosedMessage(fallback)); }
    }
    onThreadCreate(data) {
        if ((data.guild_id || this.config.guildId) !== this.config.guildId) return;
        data.guild_id = this.config.guildId; this.channelCache.set(data.id, data);
        if (this.activeTickets.has(data.id)) return;
        this.registerTicket(data, !data.newly_created);
    }
    onMessageCreate(data) {
        const guildId = data.guild_id || this.channelCache.get(data.channel_id)?.guild_id;
        if (guildId !== this.config.guildId) return;
        const channelId = data.channel_id;
        let channel = this.channelCache.get(channelId);
        if (!channel) { if (this.activeTickets.has(channelId)) { channel = { id: channelId, name: this.activeTickets.get(channelId).channelName, guild_id: guildId, parent_id: this.config.ticketsCategoryId, type: 0 }; this.channelCache.set(channelId, channel); } else return; }
        if (!this.activeTickets.has(channelId)) { if (!this.isTicketChannel(channel)) return; this.registerTicket(channel); }
        const author = data.author; if (!author || author.bot || data.webhook_id) return;
        const record = this.activeTickets.get(channelId); if (!record) return;
        const staffSent = this.isStaffFromMember(data.member);
        if (!staffSent && !record.openerId) { record.openerId = author.id || ''; record.openerUsername = author.username || ''; this.markDirty(); }
        if (staffSent && record.firstStaffReplyAt === null) { record.firstStaffReplyAt = Date.now(); this.markDirty(); }
        if (data.content) { record.lastMessage = (staffSent ? '[Саппорт] ' : '') + data.content; record.lastMessageAt = Date.now(); this.markDirty(); }
        if (staffSent) return; // Don't notify staff messages to TG
        if (this.botPaused || !this.config.includeFirstUserMessage) return;
        if (this.notifiedFirstMessage.has(channelId)) return;
        if (!this.SAFE_MESSAGE_TYPES.has(data.type ?? 0)) return;
        this.notifiedFirstMessage.add(channelId);
        this.addLog('ticket', `First message in #${channel?.name || channelId}`);
        this.enqueue({ ...this.buildFirstMessageNotification(channel, data), channelId });
    }

    scanExistingTickets() {
        let found = 0;
        for (const [id, ch] of this.channelCache) {
            if (this.activeTickets.has(id) || !this.isTicketChannel(ch)) continue;
            this.registerTicket(ch, true); found++;
        }
        if (found > 0) { console.log(`${LOG} [${this.userId}] Scanned ${found} tickets.`); this.markDirty(); }
    }
    async fetchGuildChannelsREST(guildId) {
        if (this.channelsFetched) return;
        try {
            const res = await this.httpGet(`https://discord.com/api/v9/guilds/${guildId}/channels`, { Authorization: this.GATEWAY_TOKEN });
            if (!res.ok) return;
            const channels = JSON.parse(res.body);
            for (const ch of channels) this.channelCache.set(ch.id, { ...ch, guild_id: guildId });
            this.channelsFetched = true;
            this.scanExistingTickets();
        } catch (e) { }
    }

    // ── Message Builders ─────────────────────────────
    buildTicketCreatedMessage(channel, guild) {
        const name = escapeHtml(channel.name || channel.id); const link = channelLink(this.config.guildId, channel.id);
        const text = [`╔══════════════════════╗`, `║  🎫  <b>НОВЫЙ ТИКЕТ</b>`, `╚══════════════════════╝`, ``, `📋  <b>Канал:</b>   <code>#${name}</code>`, `🏠  <b>Сервер:</b>  ${escapeHtml(guild?.name || 'Unknown')}`, `🕐  <b>Время:</b>   ${nowTime()}`].join('\n');
        return { text, replyMarkup: { inline_keyboard: [[{ text: '🔗 Открыть', url: link }]] } };
    }
    buildFirstMessageNotification(channel, message) {
        const chName = escapeHtml(channel?.name || message.channel_id); const link = channelLink(this.config.guildId, message.channel_id);
        const author = message.author; const content = escapeHtml(truncate(message.content || '(вложение)', 300));
        const text = [`╔══════════════════════╗`, `║  💬  <b>НОВОЕ СООБЩЕНИЕ</b>`, `╚══════════════════════╝`, ``, `📋  <b>Тикет:</b>   <code>#${chName}</code>`, `👤  <b>Игрок:</b>   ${escapeHtml(author?.username || '?')}`, `🕐  <b>Время:</b>   ${nowTime()}`, ``, `💌  <b>Сообщение:</b>`, `<blockquote>${content}</blockquote>`].join('\n');
        return { text, replyMarkup: { inline_keyboard: [[{ text: '🔗 Перейти', url: link }]] } };
    }
    buildTicketClosedMessage(record) {
        const text = [`╔══════════════════════╗`, `║  🔒  <b>ТИКЕТ ЗАКРЫТ</b>`, `╚══════════════════════╝`, ``, `📋  <b>Канал:</b>   <code>#${escapeHtml(record.channelName)}</code>`, `⏱  <b>Жил:</b>     ${formatDuration(Date.now() - record.createdAt)}`, `🕐  <b>Закрыт:</b>  ${nowTime()}`].join('\n');
        return { text };
    }

    // ── Telegram Polling ─────────────────────────────
    schedulePolling() {
        const sec = this.config.pollingIntervalSec || 3;
        this.pollingTimer = setTimeout(async () => {
            this.pollingTimer = null;
            if (!this.pollingRunning) { this.pollingRunning = true; try { await this.pollTelegram(); } finally { this.pollingRunning = false; } }
            if (!this._stopped) this.schedulePolling();
        }, sec * 1000);
    }
    async pollTelegram() {
        try {
            const res = await this.httpGet(`${this.TELEGRAM_API}/getUpdates?offset=${this.pollingOffset}&timeout=1&allowed_updates=["message","callback_query"]`);
            if (!res.ok) return;
            const data = JSON.parse(res.body); if (!data.ok) return;
            for (const update of data.result || []) {
                const uid = update.update_id; this.pollingOffset = uid + 1;
                if (this.processedUpdateIds.has(uid)) continue; this.processedUpdateIds.add(uid);
                if (this.processedUpdateIds.size > 100) { const a = [...this.processedUpdateIds]; for (let i = 0; i < a.length - 50; i++)this.processedUpdateIds.delete(a[i]); }
                const text = update?.message?.text || '';
                const chatId = String(update?.message?.chat?.id || '');
                if (chatId !== String(this.config.tgChatId)) continue;
                // Basic command handling
                if (text === '/start') this.enqueue({ text: '🤖 Бот работает! /list для тикетов' });
                else if (text === '/list' || text.startsWith('/list ')) { const msg = this.buildListMessage(); this.enqueue({ text: msg }); }
                else if (text === '/stats') { this.enqueue({ text: this.buildStatsMessage() }); }
                else if (text === '/pause') { this.botPaused = true; this.enqueue({ text: '⏸ Бот на паузе.' }); }
                else if (text === '/resume') { this.botPaused = false; this.enqueue({ text: '▶️ Бот возобновлён.' }); }
            }
        } catch (e) { console.error(`${LOG} [${this.userId}] Polling error:`, e.message); }
    }

    buildListMessage() {
        if (this.activeTickets.size === 0) return '📭 Нет открытых тикетов 🎉';
        const lines = [`📋 <b>ОТКРЫТЫЕ ТИКЕТЫ</b> (${this.activeTickets.size})`, ``];
        let i = 1;
        for (const r of this.activeTickets.values()) {
            lines.push(`${i}. <code>#${escapeHtml(r.channelName)}</code> — ${formatDuration(Date.now() - r.createdAt)}`);
            i++;
        }
        return lines.join('\n');
    }
    buildStatsMessage() {
        return [`📊 <b>СТАТИСТИКА</b>`, ``, `🎫 Создано: ${this.ps.totalCreated}`, `🔒 Закрыто: ${this.ps.totalClosed}`, `🟢 Открыто: ${this.activeTickets.size}`, `✉️ Сообщений: ${this.ps.totalMessagesSent}`].join('\n');
    }

    // ── Config update ────────────────────────────────
    updateConfig(newConfig) { this.config = newConfig; }

    // ── Lifecycle ────────────────────────────────────
    start() {
        this._stopped = false;
        this.loadState();
        this.autosaveTimer = setInterval(() => { if (this.stateDirty) this.saveState(); }, 30000);
        this.connectGateway();
        console.log(`${LOG} [${this.userId}] 🚀 Bot started.`);
    }
    stop() {
        this._stopped = true;
        if (this.pollingTimer) { clearTimeout(this.pollingTimer); this.pollingTimer = null; }
        if (this.autosaveTimer) { clearInterval(this.autosaveTimer); this.autosaveTimer = null; }
        if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
        this.noReplyTimers.forEach(t => clearTimeout(t)); this.noReplyTimers.clear();
        if (this.shiftReminderTimer) { clearTimeout(this.shiftReminderTimer); this.shiftReminderTimer = null; }
        if (this.shiftCloseReminderTimer) { clearTimeout(this.shiftCloseReminderTimer); this.shiftCloseReminderTimer = null; }
        this.saveState();
        if (this.ws) this.ws.close(1000);
        console.log(`${LOG} [${this.userId}] 🛑 Bot stopped.`);
    }
}

module.exports = Bot;
