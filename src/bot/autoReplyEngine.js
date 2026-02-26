const { analyzeAutoReplyRule } = require('./helpers');

const APPEAL_RESPONSE = 'Если Вы считаете блокировку ошибочной, подайте апелляцию:\nhttps://forum.funtime.su/index.php?forums/appeals/\n\nПеред подачей обязательно ознакомьтесь с FAQ:\nhttps://forum.funtime.su/faq_appeals';
const SUPPORT_RESPONSE = 'Обратитесь в поддержку: https://vk.com/funtime';

function hasHelpQuestionIntent(text) {
    const t = String(text || '');
    if (!t) return false;
    if (t.includes('?')) return true;
    return /(что делать|что мне делать|как быть|как быть\?|как же|что делать если|куда писать|куда обращаться|куда идти|подскаж|помог|почему|за что|как обжал|обжал|оспор|кто поможет|что теперь|как дальше)/.test(t);
}

function analyzeModerationCheck(content) {
    const text = String(content || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!text) return { matched: false, reason: 'empty', keywords: [], confidence: 0 };

    const looksLikeAnnouncement = /(проходит набор|набор в|критери|pvp\s*0\/10|pve\s*0\/10|привилеги|имя\(настоящее\)|играли когда то с софтами|готовы ли пройти проверку)/.test(text);
    if (looksLikeAnnouncement) {
        return { matched: false, reason: 'announcement_template', keywords: [], confidence: 0 };
    }

    const hasCheckContext = /(проверк|проверяющ|прова|прове|прову|анидеск|anydesk|аник|ани деск)/.test(text);
    const hasModeratorWord = /(модер|модерат)/.test(text);
    const hasWaitOrIgnore = /(игнор|не отвечает|не кидает|не делают|не делает|жду|долго|нет ответа|молчит|пропал|не пишет|ничего не делает|вызвали на пров|вызвали на провер)/.test(text);
    const hasBanContext = /(бан|забан|откин|блок|разбан|розбан)/.test(text);
    const hasPersonalContext = /(^|\s)(я|меня|мне|мной|у меня|мой|моя|мои|мою|вызвали)(\s|$)/.test(text);
    const hasSignal = hasWaitOrIgnore || (hasHelpQuestionIntent(text) && hasPersonalContext);

    if (!(hasCheckContext || (hasModeratorWord && hasWaitOrIgnore))) {
        return { matched: false, reason: 'no_moderation_context', keywords: [], confidence: 0 };
    }

    if (!hasSignal) {
        return { matched: false, reason: 'no_help_signal', keywords: [], confidence: 0 };
    }

    const keywords = [];
    if (hasCheckContext) keywords.push('проверка/анидеск');
    if (hasModeratorWord) keywords.push('модератор');
    if (hasWaitOrIgnore) keywords.push('игнор/ожидание');
    if (hasPersonalContext) keywords.push('личный контекст');
    if (hasBanContext) keywords.push('бан/блок');

    let confidence = 0.55;
    if (hasCheckContext) confidence += 0.15;
    if (hasWaitOrIgnore) confidence += 0.15;
    if (hasPersonalContext) confidence += 0.08;
    if (hasModeratorWord) confidence += 0.06;
    if (hasBanContext) confidence += 0.06;
    confidence = Math.min(confidence, 0.99);

    return {
        matched: true,
        reason: hasBanContext ? 'moderation_issue_ban_context' : 'moderation_issue_support_context',
        keywords,
        confidence,
        response: hasBanContext ? APPEAL_RESPONSE : SUPPORT_RESPONSE,
    };
}

function getBanAppealOverrideResponse(rule, content) {
    const ruleName = String(rule?.name || '').toLowerCase();
    if (!ruleName.includes('ошибоч') || !ruleName.includes('бан')) return null;

    const text = String(content || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!text) return null;

    const hasUnban = /(разбан|розбан)/.test(text);
    const hasPurchase = /(куп|покуп|оплат|донат|стоим|цена|4[.,]13|5000|5к)/.test(text);
    if (hasUnban && hasPurchase) return SUPPORT_RESPONSE;
    return null;
}

function shouldSkipBanAppealAutoReply(rule, content) {
    const ruleName = String(rule?.name || '').toLowerCase();
    if (!ruleName.includes('ошибоч') || !ruleName.includes('бан')) return false;

    const text = String(content || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!text) return false;

    const hasUnban = /(разбан|розбан)/.test(text);
    const hasPurchase = /(куп|покуп|оплат|донат|стоим|цена|4[.,]13|5000|5к)/.test(text);
    if (hasUnban && hasPurchase) return true;

    const isSimpleMentionRule = ruleName.includes('простое упоминание');
    if (isSimpleMentionRule) return true;
    if (!hasHelpQuestionIntent(text)) return true;
    return false;
}

function evaluateAutoReplyDecision({ rules = [], content = '', channelId = '', guildId = '', source = 'gateway' }) {
    const moderation = analyzeModerationCheck(content);
    if (moderation.matched) {
        return {
            action: 'send',
            source,
            ruleId: 'moderation_check',
            ruleName: 'проверка/модерация',
            response: moderation.response,
            reason: moderation.reason,
            keywords: moderation.keywords,
            confidence: moderation.confidence,
            checkedRules: 0,
        };
    }

    let checkedRules = 0;
    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        checkedRules++;
        const match = analyzeAutoReplyRule(rule, content, channelId, guildId);
        if (!match.matched) continue;

        const overrideResponse = getBanAppealOverrideResponse(rule, content);
        if (overrideResponse) {
            return {
                action: 'send',
                source,
                ruleId: rule.id || `rule_${i + 1}`,
                ruleName: rule.name || `Правило ${i + 1}`,
                response: overrideResponse,
                reason: 'ban_appeal_override_to_support',
                keywords: match.matchedKeywords || [],
                confidence: Math.max(match.confidence || 0, 0.7),
                checkedRules,
            };
        }

        if (shouldSkipBanAppealAutoReply(rule, content)) {
            continue;
        }

        return {
            action: 'send',
            source,
            ruleId: rule.id || `rule_${i + 1}`,
            ruleName: rule.name || `Правило ${i + 1}`,
            response: rule.response || '',
            reason: match.reason || 'rule_match',
            keywords: match.matchedKeywords || [],
            confidence: match.confidence || 0.6,
            checkedRules,
        };
    }

    return {
        action: 'none',
        source,
        ruleId: null,
        ruleName: null,
        response: null,
        reason: 'no_rule_matched',
        keywords: [],
        confidence: 0,
        checkedRules,
    };
}

module.exports = {
    APPEAL_RESPONSE,
    SUPPORT_RESPONSE,
    analyzeModerationCheck,
    getBanAppealOverrideResponse,
    shouldSkipBanAppealAutoReply,
    evaluateAutoReplyDecision,
};
