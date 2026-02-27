// ═══════════════════════════════════════════════════════════════
//  Bot Message Builders — Telegram notification messages
// ═══════════════════════════════════════════════════════════════

const { escapeHtml, truncate, formatDuration, nowTime, formatDateTime, channelLink, getPriority, slaEmoji, getMemberDisplayName } = require('./helpers');

function buildTicketCreatedMessage(channel, guild, config) {
    const name = escapeHtml(channel.name || channel.id);
    const link = channelLink(config.guildId, channel.id);
    const priority = getPriority(channel.name || '', '', config.priorityKeywords);
    const text = [
        `╔══════════════════════╗`,
        `║  🎫  <b>НОВЫЙ ТИКЕТ</b>`,
        `╚══════════════════════╝`,
        ``,
        `📋  <b>Канал:</b>   <code>#${name}</code>`,
        `🏠  <b>Сервер:</b>  ${escapeHtml(guild?.name || 'Unknown')}`,
        `${priority.emoji}  <b>Приоритет:</b>  ${priority.badge}`,
        `🕐  <b>Время:</b>   ${nowTime()}`,
        ``,
        `<i>💡 Тикет ожидает ответа</i>`,
    ].join('\n');
    return {
        text, channelId: channel.id, replyMarkup: {
            inline_keyboard: [
                [{ text: '✅ Взять тикет', callback_data: `tsel_${channel.id}` }, { text: '🔗 Открыть в Discord', url: link }]
            ]
        }
    };
}

function buildFirstMessageNotification(channel, message, config) {
    const chName = escapeHtml(channel?.name || message.channel_id);
    const link = channelLink(config.guildId, message.channel_id);
    const author = message.author;
    const displayName = getMemberDisplayName(message.member, author);
    const rawUsername = author?.username || 'Неизвестно';
    const maxLen = config.maxMessageLength || 300;
    const content = escapeHtml(truncate(message.content || '(вложение без текста)', maxLen));
    const priority = getPriority(channel?.name || '', message.content || '', config.priorityKeywords);
    const text = [
        `╔══════════════════════╗`,
        `║  💬  <b>НОВОЕ СООБЩЕНИЕ</b>`,
        `╚══════════════════════╝`,
        ``,
        `📋  <b>Тикет:</b>   <code>#${chName}</code>`,
        `👤  <b>Игрок:</b>   ${escapeHtml(displayName)}  <i>(@${escapeHtml(rawUsername)})</i>`,
        `${priority.emoji}  <b>Приоритет:</b>  ${priority.badge}`,
        `🕐  <b>Время:</b>   ${nowTime()}`,
        ``,
        `💌  <b>Сообщение:</b>`,
        `<blockquote>${content}</blockquote>`,
    ].join('\n');
    return {
        text, channelId: message.channel_id, replyMarkup: {
            inline_keyboard: [
                [{ text: '✅ Взять тикет', callback_data: `tsel_${message.channel_id}` }, { text: '🔗 Перейти в Discord', url: link }]
            ]
        }
    };
}

function buildTicketClosedMessage(record, ps) {
    return {
        text: [
            `╔══════════════════════╗`,
            `║  🔒  <b>ТИКЕТ ЗАКРЫТ</b>`,
            `╚══════════════════════╝`,
            ``,
            `📋  <b>Канал:</b>   <code>#${escapeHtml(record.channelName)}</code>`,
            `🏠  <b>Сервер:</b>  ${escapeHtml(record.guildName)}`,
            `⏱  <b>Жил:</b>     ${formatDuration(Date.now() - record.createdAt)}`,
            `🕐  <b>Закрыт:</b>  ${nowTime()}`,
            ``,
            `📊  <b>Всего:</b>  🎫 ${ps.totalCreated}  ·  🔒 ${ps.totalClosed}`,
        ].join('\n')
    };
}

function buildHighPriorityAlert(channelName) {
    return { text: `🚨🚨  <b>ВЫСОКИЙ ПРИОРИТЕТ</b>  🚨🚨\n\nТикет <code>#${escapeHtml(channelName)}</code> требует <b>срочного</b> ответа!` };
}

function buildActivityMessage(record, type, minutes) {
    const link = channelLink(record.guildId, record.channelId);
    if (type === 'closing') {
        return {
            text: [
                `╔══════════════════════╗`, `║  ⏰  <b>МОЖНО ЗАКРЫВАТЬ</b>`, `╚══════════════════════╝`, ``,
                `📋  <b>Тикет:</b>   <code>#${escapeHtml(record.channelName)}</code>`,
                `⏱  <b>Прошло:</b>  ${minutes} мин. без ответа игрока`,
                `🕐  <b>Время:</b>   ${nowTime()}`, ``,
                `<i>Игрок не отвечает ${minutes} минут. Вы можете закрывать тикет.</i>`,
            ].join('\n'),
            replyMarkup: { inline_keyboard: [[{ text: '🔗 Открыть тикет', url: link }]] }
        };
    }
    return {
        text: [
            `╔══════════════════════╗`, `║  ⏰  <b>НЕТ ОТВЕТА</b>`, `╚══════════════════════╝`, ``,
            `📋  <b>Тикет:</b>   <code>#${escapeHtml(record.channelName)}</code>`,
            `⏱  <b>Прошло:</b>  ${minutes} мин. без ответа игрока`,
            `🕐  <b>Время:</b>   ${nowTime()}`, ``,
            `<i>Игрок не отвечает ${minutes} минут. Возможно, стоит уточнить, остались ли у него вопросы?</i>`,
        ].join('\n'),
        replyMarkup: { inline_keyboard: [[{ text: '🔗 Открыть тикет', url: link }]] }
    };
}

function buildForwardedMessage(channelName, author, member, content, attachments, maxLen) {
    const displayName = getMemberDisplayName(member, author);
    const username = author?.username || 'Неизвестно';
    const lines = [
        `┌─── 💬 <b>#${escapeHtml(channelName)}</b> ───`,
        `│ 👤 <b>${escapeHtml(displayName)}</b> <i>(@${escapeHtml(username)})</i>`,
        `│ 🕐 ${nowTime()}`,
        `├───────────────`,
    ];
    if (content) lines.push(`│ ${escapeHtml(truncate(content, maxLen || 300))}`);
    if (attachments?.length > 0) {
        lines.push(`│`);
        for (const att of attachments) {
            const name = att.filename || 'файл';
            const url = att.url || att.proxy_url || '';
            lines.push(url ? `│ 📎 <a href="${url}">${escapeHtml(name)}</a>` : `│ 📎 ${escapeHtml(name)}`);
        }
    }
    lines.push(`└───────────────`);
    return lines.join('\n');
}

function buildStartMessage(activeCount, config) {
    return [
        `╔══════════════════════╗`, `║  🤖  <b>TICKET NOTIFIER</b>`, `╚══════════════════════╝`, ``,
        `Привет! Я бот для мониторинга тикетов.`,
        `Отслеживаю тикеты на сервере и отправляю уведомления сюда.`, ``,
        `✉️  <b>Чат с тикетами:</b>`,
        `  /list — выбрать тикет (кнопки)`,
        `  /s &lt;текст&gt; — отправить в выбранный тикет`,
        `  /ticket — показать текущий тикет`,
        `  /unselect — сбросить выбор`,
        `  💬 Ответы игроков приходят автоматически!`, ``,
        `📋  <b>Мониторинг:</b>`,
        `  /oldlist — открытые тикеты (SLA)`,
        `  /stats — статистика · /ai — токены AI`,
        `  /settings — настройки · /set — изменить`,
        `  /pause · /resume — пауза/возобновление`, ``,
        `✉️  <b>Быстрая отправка:</b>`,
        `  /msg &lt;номер&gt; &lt;текст&gt; — отправить в тикет`,
        `  Или <b>reply</b> на уведомление`, ``,
        `📜  <b>История и бинды:</b>`,
        `  /history — история сообщений тикета`,
        `  /binds — все шаблоны ответов`,
        `  /addbind &lt;имя&gt; &lt;текст&gt; — добавить шаблон`,
        `  /delbind &lt;имя&gt; — удалить шаблон`,
        `  /&lt;имя&gt; — быстрый поиск и отправка бинда`, ``,
        `👋  <b>Авто-приветствие:</b>`,
        `  /greet — статус · /greet on|off — вкл/выкл`,
        `  /setgreet &lt;текст&gt; — изменить текст`, ``,
        `📅  <b>Смена:</b>`,
        `  /smena — начать смену · /smenoff — закрыть`,
        `  ⏰ Авто-напоминание в 11:00 если не отмечено`, ``,
        `🌐  <b>Dashboard:</b>`,
        `  /web — открыть панель управления в Telegram`, ``,
        `🟢 Сейчас открыто: ${activeCount} тикетов`,
        `🕐 ${nowTime()}`,
    ].join('\n');
}

function buildStatsMessage(ps, botPaused, activeCount, closedCount) {
    return [
        `╔══════════════════════╗`, `║  🧪  <b>СТАТИСТИКА</b>`, `╚══════════════════════╝`, ``,
        `${botPaused ? '⏸ Бот на паузе' : '✅ Бот работает корректно!'}`,
        `🕐  ${nowTime()}`, ``,
        `📊  <b>Данные:</b>`,
        `    🎫 Всего создано:  ${ps.totalCreated}`,
        `    🔒 Закрыто:        ${ps.totalClosed}`,
        `    📭 Активных:       ${activeCount}`,
        `    💾 В архиве:       ${closedCount}`,
        `    ✉️ Сообщений:      ${ps.totalMessagesSent}`,
    ].join('\n');
}

function buildListMessage(activeTickets, config) {
    if (activeTickets.size === 0) {
        return [`╔══════════════════════╗`, `║  📋  <b>ОТКРЫТЫЕ ТИКЕТЫ</b>`, `╚══════════════════════╝`, ``, `<i>Нет открытых тикетов 🎉</i>`].join('\n');
    }
    const lines = [`╔══════════════════════╗`, `║  📋  <b>ОТКРЫТЫЕ ТИКЕТЫ</b>  (${activeTickets.size})`, `╚══════════════════════╝`, ``];
    let i = 1;
    for (const record of activeTickets.values()) {
        const name = escapeHtml(record.channelName);
        const age = formatDuration(Date.now() - record.createdAt);
        const lastMsg = record.lastMessage ? escapeHtml(truncate(record.lastMessage, 60)) : '<i>сообщений нет</i>';
        const lastTime = record.lastMessageAt ? formatDateTime(record.lastMessageAt) : '—';
        const link = channelLink(record.guildId, record.channelId);
        lines.push(`${slaEmoji(record)} <b>${i}.</b> <code>#${name}</code>`, `   ⏱ Висит: ${age}`, `   💬 Последнее: ${lastTime}`, `   <i>${lastMsg}</i>`, `   🔗 <a href="${link}">Открыть</a>`, ``);
        i++;
    }
    lines.push(`🕐 ${nowTime()}`);
    return lines.join('\n');
}

function buildTicketListButtons(tickets, page, TICKETS_PER_PAGE, activeTicketId) {
    const totalPages = Math.ceil(tickets.length / TICKETS_PER_PAGE);
    if (page >= totalPages) page = totalPages - 1;
    if (page < 0) page = 0;
    const start = page * TICKETS_PER_PAGE;
    const pageTickets = tickets.slice(start, start + TICKETS_PER_PAGE);

    const lines = [`╔══════════════════════════╗`, `║  🎫  <b>ВЫБЕРИ ТИКЕТ</b>  (${tickets.length})`, `╚══════════════════════════╝`, ``];
    if (activeTicketId) { lines.push(`✅ Активный: <code>#${escapeHtml(activeTicketId)}</code>`, ``); }

    for (let i = 0; i < pageTickets.length; i++) {
        const t = pageTickets[i];
        const num = start + i + 1;
        const age = formatDuration(Date.now() - t.createdAt);
        const lastMsg = t.lastMessage ? truncate(t.lastMessage, 40) : 'нет сообщений';
        const isActive = t.channelId === activeTicketId;
        lines.push(`${isActive ? '▶️' : '📩'} <b>${num}.</b> <code>#${escapeHtml(t.channelName)}</code>`);
        lines.push(`    ⏱ ${age} │ 💬 <i>${escapeHtml(lastMsg)}</i>`);
    }
    lines.push(``, `📄 Стр. ${page + 1}/${totalPages} │ 🕐 ${nowTime()}`);

    const buttons = [];
    for (let i = 0; i < pageTickets.length; i += 2) {
        const row = [];
        for (let j = i; j < Math.min(i + 2, pageTickets.length); j++) {
            const t = pageTickets[j]; const num = start + j + 1;
            const shortName = t.channelName.length > 20 ? t.channelName.slice(0, 18) + '..' : t.channelName;
            const isActive = t.channelId === activeTicketId;
            row.push({ text: `${isActive ? '✅' : '📩'} ${num}. ${shortName}`, callback_data: `tsel_${t.channelId}` });
        }
        buttons.push(row);
    }
    const navRow = [];
    if (page > 0) navRow.push({ text: '⬅️ Назад', callback_data: `tpage_${page - 1}` });
    navRow.push({ text: '🔄 Обновить', callback_data: `tpage_${page}` });
    if (page < totalPages - 1) navRow.push({ text: 'Вперёд ➡️', callback_data: `tpage_${page + 1}` });
    buttons.push(navRow);
    if (activeTicketId) buttons.push([{ text: '❌ Снять выбор', callback_data: 'tunselect' }]);

    return { text: lines.join('\n'), markup: { inline_keyboard: buttons }, page };
}

function buildActiveTicketMessage(activeTicketId, activeTicketName, record, config) {
    if (!activeTicketId) {
        return { text: '📭 Тикет не выбран. Нажми /list и выбери тикет.', markup: { inline_keyboard: [[{ text: '📋 Открыть список', callback_data: 'tpage_0' }]] } };
    }
    const name = activeTicketName || '?';
    const age = record ? formatDuration(Date.now() - record.createdAt) : '?';
    const lastMsg = record?.lastMessage ? escapeHtml(truncate(record.lastMessage, 80)) : '<i>нет сообщений</i>';
    const link = channelLink(config.guildId, activeTicketId);
    return {
        text: [
            `╔══════════════════════════╗`, `║  ✅  <b>АКТИВНЫЙ ТИКЕТ</b>`, `╚══════════════════════════╝`, ``,
            `📌 <code>#${escapeHtml(name)}</code>`, `⏱ Возраст: ${age}`, `💬 Последнее: <i>${lastMsg}</i>`,
            `🔗 <a href="${link}">Открыть в Discord</a>`, ``,
            `<b>Пиши:</b> <code>/s текст сообщения</code>`, `Или просто напиши текст — он уйдёт в тикет.`,
        ].join('\n'),
        markup: { inline_keyboard: [[{ text: '📜 История чата', callback_data: 'thistory' }], [{ text: '📋 Открыть список', callback_data: 'tpage_0' }, { text: '❌ Снять выбор', callback_data: 'tunselect' }]] }
    };
}

module.exports = {
    buildTicketCreatedMessage, buildFirstMessageNotification, buildTicketClosedMessage,
    buildHighPriorityAlert, buildActivityMessage, buildForwardedMessage,
    buildStartMessage, buildStatsMessage, buildListMessage,
    buildTicketListButtons, buildActiveTicketMessage,
};
