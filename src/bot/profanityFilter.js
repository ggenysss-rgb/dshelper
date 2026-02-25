// ═══════════════════════════════════════════════════════════════
//  Russian profanity filter with obfuscation detection
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

// Root stems of Russian profanity (normalized)
// These are the most common base forms that will catch conjugations/declensions
const PROFANITY_ROOTS = [
    'хуй', 'хуя', 'хуе', 'хуё', 'хуи', 'хую', 'хул',
    'пизд', 'пезд',
    'блят', 'бляд', 'блят', 'бляи',
    'ебат', 'ебан', 'ебал', 'ебаш', 'ебну', 'ебёт', 'ебет', 'ебис', 'ебуч', 'ебла', 'ёбан',
    'заеб', 'заёб', 'наеб', 'наёб', 'отъеб', 'уеб', 'уёб', 'выеб', 'въеб', 'доеб', 'доёб',
    'сука', 'суки', 'суку', 'сучк', 'сучар', 'сучий',
    'мудак', 'мудач', 'мудил', 'мудозв',
    'долбоёб', 'долбаёб', 'долбоеб', 'долбаеб',
    'пидор', 'пидар', 'пидр', 'педик', 'педер',
    'шлюх', 'шалав',
    'гандон', 'гондон',
    'дрочи', 'дроч',
    'залуп',
    'манда', 'манду',
    'чмо', 'чморе',
    'нахуй',
    'похуй',
    'охуе', 'охуё',
    'ахуе', 'ахуё',
];

/**
 * Check if text contains profanity (including obfuscated)
 * @param {string} text - message content
 * @returns {{ found: boolean, match: string }} result
 */
function containsProfanity(text) {
    if (!text || text.length < 3) return { found: false, match: '' };

    const normalized = normalize(text);

    for (const root of PROFANITY_ROOTS) {
        if (normalized.includes(root)) {
            return { found: true, match: root };
        }
    }

    return { found: false, match: '' };
}

module.exports = { containsProfanity, normalize };
