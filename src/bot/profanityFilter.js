// ═══════════════════════════════════════════════════════════════
//  Russian profanity filter — ONLY harsh insults
// ═══════════════════════════════════════════════════════════════

// Character substitution — covers obfuscation (Latin lookalikes etc)
const CHAR_MAP = {
    '@': 'а', '$': 'с', '0': 'о', '3': 'з',
    '4': 'ч', '6': 'б', '!': 'и', '(': 'с', ')': 'о', '|': 'л',
    '€': 'е', '₽': 'р', '№': 'н',
    // Latin lookalikes → Cyrillic
    'a': 'а', 'b': 'б', 'c': 'с', 'e': 'е', 'h': 'н', 'i': 'и',
    'k': 'к', 'm': 'м', 'n': 'н', 'o': 'о', 'p': 'р', 'r': 'р',
    't': 'т', 'u': 'у', 'x': 'х', 'y': 'у', 'w': 'ш',
};

// Only remove obfuscation chars WITHIN words, NOT spaces
const REMOVE_CHARS = new Set(['*', '#', '.', ',', '-', '_', '~', '+', '=', '`', "'", '"', '^', '/']);

/**
 * Normalize a single word: lowercase, replace lookalikes, remove decorators
 */
function normalizeWord(word) {
    let result = '';
    for (const ch of word.toLowerCase()) {
        if (REMOVE_CHARS.has(ch)) continue;
        result += CHAR_MAP[ch] !== undefined ? CHAR_MAP[ch] : ch;
    }
    return result;
}

// ══════════════════════════════════════════
//  HARSH INSULTS ONLY — trigger staff ping
// ══════════════════════════════════════════
const PROFANITY_ROOTS = [
    // Classic profanity (мат)
    'хуй', 'хуя', 'хуе', 'хуё', 'хуи', 'хую',
    'пизд', 'пезд',
    'блят', 'бляд',
    'ебат', 'ебан', 'ебал', 'ебаш', 'ебну', 'ебёт', 'ебет', 'ебуч', 'ебла', 'ёбан',
    'заеб', 'заёб', 'наеб', 'наёб', 'отъеб', 'уеб', 'уёб', 'выеб', 'въеб', 'доеб', 'доёб',
    'нахуй', 'похуй',
    'охуе', 'охуё', 'ахуе', 'ахуё',
    'сука', 'суки', 'суку', 'сучк', 'сучар',
    'мудак', 'мудач', 'мудил',
    'долбоёб', 'долбаёб', 'долбоеб', 'долбаеб',
    'пидор', 'пидар', 'пидр', 'педик', 'педер',
    'шлюх', 'шалав',
    'гандон', 'гондон',
    'манда', 'манду',

    // Harsh insults
    'мразь', 'мрази',
    'тварь', 'твари',
    'ублюдок', 'ублюдк',
    'гнида', 'гнид',
    'проститутк',
    'прошмандовк',
    'подстилк',
    'черножоп',
    'ниггер', 'нигер',
    'чурк',
    'пиздолиз',
    'миньетчиц', 'минетчиц',
    'падаль', 'падл',
    'недоразвит',
    'быдл',
    'шкура',
];

/**
 * Check if text contains profanity (word-by-word, no space stripping)
 * @param {string} text
 * @returns {{ found: boolean, match: string }}
 */
function containsProfanity(text) {
    if (!text || text.length < 2) return { found: false, match: '' };

    // Split into words and check each word individually
    const words = text.split(/\s+/);
    for (const word of words) {
        const normalized = normalizeWord(word);
        if (normalized.length < 3) continue;

        for (const root of PROFANITY_ROOTS) {
            if (normalized.includes(root)) {
                return { found: true, match: root };
            }
        }
    }

    return { found: false, match: '' };
}

module.exports = { containsProfanity, normalizeWord };
