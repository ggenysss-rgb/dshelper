const Database = require('better-sqlite3');
const path = require('path');

function initDb(dataDir) {
    const dbFile = path.join(dataDir, 'tickets.db');
    const db = new Database(dbFile);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');

    // Create users table
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            discord_token TEXT,
            discord_guild_id TEXT,
            tickets_category_id TEXT,
            staff_role_ids TEXT DEFAULT '[]',
            tg_token TEXT,
            tg_chat_id TEXT,
            
            auto_greet_enabled INTEGER DEFAULT 1,
            auto_greet_text TEXT,
            auto_greet_role_ids TEXT DEFAULT '[]',
            
            activity_check_min INTEGER DEFAULT 10,
            closing_check_min INTEGER DEFAULT 15,
            
            notify_on_close INTEGER DEFAULT 1,
            include_first_user_message INTEGER DEFAULT 1,
            mention_on_high_priority INTEGER DEFAULT 1,
            forum_mode INTEGER DEFAULT 0,
            
            closing_phrase TEXT DEFAULT '',
            priority_keywords TEXT DEFAULT '{"high":[],"medium":[]}',
            ticket_prefix TEXT DEFAULT 'ticket-',
            auto_replies TEXT DEFAULT '[]',
            binds TEXT DEFAULT '{}',
            
            polling_interval_sec INTEGER DEFAULT 3,
            rate_limit_ms INTEGER DEFAULT 1500,
            max_message_length INTEGER DEFAULT 300
        );
    `);

    // Create closed_tickets table (new DBs get user_id, old ones get migrated below)
    db.exec(`
        CREATE TABLE IF NOT EXISTS closed_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            channel_id TEXT NOT NULL,
            channel_name TEXT NOT NULL DEFAULT '',
            opener_id TEXT NOT NULL DEFAULT '',
            opener_username TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL DEFAULT 0,
            closed_at INTEGER NOT NULL DEFAULT 0,
            first_staff_reply_at INTEGER,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_ct_closed_at ON closed_tickets(closed_at);
        CREATE INDEX IF NOT EXISTS idx_ct_channel_id ON closed_tickets(channel_id);
    `);

    // Migrate: add user_id column if missing (old DB from bot.js)
    try {
        const closedTicketsInfo = db.pragma('table_info(closed_tickets)');
        const hasUserIdCol = closedTicketsInfo.some(col => col.name === 'user_id');
        if (!hasUserIdCol) {
            db.exec('ALTER TABLE closed_tickets ADD COLUMN user_id INTEGER;');
        }
        db.exec('CREATE INDEX IF NOT EXISTS idx_ct_user_id ON closed_tickets(user_id);');
    } catch (e) {
        console.error("[DB] Migration error on closed_tickets:", e.message);
    }

    db.exec(`
        CREATE TABLE IF NOT EXISTS ticket_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            channel_id TEXT NOT NULL,
            message_id TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL DEFAULT '',
            author_id TEXT NOT NULL DEFAULT '',
            author_username TEXT NOT NULL DEFAULT '',
            author_global_name TEXT,
            author_avatar TEXT,
            author_bot INTEGER NOT NULL DEFAULT 0,
            timestamp TEXT NOT NULL DEFAULT '',
            embeds TEXT,
            attachments TEXT,
            member_roles TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_tm_channel_id ON ticket_messages(channel_id);
    `);

    // Migrate: add user_id column if missing (old DB from bot.js)
    try {
        const ticketMessagesInfo = db.pragma('table_info(ticket_messages)');
        const hasUserIdColTM = ticketMessagesInfo.some(col => col.name === 'user_id');
        if (!hasUserIdColTM) {
            db.exec('ALTER TABLE ticket_messages ADD COLUMN user_id INTEGER;');
        }
        db.exec('CREATE INDEX IF NOT EXISTS idx_tm_user_id ON ticket_messages(user_id);');
    } catch (e) {
        console.error("[DB] Migration error on ticket_messages:", e.message);
    }

    // Add shift_channel_id column if missing
    try {
        const usersInfo = db.pragma('table_info(users)');
        if (!usersInfo.some(col => col.name === 'shift_channel_id')) {
            db.exec("ALTER TABLE users ADD COLUMN shift_channel_id TEXT DEFAULT '';");
        }
    } catch (e) {
        console.error("[DB] Migration error on users.shift_channel_id:", e.message);
    }

    console.log("[DB] SQLite check/migration complete.");
    return db;
}

module.exports = { initDb };
