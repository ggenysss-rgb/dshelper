const fs = require('fs');
const path = require('path');

const CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_SNIPPET_CHARS = 420;
const DEFAULT_FALLBACK_URL = 'https://vk.com/funtime';

const ALLOWED_URL_PREFIXES = [
    'https://www.youtube.com/@mc_funtime',
    'https://forum.funtime.su',
    'https://vk.com/funtime',
    'https://t.me/FunAuthBot',
    'https://funtime.su',
    'https://funtime.me',
    'https://forum.funtime.su/index.php?forums/appeals/',
    'https://forum.funtime.su/faq_appeals',
    'https://forum.funtime.su/complaint',
    'https://forum.funtime.su/modifications',
    'https://forum.funtime.su/categories12',
    'https://forms.gle/tLHyXzr9XzMjzwbo9',
    'http://vk.com/staff_funtime',
].map(normalizeUrl);

const STOP_TOKENS = new Set([
    'и', 'в', 'во', 'на', 'по', 'за', 'под', 'при', 'из', 'к', 'у', 'о', 'об',
    'для', 'что', 'это', 'как', 'или', 'а', 'но', 'не', 'да', 'нет', 'ли',
    'если', 'то', 'я', 'ты', 'вы', 'он', 'она', 'мы', 'они', 'мой', 'моя',
    'твой', 'ваш', 'его', 'ее', 'их', 'с', 'со', 'от', 'до', 'же', 'бы',
    'the', 'and', 'for', 'with', 'that', 'this', 'you', 'your', 'are', 'not',
]);

let docsCache = {
    key: '',
    docs: [],
    builtAt: 0,
};

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/<@!?\d+>/g, ' ')
        .replace(/[`*_~>|()[\]{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(value) {
    const normalized = normalizeText(value);
    const tokens = normalized.match(/[a-zа-яё0-9_]+/giu) || [];
    return tokens.filter(t => t.length > 1 && !STOP_TOKENS.has(t));
}

function unique(values) {
    return [...new Set(values)];
}

function simpleHash(value) {
    const text = String(value || '');
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
    }
    return String(hash >>> 0);
}

function normalizeUrl(url) {
    return String(url || '')
        .trim()
        .replace(/[),.;!?]+$/g, '')
        .toLowerCase();
}

function isAllowedUrl(url) {
    const normalized = normalizeUrl(url);
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) return true;
    return ALLOWED_URL_PREFIXES.some(prefix =>
        normalized === prefix
        || normalized.startsWith(`${prefix}/`)
        || normalized.startsWith(`${prefix}?`)
    );
}

function splitTrailingPunctuation(url) {
    const match = String(url || '').match(/^(.*?)([),.;!?]+)?$/);
    return {
        clean: match?.[1] || String(url || ''),
        suffix: match?.[2] || '',
    };
}

function sanitizeResponseLinks(text, fallbackUrl = DEFAULT_FALLBACK_URL) {
    const blockedUrls = [];
    let replacedCount = 0;

    const sanitized = String(text || '').replace(/https?:\/\/[^\s<>"'\]\)]+[^\s<>"'\]\),.;!?]?/gi, (raw) => {
        const { clean, suffix } = splitTrailingPunctuation(raw);
        if (isAllowedUrl(clean)) return `${clean}${suffix}`;
        replacedCount++;
        blockedUrls.push(clean);
        return `${fallbackUrl}${suffix}`;
    });

    return { text: sanitized, replacedCount, blockedUrls };
}

function clipSnippet(value, maxChars = MAX_SNIPPET_CHARS) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

function createDoc({ source, text, weight = 1, hints = [] }) {
    const body = clipSnippet(text);
    const tokenSet = new Set(unique([
        ...tokenize(body),
        ...tokenize(hints.join(' ')),
    ]));
    return {
        source,
        text: body,
        normalized: normalizeText(body),
        tokenSet,
        tokenCount: tokenSet.size,
        weight: Number(weight) || 1,
    };
}

function safeReadJson(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function flattenIncludeAll(includeAll) {
    if (!Array.isArray(includeAll)) return [];
    const out = [];
    for (const group of includeAll) {
        if (Array.isArray(group)) {
            for (const token of group) out.push(String(token || '').trim());
        } else {
            out.push(String(group || '').trim());
        }
    }
    return out.filter(Boolean);
}

function buildDocs(dataDir, config) {
    const docs = [];

    const binds = config?.binds || {};
    for (const [key, bind] of Object.entries(binds)) {
        const message = bind?.message || '';
        if (!message) continue;
        docs.push(createDoc({
            source: `bind:${key}`,
            text: `Быстрый ответ /${key}: ${message}`,
            weight: 1.2,
            hints: [key],
        }));
    }

    const autoReplies = Array.isArray(config?.autoReplies) ? config.autoReplies : [];
    for (let i = 0; i < autoReplies.length; i++) {
        const rule = autoReplies[i];
        if (!rule || !rule.response) continue;
        const includeAny = Array.isArray(rule.includeAny) ? rule.includeAny : [];
        const includeAll = flattenIncludeAll(rule.includeAll);
        const triggerHints = unique([...includeAny, ...includeAll]).filter(Boolean);
        const triggersLine = triggerHints.length > 0 ? ` Триггеры: ${triggerHints.join(', ')}.` : '';
        docs.push(createDoc({
            source: `rule:${rule.name || `rule_${i + 1}`}`,
            text: `Правило "${rule.name || `rule_${i + 1}`}".${triggersLine} Ответ: ${rule.response}`,
            weight: 1.1,
            hints: triggerHints,
        }));
    }

    const knowledgePath = path.join(dataDir, 'learned_knowledge.json');
    const knowledge = safeReadJson(knowledgePath);
    if (Array.isArray(knowledge)) {
        for (const item of knowledge) {
            if (!item || typeof item !== 'object') continue;
            if (item.type === 'qa' && item.question && item.answer) {
                docs.push(createDoc({
                    source: 'knowledge:qa',
                    text: `Вопрос: ${item.question} Ответ: ${item.answer}`,
                    weight: 1,
                    hints: [item.question],
                }));
                continue;
            }
            if (item.type === 'fact' && item.content) {
                docs.push(createDoc({
                    source: 'knowledge:fact',
                    text: item.content,
                    weight: 0.9,
                }));
            }
        }
    }

    return docs;
}

function getKnowledgeCacheKey(dataDir, config) {
    const knowledgePath = path.join(dataDir, 'learned_knowledge.json');
    let knowledgeMtime = 0;
    try {
        if (fs.existsSync(knowledgePath)) {
            knowledgeMtime = fs.statSync(knowledgePath).mtimeMs || 0;
        }
    } catch {
        knowledgeMtime = 0;
    }

    const bindsHash = simpleHash(JSON.stringify(config?.binds || {}));
    const autoRepliesHash = simpleHash(JSON.stringify(config?.autoReplies || []));
    return `${knowledgeMtime}:${bindsHash}:${autoRepliesHash}`;
}

function getKnowledgeDocs(dataDir, config) {
    const now = Date.now();
    const cacheKey = getKnowledgeCacheKey(dataDir, config);
    const cacheFresh = (now - docsCache.builtAt) < CACHE_TTL_MS;
    if (cacheFresh && docsCache.key === cacheKey) return docsCache.docs;

    const docs = buildDocs(dataDir, config);
    docsCache = {
        key: cacheKey,
        docs,
        builtAt: now,
    };
    return docs;
}

function scoreDoc(doc, queryTokens, normalizedQuery) {
    if (!doc || !doc.tokenSet || queryTokens.length === 0) return 0;
    let overlap = 0;
    for (const token of queryTokens) {
        if (doc.tokenSet.has(token)) overlap++;
    }

    const hasPhrase = normalizedQuery.length >= 4 && doc.normalized.includes(normalizedQuery);
    if (overlap === 0 && !hasPhrase) return 0;

    let score = overlap * 3;
    if (hasPhrase) score += 8;
    score *= doc.weight;
    score /= (1 + Math.log(1 + Math.max(1, doc.tokenCount)));
    return score;
}

function retrieveTopDocs({ query, dataDir, config, topK = 6 }) {
    const normalizedQuery = normalizeText(query);
    const queryTokens = unique(tokenize(normalizedQuery));
    if (!normalizedQuery || queryTokens.length === 0) return [];

    const docs = getKnowledgeDocs(dataDir, config);
    if (!Array.isArray(docs) || docs.length === 0) return [];

    const scored = [];
    for (const doc of docs) {
        const score = scoreDoc(doc, queryTokens, normalizedQuery);
        if (score <= 0) continue;
        scored.push({ ...doc, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.max(1, topK));
}

function buildRagContextMessage({
    query = '',
    dataDir = '',
    config = {},
    topK = 6,
    maxContextChars = 2600,
} = {}) {
    const hits = retrieveTopDocs({ query, dataDir, config, topK });
    if (hits.length === 0) {
        return { message: '', snippetCount: 0, sources: [] };
    }

    const lines = [
        'РЕЛЕВАНТНЫЙ КОНТЕКСТ (RAG):',
        'Используй факты и ссылки только из пунктов ниже. Если фактов не хватает, задай уточняющий вопрос.',
    ];

    let usedChars = lines.join('\n').length;
    let snippetCount = 0;
    const usedSources = [];

    for (let i = 0; i < hits.length; i++) {
        const hit = hits[i];
        const line = `#${i + 1} [${hit.source}] ${hit.text}`;
        if (usedChars + line.length + 1 > maxContextChars) break;
        lines.push(line);
        usedChars += line.length + 1;
        snippetCount++;
        usedSources.push(hit.source);
    }

    if (snippetCount === 0) {
        return { message: '', snippetCount: 0, sources: [] };
    }

    return {
        message: lines.join('\n'),
        snippetCount,
        sources: unique(usedSources),
    };
}

module.exports = {
    buildRagContextMessage,
    sanitizeResponseLinks,
    DEFAULT_FALLBACK_URL,
};
