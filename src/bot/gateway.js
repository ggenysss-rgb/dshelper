// ═══════════════════════════════════════════════════════════════
//  Discord Gateway — WebSocket connection and event handling
// ═══════════════════════════════════════════════════════════════
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { sleep, escapeHtml, getTicketPrefixes, isStaffFromMember, isClosingPhrase, snowflakeToTimestamp } = require('./helpers');
const { buildTicketCreatedMessage, buildFirstMessageNotification, buildTicketClosedMessage, buildHighPriorityAlert, buildForwardedMessage } = require('./builders');
const { containsProfanity } = require('./profanityFilter');
const ConversationLogger = require('./conversationLogger');
const { evaluateAutoReplyDecision } = require('./autoReplyEngine');
const { buildRagContextMessage, sanitizeResponseLinks } = require('./ragEngine');

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=9&encoding=json';
const RESUMABLE_CODES = [4000, 4001, 4002, 4003, 4005, 4007, 4009];

// Dedup set: prevents duplicate Neuro responses when multiple bot instances share the same token
const _neuroProcessed = new Set();

// Profanity cooldown: prevents spamming staff pings for the same user
const _profanityCooldown = new Map();

// Cache for loaded system prompt
let _cachedSystemPrompt = null;
let _promptLoadedAt = 0;
// Resolve persistent data dir (Railway volume or local)
const _dataDir = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', '..', 'data'));

function loadSystemPrompt() {
    // Reload prompt every 5 minutes to pick up changes
    if (_cachedSystemPrompt && Date.now() - _promptLoadedAt < 300000) return _cachedSystemPrompt;
    try {
        // Base prompt from repo
        const promptPath = path.join(__dirname, '..', '..', 'neuro_style_prompt.txt');
        let prompt = fs.readFileSync(promptPath, 'utf8');

        // Large knowledge is injected via retrieval (RAG) at request-time, not appended entirely.
        const knowledgePath = path.join(_dataDir, 'learned_knowledge.json');
        if (fs.existsSync(knowledgePath)) {
            try {
                const knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));
                const count = Array.isArray(knowledge) ? knowledge.length : 0;
                if (count > 0) {
                    prompt += `\n\n[СИСТЕМА] Дополнительные знания (${count} записей) подаются через RAG-контекст.`;
                }
            } catch (e) {
                console.log(`[Neuro] Failed to parse learned_knowledge.json: ${e.message}`);
            }
        }

        // Auto-migrate old extra_examples.txt if it exists and knowledge file doesn't
        const oldExtraPath = path.join(_dataDir, 'extra_examples.txt');
        if (fs.existsSync(oldExtraPath) && !fs.existsSync(knowledgePath)) {
            try {
                const oldContent = fs.readFileSync(oldExtraPath, 'utf8');
                const lines = oldContent.split('\n').filter(l => l.trim().startsWith('- "'));
                const migrated = lines.map(l => {
                    const match = l.match(/^- "(.+)"$/);
                    return match ? { type: 'fact', content: match[1].replace(/\\"/g, '"'), ts: new Date().toISOString() } : null;
                }).filter(Boolean);
                if (migrated.length > 0) {
                    fs.writeFileSync(knowledgePath, JSON.stringify(migrated, null, 2), 'utf8');
                    console.log(`[Neuro] Migrated ${migrated.length} examples from extra_examples.txt to learned_knowledge.json`);
                }
            } catch (e) {
                console.log(`[Neuro] Migration error: ${e.message}`);
            }
        }

        _cachedSystemPrompt = prompt;
        _promptLoadedAt = Date.now();
    } catch (e) {
        console.log(`[Neuro] Failed to load prompt: ${e.message}`);
        _cachedSystemPrompt = '';
    }
    return _cachedSystemPrompt;
}

// Save a learning entry to learned_knowledge.json
function saveLearning(bot, entry) {
    try {
        const knowledgePath = path.join(_dataDir, 'learned_knowledge.json');
        let knowledge = [];
        if (fs.existsSync(knowledgePath)) {
            try { knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf8')); } catch (e) { knowledge = []; }
        }
        // Dedup: check if exact same content/answer already exists
        const isDuplicate = entry.type === 'qa'
            ? knowledge.some(k => k.type === 'qa' && k.answer === entry.answer && k.question === entry.question)
            : knowledge.some(k => k.type === 'fact' && k.content === entry.content);
        if (isDuplicate) return false;
        entry.ts = new Date().toISOString();
        knowledge.push(entry);
        fs.writeFileSync(knowledgePath, JSON.stringify(knowledge, null, 2), 'utf8');
        _promptLoadedAt = 0; // Force prompt reload
        return true;
    } catch (e) {
        bot.log(`⚠️ Failed to save learning: ${e.message}`);
        return false;
    }
}

const NEURO_ACK_PHRASES = new Set([
    'ок', 'ok', 'окей', 'okay', 'хорошо', 'понял', 'поняла', 'пон', 'понятно',
    'ясно', 'угу', 'ага', 'спасибо', 'спс', 'благодарю', 'принял', 'принято',
    'ладно', 'бывает', 'норм', 'нормально', 'ок спс', 'ок спасибо', 'хорошо спасибо',
]);

const NEURO_ACK_TOKENS = new Set([
    'ок', 'ok', 'окей', 'okay', 'пон', 'понял', 'поняла', 'ясно', 'угу', 'ага', 'спс',
    'спасибо', 'благодарю', 'ладно', 'принял', 'принято', 'норм',
]);

function normalizeNeuroInput(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/<@!?\d+>/g, ' ')
        .replace(/[`*_~>|()[\]{}]/g, ' ')
        .replace(/[.,!?;:/\\'"`+-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function shouldSkipNeuroQuestion(question) {
    const raw = String(question || '');
    const normalized = normalizeNeuroInput(raw);
    if (!normalized) return true;
    if (NEURO_ACK_PHRASES.has(normalized)) return true;

    const tokens = normalized.split(' ').filter(Boolean);
    if (tokens.length > 0 && tokens.length <= 2 && tokens.every(t => NEURO_ACK_TOKENS.has(t))) return true;

    // Tiny non-question messages (e.g. "ок", "да", ".") should not trigger AI.
    if (!raw.includes('?') && tokens.length <= 1 && normalized.length <= 3) return true;
    return false;
}

function getBuiltInNeuroReply(question) {
    const normalized = normalizeNeuroInput(question);
    if (!normalized) return '';

    const hasSiteKeyword = /\bсайт(а|ом|у|е)?\b/.test(normalized) || /\bfuntime\s*(su|me)\b/.test(normalized);
    if (hasSiteKeyword) {
        return 'Что именно не работает?\nfuntime.su\nfuntime.me';
    }

    return '';
}

function getDirectNeuroDecision({ question = '', cfg = {}, channelId = '', guildId = '' } = {}) {
    const builtInReply = getBuiltInNeuroReply(question);
    if (builtInReply) {
        return { response: builtInReply, source: 'builtin:site' };
    }

    const decision = evaluateAutoReplyDecision({
        rules: cfg.autoReplies || [],
        content: question,
        channelId: channelId || '',
        guildId: guildId || '',
        source: 'ai_intent',
    });
    if (decision.action === 'send' && decision.response) {
        return {
            response: decision.response,
            source: `rule:${decision.ruleName || decision.ruleId || 'auto'}`,
        };
    }

    return null;
}

const DEFAULT_OPENROUTER_MODELS = [
    'stepfun/step-3.5-flash:free',
    'qwen/qwen3-32b:free',
    'meta-llama/llama-3.3-70b-instruct:free',
];
const DEFAULT_GROQ_MODELS = [
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
];
const DEFAULT_GEMINI_MODELS = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro-latest',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
];
const DEFAULT_GEMINI_API_VERSIONS = ['v1beta', 'v1'];
const GEMINI_MODEL_CACHE_TTL_MS = 10 * 60 * 1000;
const _geminiModelCache = new Map();

function splitKeyList(raw) {
    return String(raw || '')
        .split(/[\n,]/g)
        .map(v => v.trim())
        .filter(Boolean);
}

function normalizeAiProviderName(provider) {
    const p = String(provider || '').trim().toLowerCase();
    if (!p) return '';
    if (p === 'or' || p === 'openrouter') return 'openrouter';
    if (p === 'groq' || p === 'qroq') return 'groq';
    if (p === 'gemini' || p === 'google' || p === 'googleai') return 'gemini';
    return '';
}

function detectAiProviderByKey(key) {
    const k = String(key || '').trim();
    if (!k) return '';
    if (k.startsWith('sk-or-')) return 'openrouter';
    if (k.startsWith('gsk_')) return 'groq';
    if (/^AIza[0-9A-Za-z\-_]{20,}/.test(k)) return 'gemini';
    return 'openrouter';
}

function parseAiCredential(input, forcedProvider = '') {
    const raw = String(input || '').trim();
    if (!raw) return null;

    if (raw.startsWith('{') && raw.endsWith('}')) {
        try {
            const obj = JSON.parse(raw);
            const provider = normalizeAiProviderName(obj.provider || forcedProvider || '');
            const key = String(obj.key || obj.apiKey || obj.token || '').trim();
            if (!provider || !key) return null;
            return { provider, key };
        } catch {
            return null;
        }
    }

    const prefixed = raw.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.+)$/);
    if (prefixed) {
        const provider = normalizeAiProviderName(prefixed[1]);
        const key = String(prefixed[2] || '').trim();
        if (provider && key) return { provider, key };
    }

    const provider = normalizeAiProviderName(forcedProvider) || detectAiProviderByKey(raw);
    if (!provider) return null;
    return { provider, key: raw };
}

function getAiCredentials(cfg) {
    const configuredRaw = Array.isArray(cfg?.geminiApiKeys)
        ? cfg.geminiApiKeys
        : (typeof cfg?.geminiApiKeys === 'string' ? splitKeyList(cfg.geminiApiKeys) : (cfg?.geminiApiKeys ? [cfg.geminiApiKeys] : []));

    const entries = [];
    const pushCred = (cred) => {
        if (!cred || !cred.provider || !cred.key) return;
        entries.push(cred);
    };

    for (const item of configuredRaw) {
        const cred = parseAiCredential(item);
        pushCred(cred);
    }

    for (const k of splitKeyList(process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || '')) {
        pushCred(parseAiCredential(k, 'openrouter'));
    }
    for (const k of splitKeyList(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '')) {
        pushCred(parseAiCredential(k, 'groq'));
    }
    for (const k of splitKeyList(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')) {
        pushCred(parseAiCredential(k, 'gemini'));
    }

    const uniq = [];
    const seen = new Set();
    for (const cred of entries) {
        const sig = `${cred.provider}:${cred.key}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        uniq.push(cred);
    }
    return uniq;
}

function getProviderModels(envName, fallback) {
    const fromEnv = splitKeyList(process.env[envName] || '');
    return fromEnv.length > 0 ? fromEnv : fallback;
}

function getProviderApiVersions(envName, fallback) {
    const fromEnv = splitKeyList(process.env[envName] || '')
        .map(v => v.replace(/^\/+|\/+$/g, '').trim())
        .filter(Boolean);
    return fromEnv.length > 0 ? fromEnv : fallback;
}

function parseProviderBody(body) {
    try { return JSON.parse(body || '{}'); } catch { return {}; }
}

function getOpenAiStyleAnswer(data) {
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
        return content.map(part => (typeof part === 'string' ? part : part?.text || '')).join('\n').trim();
    }
    return '';
}

function getGeminiAnswer(data) {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return '';
    return parts.map(p => String(p?.text || '')).join('\n').trim();
}

function normalizeGeminiModelName(name) {
    return String(name || '').replace(/^models\//, '').trim();
}

function supportsGeminiGenerateContent(modelInfo) {
    const methods = Array.isArray(modelInfo?.supportedGenerationMethods)
        ? modelInfo.supportedGenerationMethods
        : [];
    return methods.includes('generateContent') || methods.includes('streamGenerateContent');
}

function rankGeminiModel(name) {
    const n = String(name || '').toLowerCase();
    if (n.includes('2.5') && n.includes('flash')) return 100;
    if (n.includes('2.0') && n.includes('flash')) return 95;
    if (n.includes('1.5') && n.includes('flash')) return 90;
    if (n.includes('1.5') && n.includes('pro')) return 80;
    if (n.includes('pro')) return 70;
    return 50;
}

function stringifyProviderError(status, data) {
    const err = data?.error || data?.message || data;
    const base = typeof err === 'string' ? err : JSON.stringify(err || {});
    return `${status} ${String(base || '').slice(0, 300)}`.trim();
}

function isProviderRetryable(status) {
    return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function isProviderKeyRejected(status) {
    return status === 401 || status === 403;
}

function isGeminiModelVersionMiss(status, data) {
    if (status !== 404) return false;
    const text = JSON.stringify(data || {}).toLowerCase();
    return text.includes('not found for api version') || text.includes('is not supported for generatecontent');
}

async function fetchGeminiModels(bot, apiKey, apiVersion, logPrefix = '') {
    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${encodeURIComponent(apiKey)}&pageSize=200`;
    try {
        const res = await bot.httpGet(url);
        const data = parseProviderBody(res.body);
        if (!res.ok) {
            return { ok: false, models: [], error: stringifyProviderError(res.status, data), status: res.status };
        }
        const list = Array.isArray(data?.models) ? data.models : [];
        const models = list
            .filter(m => supportsGeminiGenerateContent(m))
            .map(m => normalizeGeminiModelName(m?.name))
            .filter(name => name.toLowerCase().startsWith('gemini'))
            .sort((a, b) => rankGeminiModel(b) - rankGeminiModel(a));
        return { ok: true, models: [...new Set(models)], error: '', status: res.status };
    } catch (e) {
        bot.log(`⚠️ ${logPrefix}gemini listModels network error [${apiVersion}]: ${e.message}`);
        return { ok: false, models: [], error: `network ${e.message}`, status: 0 };
    }
}

async function getGeminiCandidateModels(bot, apiKey, configuredModels, versions, logPrefix = '') {
    const cleanConfigured = (Array.isArray(configuredModels) ? configuredModels : [])
        .map(m => normalizeGeminiModelName(m))
        .filter(Boolean);
    const cacheKey = String(apiKey || '');
    const now = Date.now();
    const cached = _geminiModelCache.get(cacheKey);
    if (cached && now - cached.ts < GEMINI_MODEL_CACHE_TTL_MS && Array.isArray(cached.models) && cached.models.length > 0) {
        return [...new Set([...cached.models, ...cleanConfigured])];
    }

    const discovered = [];
    for (const version of versions) {
        const info = await fetchGeminiModels(bot, apiKey, version, logPrefix);
        if (info.ok && info.models.length > 0) {
            discovered.push(...info.models);
        }
    }

    const uniqueDiscovered = [...new Set(discovered)];
    if (uniqueDiscovered.length > 0) {
        _geminiModelCache.set(cacheKey, { ts: now, models: uniqueDiscovered });
        bot.log(`ℹ️ ${logPrefix}gemini listModels: ${uniqueDiscovered.length} generateContent models available`);
    }

    return [...new Set([...uniqueDiscovered, ...cleanConfigured])];
}

async function requestOpenAiCompatibleAnswer(bot, provider, endpoint, apiKey, models, messages, logPrefix = '', keyIndex = 0) {
    let lastError = 'no response';
    for (const model of models) {
        const payload = {
            model,
            messages,
            temperature: 0.7,
            max_tokens: 800,
        };

        let res;
        try {
            res = await bot.httpPostWithHeaders(endpoint, payload, { Authorization: `Bearer ${apiKey}` });
        } catch (e) {
            lastError = `network ${e.message}`;
            bot.log(`⚠️ ${logPrefix}${provider} network error [${model}]: ${e.message}`);
            await sleep(350);
            continue;
        }

        const data = parseProviderBody(res.body);
        const answerText = getOpenAiStyleAnswer(data);
        if (res.ok && answerText) return { ok: true, answerText, model, provider, error: '' };

        const err = stringifyProviderError(res.status, data);
        lastError = err;
        bot.log(`⚠️ ${logPrefix}${provider} error [${model}${keyIndex > 0 ? `, key#${keyIndex + 1}` : ''}]: ${err}`);

        if (isProviderKeyRejected(res.status)) break;
        if (isProviderRetryable(res.status)) await sleep(350);
    }
    return { ok: false, answerText: '', model: '', provider, error: lastError };
}

function buildGeminiPrompt(messages) {
    return messages
        .map(m => `${String(m.role || 'user').toUpperCase()}:\n${String(m.content || '').trim()}`)
        .filter(Boolean)
        .join('\n\n');
}

async function requestGeminiAnswer(bot, apiKey, models, messages, logPrefix = '', keyIndex = 0) {
    let lastError = 'no response';
    const prompt = buildGeminiPrompt(messages);
    if (!prompt) return { ok: false, answerText: '', model: '', provider: 'gemini', error: 'empty prompt' };

    const versions = getProviderApiVersions('GEMINI_API_VERSIONS', DEFAULT_GEMINI_API_VERSIONS);
    const candidateModels = await getGeminiCandidateModels(bot, apiKey, models, versions, logPrefix);
    const finalModels = candidateModels.length > 0 ? candidateModels : models;

    for (const modelRaw of finalModels) {
        const model = normalizeGeminiModelName(modelRaw);
        if (!model) continue;

        for (const version of versions) {
            const url = `https://generativelanguage.googleapis.com/${version}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
            const payload = {
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 800,
                },
            };

            let res;
            try {
                res = await bot.httpPost(url, payload);
            } catch (e) {
                lastError = `network ${e.message}`;
                bot.log(`⚠️ ${logPrefix}gemini network error [${model}@${version}]: ${e.message}`);
                await sleep(350);
                continue;
            }

            const data = parseProviderBody(res.body);
            const answerText = getGeminiAnswer(data);
            if (res.ok && answerText) return { ok: true, answerText, model: `${model}@${version}`, provider: 'gemini', error: '' };

            const err = stringifyProviderError(res.status, data);
            lastError = err;
            bot.log(`⚠️ ${logPrefix}gemini error [${model}@${version}${keyIndex > 0 ? `, key#${keyIndex + 1}` : ''}]: ${err}`);

            if (isProviderKeyRejected(res.status)) break;
            if (isGeminiModelVersionMiss(res.status, data)) continue;
            if (isProviderRetryable(res.status)) await sleep(350);
        }
    }

    return { ok: false, answerText: '', model: '', provider: 'gemini', error: lastError };
}

async function requestAiAnswer(bot, cfg, messages, opts = {}) {
    const logPrefix = opts.logPrefix || '';
    const creds = getAiCredentials(cfg);
    if (creds.length === 0) {
        return { ok: false, answerText: '', model: '', provider: '', error: 'no AI keys configured', keyIndex: -1 };
    }

    let lastError = 'no response';
    for (let keyIndex = 0; keyIndex < creds.length; keyIndex++) {
        const cred = creds[keyIndex];
        let result = null;
        if (cred.provider === 'openrouter') {
            result = await requestOpenAiCompatibleAnswer(
                bot,
                'openrouter',
                'https://openrouter.ai/api/v1/chat/completions',
                cred.key,
                getProviderModels('OPENROUTER_MODELS', DEFAULT_OPENROUTER_MODELS),
                messages,
                logPrefix,
                keyIndex
            );
        } else if (cred.provider === 'groq') {
            result = await requestOpenAiCompatibleAnswer(
                bot,
                'groq',
                'https://api.groq.com/openai/v1/chat/completions',
                cred.key,
                getProviderModels('GROQ_MODELS', DEFAULT_GROQ_MODELS),
                messages,
                logPrefix,
                keyIndex
            );
        } else if (cred.provider === 'gemini') {
            result = await requestGeminiAnswer(
                bot,
                cred.key,
                getProviderModels('GEMINI_MODELS', DEFAULT_GEMINI_MODELS),
                messages,
                logPrefix,
                keyIndex
            );
        } else {
            continue;
        }

        if (result?.ok) return { ...result, keyIndex };
        if (result?.error) lastError = `${cred.provider}: ${result.error}`;
    }

    return { ok: false, answerText: '', model: '', provider: '', error: lastError, keyIndex: -1 };
}

function pushChatMessage(messages, role, content) {
    const text = String(content || '').trim();
    if (!text) return;
    if (messages.length > 1 && messages[messages.length - 1].role === role) {
        messages[messages.length - 1].content += `\n${text}`;
    } else {
        messages.push({ role, content: text });
    }
}

function isNeuroAuthor(bot, authorUsername) {
    const name = String(authorUsername || '').toLowerCase();
    if (!name) return false;
    const botName = String(bot.user?.username || '').toLowerCase();
    return name === 'neuro' || (botName && name === botName);
}

function appendHistoryMessages(bot, messages, channelHistory) {
    for (const entry of channelHistory) {
        if (entry.type === 'manual') {
            pushChatMessage(messages, 'user', entry.question);
            pushChatMessage(messages, 'assistant', entry.answer);
            continue;
        }
        const text = entry.question || entry.answer || '';
        const role = isNeuroAuthor(bot, entry.authorUsername) ? 'assistant' : 'user';
        pushChatMessage(messages, role, text);
    }
}

const FORCED_TICKET_GREET_ROLE_IDS = ['1334466933273395242', '1086969387103293560'];

function getEffectiveAutoGreetRoleIds(cfg) {
    const configured = Array.isArray(cfg?.autoGreetRoleIds) ? cfg.autoGreetRoleIds : [];
    return [...new Set([...configured.map(String), ...FORCED_TICKET_GREET_ROLE_IDS])];
}

function rememberNeuroMessageId(bot, sendResult) {
    if (!sendResult?.ok) return;
    let messageId = null;
    try {
        const parsed = JSON.parse(sendResult.body || '{}');
        messageId = parsed?.id || null;
    } catch { }
    if (!messageId) return;

    if (!bot._neuroMessageIds) {
        bot._neuroMessageIds = new Set();
        bot._neuroMessageOrder = [];
    }

    if (bot._neuroMessageIds.has(messageId)) return;
    bot._neuroMessageIds.add(messageId);
    bot._neuroMessageOrder.push(messageId);

    // Keep memory bounded.
    if (bot._neuroMessageOrder.length > 2000) {
        const old = bot._neuroMessageOrder.shift();
        if (old) bot._neuroMessageIds.delete(old);
    }
}

function isReplyToTrackedNeuroMessage(bot, msg) {
    const ref = msg?.referenced_message;
    if (!ref) return false;

    const refId = ref.id;
    if (refId && bot._neuroMessageIds?.has(refId)) return true;

    // Fallback after restart: treat as Neuro only when the replied content matches
    // recent AI outputs from this channel.
    if (ref.author?.id && ref.author.id !== bot.selfUserId) return false;
    const refText = String(ref.content || '').trim();
    if (!refText || !bot._convLogger) return false;

    const chId = msg.channel_id || msg.channelId;
    if (!chId) return false;
    const history = bot._convLogger.getChannelHistory(chId, 40);
    return history.some(e =>
        e.type === 'ai_question'
        && isNeuroAuthor(bot, e.authorUsername)
        && String(e.question || '').trim() === refText
    );
}

function limitForTelegram(text, max = 200) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '—';
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function enqueueNeuroTelegramNotification(bot, { channelId, authorUsername, question, answer }) {
    const safeChannel = escapeHtml(String(channelId || 'unknown'));
    const safeAuthor = escapeHtml(String(authorUsername || 'unknown'));
    const safeQuestion = escapeHtml(limitForTelegram(question, 180));
    const safeAnswer = escapeHtml(limitForTelegram(answer, 240));

    bot.enqueue({
        text: `🧠 <b>Neuro ответил</b>\n\n📍 <b>Канал:</b> <code>${safeChannel}</code>\n👤 <b>Пользователь:</b> ${safeAuthor}\n❓ <b>Вопрос:</b> <i>${safeQuestion}</i>\n💬 <b>Ответ:</b> <i>${safeAnswer}</i>`
    });
}

function normalizePresenceEntry(presence) {
    if (!presence) return { status: 'offline', activities: [], customStatus: null, activityText: null, clientStatus: null };
    if (typeof presence === 'string') {
        return { status: presence || 'offline', activities: [], customStatus: null, activityText: null, clientStatus: null };
    }

    const status = presence.status || 'offline';
    const activities = Array.isArray(presence.activities) ? presence.activities : [];
    const customActivity = activities.find(a => Number(a?.type) === 4) || null;
    const primaryActivity = activities.find(a => Number(a?.type) !== 4) || null;
    const customStatus = customActivity?.state || customActivity?.name || null;
    const activityText = primaryActivity
        ? [primaryActivity.name, primaryActivity.details, primaryActivity.state].filter(Boolean).join(' - ')
        : null;

    return {
        status,
        activities,
        customStatus: customStatus ? String(customStatus).slice(0, 120) : null,
        activityText: activityText ? String(activityText).slice(0, 120) : null,
        clientStatus: presence.client_status || null,
    };
}

const VIEW_CHANNEL_PERMISSION = 1n << 10n;

function parsePermissionBits(value) {
    try {
        if (value == null || value === '') return 0n;
        return BigInt(value);
    } catch {
        return 0n;
    }
}

function overwriteAllowsView(overwrite) {
    if (!overwrite) return false;
    return (parsePermissionBits(overwrite.allow) & VIEW_CHANNEL_PERMISSION) === VIEW_CHANNEL_PERMISSION;
}

function overwriteDeniesView(overwrite) {
    if (!overwrite) return false;
    return (parsePermissionBits(overwrite.deny) & VIEW_CHANNEL_PERMISSION) === VIEW_CHANNEL_PERMISSION;
}

function getEveryoneOverwrite(channel, guildId) {
    const overwrites = Array.isArray(channel?.permission_overwrites) ? channel.permission_overwrites : [];
    return overwrites.find(ow =>
        String(ow?.id || '') === String(guildId)
        && (ow?.type === 0 || ow?.type === '0' || ow?.type === 'role' || ow?.type == null)
    ) || null;
}

function getMembersSidebarChannelScore(channel, guildId, ticketsCategoryId, channelCache) {
    let score = 0;
    const name = String(channel?.name || '').toLowerCase();

    if (!ticketsCategoryId || channel.parent_id !== ticketsCategoryId) score += 8;
    else score -= 3;

    const ownOverwrite = getEveryoneOverwrite(channel, guildId);
    if (overwriteAllowsView(ownOverwrite)) score += 14;
    if (overwriteDeniesView(ownOverwrite)) score -= 26;

    if (!ownOverwrite && channel?.parent_id) {
        const parent = channelCache.get(channel.parent_id);
        const parentOverwrite = getEveryoneOverwrite(parent, guildId);
        if (overwriteAllowsView(parentOverwrite)) score += 6;
        if (overwriteDeniesView(parentOverwrite)) score -= 18;
    }

    if (/(general|chat|общ|основ|main|lobby|лобби|welcome|чат)/.test(name)) score += 10;
    if (/(staff|admin|админ|mod|модер|персонал|ticket|тикет|заявк|appeal|обращ|log|лог|audit)/.test(name)) score -= 10;

    if (typeof channel?.position === 'number') score += channel.position / 1000;

    return score;
}

const MEMBER_SEARCH_QUERY_CHARS = Array.from(new Set([
    '', // try broad query once; Discord may reject it for some tokens
    ...'etaoinshrdlucmfwypvbgkjqxz',
    ...'0123456789',
    '_', '-', '.',
    ...'аеоинтрсвлкмдпуяыьбгчйхжшюцщэфё',
]));

function upsertGuildMemberCache(bot, member) {
    if (!member?.user?.id) return false;
    const userId = String(member.user.id);
    const existed = bot.guildMembersCache.has(userId);
    const prev = bot.guildMembersCache.get(userId) || {};
    bot.guildMembersCache.set(userId, { ...prev, ...member });
    return !existed;
}

function buildRankedSidebarChannels(bot, guildId, ticketsCategoryId) {
    const textChannels = [...bot.channelCache.values()].filter(ch => ch.guild_id === guildId && ch.type === 0);
    if (textChannels.length === 0) return [];
    return textChannels
        .map(ch => ({
            channel: ch,
            score: getMembersSidebarChannelScore(ch, guildId, ticketsCategoryId, bot.channelCache),
        }))
        .sort((a, b) => b.score - a.score);
}

function isOp14Enabled(bot) {
    // OP14 is stable in bot-token mode. For selfbot keep it off by default:
    // Discord often closes selfbot sessions with 4002/4003 after OP14 payloads.
    if (bot?.config?.discordBotToken) return true;
    return process.env.ENABLE_SELFBOT_OP14 === '1';
}

function scheduleMembersSidebarSweep(
    bot,
    guildId,
    ticketsCategoryId,
    {
        startDelayMs = 1200,
        stepDelayMs = 900,
        passes = 6,
        channelsPerRequest = 2,
    } = {}
) {
    if (!isOp14Enabled(bot)) return;
    for (let pass = 0; pass < passes; pass++) {
        setTimeout(() => {
            requestDashboardMembersSidebar(bot, guildId, ticketsCategoryId, pass * channelsPerRequest, channelsPerRequest);
        }, startDelayMs + (pass * stepDelayMs));
    }
}

async function hydrateMembersFromRest(bot, guildId, token, {
    isBotToken = false,
    ticketsCategoryId = '',
} = {}) {
    const seen = new Set(bot.guildMembersCache.keys());
    let restLoaded = 0;
    let searchLoaded = 0;

    // Try privileged /members endpoint first (best quality if token has access).
    try {
        let after = null;
        const pageLimit = isBotToken ? 20 : 2;
        for (let page = 0; page < pageLimit; page++) {
            const url = `https://discord.com/api/v9/guilds/${guildId}/members?limit=1000${after ? `&after=${after}` : ''}`;
            const res = await bot.httpGet(url, { Authorization: token });
            if (!res.ok) {
                if (page === 0) bot.log(`ℹ️ REST /members unavailable (${res.status}), switching to search/op14`);
                break;
            }

            const members = JSON.parse(res.body);
            if (!Array.isArray(members) || members.length === 0) break;

            let pageAdded = 0;
            for (const member of members) {
                if (upsertGuildMemberCache(bot, member)) {
                    seen.add(String(member.user.id));
                    pageAdded++;
                    restLoaded++;
                }
            }

            if (pageAdded > 0) scheduleMembersUpdate(bot);
            if (members.length < 1000) break;
            after = members[members.length - 1]?.user?.id || null;
            if (!after) break;
            await sleep(220);
        }
    } catch (e) {
        bot.log(`⚠️ REST /members hydrate error: ${e.message}`);
    }

    // Search fallback/augment (works for user tokens). Gather wider set of queries in batches.
    let okSearchResponses = 0;
    let firstSearchErrorLogged = false;
    let stagnantBatches = 0;
    const batchSize = 4;
    for (let i = 0; i < MEMBER_SEARCH_QUERY_CHARS.length; i += batchSize) {
        const batch = MEMBER_SEARCH_QUERY_CHARS.slice(i, i + batchSize);
        let batchAdded = 0;

        await Promise.all(batch.map(async (query) => {
            try {
                const url = `https://discord.com/api/v9/guilds/${guildId}/members/search?query=${encodeURIComponent(query)}&limit=100`;
                const res = await bot.httpGet(url, { Authorization: token });
                if (!res.ok) {
                    if (!firstSearchErrorLogged) {
                        bot.log(`⚠️ Members search returned ${res.status} for query "${query}"`);
                        firstSearchErrorLogged = true;
                    }
                    return;
                }

                okSearchResponses++;
                const members = JSON.parse(res.body);
                if (!Array.isArray(members) || members.length === 0) return;
                for (const member of members) {
                    if (!member?.user?.id) continue;
                    if (upsertGuildMemberCache(bot, member)) {
                        seen.add(String(member.user.id));
                        batchAdded++;
                        searchLoaded++;
                    }
                }
            } catch { }
        }));

        if (batchAdded > 0) {
            stagnantBatches = 0;
            scheduleMembersUpdate(bot);
        } else {
            stagnantBatches++;
        }

        // Stop early when search no longer adds members.
        if (stagnantBatches >= 5 && seen.size >= 250) break;
        await sleep(180);
    }

    bot.log(`👥 Members hydrated: total=${seen.size}, rest=${restLoaded}, search=${searchLoaded}, search_ok=${okSearchResponses}`);

    // If still tiny set, do a broader sidebar sweep across more channels.
    if (!isBotToken && seen.size < 120 && isOp14Enabled(bot)) {
        scheduleMembersSidebarSweep(bot, guildId, ticketsCategoryId, {
            startDelayMs: 1500,
            stepDelayMs: 850,
            passes: 10,
            channelsPerRequest: 2,
        });
    }

    if (seen.size > 0) scheduleMembersUpdate(bot);
}

function emitDashboard(bot, event, payload = {}) {
    if (typeof bot.emitToDashboard === 'function') {
        bot.emitToDashboard(event, payload);
        return;
    }
    if (!bot.io) return;
    try { bot.io.emit(event, payload); } catch { }
}

function scheduleMembersUpdate(bot) {
    const now = Date.now();
    const throttleMs = 1500;
    const lastAt = bot._membersEmitAt || 0;
    const emit = () => {
        bot._membersEmitAt = Date.now();
        bot._membersEmitTimer = null;
        emitDashboard(bot, 'members:updated', { ts: bot._membersEmitAt });
    };

    if (bot._membersEmitTimer) return;
    const wait = Math.max(0, throttleMs - (now - lastAt));
    if (wait === 0) {
        emit();
        return;
    }
    bot._membersEmitTimer = setTimeout(emit, wait);
}

function resolveGatewayAuthMode(bot) {
    if (bot.config.discordBotToken) return 'bot';
    if (bot._gatewayAuthMode === 'bot' || bot._gatewayAuthMode === 'user') return bot._gatewayAuthMode;
    bot._gatewayAuthMode = 'user';
    return bot._gatewayAuthMode;
}

function getRestAuthHeader(bot) {
    if (typeof bot.getDiscordAuthorizationHeader === 'function') {
        return bot.getDiscordAuthorizationHeader();
    }
    const raw = bot.config.discordBotToken || bot.config.discordToken || '';
    if (!raw) return '';
    const mode = resolveGatewayAuthMode(bot);
    return mode === 'bot' ? `Bot ${raw}` : raw;
}


function connectGateway(bot) {
    if (bot.destroyed) return;
    const token = (typeof bot.getDiscordGatewayToken === 'function')
        ? bot.getDiscordGatewayToken()
        : (bot.config.discordBotToken || bot.config.discordToken || '');
    if (!token) { bot.log('❌ No Discord token'); return; }
    const authMode = resolveGatewayAuthMode(bot);
    const isBotToken = authMode === 'bot';

    // Initialize conversation logger
    if (!bot._convLogger) {
        bot._convLogger = new ConversationLogger(bot.dataDir || path.join(__dirname, '..', '..', 'data'));
        bot.log(`📝 Conversation logger initialized (${bot._convLogger.getStats().total} entries)`);
    }

    bot.log(`🔌 Connecting to Discord Gateway... (auth:${authMode})`);
    // Diagnostic: log auto-reply confi
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
        if (code === 4004) {
            // Optional fallback is disabled by default; selfbot setups should stay in user mode.
            const allowModeFallback = process.env.DISCORD_MODE_FALLBACK === '1';
            const canTryAlternateMode = !bot.config.discordBotToken && !!bot.config.discordToken;
            if (allowModeFallback && canTryAlternateMode && authMode === 'user' && !bot._gatewayAltModeTried) {
                bot._gatewayAuthMode = 'bot';
                bot._gatewayAltModeTried = true;
                bot.log('⚠️ Gateway 4004 in user mode; retrying DISCORD_TOKEN as bot mode...');
                setTimeout(() => connectGateway(bot), 1000);
                return;
            }
            if (allowModeFallback && canTryAlternateMode && authMode === 'bot' && bot._gatewayAltModeTried) {
                bot.log('❌ Gateway 4004 in both user+bot modes. DISCORD_TOKEN is invalid/revoked.');
            } else if (bot.config.discordBotToken) {
                bot.log('❌ Gateway 4004 for DISCORD_BOT_TOKEN. Token invalid/revoked.');
            } else {
                bot.log('❌ Gateway 4004 for DISCORD_TOKEN (selfbot mode). Token invalid/revoked.');
            }
        }
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
            if (bot.config.discordBotToken) bot._gatewayAuthMode = 'bot';
            else if (bot._gatewayAuthMode !== 'bot') bot._gatewayAuthMode = 'user';
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
            if (d.presences) for (const p of d.presences) { if (p.user) bot.guildPresenceCache.set(p.user.id, normalizePresenceEntry(p)); }
            if ((d.members && d.members.length) || (d.presences && d.presences.length)) scheduleMembersUpdate(bot);
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
                emitDashboard(bot, 'ticket:new', { channelId: d.id, channelName: d.name });
            }
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
            emitDashboard(bot, 'ticket:closed', { channelId: d.id });
            break;
        }

        case 'MESSAGE_CREATE': {
            const author = d.author;
            if (!author) break;
            const isBot = author.bot || false;

            // Cache member from message for members panel (only for the configured guild)
            if (d.member && author && d.guild_id === guildId) {
                bot.guildMembersCache.set(author.id, { ...d.member, user: author });
                scheduleMembersUpdate(bot);
            }

            // Auto-reply check — runs on ALL guilds, rule.guildId does filtering
            const arExclude = cfg.autoReplyExcludeChannels || ['717735180546343032'];
            if (!isBot && author.id !== bot.selfUserId && cfg.autoReplies?.length > 0 && !arExclude.includes(d.channel_id)) {
                // Mark as processed to prevent REST polling from double-processing
                if (!bot._arProcessed) bot._arProcessed = new Set();
                bot._arProcessed.add(d.id);
                let matched = false;
                const decision = evaluateAutoReplyDecision({
                    rules: cfg.autoReplies || [],
                    content: d.content || '',
                    channelId: d.channel_id,
                    guildId: d.guild_id,
                    source: 'gateway',
                });
                if (decision.action === 'send' && decision.response) {
                    matched = true;
                    const details = {
                        rule_id: decision.ruleId,
                        rule_name: decision.ruleName,
                        keywords: decision.keywords,
                        confidence: decision.confidence,
                        source: decision.source,
                        reason: decision.reason,
                        channel_id: d.channel_id,
                        guild_id: d.guild_id,
                    };
                    bot.log(`🤖 Auto-reply matched: "${decision.ruleName}" in guild ${d.guild_id} channel ${d.channel_id}`, 'autoreply', details);
                    const replyMsgId = d.id;
                    const delaySec = decision.ruleId === 'moderation_check' ? 2 : (((cfg.autoReplies || []).find(r => (r.id || '') === decision.ruleId || r.name === decision.ruleName)?.delay) || 2);
                    setTimeout(async () => {
                        try {
                            await bot.sendDiscordMessage(d.channel_id, decision.response, replyMsgId);
                            bot.log(`✅ Auto-reply sent: "${decision.ruleName}"`, 'autoreply', details);
                            bot.enqueue({ text: `🤖 <b>Авто-ответ отправлен</b>\n\n📋 <b>Правило:</b> ${decision.ruleName}\n🧾 <b>rule_id:</b> <code>${decision.ruleId}</code>\n🎯 <b>confidence:</b> <code>${Number(decision.confidence || 0).toFixed(2)}</code>\n🔎 <b>source:</b> <code>${decision.source}</code>\n👤 <b>Игрок:</b> ${d.author?.username || 'unknown'}\n💬 <b>Сообщение:</b> <i>${(d.content || '').slice(0, 150)}</i>` });
                        } catch (e) {
                            bot.log(`❌ Auto-reply send failed: ${e.message}`);
                        }
                    }, delaySec * 1000);
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

            // ── Log staff manual messages for AI learning ──
            // Only in guild 690362306395111444, channel 717734206586880060
            const _learnChannel = '717734206586880060';
            const _learnUserIds = [bot.selfUserId, '968175323709599794'];
            if (!isBot && _learnUserIds.includes(author.id) && d.channel_id === _learnChannel && bot._convLogger) {
                // Check if this message is an AI response (not manual)
                if (bot._aiPendingChannels && bot._aiPendingChannels.has(d.channel_id)) {
                    bot._aiPendingChannels.delete(d.channel_id);
                    bot.log(`🤖 Skipped AI response from logging: "${(d.content || '').slice(0, 50)}"`);
                } else {
                    const msgText = d.content || '';
                    // Skip short messages, commands, and self-mentions (pinging yourself)
                    const isSelfMention = msgText.includes(`<@${bot.selfUserId}>`) || msgText.includes(`<@!${bot.selfUserId}>`);
                    if (msgText.length > 1 && !msgText.startsWith('/') && !isSelfMention) {
                        // Get question ONLY from actual Discord Reply
                        let question = '';
                        if (d.referenced_message && d.referenced_message.content) {
                            question = d.referenced_message.content.slice(0, 500);
                        }

                        bot._convLogger.logManualResponse({
                            channelId: d.channel_id,
                            question,
                            answer: msgText,
                            authorUsername: author.username,
                        });

                        // ── Save structured learning ──
                        if (question) {
                            // Q&A pair: user replied to someone's message
                            const saved = saveLearning(bot, { type: 'qa', question, answer: msgText.slice(0, 500) });
                            if (saved) bot.log(`📝 Learned Q&A: "${question.slice(0, 40)}" → "${msgText.slice(0, 40)}"`);
                        } else if (msgText.length > 5) {
                            // Fact: standalone message
                            const saved = saveLearning(bot, { type: 'fact', content: msgText.slice(0, 500) });
                            if (saved) bot.log(`📝 Learned fact: "${msgText.slice(0, 50)}"`);
                        }
                    }
                }
            }
            // Track last non-self message per channel as potential "question"
            if (!isBot && author.id !== bot.selfUserId) {
                if (!bot._lastChannelQuestion) bot._lastChannelQuestion = {};
                bot._lastChannelQuestion[d.channel_id] = (d.content || '').slice(0, 500);
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
            // Trigger: reply to AI-generated Neuro message or @mention of Neuro
            // Works on ALL guilds (or only specific ones if neuroGuildIds is set)
            const neuroExcludedChannels = ['1451246122755559555'];
            const neuroGuilds = cfg.neuroGuildIds || [];
            const neuroAllowed = neuroGuilds.length === 0 || neuroGuilds.includes(d.guild_id);
            const hasAiKeys = getAiCredentials(cfg).length > 0;
            if (!isBot && !hasProfanity && hasAiKeys && bot.selfUserId && neuroAllowed && !neuroExcludedChannels.includes(d.channel_id)) {
                const content = d.content || '';
                const mentionsMe = content.includes(`<@${bot.selfUserId}>`) || content.includes(`<@!${bot.selfUserId}>`);
                const isMentionTrigger = mentionsMe;
                const isReplyToNeuro = isReplyToTrackedNeuroMessage(bot, d);
                const isAllowedAuthor = author.id !== bot.selfUserId || isMentionTrigger;
                const canTrigger = isReplyToNeuro || isMentionTrigger;

                if (isAllowedAuthor && canTrigger) {
                    // Extract question: remove mention if present
                    let question = content
                        .replace(new RegExp(`<@!?${bot.selfUserId}>`, 'g'), '')
                        .replace(/[,،\s]+/g, ' ')
                        .trim();
                    // For replies without text / short acknowledgements, skip
                    if (question.length > 0 && !shouldSkipNeuroQuestion(question) && !_neuroProcessed.has(d.id)) {
                        const direct = getDirectNeuroDecision({
                            question,
                            cfg,
                            channelId: d.channel_id,
                            guildId: d.guild_id,
                        });
                        if (direct?.response) {
                            _neuroProcessed.add(d.id);
                            setTimeout(() => _neuroProcessed.delete(d.id), 60000);
                            bot.log(`🤖 Neuro direct reply [${direct.source}] to ${author.username}: "${question.slice(0, 100)}"`);
                            (async () => {
                                try {
                                    const sentRes = await bot.sendDiscordMessage(d.channel_id, direct.response, d.id);
                                    if (sentRes.ok) {
                                        rememberNeuroMessageId(bot, sentRes);
                                        enqueueNeuroTelegramNotification(bot, {
                                            channelId: d.channel_id,
                                            authorUsername: author.username || author.global_name || author.id,
                                            question,
                                            answer: direct.response,
                                        });
                                        if (bot._convLogger) {
                                            bot._convLogger.logAIResponse({
                                                channelId: d.channel_id,
                                                question: direct.response,
                                                authorUsername: bot.user?.username || 'Neuro',
                                            });
                                        }
                                        bot.log(`✅ Neuro direct response sent to #${d.channel_id}`);
                                    } else {
                                        bot.log(`❌ Failed to send direct reply: ${sentRes.status} ${sentRes.body}`);
                                    }
                                } catch (e) {
                                    bot.log(`❌ Neuro direct reply error: ${e.message}`);
                                }
                            })();
                            break;
                        }

                        _neuroProcessed.add(d.id);
                        setTimeout(() => _neuroProcessed.delete(d.id), 60000); // cleanup after 60s
                        const triggerType = isReplyToNeuro ? 'reply' : 'mention';
                        bot.log(`🧠 Neuro AI [${triggerType}]: question from ${author.username}: "${question.slice(0, 100)}"`);
                        // Log AI question
                        if (bot._convLogger) {
                            bot._convLogger.logAIResponse({
                                channelId: d.channel_id,
                                question,
                                authorUsername: author.username,
                            });
                        }
                        // Mark channel as having a pending AI response
                        if (!bot._aiPendingChannels) bot._aiPendingChannels = new Set();
                        bot._aiPendingChannels.add(d.channel_id);
                        // Auto-clear after 30s in case response never arrives
                        setTimeout(() => bot._aiPendingChannels?.delete(d.channel_id), 30000);
                        // Build conversation context — include the previous bot reply for context
                        const prevBotReply = isReplyToNeuro ? (d.referenced_message.content || '').slice(0, 500) : '';
                        // Fire and forget — n8n handles the response via Discord API
                        (async () => {
                            try {
                                const systemPrompt = loadSystemPrompt();
                                const convLogger = bot._convLogger;
                                const channelHistory = convLogger ? convLogger.getChannelHistory(d.channel_id, 10) : [];

                                // Build OpenAI-compatible messages array for Groq
                                const messages = [{ role: 'system', content: systemPrompt }];
                                const ragContext = buildRagContextMessage({
                                    query: question,
                                    dataDir: bot.dataDir || _dataDir,
                                    config: cfg,
                                    topK: 8,
                                    maxContextChars: 2600,
                                });
                                if (ragContext.message) {
                                    messages.push({ role: 'system', content: ragContext.message });
                                    bot.log(`📚 RAG context attached: ${ragContext.snippetCount} snippets`);
                                }

                                appendHistoryMessages(bot, messages, channelHistory);

                                if (prevBotReply && !channelHistory.some(e => e.type === 'ai_question' && (e.question || e.answer || '').includes(prevBotReply.slice(0, 50)))) {
                                    if (messages.length > 1 && messages[messages.length - 1].role === 'assistant') {
                                        messages[messages.length - 1].content += `\n${prevBotReply}`;
                                    } else {
                                        messages.push({ role: 'assistant', content: prevBotReply });
                                    }
                                }

                                pushChatMessage(messages, 'user', question);
                                const aiResult = await requestAiAnswer(bot, cfg, messages);
                                let answerText = aiResult.ok ? aiResult.answerText : '';
                                if (aiResult.ok) bot.log(`🧠 AI success (${aiResult.provider}/${aiResult.model})`);

                                if (answerText) {
                                    const guarded = sanitizeResponseLinks(answerText);
                                    answerText = guarded.text;
                                    if (guarded.replacedCount > 0) {
                                        const blockedPreview = guarded.blockedUrls.slice(0, 3).join(', ');
                                        bot.log(`🛡️ Link guard replaced ${guarded.replacedCount} URL(s)${blockedPreview ? `: ${blockedPreview}` : ''}`);
                                    }

                                    const sentRes = await bot.sendDiscordMessage(d.channel_id, answerText, d.id);
                                    if (sentRes.ok) {
                                        bot.log(`✅ Neuro response sent to #${d.channel_id}`);
                                        rememberNeuroMessageId(bot, sentRes);
                                        enqueueNeuroTelegramNotification(bot, {
                                            channelId: d.channel_id,
                                            authorUsername: author.username || author.global_name || author.id,
                                            question,
                                            answer: answerText,
                                        });
                                        if (convLogger) {
                                            convLogger.logAIResponse({
                                                channelId: d.channel_id,
                                                question: answerText,
                                                authorUsername: bot.user?.username || 'Neuro'
                                            });
                                        }
                                    } else {
                                        bot.log(`❌ Failed to send Discord message: ${sentRes.status} ${sentRes.body}`);
                                    }
                                } else {
                                    bot.log(`❌ Neuro API: failed or no response generated${aiResult.error ? ` (${aiResult.error})` : ''}.`);
                                }
                            } catch (e) {
                                bot.log(`❌ Neuro AI error: ${e.stack}`);
                            }
                        })();
                    }
                }
            }

            // Ticket-specific logic — only for the configured guild
            if (d.guild_id !== guildId) break;

            const record = bot.activeTickets.get(d.channel_id);
            if (!record) break;
            if (bot.sentByBot.has(d.id)) {
                // Still emit to dashboard so self-sent messages update in real-time
                emitDashboard(bot, 'ticket:message', { channelId: d.channel_id, content: d.content });
                return;
            }

            const isStaff = isStaffFromMember(d.member, staffRoleIds);

            // Auto-greet: trigger when bot/system message mentions staff role in this ticket
            if (cfg.autoGreetEnabled && cfg.autoGreetText && isBot) {
                const greetRoles = getEffectiveAutoGreetRoleIds(cfg);
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
            emitDashboard(bot, 'ticket:message', { channelId: d.channel_id, content: d.content });
            break;
        }

        case 'GUILD_MEMBER_ADD': {
            if (d.guild_id !== guildId) break;
            if (d.user) bot.guildMembersCache.set(d.user.id, d);
            scheduleMembersUpdate(bot);
            break;
        }

        case 'GUILD_MEMBER_UPDATE': {
            if (d.guild_id !== guildId) break;
            if (d.user) {
                const existing = bot.guildMembersCache.get(d.user.id) || {};
                bot.guildMembersCache.set(d.user.id, { ...existing, ...d });
                scheduleMembersUpdate(bot);
            }
            break;
        }

        case 'GUILD_MEMBER_REMOVE': {
            if (d.guild_id !== guildId) break;
            if (d.user) bot.guildMembersCache.delete(d.user.id);
            scheduleMembersUpdate(bot);
            break;
        }

        case 'PRESENCE_UPDATE': {
            if (d.guild_id !== guildId) break;
            if (d.user?.id) bot.guildPresenceCache.set(d.user.id, normalizePresenceEntry(d));
            scheduleMembersUpdate(bot);
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
                                bot.guildPresenceCache.set(item.member.user.id, normalizePresenceEntry(item.member.presence));
                            }
                            added++;
                        }
                    }
                }
                if (added > 0) bot.log(`👥 Member list update: ${added} members cached (total: ${bot.guildMembersCache.size})`);
                if (added > 0) scheduleMembersUpdate(bot);
            }
            break;
        }
    }
}

// ── REST-based channel scan (needed for selfbot/user tokens) ──

function scanChannelsList(bot, channels, guildId, guildName, prefixes, categoryId) {
    // Debug: show what filter criteria we're using
    bot.log(`🔍 Scan filter: prefixes=[${prefixes.join(', ')}], categoryId=${categoryId || 'ANY'}`);

    // Debug: show text channels with their parent_id's to help diagnose
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
    const authHeader = getRestAuthHeader(bot);

    if (!guildId) { bot.log('⚠️ No guildId configured, cannot fetch channels'); return; }

    bot.log(`🌐 Fetching channels via REST API for guild ${guildId}...`);
    try {
        const res = await bot.httpGet(`https://discord.com/api/v9/guilds/${guildId}/channels`, { Authorization: authHeader });
        if (!res.ok) {
            bot.log(`❌ REST /channels error: ${res.status} — ${res.body?.slice(0, 200)}`);
            return;
        }
        const channels = JSON.parse(res.body);
        bot.log(`🌐 REST: ${channels.length} channels loaded`);
        bot.guildCreateHandled = true;
        scanChannelsList(bot, channels, guildId, '', prefixes, categoryId);
        bot.restoreActivityTimers();
        // Subscribe to ticket channels via OP14 only when enabled for this auth mode.
        if (isOp14Enabled(bot)) {
            subscribeToTicketChannels(bot);
        } else {
            bot.log('ℹ️ OP14 disabled for selfbot (stable mode).');
        }
        // For selfbot flow: optionally request member sidebar data for dashboard members list
        if (!cfg.discordBotToken && isOp14Enabled(bot)) {
            scheduleMembersSidebarSweep(bot, guildId, categoryId, {
                startDelayMs: 1200,
                stepDelayMs: 950,
                passes: 6,
                channelsPerRequest: 2,
            });
        }

        // Background: fetch last message for each ticket to populate preview
        (async () => {
            for (const [channelId, record] of bot.activeTickets) {
                if (record.lastMessage) continue; // already has data
                try {
                    const msgRes = await bot.httpGet(
                        `https://discord.com/api/v9/channels/${channelId}/messages?limit=1`,
                        { Authorization: authHeader }
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
            emitDashboard(bot, 'ticket:updated', {});
            bot.log(`📝 Ticket previews loaded`);
        })();
    } catch (e) {
        bot.log(`❌ REST channels error: ${e.message}`);
    }

    // Fetch members in background so UI doesn't block on cold start.
    hydrateMembersFromRest(bot, guildId, authHeader, {
        isBotToken: !!cfg.discordBotToken,
        ticketsCategoryId: categoryId,
    }).catch((e) => bot.log(`❌ Members fetch error: ${e.message}`));

    // Fetch guild roles
    try {
        const res = await bot.httpGet(`https://discord.com/api/v9/guilds/${guildId}/roles`, { Authorization: authHeader });
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
    if (!isOp14Enabled(bot)) return;
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

function requestDashboardMembersSidebar(bot, guildId, ticketsCategoryId, channelOffset = 0, channelsPerRequest = 1) {
    if (!isOp14Enabled(bot)) return false;
    if (!bot.ws || bot.ws.readyState !== 1) return false;
    if (!guildId) return false;

    const rankedChannels = buildRankedSidebarChannels(bot, guildId, ticketsCategoryId);
    if (rankedChannels.length === 0) {
        bot.log('⚠️ Members sidebar request skipped: no text channels in cache');
        return false;
    }

    const safeOffset = Math.max(0, channelOffset);
    const selected = rankedChannels
        .slice(safeOffset, safeOffset + Math.max(1, channelsPerRequest))
        .map(entry => entry.channel);
    if (selected.length === 0) selected.push(rankedChannels[0].channel);

    const ranges = [];
    for (let i = 0; i < 2500; i += 100) ranges.push([i, i + 99]);
    const channels = {};
    for (const channel of selected) {
        channels[channel.id] = ranges;
    }

    try {
        bot.ws.send(JSON.stringify({
            op: 14,
            d: {
                guild_id: guildId,
                typing: true,
                threads: true,
                activities: true,
                members: [],
                channels,
            }
        }));
        const selectedInfo = selected
            .map(ch => {
                const score = getMembersSidebarChannelScore(ch, guildId, ticketsCategoryId, bot.channelCache);
                return `${ch.id}#${ch.name || 'unknown'}(${score.toFixed(1)})`;
            })
            .join(', ');
        bot.log(`👥 Requested member sidebar for dashboard (channels: ${selectedInfo}, ranges: ${ranges.length})`);
        return true;
    } catch (e) {
        bot.log(`❌ Members sidebar request error: ${e.message}`);
        return false;
    }
}

function subscribeToTicketChannels(bot) {
    if (!isOp14Enabled(bot)) return;
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

    const authHeader = getRestAuthHeader(bot);
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
    // Always include learning channel for d1reevof message capture
    pollChannels.add('717734206586880060');
    pollChannels.add('1093146249412231199');

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
                    { Authorization: authHeader }
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
                    // Never auto-reply to own messages; self-mention is handled by AI flow.
                    if (msg.author.id === bot.selfUserId) continue;
                    // Skip staff messages — avoid answering staff with auto-replies
                    const arStaffRoles = (Array.isArray(cfg.staffRoleIds) && cfg.staffRoleIds.length > 0) ? cfg.staffRoleIds : ['1475932249017946133', '1475961602619478116'];
                    if (msg.member && msg.member.roles) {
                        if (msg.member.roles.some(r => arStaffRoles.includes(r))) continue;
                    }

                    // Log for debugging
                    if (pollCycle <= 3 || msg.author.username === 'd1reevof') {
                        bot.log(`🔍 Poll: new msg from ${msg.author.username} in #${channelId}: "${(msg.content || '').slice(0, 40)}"`);
                    }

                    // ── AI Learning from staff messages (poll-based) ──
                    // Only learn from channel 717734206586880060
                    const _pollLearnUserIds = [bot.selfUserId, '968175323709599794'];
                    if (_pollLearnUserIds.includes(msg.author.id) && channelId === '717734206586880060' && bot._convLogger) {
                        const msgText = msg.content || '';
                        const isSelfMention = msgText.includes(`<@${bot.selfUserId}>`) || msgText.includes(`<@!${bot.selfUserId}>`);
                        // Skip AI responses, commands, self-mentions, very short messages
                        if (bot._aiPendingChannels && bot._aiPendingChannels.has(channelId)) {
                            bot._aiPendingChannels.delete(channelId);
                            bot.log(`🤖 Poll: skipped AI response: "${msgText.slice(0, 50)}"`);
                        } else if (msgText.length > 1 && !msgText.startsWith('/') && !isSelfMention) {
                            // Get question ONLY from actual Discord Reply
                            let question = '';
                            if (msg.referenced_message && msg.referenced_message.content) {
                                question = msg.referenced_message.content.slice(0, 500);
                            }

                            bot._convLogger.logManualResponse({
                                channelId,
                                question,
                                answer: msgText,
                                authorUsername: msg.author.username,
                            });

                            // ── Save structured learning ──
                            if (question) {
                                const saved = saveLearning(bot, { type: 'qa', question, answer: msgText.slice(0, 500) });
                                if (saved) bot.log(`📝 Poll: Learned Q&A: "${question.slice(0, 40)}" → "${msgText.slice(0, 40)}"`);
                            } else if (msgText.length > 5) {
                                const saved = saveLearning(bot, { type: 'fact', content: msgText.slice(0, 500) });
                                if (saved) bot.log(`📝 Poll: Learned fact: "${msgText.slice(0, 50)}"`);
                            }
                        }
                    }
                    // Track last non-self message per channel (for question context)
                    if (msg.author.id !== bot.selfUserId) {
                        if (!bot._lastChannelQuestion) bot._lastChannelQuestion = {};
                        bot._lastChannelQuestion[channelId] = (msg.content || '').slice(0, 500);
                    }

                    // ── AI handler (poll-based) — reply to Neuro or @mention ──
                    const neuroExcludedPoll = ['1451246122755559555'];
                    const pollHasAiKeys = getAiCredentials(cfg).length > 0;
                    if (!msg.author.bot && pollHasAiKeys && bot.selfUserId && !neuroExcludedPoll.includes(channelId)) {
                        const content = msg.content || '';
                        const mentionFollowupWindowMs = 45000;
                        if (!bot._aiMentionFollowups) bot._aiMentionFollowups = new Map();
                        const followupKey = `${channelId}:${msg.author.id}`;
                        const pendingMentionTs = bot._aiMentionFollowups.get(followupKey) || 0;
                        const isRecentMentionPending = pendingMentionTs > 0 && (Date.now() - pendingMentionTs) <= mentionFollowupWindowMs;
                        const mentionsMe = content.includes(`<@${bot.selfUserId}>`) || content.includes(`<@!${bot.selfUserId}>`);
                        const isMentionTrigger = mentionsMe;
                        const isReplyToNeuro = isReplyToTrackedNeuroMessage(bot, msg);
                        const isFollowupAfterMention = !isMentionTrigger && !isReplyToNeuro && isRecentMentionPending;
                        const isAllowedAuthor = msg.author.id !== bot.selfUserId || isMentionTrigger;
                        const canTrigger = isReplyToNeuro || isMentionTrigger || isFollowupAfterMention;

                        if (isAllowedAuthor && canTrigger && !_neuroProcessed.has(msg.id)) {
                            let question = content
                                .replace(new RegExp(`<@!?${bot.selfUserId}>`, 'g'), '')
                                .replace(/[,،\s]+/g, ' ')
                                .trim();
                            if (isMentionTrigger && (!question || shouldSkipNeuroQuestion(question))) {
                                bot._aiMentionFollowups.set(followupKey, Date.now());
                                bot.log(`🧠 Poll: mention-only from ${msg.author.username}, waiting follow-up question...`);
                                continue;
                            }
                            if (isFollowupAfterMention && !question) {
                                question = content.trim();
                            }
                            bot._aiMentionFollowups.delete(followupKey);

                            const aiGuildId = msg.guild_id || bot.channelCache.get(channelId)?.guild_id || cfg.guildId || '';
                            const direct = getDirectNeuroDecision({
                                question,
                                cfg,
                                channelId,
                                guildId: aiGuildId,
                            });
                            if (direct?.response) {
                                _neuroProcessed.add(msg.id);
                                setTimeout(() => _neuroProcessed.delete(msg.id), 60000);
                                bot.log(`🤖 Poll: direct reply [${direct.source}] to ${msg.author.username}: "${question.slice(0, 100)}"`);
                                (async () => {
                                    try {
                                        const sentRes = await bot.sendDiscordMessage(channelId, direct.response, msg.id);
                                        if (sentRes.ok) {
                                            rememberNeuroMessageId(bot, sentRes);
                                            enqueueNeuroTelegramNotification(bot, {
                                                channelId,
                                                authorUsername: msg.author?.username || msg.author?.global_name || msg.author?.id,
                                                question,
                                                answer: direct.response,
                                            });
                                            if (bot._convLogger) {
                                                bot._convLogger.logAIResponse({
                                                    channelId,
                                                    question: direct.response,
                                                    authorUsername: bot.user?.username || 'Neuro',
                                                });
                                            }
                                            bot.log(`✅ Poll: direct response sent to #${channelId}`);
                                        } else {
                                            bot.log(`❌ Poll: failed to send direct reply: ${sentRes.status}`);
                                        }
                                    } catch (e) {
                                        bot.log(`❌ Poll: direct reply error: ${e.message}`);
                                    }
                                })();
                                continue;
                            }

                            _neuroProcessed.add(msg.id);
                            setTimeout(() => _neuroProcessed.delete(msg.id), 60000);
                            if (question.length > 0 && !shouldSkipNeuroQuestion(question)) {
                                const triggerType = isReplyToNeuro ? 'reply' : (isFollowupAfterMention ? 'mention_followup' : 'mention');
                                bot.log(`🧠 Poll: Neuro AI [${triggerType}] from ${msg.author.username}: "${question.slice(0, 100)}"`);
                                if (bot._convLogger) {
                                    bot._convLogger.logAIResponse({
                                        channelId,
                                        question,
                                        authorUsername: msg.author.username,
                                    });
                                }
                                if (!bot._aiPendingChannels) bot._aiPendingChannels = new Set();
                                bot._aiPendingChannels.add(channelId);
                                setTimeout(() => bot._aiPendingChannels?.delete(channelId), 30000);
                                const prevBotReply = isReplyToNeuro ? (msg.referenced_message.content || '').slice(0, 500) : '';
                                (async () => {
                                    try {
                                        const systemPrompt = loadSystemPrompt();
                                        const channelHistory = bot._convLogger ? bot._convLogger.getChannelHistory(channelId, 10) : [];
                                        const messages = [{ role: 'system', content: systemPrompt }];
                                        const ragContext = buildRagContextMessage({
                                            query: question,
                                            dataDir: bot.dataDir || _dataDir,
                                            config: cfg,
                                            topK: 8,
                                            maxContextChars: 2600,
                                        });
                                        if (ragContext.message) {
                                            messages.push({ role: 'system', content: ragContext.message });
                                            bot.log(`📚 Poll RAG context attached: ${ragContext.snippetCount} snippets`);
                                        }
                                        appendHistoryMessages(bot, messages, channelHistory);
                                        if (prevBotReply && !channelHistory.some(e => e.type === 'ai_question' && (e.question || e.answer || '').includes(prevBotReply.slice(0, 50)))) {
                                            if (messages.length > 1 && messages[messages.length - 1].role === 'assistant') {
                                                messages[messages.length - 1].content += `\n${prevBotReply}`;
                                            } else {
                                                messages.push({ role: 'assistant', content: prevBotReply });
                                            }
                                        }
                                        pushChatMessage(messages, 'user', question);
                                        const aiResult = await requestAiAnswer(bot, cfg, messages, { logPrefix: 'Poll: ' });
                                        let answerText = aiResult.ok ? aiResult.answerText : '';
                                        if (aiResult.ok) bot.log(`🧠 Poll: AI success (${aiResult.provider}/${aiResult.model})`);
                                        if (answerText) {
                                            const guarded = sanitizeResponseLinks(answerText);
                                            answerText = guarded.text;
                                            if (guarded.replacedCount > 0) {
                                                const blockedPreview = guarded.blockedUrls.slice(0, 3).join(', ');
                                                bot.log(`🛡️ Poll link guard replaced ${guarded.replacedCount} URL(s)${blockedPreview ? `: ${blockedPreview}` : ''}`);
                                            }

                                            const sentRes = await bot.sendDiscordMessage(channelId, answerText, msg.id);
                                            if (sentRes.ok) {
                                                bot.log(`✅ Poll: Neuro response sent to #${channelId}`);
                                                rememberNeuroMessageId(bot, sentRes);
                                                enqueueNeuroTelegramNotification(bot, {
                                                    channelId,
                                                    authorUsername: msg.author?.username || msg.author?.global_name || msg.author?.id,
                                                    question,
                                                    answer: answerText,
                                                });
                                                if (bot._convLogger) {
                                                    bot._convLogger.logAIResponse({
                                                        channelId,
                                                        question: answerText,
                                                        authorUsername: bot.user?.username || 'Neuro'
                                                    });
                                                }
                                            } else {
                                                bot.log(`❌ Poll: Failed to send Discord message: ${sentRes.status}`);
                                            }
                                        } else {
                                            bot.log(`❌ Poll: Neuro API failed or no response generated${aiResult.error ? ` (${aiResult.error})` : ''}.`);
                                        }
                                    } catch (e) {
                                        bot.log(`❌ Poll: Neuro AI error: ${e.stack}`);
                                    }
                                })();
                            }
                        }
                    }

                    const ch = bot.channelCache.get(channelId);
                    const msgGuildId = ch?.guild_id || guildId;
                    const arExclude2 = cfg.autoReplyExcludeChannels || ['717735180546343032'];
                    if (arExclude2.includes(channelId)) continue;
                    const decision = evaluateAutoReplyDecision({
                        rules: cfg.autoReplies || [],
                        content: msg.content || '',
                        channelId,
                        guildId: msgGuildId,
                        source: 'poll',
                    });
                    if (decision.action === 'send' && decision.response) {
                        const details = {
                            rule_id: decision.ruleId,
                            rule_name: decision.ruleName,
                            keywords: decision.keywords,
                            confidence: decision.confidence,
                            source: decision.source,
                            reason: decision.reason,
                            channel_id: channelId,
                            guild_id: msgGuildId,
                        };
                        bot.log(`🤖 Auto-reply matched (poll): "${decision.ruleName}" from ${msg.author.username} in #${channelId}`, 'autoreply', details);
                        const delaySec = decision.ruleId === 'moderation_check' ? 2 : (((cfg.autoReplies || []).find(r => (r.id || '') === decision.ruleId || r.name === decision.ruleName)?.delay) || 2);
                        await sleep(delaySec * 1000);
                        try {
                            await bot.sendDiscordMessage(channelId, decision.response, msg.id);
                            bot.log(`✅ Auto-reply sent: "${decision.ruleName}"`, 'autoreply', details);
                            bot.enqueue({ text: `🤖 <b>Авто-ответ отправлен</b>\n\n📋 <b>Правило:</b> ${decision.ruleName}\n🧾 <b>rule_id:</b> <code>${decision.ruleId}</code>\n🎯 <b>confidence:</b> <code>${Number(decision.confidence || 0).toFixed(2)}</code>\n🔎 <b>source:</b> <code>${decision.source}</code>\n👤 <b>Игрок:</b> ${msg.author?.username || 'unknown'}\n💬 <b>Сообщение:</b> <i>${(msg.content || '').slice(0, 150)}</i>` });
                        } catch (e) {
                            bot.log(`❌ Auto-reply send failed: ${e.message}`);
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
