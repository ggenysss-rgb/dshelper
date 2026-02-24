// ═══════════════════════════════════════════════════════════════
//  Discord Gateway — WebSocket connection and event handling
// ═══════════════════════════════════════════════════════════════
const WebSocket = require('ws');
const { sleep, getTicketPrefixes, isStaffFromMember, isClosingPhrase, snowflakeToTimestamp, matchAutoReply } = require('./helpers');
const { buildTicketCreatedMessage, buildFirstMessageNotification, buildTicketClosedMessage, buildHighPriorityAlert, buildForwardedMessage } = require('./builders');

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=9&encoding=json';
const RESUMABLE_CODES = [4000, 4001, 4002, 4003, 4005, 4007, 4009];

function connectGateway(bot) {
    if (bot.destroyed) return;
    const token = bot.config.discordBotToken || bot.config.discordToken;
    if (!token) { bot.log('❌ No Discord token'); return; }
    const isBotToken = !!bot.config.discordBotToken;

    bot.log(`🔌 Connecting to Discord Gateway...`);
    try { if (bot.ws) bot.ws.close(1000); } catch { }

    const ws = new WebSocket(GATEWAY_URL);
    bot.ws = ws;

    ws.on('open', () => bot.log('🔗 Gateway connected'));
    ws.on('error', e => bot.log(`❌ Gateway error: ${e.message}`));
    ws.on('close', (code) => {
        cleanupGateway(bot);
        if (bot.destroyed) return;
        const canResume = RESUMABLE_CODES.includes(code);
        const delay = canResume ? 2000 : 5000;
        bot.log(`🔌 Gateway closed (${code}), reconnecting in ${delay / 1000}s...`);
        if (!canResume) { bot.sessionId = null; bot.seq = null; }
        setTimeout(() => connectGateway(bot), delay);
    });

    ws.on('message', (raw) => {
        let data;
        try { data = JSON.parse(raw); } catch { return; }
        if (data.s) bot.seq = data.s;

        switch (data.op) {
            case 10: // HELLO
                startHeartbeat(bot, ws, data.d.heartbeat_interval);
                if (bot.sessionId && bot.seq) {
                    ws.send(JSON.stringify({ op: 6, d: { token, session_id: bot.sessionId, seq: bot.seq } }));
                } else {
                    const identify = {
                        op: 2, d: {
                            token, properties: { os: 'linux', browser: isBotToken ? 'discord.js' : 'Chrome', device: isBotToken ? 'discord.js' : 'Windows' },
                            intents: isBotToken ? 33281 : undefined,
                            presence: isBotToken ? { status: 'online', afk: false } : undefined,
                        }
                    };
                    if (!isBotToken) { identify.d.capabilities = 30717; identify.d.compress = false; }
                    ws.send(JSON.stringify(identify));
                }
                break;
            case 11: bot.receivedAck = true; break; // HEARTBEAT_ACK
            case 7: ws.close(4000); break; // RECONNECT
            case 9: // INVALID SESSION
                bot.sessionId = null; bot.seq = null;
                setTimeout(() => ws.close(4000), 2000);
                break;
            case 0: handleDispatch(bot, data.t, data.d); break;
        }
    });
}

function startHeartbeat(bot, ws, intervalMs) {
    if (bot.heartbeatTimer) clearInterval(bot.heartbeatTimer);
    bot.receivedAck = true;
    const jitter = Math.random() * intervalMs;
    setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 1, d: bot.seq }));
        bot.heartbeatTimer = setInterval(() => {
            if (!bot.receivedAck) { bot.log('⚠️ No Heartbeat ACK'); if (bot.ws) bot.ws.close(4000); return; }
            bot.receivedAck = false;
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 1, d: bot.seq }));
        }, intervalMs);
    }, jitter);
}

function cleanupGateway(bot) {
    if (bot.heartbeatTimer) { clearInterval(bot.heartbeatTimer); bot.heartbeatTimer = null; }
    bot.receivedAck = true;
    bot.guildCreateHandled = false;
}

function handleDispatch(bot, event, d) {
    const cfg = bot.config;
    const guildId = cfg.guildId;
    const prefixes = getTicketPrefixes(cfg.ticketPrefix);
    const categoryId = cfg.ticketsCategoryId;
    const staffRoleIds = cfg.staffRoleIds || [];

    switch (event) {
        case 'READY':
            bot.sessionId = d.session_id;
            bot.resumeUrl = d.resume_gateway_url;
            bot.log(`✅ Gateway READY (session: ${d.session_id})`);
            break;

        case 'RESUMED':
            bot.log('✅ Gateway RESUMED');
            break;

        case 'GUILD_CREATE': {
            if (d.id !== guildId || bot.guildCreateHandled) break;
            bot.guildCreateHandled = true;
            bot.log(`📡 Guild loaded: ${d.name} (${d.id})`);
            // Cache roles
            if (d.roles) for (const r of d.roles) bot.guildRolesCache.set(r.id, r);
            // Cache members
            if (d.members) for (const m of d.members) { if (m.user) bot.guildMembersCache.set(m.user.id, m); }
            // Cache presences
            if (d.presences) for (const p of d.presences) { if (p.user) bot.guildPresenceCache.set(p.user.id, p.status); }
            // Scan channels for existing tickets
            if (d.channels) {
                for (const ch of d.channels) {
                    if (categoryId && ch.parent_id !== categoryId) continue;
                    if (!prefixes.some(p => (ch.name || '').toLowerCase().startsWith(p.toLowerCase()))) continue;
                    if (!bot.activeTickets.has(ch.id)) {
                        bot.activeTickets.set(ch.id, {
                            channelId: ch.id, channelName: ch.name, guildId, guildName: d.name,
                            createdAt: snowflakeToTimestamp(ch.id), firstStaffReplyAt: null,
                            lastMessage: null, lastMessageAt: null, lastStaffMessageAt: null,
                            waitingForReply: false, activityTimerType: null, tgThreadId: null,
                        });
                    }
                }
                bot.markDirty();
                bot.log(`📊 Active tickets: ${bot.activeTickets.size}`);
            }
            bot.restoreActivityTimers();
            break;
        }

        case 'CHANNEL_CREATE': {
            if (d.guild_id !== guildId) break;
            if (categoryId && d.parent_id !== categoryId) break;
            if (!prefixes.some(p => (d.name || '').toLowerCase().startsWith(p.toLowerCase()))) break;
            const record = {
                channelId: d.id, channelName: d.name, guildId, guildName: '',
                createdAt: Date.now(), firstStaffReplyAt: null,
                lastMessage: null, lastMessageAt: null, lastStaffMessageAt: null,
                waitingForReply: false, activityTimerType: null, tgThreadId: null,
                openerId: '', openerUsername: '',
            };
            bot.activeTickets.set(d.id, record);
            bot.ps.totalCreated++;
            bot.markDirty();
            bot.log(`🎫 New ticket: #${d.name}`);
            bot.addLog('ticket', `Новый тикет: #${d.name}`);
            if (!bot.botPaused) {
                const msg = buildTicketCreatedMessage(d, { name: '' }, cfg);
                bot.enqueue({ ...msg });
                if (bot.io) bot.io.emit('ticket:new', { channelId: d.id, channelName: d.name });
            }
            // Auto-greet
            if (cfg.autoGreetEnabled && cfg.autoGreetText) {
                setTimeout(async () => {
                    try { await bot.sendDiscordMessage(d.id, cfg.autoGreetText); } catch { }
                }, (cfg.autoGreetDelay || 3) * 1000);
            }
            break;
        }

        case 'CHANNEL_DELETE': {
            if (d.guild_id !== guildId) break;
            const record = bot.activeTickets.get(d.id);
            if (!record) break;
            record.closedAt = Date.now();
            bot.ps.totalClosed++;
            bot.clearNoReplyTimer(d.id);
            bot.activeTickets.delete(d.id);
            bot.markDirty();
            bot.log(`🔒 Ticket closed: #${record.channelName}`);
            bot.addLog('ticket', `Тикет закрыт: #${record.channelName}`);
            if (!bot.botPaused) bot.enqueue(buildTicketClosedMessage(record, bot.ps));
            bot.dbInsertClosedTicket(record);
            bot.archiveTicketMessages(d.id, record);
            if (bot.io) bot.io.emit('ticket:closed', { channelId: d.id });
            break;
        }

        case 'MESSAGE_CREATE': {
            if (d.guild_id !== guildId) break;
            const record = bot.activeTickets.get(d.channel_id);
            if (!record) break;
            if (bot.sentByBot.has(d.id)) return;
            const author = d.author;
            if (!author) break;
            const isStaff = isStaffFromMember(d.member, staffRoleIds);
            const isBot = author.bot || false;

            // Update record
            const preview = isStaff ? `[Саппорт] ${d.content || ''}` : (d.content || '');
            record.lastMessage = preview.slice(0, 200);
            record.lastMessageAt = Date.now();

            // First staff reply tracking
            if (isStaff && !isBot && !record.firstStaffReplyAt) {
                record.firstStaffReplyAt = Date.now();
            }
            bot.markDirty();

            // Activity timer logic
            if (isStaff && !isBot) {
                const timerType = isClosingPhrase(d.content || '', cfg.closingPhrase) ? 'closing' : 'regular';
                bot.startActivityTimer(d.channel_id, timerType);
            } else if (!isBot && !isStaff) {
                bot.clearNoReplyTimer(d.channel_id);
            }

            // Forward to Telegram (non-staff, non-bot messages)
            if (!isStaff && !isBot && !bot.botPaused) {
                if (!bot.notifiedFirstMessage.has(d.channel_id)) {
                    bot.notifiedFirstMessage.add(d.channel_id);
                    if (!record.openerId) { record.openerId = author.id; record.openerUsername = author.username; bot.markDirty(); }
                    const ch = { name: record.channelName, id: d.channel_id };
                    const msg = buildFirstMessageNotification(ch, d, cfg);
                    bot.enqueue(msg);
                } else {
                    const text = buildForwardedMessage(record.channelName, author, d.member, d.content, d.attachments, cfg.maxMessageLength);
                    bot.enqueue({ text, channelId: d.channel_id });
                }
                if (bot.io) bot.io.emit('ticket:message', { channelId: d.channel_id, content: d.content });
            }

            // Auto-reply check
            if (!isBot && cfg.autoReplies?.length > 0) {
                for (const rule of cfg.autoReplies) {
                    if (matchAutoReply(rule, d.content || '', d.channel_id, guildId)) {
                        setTimeout(async () => {
                            try { await bot.sendDiscordMessage(d.channel_id, rule.response); } catch { }
                        }, (rule.delay || 2) * 1000);
                        break;
                    }
                }
            }
            break;
        }

        case 'GUILD_MEMBER_ADD': {
            if (d.guild_id !== guildId) break;
            if (d.user) bot.guildMembersCache.set(d.user.id, d);
            break;
        }

        case 'GUILD_MEMBER_UPDATE': {
            if (d.guild_id !== guildId) break;
            if (d.user) {
                const existing = bot.guildMembersCache.get(d.user.id) || {};
                bot.guildMembersCache.set(d.user.id, { ...existing, ...d });
            }
            break;
        }

        case 'GUILD_MEMBER_REMOVE': {
            if (d.guild_id !== guildId) break;
            if (d.user) bot.guildMembersCache.delete(d.user.id);
            break;
        }

        case 'PRESENCE_UPDATE': {
            if (d.guild_id !== guildId) break;
            if (d.user?.id) bot.guildPresenceCache.set(d.user.id, d.status);
            break;
        }

        case 'GUILD_ROLE_CREATE':
        case 'GUILD_ROLE_UPDATE':
            if (d.guild_id === guildId && d.role) bot.guildRolesCache.set(d.role.id, d.role);
            break;
        case 'GUILD_ROLE_DELETE':
            if (d.guild_id === guildId) bot.guildRolesCache.delete(d.role_id);
            break;
    }
}

module.exports = { connectGateway, cleanupGateway };
