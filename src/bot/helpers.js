// ═══════════════════════════════════════════════════════════════
//  Bot Helpers — Pure utility functions
// ═══════════════════════════════════════════════════════════════

function escapeHtml(t) { return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function truncate(t, max) { return t.length <= max ? t : t.slice(0, max).trimEnd() + '…'; }

function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}с`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}м ${s % 60}с`;
    const h = Math.floor(m / 60);
    return `${h}ч ${m % 60}м`;
}

function nowTime() {
    return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(ts) {
    return new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function channelLink(guildId, channelId) {
    return `https://discord.com/channels/${guildId}/${channelId}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getPriority(name, content, keywords) {
    const haystack = (name + ' ' + content).toLowerCase();
    const defaultKw = ['срочно', 'urgent', 'баг', 'bug', 'оплата', 'payment', 'помогите', 'help'];
    const kw = Array.isArray(keywords) && keywords.length > 0 ? keywords : defaultKw;
    if (kw.some(k => haystack.includes(String(k).toLowerCase()))) {
        return { emoji: '🔴', badge: 'ВЫСОКИЙ ⚡', high: true };
    }
    return { emoji: '🟢', badge: 'обычный', high: false };
}

function getTicketPrefixes(prefix) {
    return (prefix || 'тикет-от').split(',').map(p => p.trim()).filter(Boolean);
}

function isStaffFromMember(member, staffRoleIds) {
    if (!member?.roles) return false;
    return member.roles.some(r => (staffRoleIds || []).includes(r));
}

function isClosingPhrase(content, phrase) {
    const phrases = (phrase || 'остались вопросы').split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
    const text = content.toLowerCase();
    return phrases.some(p => text.includes(p));
}

function getMemberDisplayName(member, author) {
    if (member?.nick) return member.nick;
    if (author?.global_name) return author.global_name;
    return author?.username || 'Неизвестно';
}

function snowflakeToTimestamp(id) {
    return Number(BigInt(id) >> 22n) + 1420070400000;
}

function slaEmoji(record) {
    if (record.firstStaffReplyAt !== null) return '✅';
    const age = Date.now() - record.createdAt;
    if (age < 30 * 60 * 1000) return '🟢';
    if (age < 2 * 60 * 60 * 1000) return '🟡';
    return '🔴';
}

// Kyiv timezone helpers
const SHIFT_TZ = 'Europe/Kyiv';
function getKyivDate() { return new Date().toLocaleDateString('sv-SE', { timeZone: SHIFT_TZ }); }
function getKyivHour() { return parseInt(new Date().toLocaleString('en-US', { timeZone: SHIFT_TZ, hour: 'numeric', hour12: false }), 10); }
function getKyivMinute() { return parseInt(new Date().toLocaleString('en-US', { timeZone: SHIFT_TZ, minute: 'numeric' }), 10); }
function formatKyivDate() { return new Date().toLocaleDateString('ru-RU', { timeZone: SHIFT_TZ, day: '2-digit', month: '2-digit', year: 'numeric' }); }
function getKyivNow() { return new Date(new Date().toLocaleString('en-US', { timeZone: SHIFT_TZ })); }
function msUntilKyivHour(targetHour, targetMinute = 0) {
    const kyivNow = getKyivNow();
    const target = new Date(kyivNow);
    target.setHours(targetHour, targetMinute, 0, 0);
    let ms = target.getTime() - kyivNow.getTime();
    if (ms < 0) ms += 24 * 60 * 60 * 1000;
    return ms;
}

// Auto-reply matching
function matchAutoReply(rule, content, channelId, guildId) {
    return analyzeAutoReplyRule(rule, content, channelId, guildId).matched;
}

function analyzeAutoReplyRule(rule, content, channelId, guildId) {
    const text = String(content || '').toLowerCase();
    const ruleGuildId = String(rule?.guildId || '');
    const ruleChannelId = String(rule?.channelId || '');
    const currentGuildId = String(guildId || '');
    const currentChannelId = String(channelId || '');

    if (!rule.enabled) {
        return {
            matched: false,
            reason: 'disabled',
            matchedKeywords: [],
            confidence: 0,
        };
    }

    if (ruleGuildId && ruleGuildId !== currentGuildId) {
        return {
            matched: false,
            reason: 'guild_mismatch',
            matchedKeywords: [],
            confidence: 0,
        };
    }

    if (ruleChannelId && ruleChannelId !== currentChannelId) {
        return {
            matched: false,
            reason: 'channel_mismatch',
            matchedKeywords: [],
            confidence: 0,
        };
    }

    // Exclude check
    const excludeAny = Array.isArray(rule.excludeAny) ? rule.excludeAny : [];
    const excludedKeywords = excludeAny.filter(e => text.includes(String(e).toLowerCase()));
    if (excludedKeywords.length > 0) {
        return {
            matched: false,
            reason: 'excluded',
            matchedKeywords: excludedKeywords,
            confidence: 0.1,
        };
    }

    // Include check
    const includeAny = Array.isArray(rule.includeAny) ? rule.includeAny : [];
    const includeAnyMatches = includeAny.filter(k => text.includes(String(k).toLowerCase()));
    if (includeAnyMatches.length > 0) {
        return {
            matched: true,
            reason: 'include_any',
            matchedKeywords: includeAnyMatches,
            confidence: Math.min(0.7 + includeAnyMatches.length * 0.1, 0.98),
        };
    }

    if (rule.includeAll) {
        const includeAll = Array.isArray(rule.includeAll) ? rule.includeAll : [];
        const matchedIncludeAll = [];
        const allGroupsMatched = includeAll.every(group => {
            if (Array.isArray(group)) {
                const localMatches = group.filter(k => text.includes(String(k).toLowerCase()));
                if (localMatches.length > 0) {
                    matchedIncludeAll.push(...localMatches);
                    return true;
                }
                return false;
            }
            const token = String(group || '');
            if (text.includes(token.toLowerCase())) {
                matchedIncludeAll.push(token);
                return true;
            }
            return false;
        });
        if (allGroupsMatched && includeAll.length > 0) {
            return {
                matched: true,
                reason: 'include_all',
                matchedKeywords: matchedIncludeAll,
                confidence: Math.min(0.75 + matchedIncludeAll.length * 0.06, 0.99),
            };
        }
        return {
            matched: false,
            reason: 'include_miss',
            matchedKeywords: matchedIncludeAll,
            confidence: 0,
        };
    }

    return {
        matched: false,
        reason: 'no_include_rules',
        matchedKeywords: [],
        confidence: 0,
    };
}

module.exports = {
    escapeHtml, truncate, formatDuration, nowTime, formatDateTime,
    channelLink, sleep, getPriority, getTicketPrefixes, isStaffFromMember,
    isClosingPhrase, getMemberDisplayName, snowflakeToTimestamp, slaEmoji,
    getKyivDate, getKyivHour, getKyivMinute, formatKyivDate, getKyivNow, msUntilKyivHour,
    matchAutoReply, analyzeAutoReplyRule, SHIFT_TZ,
};
