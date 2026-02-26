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
            auto_greet_all_channels INTEGER DEFAULT 0,
            
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
            gemini_api_keys TEXT DEFAULT '[]',
            
            polling_interval_sec INTEGER DEFAULT 3,
            rate_limit_ms INTEGER DEFAULT 1500,
            max_message_length INTEGER DEFAULT 300,
            role TEXT DEFAULT 'pending',
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
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

    // Migrate: add auto_greet_all_channels column if missing
    try {
        const usersInfo = db.pragma('table_info(users)');
        if (!usersInfo.some(col => col.name === 'auto_greet_all_channels')) {
            db.exec('ALTER TABLE users ADD COLUMN auto_greet_all_channels INTEGER DEFAULT 0;');
        }
    } catch (e) { console.error("[DB] Migration auto_greet_all_channels:", e.message); }

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

    // Add gemini_api_keys column if missing
    try {
        const usersInfo = db.pragma('table_info(users)');
        if (!usersInfo.some(col => col.name === 'gemini_api_keys')) {
            db.exec("ALTER TABLE users ADD COLUMN gemini_api_keys TEXT DEFAULT '[]';");
        }
    } catch (e) {
        console.error("[DB] Migration error on users.gemini_api_keys:", e.message);
    }

    // Migrate: add role column if missing
    try {
        const usersInfo = db.pragma('table_info(users)');
        if (!usersInfo.some(col => col.name === 'role')) {
            db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';");
            // Set d1reevo as admin, all others as user (not pending)
            db.exec("UPDATE users SET role = 'user' WHERE username != 'd1reevo';");
            db.exec("UPDATE users SET role = 'admin' WHERE username = 'd1reevo';");
            console.log('[DB] Migration: role column added, d1reevo set as admin, others set as user.');
        }
    } catch (e) { console.error('[DB] Migration error on users.role:', e.message); }

    // Migrate: add admin_tg_chat_id column if missing
    try {
        const usersInfo = db.pragma('table_info(users)');
        if (!usersInfo.some(col => col.name === 'admin_tg_chat_id')) {
            db.exec("ALTER TABLE users ADD COLUMN admin_tg_chat_id TEXT DEFAULT NULL;");
            console.log('[DB] Migration: admin_tg_chat_id column added.');
        }
    } catch (e) { console.error('[DB] Migration error on users.admin_tg_chat_id:', e.message); }

    // Migrate: add created_at column if missing
    try {
        const usersInfo = db.pragma('table_info(users)');
        if (!usersInfo.some(col => col.name === 'created_at')) {
            // SQLite does not allow function calls as DEFAULT in ALTER TABLE, use literal 0
            db.exec("ALTER TABLE users ADD COLUMN created_at INTEGER DEFAULT 0;");
            // Backfill with current unix timestamp for existing rows
            db.exec(`UPDATE users SET created_at = ${Math.floor(Date.now() / 1000)} WHERE created_at = 0;`);
            console.log('[DB] Migration: created_at column added.');
        }
    } catch (e) { console.error('[DB] Migration error on users.created_at:', e.message); }

    // Always ensure user id=1 (d1reevo) is admin
    try {
        db.exec("UPDATE users SET role = 'admin' WHERE (id = 1 OR username = 'd1reevo') AND role != 'admin';");
    } catch (e) { console.error('[DB] Migration error enforcing admin:', e.message); }

    console.log("[DB] SQLite check/migration complete.");
    return db;
}

module.exports = { initDb };
