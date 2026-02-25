// ═══════════════════════════════════════════════════════════════
//  Discord Gateway — WebSocket connection and event handling
// ═══════════════════════════════════════════════════════════════
const WebSocket = require('ws');
const { sleep, getTicketPrefixes, isStaffFromMember, isClosingPhrase, snowflakeToTimestamp, matchAutoReply } = require('./helpers');
const { buildTicketCreatedMessage, buildFirstMessageNotification, buildTicketClosedMessage, buildHighPriorityAlert, buildForwardedMessage } = require('./builders');
const { containsProfanity } = require('./profanityFilter');

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=9&encoding=json';
const RESUMABLE_CODES = [4000, 4001, 4002, 4003, 4005, 4007, 4009];

// Dedup set: prevents duplicate Neuro responses when multiple bot instances share the same token
const _neuroProcessed = new Set();

// Profanity cooldown: prevents spamming staff pings for the same user
const _profanityCooldown = new Map();

function connectGateway(bot) {
    if (bot.destroyed) return;
    const token = bot.config.discordBotToken || bot.config.discordToken;
    if (!token) { bot.log('❌ No Discord token'); return; }
    const isBotToken = !!bot.config.discordBotToken;

    bot.log(`🔌 Connecting to Discord Gateway...`);
    // Diagnostic: log auto-reply config
    const arRules = bot.config.autoReplies || [];
    bot.log(`🤖 Auto-reply config: ${arRules.length} rules — ${arRules.map(r => `"${r.name}"(guild:${r.guildId || 'any'},ch:${r.channelId || 'any'})`).join(', ') || 'NONE'}`);
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
                    const payload = isBotToken
                        ? {
                            token,
                            intents: 33283,
                            properties: { os: 'linux', browser: 'ticket-notifier', device: 'ticket-notifier' },
                            compress: false,
                            large_threshold: 250,
                        }
                        : {
                            token,
                            properties: { os: 'Windows', browser: 'Chrome', device: '' },
                            presence: { status: 'online', activities: [], since: 0, afk: false },
                            compress: false,
                            large_threshold: 250,
                        };
                    ws.send(JSON.stringify({ op: 2, d: payload }));
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

    // DIAGNOSTIC: log all dispatch events (limited to avoid spam)
    if (!bot._dispatchCounts) bot._dispatchCounts = {};
    bot._dispatchCounts[event] = (bot._dispatchCounts[event] || 0) + 1;
    if (bot._dispatchCounts[event] <= 3) {
        bot.log(`📨 Dispatch: ${event}${d?.guild_id ? ` (guild:${d.guild_id})` : ''}${event === 'MESSAGE_CREATE' ? ` from:${d?.author?.username} ch:${d?.channel_id} "${(d?.content || '').slice(0, 40)}"` : ''}`);
    }
    if (bot._dispatchCounts[event] === 3 && event !== 'MESSAGE_CREATE') {
        bot.log(`📨 (suppressing further ${event} logs)`);
    }

    switch (event) {
        case 'READY':
            bot.sessionId = d.session_id;
            bot.resumeUrl = d.resume_gateway_url;
            if (d.user?.id) bot.selfUserId = d.user.id;
            bot.log(`✅ Gateway READY (session: ${d.session_id}, user: ${d.user?.username || '?'} / ${d.user?.id || '?'})`);
            // For selfbot: GUILD_CREATE might not include channels.
            // Use REST API to fetch channels after a small delay
            setTimeout(() => fetchAndScanChannels(bot), 3000);
            break;

        case 'RESUMED':
            bot.log('✅ Gateway RESUMED');
            break;

        case 'GUILD_CREATE': {
            if (d.id !== guildId) break;
            bot.log(`📡 Guild event: ${d.name} (${d.id}), channels: ${d.channels?.length || 0}, members: ${d.members?.length || 0}`);
            // Cache roles
            if (d.roles) for (const r of d.roles) bot.guildRolesCache.set(r.id, r);
            // Cache members
            if (d.members) for (const m of d.members) { if (m.user) bot.guildMembersCache.set(m.user.id, m); }
            // Cache presences
            if (d.presences) for (const p of d.presences) { if (p.user) bot.guildPresenceCache.set(p.user.id, p.status); }
            // Scan channels if we got them (bot token sends them here)
            if (d.channels?.length > 0 && !bot.guildCreateHandled) {
                bot.guildCreateHandled = true;
                scanChannelsList(bot, d.channels, guildId, d.name, prefixes, categoryId);
                bot.restoreActivityTimers();
            }
            break;
        }

        case 'CHANNEL_CREATE': {
            if (d.guild_id !== guildId) break;
            if (categoryId && d.parent_id !== categoryId) break;
            if (!prefixes.some(p => (d.name || '').toLowerCase().includes(p.toLowerCase()))) break;
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
            // Auto-greet: moved to MESSAGE_CREATE — triggers on role mention, not channel creation
            // Subscribe to new channel via op14 so we get MESSAGE_CREATE for it
            subscribeToSingleChannel(bot, guildId, d.id);
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
            const author = d.author;
            if (!author) break;
            const isBot = author.bot || false;

            // Cache member from message for members panel (only for the configured guild)
            if (d.member && author && d.guild_id === guildId) {
                bot.guildMembersCache.set(author.id, { ...d.member, user: author });
            }

            // Auto-reply check — runs on ALL guilds, rule.guildId does filtering
            const arExclude = cfg.autoReplyExcludeChannels || ['717735180546343032'];
            if (!isBot && cfg.autoReplies?.length > 0 && !arExclude.includes(d.channel_id)) {
                // Mark as processed to prevent REST polling from double-processing
                if (!bot._arProcessed) bot._arProcessed = new Set();
                bot._arProcessed.add(d.id);
                let matched = false;
                for (const rule of cfg.autoReplies) {
                    if (matchAutoReply(rule, d.content || '', d.channel_id, d.guild_id)) {
                        bot.log(`🤖 Auto-reply matched: "${rule.name}" in guild ${d.guild_id} channel ${d.channel_id}`);
                        matched = true;
                        const replyMsgId = d.id;
                        setTimeout(async () => {
                            try {
                                await bot.sendDiscordMessage(d.channel_id, rule.response, replyMsgId);
                                bot.log(`✅ Auto-reply sent: "${rule.name}"`);
                                // Telegram notification
                                bot.enqueue({ text: `🤖 <b>Авто-ответ отправлен</b>\n\n📋 <b>Правило:</b> ${rule.name}\n👤 <b>Игрок:</b> ${d.author?.username || 'unknown'}\n💬 <b>Сообщение:</b> <i>${(d.content || '').slice(0, 150)}</i>` });
                            } catch (e) {
                                bot.log(`❌ Auto-reply send failed: ${e.message}`);
                            }
                        }, (rule.delay || 2) * 1000);
                        break;
                    }
                }
                // Debug: log when message is checked but no rule matched (only for target guild, limit noise)
                if (!matched && d.guild_id === guildId && !bot._arDebugCount) bot._arDebugCount = 0;
                if (!matched && d.guild_id === guildId && bot._arDebugCount < 5) {
                    bot._arDebugCount++;
                    bot.log(`🔍 AR debug: msg from ${author.username} in #${d.channel_id}: "${(d.content || '').slice(0, 50)}" — ${cfg.autoReplies.length} rules checked, 0 matched`);
                }
            } else if (!isBot && d.guild_id === guildId) {
                if (!bot._arNoRulesLogged) {
                    bot.log(`⚠️ Auto-replies: ${cfg.autoReplies?.length || 0} rules loaded (none active)`);
                    bot._arNoRulesLogged = true;
                }
            }

            // ── Profanity filter — ping @персонал on swear words ──
            let hasProfanity = false;
            if (!isBot && d.guild_id === guildId) {
                const isStaff = isStaffFromMember(d.member, staffRoleIds);
                if (!isStaff) {
                    const msgContent = d.content || '';
                    const profanityResult = containsProfanity(msgContent);
                    if (profanityResult.found) {
                        hasProfanity = true;
                        const cooldownKey = `${d.author?.id}_profanity`;
                        const now = Date.now();
                        if (!_profanityCooldown.has(cooldownKey) || now - _profanityCooldown.get(cooldownKey) > 30000) {
                            _profanityCooldown.set(cooldownKey, now);
                            bot.sendDiscordMessage(d.channel_id, '<@&1086969387103293560>', d.id)
                                .then(() => bot.log(`🚨 Profanity detected from ${author.username}: "${msgContent.slice(0, 50)}" (match: ${profanityResult.match})`))
                                .catch(e => bot.log(`❌ Profanity ping failed: ${e.message}`));
                        }
                    }
                }
            }

            // ── AI handler — forward questions to n8n webhook ──
            // Works on ALL guilds (or only specific ones if neuroGuildIds is set)
            // Excluded channels: 717734206586880060
            const neuroExcludedChannels = ['1451246122755559555'];
            const neuroGuilds = cfg.neuroGuildIds || [];
            const neuroAllowed = neuroGuilds.length === 0 || neuroGuilds.includes(d.guild_id);
            if (!isBot && !hasProfanity && cfg.n8nWebhookUrl && bot.selfUserId && neuroAllowed && !neuroExcludedChannels.includes(d.channel_id)) {
                const content = d.content || '';
                const mentionsMe = content.includes(`<@${bot.selfUserId}>`) || content.includes(`<@!${bot.selfUserId}>`);
                if (mentionsMe) {
                    // Extract question: remove mention
                    let question = content
                        .replace(new RegExp(`<@!?${bot.selfUserId}>`, 'g'), '')
                        .replace(/[,،\s]+/g, ' ')
                        .trim();
                    if (question.length > 0 && !_neuroProcessed.has(d.id)) {
                        _neuroProcessed.add(d.id);
                        setTimeout(() => _neuroProcessed.delete(d.id), 60000); // cleanup after 60s
                        bot.log(`🧠 Neuro AI: question from ${author.username}: "${question.slice(0, 100)}"`);
                        // Fire and forget — n8n handles the response via Discord API
                        (async () => {
                            try {
                                const payload = JSON.stringify({
                                    chatInput: question,
                                    channelId: d.channel_id,
                                    messageId: d.id,
                                    authorId: author.id,
                                    authorUsername: author.username,
                                    guildId: d.guild_id,
                                });
                                const url = new URL(cfg.n8nWebhookUrl);
                                const options = {
                                    hostname: url.hostname,
                                    port: url.port || (url.protocol === 'https:' ? 443 : 80),
                                    path: url.pathname + url.search,
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
                                };
                                const http = url.protocol === 'https:' ? require('https') : require('http');
                                const req = http.request(options, (res) => {
                                    let body = '';
                                    res.on('data', chunk => body += chunk);
                                    res.on('end', () => bot.log(`🧠 Neuro webhook response: ${res.statusCode}`));
                                });
                                req.on('error', e => bot.log(`❌ Neuro webhook error: ${e.message}`));
                                req.write(payload);
                                req.end();
                            } catch (e) {
                                bot.log(`❌ Neuro AI error: ${e.message}`);
                            }
                        })();
                    }
                }
            }

            // Ticket-specific logic — only for the configured guild
            if (d.guild_id !== guildId) break;

            // Auto-greet for ALL channels (when toggle is on)
            if (cfg.autoGreetAllChannels && cfg.autoGreetEnabled && cfg.autoGreetText && isBot) {
                const greetRoles = cfg.autoGreetRoleIds || [];
                const mentionedRoles = d.mention_roles || [];
                const msgContent = d.content || '';
                const contentHasRole = greetRoles.length > 0 && greetRoles.some(r => msgContent.includes(`<@&${r}>`));
                const mentionMatch = mentionedRoles.some(r => greetRoles.includes(r));
                if (greetRoles.length > 0 && (mentionMatch || contentHasRole)) {
                    if (!bot._greetedChannels) bot._greetedChannels = new Set();
                    if (!bot._greetedChannels.has(d.channel_id)) {
                        bot._greetedChannels.add(d.channel_id);
                        const chId = d.channel_id;
                        setTimeout(async () => {
                            try {
                                await bot.sendDiscordMessage(chId, cfg.autoGreetText);
                                bot.log(`👋 Auto-greet sent in channel ${chId} (all-channels mode)`);
                            } catch (e) { bot.log(`❌ Auto-greet error: ${e.message}`); }
                        }, (cfg.autoGreetDelay || 3) * 1000);
                    }
                }
            }

            const record = bot.activeTickets.get(d.channel_id);
            if (!record) break;
            if (bot.sentByBot.has(d.id)) {
                // Still emit to dashboard so self-sent messages update in real-time
                if (bot.io) bot.io.emit('ticket:message', { channelId: d.channel_id, content: d.content });
                return;
            }

            const isStaff = isStaffFromMember(d.member, staffRoleIds);

            // Auto-greet: trigger when bot/system message mentions staff role in this ticket
            if (cfg.autoGreetEnabled && cfg.autoGreetText && isBot) {
                const greetRoles = cfg.autoGreetRoleIds || [];
                const mentionedRoles = d.mention_roles || [];
                const msgContent = d.content || '';
                // Also check content for <@&roleId> format (some bots don't populate mention_roles)
                const contentHasRole = greetRoles.length > 0 && greetRoles.some(r => msgContent.includes(`<@&${r}>`));
                const mentionMatch = mentionedRoles.some(r => greetRoles.includes(r));
                bot.log(`🔍 Auto-greet check: bot=${d.author?.username}, mention_roles=[${mentionedRoles.join(',')}], greetRoles=[${greetRoles.join(',')}], contentMatch=${contentHasRole}, mentionMatch=${mentionMatch}`);
                if (greetRoles.length > 0 && (mentionMatch || contentHasRole)) {
                    if (!bot._greetedChannels) bot._greetedChannels = new Set();
                    if (!bot._greetedChannels.has(d.channel_id)) {
                        bot._greetedChannels.add(d.channel_id);
                        const chId = d.channel_id;
                        setTimeout(async () => {
                            try {
                                await bot.sendDiscordMessage(chId, cfg.autoGreetText);
                                bot.log(`👋 Auto-greet sent in #${record.channelName} (role mention)`);
                            } catch (e) { bot.log(`❌ Auto-greet error: ${e.message}`); }
                        }, (cfg.autoGreetDelay || 3) * 1000);
                    }
                }
            }

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
            }
            // Emit to dashboard for ALL messages (staff, bot, player) — real-time updates
            if (bot.io) bot.io.emit('ticket:message', { channelId: d.channel_id, content: d.content });
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

        case 'GUILD_MEMBER_LIST_UPDATE': {
            // Populate members from op14 (Lazy Request) responses
            if (d.guild_id !== guildId) break;
            if (d.ops) {
                let added = 0;
                for (const op of d.ops) {
                    const items = op.items || (op.item ? [op.item] : []);
                    for (const item of items) {
                        if (item.member && item.member.user) {
                            bot.guildMembersCache.set(item.member.user.id, item.member);
                            if (item.member.presence) {
                                bot.guildPresenceCache.set(item.member.user.id, item.member.presence.status || 'offline');
                            }
                            added++;
                        }
                    }
                }
                if (added > 0) bot.log(`👥 Member list update: ${added} members cached (total: ${bot.guildMembersCache.size})`);
            }
            break;
        }
    }
}

// ── REST-based channel scan (needed for selfbot/user tokens) ──

function scanChannelsList(bot, channels, guildId, guildName, prefixes, categoryId) {
    // Debug: show what filter criteria we're using
    bot.log(`🔍 Scan filter: prefixes=[${prefixes.join(', ')}], categoryId=${categoryId || 'ANY'}`);

    // Debug: show text channels with their parent_ids to help diagnose
    const textChannels = channels.filter(ch => ch.type === 0 || ch.type === 5); // type 0=text, 5=announcement
    const categories = channels.filter(ch => ch.type === 4); // type 4=category
    bot.log(`🔍 Found ${textChannels.length} text channels, ${categories.length} categories`);

    // Show categories to help user find the right ID
    for (const cat of categories) {
        const childCount = textChannels.filter(tc => tc.parent_id === cat.id).length;
        if (childCount > 0) bot.log(`📁 Category: "${cat.name}" (${cat.id}) — ${childCount} channels`);
    }

    let found = 0;
    let skippedCategory = 0;
    let skippedPrefix = 0;

    for (const ch of channels) {
        // Cache all channels
        bot.channelCache.set(ch.id, { ...ch, guild_id: guildId });
        // Skip non-text channels
        if (ch.type !== 0 && ch.type !== 5) continue;

        // Category filter
        if (categoryId && ch.parent_id !== categoryId) { skippedCategory++; continue; }

        // Prefix filter
        const name = (ch.name || '').toLowerCase();
        if (!prefixes.some(p => name.includes(p.toLowerCase()))) {
            skippedPrefix++;
            // Debug: show channels in the right category but wrong prefix
            if (!categoryId || ch.parent_id === categoryId) {
                bot.log(`  ⏭ Skipped (prefix): #${ch.name} (parent: ${ch.parent_id})`);
            }
            continue;
        }

        if (bot.activeTickets.has(ch.id)) continue;
        // Extract opener username from channel name (e.g. тикет-от-ptx2226 → ptx2226)
        const nameMatch = (ch.name || '').match(/тикет-от-(.+)/i);
        const openerUsername = nameMatch ? nameMatch[1] : '';
        bot.activeTickets.set(ch.id, {
            channelId: ch.id, channelName: ch.name, guildId, guildName: guildName || '',
            createdAt: snowflakeToTimestamp(ch.id), firstStaffReplyAt: null,
            openerId: null, openerUsername,
            lastMessage: null, lastMessageAt: null, lastStaffMessageAt: null,
            waitingForReply: false, activityTimerType: null, tgThreadId: null,
        });
        found++;
        bot.log(`🎫 Найден тикет: #${ch.name} (parent: ${ch.parent_id})`);
    }
    bot.markDirty();
    bot.log(`📊 Scan result: ${found} tickets found, ${skippedCategory} skipped by category, ${skippedPrefix} skipped by prefix, total active: ${bot.activeTickets.size}`);

    // Validate persisted tickets — remove stale ones whose channels no longer exist
    const validChannelIds = new Set(channels.filter(c => c.type === 0).map(c => c.id));
    let staleCount = 0;
    for (const [channelId, record] of bot.activeTickets) {
        if (!validChannelIds.has(channelId)) {
            bot.log(`🗑️ Removing stale ticket: #${record.channelName || channelId} (channel no longer exists)`);
            bot.activeTickets.delete(channelId);
            staleCount++;
        }
    }
    if (staleCount > 0) {
        bot.log(`🧹 Cleaned ${staleCount} stale tickets. Active: ${bot.activeTickets.size}`);
        bot.markDirty();
    }
}

async function fetchAndScanChannels(bot) {
    if (bot.destroyed || bot.guildCreateHandled) return;
    const cfg = bot.config;
    const guildId = cfg.guildId;
    const prefixes = getTicketPrefixes(cfg.ticketPrefix);
    const categoryId = cfg.ticketsCategoryId;
    const token = cfg.discordBotToken || cfg.discordToken;

    if (!guildId) { bot.log('⚠️ No guildId configured, cannot fetch channels'); return; }

    bot.log(`🌐 Fetching channels via REST API for guild ${guildId}...`);
    try {
        const res = await bot.httpGet(`https://discord.com/api/v9/guilds/${guildId}/channels`, { Authorization: token });
        if (!res.ok) {
            bot.log(`❌ REST /channels error: ${res.status} — ${res.body?.slice(0, 200)}`);
            return;
        }
        const channels = JSON.parse(res.body);
        bot.log(`🌐 REST: ${channels.length} channels loaded`);
        bot.guildCreateHandled = true;
        scanChannelsList(bot, channels, guildId, '', prefixes, categoryId);
        bot.restoreActivityTimers();
        // Subscribe to ALL ticket channels via op14
        subscribeToTicketChannels(bot);

        // Background: fetch last message for each ticket to populate preview
        (async () => {
            for (const [channelId, record] of bot.activeTickets) {
                if (record.lastMessage) continue; // already has data
                try {
                    const msgRes = await bot.httpGet(
                        `https://discord.com/api/v9/channels/${channelId}/messages?limit=1`,
                        { Authorization: token }
                    );
                    if (msgRes.ok) {
                        const msgs = JSON.parse(msgRes.body);
                        if (msgs.length > 0) {
                            const m = msgs[0];
                            const embedText = m.embeds?.length ? (m.embeds[0].title || m.embeds[0].description || '📎 Вложение') : '📎 Вложение';
                            record.lastMessage = (m.content?.slice(0, 120) || embedText);
                            record.lastMessageAt = new Date(msgs[0].timestamp).getTime();
                        }
                    }
                } catch { }
                await sleep(500);
            }
            bot.markDirty();
            if (bot.io) bot.io.emit('ticket:updated', {});
            bot.log(`📝 Ticket previews loaded`);
        })();
    } catch (e) {
        bot.log(`❌ REST channels error: ${e.message}`);
    }

    // Fetch guild members — use search API (works for user tokens, /members requires bot privilege)
    try {
        // Search with empty query returns members, do multiple letter searches for broader coverage
        const searches = ['', 'a', 'e', 'i', 'o', 'u', 'с', 'а', 'е'];
        const seen = new Set();
        for (const q of searches) {
            try {
                const url = `https://discord.com/api/v9/guilds/${guildId}/members/search?query=${encodeURIComponent(q)}&limit=100`;
                const res = await bot.httpGet(url, { Authorization: token });
                if (res.ok) {
                    const members = JSON.parse(res.body);
                    for (const m of members) { if (m.user && !seen.has(m.user.id)) { seen.add(m.user.id); bot.guildMembersCache.set(m.user.id, m); } }
                }
            } catch { }
            await sleep(300); // rate limit safety
        }
        bot.log(`👥 Members search: ${seen.size} members loaded`);
    } catch (e) { bot.log(`❌ Members fetch error: ${e.message}`); }

    // Fetch guild roles
    try {
        const res = await bot.httpGet(`https://discord.com/api/v9/guilds/${guildId}/roles`, { Authorization: token });
        if (res.ok) {
            const roles = JSON.parse(res.body);
            for (const r of roles) bot.guildRolesCache.set(r.id, r);
            bot.log(`🎭 REST: ${roles.length} roles loaded`);
        }
    } catch (e) { bot.log(`Roles fetch error: ${e.message}`); }

    // Start REST polling for own messages (Gateway doesn't send MESSAGE_CREATE for selfbot's own msgs)
    startAutoReplyPolling(bot);
}

// ── Op14 Lazy Request: subscribe to ticket channels ──────────

function sendLazyRequest(bot, guildId, channelIds) {
    if (!bot.ws || bot.ws.readyState !== 1) return; // OPEN = 1
    if (!channelIds || channelIds.length === 0) return;
    const channels = {};
    for (const chId of channelIds) channels[chId] = [[0, 99]];
    try {
        bot.ws.send(JSON.stringify({
            op: 14,
            d: { guild_id: guildId, typing: true, threads: true, activities: true, members: [], channels }
        }));
        bot.log(`📡 Lazy Request: subscribed to ${channelIds.length} channels`);
    } catch (e) { bot.log(`❌ Lazy Request error: ${e.message}`); }
}

function subscribeToTicketChannels(bot) {
    const guildId = bot.config.guildId;
    if (!guildId) return;
    const ids = [...bot.activeTickets.keys()];
    if (ids.length === 0) return;
    // Send in batches of 100 (Discord limit per op14)
    for (let i = 0; i < ids.length; i += 100) {
        sendLazyRequest(bot, guildId, ids.slice(i, i + 100));
    }
    bot.log(`📡 Subscribed to ${ids.length} ticket channels via op14`);
}

function subscribeToSingleChannel(bot, guildId, channelId) {
    sendLazyRequest(bot, guildId, [channelId]);
}
// REST polling: check auto-reply target channels for new messages every 5s
function startAutoReplyPolling(bot) {
    if (bot._arPollTimer) clearInterval(bot._arPollTimer);
    const cfg = bot.config;
    if (!cfg.autoReplies?.length) return;

    const token = cfg.discordBotToken || cfg.discordToken;
    const guildId = cfg.guildId;
    // Track last seen message ID per channel
    if (!bot._arLastMsgId) bot._arLastMsgId = {};
    // Track messages already processed by MESSAGE_CREATE to avoid duplicates
    if (!bot._arProcessed) bot._arProcessed = new Set();

    // Collect channels to poll: specific channelIds from rules + first few text channels if any rule has no channelId
    const pollChannels = new Set();
    for (const rule of cfg.autoReplies) {
        if (rule.guildId === guildId && rule.channelId) pollChannels.add(rule.channelId);
    }
    const hasAnyChannel = cfg.autoReplies.some(r => r.guildId === guildId && !r.channelId);
    if (hasAnyChannel) {
        let count = 0;
        for (const [chId, ch] of bot.channelCache) {
            if (ch.guild_id === guildId && ch.type === 0 && count < 5) {
                pollChannels.add(chId);
                count++;
            }
        }
    }
    // Always include these channels for auto-replies
    pollChannels.add('1266100282551570522');
    pollChannels.add('1475424153057366036');
    // Exclude this channel from auto-replies
    pollChannels.delete('1451246122755559555');

    if (pollChannels.size === 0) return;
    const channelList = [...pollChannels];
    bot.log(`🔄 Auto-reply polling started: ${channelList.length} channels [${channelList.join(', ')}], every 5s`);

    let pollCycle = 0;
    bot._arPollTimer = setInterval(async () => {
        if (bot.destroyed) { clearInterval(bot._arPollTimer); return; }
        pollCycle++;
        // Poll ALL channels each tick
        for (const channelId of channelList) {
            try {
                const res = await bot.httpGet(
                    `https://discord.com/api/v9/channels/${channelId}/messages?limit=5`,
                    { Authorization: token }
                );
                if (!res.ok) continue;
                const msgs = JSON.parse(res.body);
                if (!msgs.length) continue;

                // Process messages from oldest to newest
                for (let i = msgs.length - 1; i >= 0; i--) {
                    const msg = msgs[i];
                    if (!msg.id || !msg.author) continue;
                    // Skip if already processed (by Gateway MESSAGE_CREATE or previous poll)
                    if (bot._arProcessed.has(msg.id)) continue;
                    // Skip if this message existed before polling started (use snowflake: ID < last known = old)
                    if (bot._arLastMsgId[channelId] && msg.id <= bot._arLastMsgId[channelId]) continue;

                    bot._arProcessed.add(msg.id);
                    if (msg.author.bot) continue;
                    // Skip staff messages — avoid answering staff with auto-replies
                    const arStaffRoles = (Array.isArray(cfg.staffRoleIds) && cfg.staffRoleIds.length > 0) ? cfg.staffRoleIds : ['1475932249017946133', '1475961602619478116'];
                    if (msg.member && msg.member.roles) {
                        if (msg.member.roles.some(r => arStaffRoles.includes(r))) continue;
                    }

                    // Log for debugging
                    if (pollCycle <= 3 || msg.author.username === 'd1reevof') {
                        bot.log(`🔍 Poll: new msg from ${msg.author.username} in #${channelId}: "${(msg.content || '').slice(0, 40)}"`);
                    }

                    // Check auto-replies
                    const ch = bot.channelCache.get(channelId);
                    const msgGuildId = ch?.guild_id || guildId;
                    const arExclude2 = cfg.autoReplyExcludeChannels || ['717735180546343032'];
                    if (arExclude2.includes(channelId)) continue;
                    for (const rule of cfg.autoReplies) {
                        if (matchAutoReply(rule, msg.content || '', channelId, msgGuildId)) {
                            bot.log(`🤖 Auto-reply matched (poll): "${rule.name}" from ${msg.author.username} in #${channelId}`);
                            await sleep((rule.delay || 2) * 1000);
                            try {
                                await bot.sendDiscordMessage(channelId, rule.response, msg.id);
                                bot.log(`✅ Auto-reply sent: "${rule.name}"`);
                                // Telegram notification
                                bot.enqueue({ text: `🤖 <b>Авто-ответ отправлен</b>\n\n📋 <b>Правило:</b> ${rule.name}\n👤 <b>Игрок:</b> ${msg.author?.username || 'unknown'}\n💬 <b>Сообщение:</b> <i>${(msg.content || '').slice(0, 150)}</i>` });
                            } catch (e) {
                                bot.log(`❌ Auto-reply send failed: ${e.message}`);
                            }
                            break;
                        }
                    }
                }

                // Update last seen to newest message
                bot._arLastMsgId[channelId] = msgs[0].id;

                // Keep _arProcessed manageable
                if (bot._arProcessed.size > 200) {
                    const arr = [...bot._arProcessed];
                    bot._arProcessed = new Set(arr.slice(-100));
                }
            } catch (e) {
                if (pollCycle <= 2) bot.log(`⚠️ Poll error ch:${channelId}: ${e.message}`);
            }
        }
    }, 5000);
}

module.exports = { connectGateway, cleanupGateway };
