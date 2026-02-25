// ═══════════════════════════════════════════════════════════════
//  Conversation Logger — logs Q&A pairs for AI self-learning
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const MAX_ENTRIES = 5000;

class ConversationLogger {
    constructor(dataDir) {
        this.logFile = path.join(dataDir, 'conversation_log.json');
        this.entries = [];
        this._load();
    }

    _load() {
        try {
            if (fs.existsSync(this.logFile)) {
                this.entries = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
            }
        } catch (e) {
            console.log(`[ConvLog] Failed to load log: ${e.message}`);
            this.entries = [];
        }
    }

    _save() {
        try {
            // Trim to max entries
            if (this.entries.length > MAX_ENTRIES) {
                this.entries = this.entries.slice(-MAX_ENTRIES);
            }
            fs.writeFileSync(this.logFile, JSON.stringify(this.entries, null, 2), 'utf8');
        } catch (e) {
            console.log(`[ConvLog] Failed to save log: ${e.message}`);
        }
    }

    /**
     * Log a manual response from the real user (d1reevo)
     * @param {object} opts
     */
    logManualResponse({ channelId, question, answer, authorUsername, timestamp }) {
        this.entries.push({
            type: 'manual',
            channelId,
            question: question || '',
            answer,
            authorUsername,
            timestamp: timestamp || new Date().toISOString(),
        });
        this._save();
    }

    /**
     * Log an AI-generated response
     * @param {object} opts
     */
    logAIResponse({ channelId, question, authorUsername, timestamp }) {
        this.entries.push({
            type: 'ai_question',
            channelId,
            question,
            authorUsername,
            timestamp: timestamp || new Date().toISOString(),
        });
        this._save();
    }

    /**
     * Get recent manual responses as training examples
     * @param {number} count
     * @returns {Array}
     */
    getRecentManualExamples(count = 50) {
        return this.entries
            .filter(e => e.type === 'manual' && e.answer && e.answer.length > 5)
            .slice(-count);
    }

    /**
     * Get all entries for a specific channel (for context)
     * @param {string} channelId
     * @param {number} count
     */
    getChannelHistory(channelId, count = 10) {
        return this.entries
            .filter(e => e.channelId === channelId)
            .slice(-count);
    }

    /**
     * Get stats about the log
     */
    getStats() {
        const manual = this.entries.filter(e => e.type === 'manual').length;
        const ai = this.entries.filter(e => e.type === 'ai_question').length;
        return { total: this.entries.length, manual, ai };
    }
}

module.exports = ConversationLogger;
