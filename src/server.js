/**
 * server.js — Multi-Tenant SaaS Entry Point
 * 
 * This replaces bot.js as the main entry when running in multi-tenant mode.
 * It initializes the database, sets up Express with all API routes,
 * creates the BotManager, and starts all user bot instances.
 * 
 * Usage: node src/server.js
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const { initDb } = require('./dbManager');
const BotManager = require('./BotManager');
const { createAuthRoutes, authenticateToken, JWT_SECRET } = require('./api/auth');
const { createProfileRoutes } = require('./api/profile');
const { createTicketRoutes } = require('./api/tickets');
const { createStatsRoutes } = require('./api/stats');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { }

const LOG = '[Server]';

async function main() {
    console.log(`${LOG} ═══════════════════════════════════════`);
    console.log(`${LOG}  Telegram Ticket Notifier — SaaS Mode`);
    console.log(`${LOG} ═══════════════════════════════════════`);

    // 1. Initialize Database
    const db = initDb(DATA_DIR);
    console.log(`${LOG} ✅ Database initialized.`);

    // 2. Create Bot Manager
    const botManager = new BotManager(db, DATA_DIR);

    // 3. Set up Express
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: { origin: '*', methods: ['GET', 'POST', 'DELETE', 'PATCH'] }
    });

    app.use(cors());
    app.use(express.json());

    // -- Public Auth Routes --
    app.use('/api/auth', createAuthRoutes(db));

    // -- Protected Routes (all require JWT) --
    app.use('/api/profile', createProfileRoutes(db, botManager));
    app.use('/api/tickets', createTicketRoutes(db, botManager));
    app.use('/api/stats', createStatsRoutes(db, botManager));

    // -- Legacy compat: /api/auth POST for old dashboard login --
    // (The old dashboard sends { password } to /api/auth)
    // This is handled by createAuthRoutes

    // -- Socket.IO Auth Middleware --
    io.use((socket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
        if (!token) return next(new Error('Authentication error'));
        try {
            jwt.verify(token, JWT_SECRET);
            next();
        } catch (err) {
            next(new Error('Authentication error'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`${LOG} 🌐 Dashboard client connected: ${socket.id}`);
        socket.on('disconnect', () => {
            console.log(`${LOG} 🌐 Dashboard client disconnected: ${socket.id}`);
        });
    });

    // Store io reference in botManager so bots can emit events
    botManager.io = io;

    // -- Serve Dashboard static files --
    const dashboardDist = path.join(__dirname, '..', 'dashboard', 'dist');
    if (fs.existsSync(dashboardDist)) {
        app.use(express.static(dashboardDist));
        // SPA fallback
        app.get('*', (req, res) => {
            res.sendFile(path.join(dashboardDist, 'index.html'));
        });
    }

    // 4. Start HTTP server
    const port = process.env.PORT || 3001;
    server.listen(port, () => {
        console.log(`${LOG} 🚀 SaaS API running on port ${port}`);
    });

    // 5. Start all user bots
    await botManager.startAll();

    // 6. Graceful shutdown
    const shutdown = () => {
        console.log(`${LOG} 🛑 Shutting down...`);
        botManager.stopAll();
        db.close();
        setTimeout(() => process.exit(0), 1000);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch(err => {
    console.error('[Server] Fatal error:', err);
    process.exit(1);
});
