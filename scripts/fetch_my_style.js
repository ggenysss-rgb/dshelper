#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  Fetch your Discord messages and generate an AI style prompt
//  Usage: node scripts/fetch_my_style.js
// ═══════════════════════════════════════════════════════════════

const https = require('https');
const fs = require('fs');
const path = require('path');

// ── Config ──
const TOKEN = process.env.DISCORD_TOKEN || require('../config.json').discordToken;
const MY_USER_ID = '1241794453694316677';
const CHANNEL_ID = '717734206586880060'; // #⛄общение
const MAX_MESSAGES = 500;

function discordGet(endpoint) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'discord.com',
            path: `/api/v9${endpoint}`,
            method: 'GET',
            headers: { 'Authorization': TOKEN, 'Content-Type': 'application/json' },
        };
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch { reject(new Error(`Failed to parse: ${body.slice(0, 200)}`)); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function fetchAllMessages(channelId, targetCount) {
    const msgs = [];
    let before = null;
    let batch = 0;
    // Fetch up to 5000 messages total to find enough of ours
    while (batch < 50) {
        let url = `/channels/${channelId}/messages?limit=100`;
        if (before) url += `&before=${before}`;

        const data = await discordGet(url);
        if (!Array.isArray(data) || data.length === 0) break;

        // Filter to only our messages
        const mine = data.filter(m =>
            m.author.id === MY_USER_ID &&
            m.content && m.content.length > 3 &&
            !m.content.startsWith('!') && !m.content.startsWith('/') &&
            !m.content.startsWith('http') &&
            !m.content.match(/^Начал/i) &&
            !m.content.match(/^<[:@]/) // skip emoji-only and mention-only
        );

        msgs.push(...mine);
        before = data[data.length - 1].id;
        batch++;

        console.log(`  📦 Batch ${batch}: ${data.length} msgs, ${mine.length} mine (total: ${msgs.length}/${targetCount})`);

        if (msgs.length >= targetCount) break;
        if (data.length < 100) break; // reached end of channel

        await new Promise(r => setTimeout(r, 500)); // rate limit
    }
    return msgs.slice(0, targetCount);
}

async function main() {
    console.log('🧠 Fetching your messages from #⛄общение...\n');

    const myMessages = await fetchAllMessages(CHANNEL_ID, MAX_MESSAGES);
    console.log(`\n📊 Total messages collected: ${myMessages.length}`);

    // Analyze style
    const texts = myMessages.map(m => m.content);
    const avgLen = Math.round(texts.reduce((a, m) => a + m.length, 0) / texts.length);
    const withEmoji = texts.filter(m => /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}]/u.test(m)).length;
    const withCaps = texts.filter(m => m === m.toLowerCase()).length;
    const emojiPercent = Math.round(withEmoji / texts.length * 100);
    const lowercasePercent = Math.round(withCaps / texts.length * 100);

    console.log(`📏 Average message length: ${avgLen} chars`);
    console.log(`😊 Messages with emoji: ${emojiPercent}%`);
    console.log(`🔡 Messages all lowercase: ${lowercasePercent}%`);

    // Load binds
    const binds = require('../src/bot/defaultBinds');
    const bindsList = Object.entries(binds)
        .map(([key, val]) => `/${key} → "${val.message.slice(0, 150)}${val.message.length > 150 ? '...' : ''}"`)
        .join('\n');

    // Build examples (limit to 150 most interesting ones for prompt size)
    const examples = texts
        .filter(m => m.length > 5 && m.length < 500) // skip very short and very long
        .slice(0, 150)
        .map(m => `- "${m}"`)
        .join('\n');

    const prompt = `Ты — d1reevo. Ты отвечаешь ТОЧНО в таком же стиле как показано в примерах ниже. Ты НЕ ИИ, ты живой человек — администратор игрового сервера.

ПРАВИЛА:
- Копируй стиль из примеров: длину сообщений, пунктуацию, сленг
- Средняя длина твоего сообщения: ${avgLen} символов
- ${lowercasePercent > 60 ? 'Пиши в основном маленькими буквами' : 'Используй обычный регистр'}
- ${emojiPercent > 30 ? 'Используй эмодзи умеренно' : 'Эмодзи используй редко'}
- Отвечай СТРОГО на заданный вопрос
- Не используй фразы типа "Конечно!", "Рад помочь!", "Безусловно!" — это звучит как бот
- Максимум 500 символов

Контекст: ты админ на игровом сервере FunTime (Minecraft). Если спрашивают про баны — скажи написать тикет или подать апелляцию. Если спрашивают когда вайп — скажи что информация будет опубликована дополнительно.

БЫСТРЫЕ ОТВЕТЫ (используй когда подходит по теме):
${bindsList}

ПРИМЕРЫ ТВОИХ РЕАЛЬНЫХ СООБЩЕНИЙ (${texts.length} шт, копируй этот стиль):
${examples}`;

    // Save to file
    const outPath = path.join(__dirname, '..', 'neuro_style_prompt.txt');
    fs.writeFileSync(outPath, prompt, 'utf-8');
    console.log(`\n✅ Prompt saved to: ${outPath}`);
    console.log(`📏 Prompt length: ${prompt.length} chars`);
    console.log(`📋 Copy the content of neuro_style_prompt.txt into n8n System prompt\n`);
}

main().catch(e => console.error('❌ Error:', e.message));
