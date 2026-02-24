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
    if (!rule.enabled) return false;
    if (rule.guildId && rule.guildId !== guildId) return false;
    if (rule.channelId && rule.channelId !== channelId) return false;
    const text = content.toLowerCase();

    // Exclude check
    if (rule.excludeAny && rule.excludeAny.some(e => text.includes(e.toLowerCase()))) return false;

    // Include check
    if (rule.includeAny && rule.includeAny.some(k => text.includes(k.toLowerCase()))) return true;
    if (rule.includeAll) {
        return rule.includeAll.every(group => {
            if (Array.isArray(group)) return group.some(k => text.includes(k.toLowerCase()));
            return text.includes(String(group).toLowerCase());
        });
    }
    return false;
}

module.exports = {
    escapeHtml, truncate, formatDuration, nowTime, formatDateTime,
    channelLink, sleep, getPriority, getTicketPrefixes, isStaffFromMember,
    isClosingPhrase, getMemberDisplayName, snowflakeToTimestamp, slaEmoji,
    getKyivDate, getKyivHour, getKyivMinute, formatKyivDate, getKyivNow, msUntilKyivHour,
    matchAutoReply, SHIFT_TZ,
};
