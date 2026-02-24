const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const JWT_SECRET = process.env.JWT_SECRET || 'ticket-dashboard-secret-key-2026';

function createAuthRoutes(db) {
    const router = express.Router();

    router.post('/register', async (req, res) => {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        try {
            const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
            if (existingUser) {
                return res.status(400).json({ error: 'Username already exists' });
            }

            const saltRounds = 10;
            const password_hash = await bcrypt.hash(password, saltRounds);

            const result = db.prepare(`
                INSERT INTO users (username, password_hash)
                VALUES (?, ?)
            `).run(username, password_hash);

            const token = jwt.sign({ userId: result.lastInsertRowid, username }, JWT_SECRET, { expiresIn: '7d' });

            res.json({ token, user: { id: result.lastInsertRowid, username } });
        } catch (error) {
            console.error('[Auth API] Register error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    router.post('/login', async (req, res) => {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        try {
            const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const match = await bcrypt.compare(password, user.password_hash);
            if (!match) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

            res.json({ token, user: { id: user.id, username: user.username } });
        } catch (error) {
            console.error('[Auth API] Login error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    router.get('/me', authenticateToken, (req, res) => {
        try {
            const user = db.prepare('SELECT id, username, discord_token, tg_token, tg_chat_id FROM users WHERE id = ?').get(req.user.userId);
            if (!user) return res.status(404).json({ error: 'User not found' });
            res.json({ user });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.status(401).json({ error: 'No token provided' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    });
}

module.exports = { createAuthRoutes, authenticateToken, JWT_SECRET };
