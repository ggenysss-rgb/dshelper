// ═══════════════════════════════════════════════════════════════
//  Russian profanity & insult filter with obfuscation detection
// ═══════════════════════════════════════════════════════════════

// Character substitution map — covers common obfuscation tricks
const CHAR_MAP = {
    '@': 'а', '*': '', '#': '', '$': 'с', '0': 'о', '3': 'з',
    '4': 'ч', '6': 'б', '!': 'и', '(': 'с', ')': 'о', '|': 'л',
    '¡': 'и', '€': 'е', '₽': 'р', '.': '', ',': '', '-': '',
    '_': '', ' ': '', '~': '', '+': '', '=': '', '/': '',
    '\\': '', '`': '', "'": '', '"': '', '^': '', '№': 'н',
    // Latin lookalikes → Cyrillic
    'a': 'а', 'b': 'б', 'c': 'с', 'e': 'е', 'h': 'н', 'i': 'и',
    'k': 'к', 'm': 'м', 'n': 'н', 'o': 'о', 'p': 'р', 'r': 'р',
    't': 'т', 'u': 'у', 'x': 'х', 'y': 'у', 'w': 'ш',
};

/**
 * Normalize text: lowercase, replace lookalikes and separators
 */
function normalize(text) {
    let result = '';
    for (const ch of text.toLowerCase()) {
        result += CHAR_MAP[ch] !== undefined ? CHAR_MAP[ch] : ch;
    }
    return result;
}

// ══════════════════════════════════════════
//  INSULTS — trigger staff ping
// ══════════════════════════════════════════
const INSULT_ROOTS = [
    // Classic profanity
    'хуй', 'хуя', 'хуе', 'хуё', 'хуи', 'хую', 'хул',
    'пизд', 'пезд',
    'блят', 'бляд', 'бляи',
    'ебат', 'ебан', 'ебал', 'ебаш', 'ебну', 'ебёт', 'ебет', 'ебис', 'ебуч', 'ебла', 'ёбан',
    'заеб', 'заёб', 'наеб', 'наёб', 'отъеб', 'уеб', 'уёб', 'выеб', 'въеб', 'доеб', 'доёб',
    'нахуй', 'похуй',
    'охуе', 'охуё', 'ахуе', 'ахуё',
    'сука', 'суки', 'суку', 'сучк', 'сучар',
    'мудак', 'мудач', 'мудил', 'мудозв',
    'долбоёб', 'долбаёб', 'долбоеб', 'долбаеб',
    'пидор', 'пидар', 'пидр', 'педик', 'педер',
    'шлюх', 'шалав',
    'гандон', 'гондон',
    'дрочи', 'дроч',
    'манда', 'манду',

    // Insults from list
    'бездар',
    'позор',
    'бомж',
    'терпил',
    'нищий', 'нищая', 'нищие',
    'сосёшь', 'сосеш', 'соси',
    'пёс',
    'собачк',
    'дурач', 'дурак', 'дура',
    'немощ',
    'ссыкл', 'ссыку',
    'гомадрил',
    'дебил',
    'идиот',
    'слабак',
    'подсос',
    'пробирочн',
    'закройпасть',
    'клоун',
    'подстилк',
    'аутист',
    'лох', 'лошар',
    'крыса', 'крыс',
    'тупой', 'тупая', 'тупые', 'тупица',
    'баран',
    'овца',
    'свинтус',
    'быдл',
    'безмозгл',
    'гнида', 'гнид',
    'мразь', 'мрази',
    'проститутк',
    'прошмандовк',
    'тварь', 'твари',
    'ублюдок', 'ублюдк',
    'стерв',
    'шкура', 'шкур',
    'олух',
    'мусор',
    'болван',
    'ничтожеств',
    'бестолоч',
    'отморозок', 'отморозк',
    'миньетчиц', 'минетчиц',
    'пиздолиз',
    'козёл', 'козел', 'козл',
    'падаль', 'падл',
    'петушок', 'петух',
    'черножоп',
    'нига', 'нигер', 'ниггер',
    'чурбан', 'чурк',
    'животно',
    'недоразвит',
    'свинья', 'свиньи',
    'оски',
];

// Words/phrases that need exact match (not substring)
const EXACT_INSULTS = [
    'пёс', 'гад', 'аут', 'чмо',
];

// ══════════════════════════════════════════
//  NOT insults — whitelist (never trigger)
// ══════════════════════════════════════════
const WHITELIST = [
    'обиженк', 'душнил', 'бедн', 'бедолаг', 'бот', 'нытик',
    'гомик', 'гей', 'сынок', 'чушпан', 'нубас', 'нуб',
    'шкила', 'школьник', 'изич', 'езз', 'балбес', 'пердун',
    'шизик', 'хитрожоп', 'дристун', 'наркош', 'задрот',
    'противн', 'картав', 'шипиляв', 'шепеляв',
];

/**
 * Check if text contains profanity/insults (including obfuscated)
 * @param {string} text - message content
 * @returns {{ found: boolean, match: string }}
 */
function containsProfanity(text) {
    if (!text || text.length < 2) return { found: false, match: '' };

    const normalized = normalize(text);

    // Check whitelist first — if whitelisted word found, skip it
    // (whitelist only prevents the specific match, not the entire message)

    // Check root stems
    for (const root of INSULT_ROOTS) {
        if (normalized.includes(root)) {
            // Make sure it's not a whitelisted word
            const isWhitelisted = WHITELIST.some(w => normalized.includes(w));
            if (!isWhitelisted) {
                return { found: true, match: root };
            }
        }
    }

    // Check exact matches (word boundaries via spaces)
    const words = normalized.split(/\s+/);
    for (const exactWord of EXACT_INSULTS) {
        if (words.includes(exactWord)) {
            return { found: true, match: exactWord };
        }
    }

    // Check multi-word phrases
    if (normalized.includes('закройпасть') || normalized.includes('закрыпасть')) {
        return { found: true, match: 'закрой пасть' };
    }

    return { found: false, match: '' };
}

module.exports = { containsProfanity, normalize };
