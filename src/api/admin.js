const express = require('express');
const { authenticateToken } = require('./auth');

function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещён. Требуются права администратора.' });
    }
    next();
}

function createAdminRoutes(db) {
    const router = express.Router();

    // All admin routes require auth + admin role
    router.use(authenticateToken, requireAdmin);

    // GET /api/admin/users — list all users
    router.get('/users', (req, res) => {
        try {
            const users = db.prepare(
                'SELECT id, username, role, created_at FROM users ORDER BY created_at DESC'
            ).all();
            res.json(users);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // POST /api/admin/users/:id/approve — approve a pending user
    router.post('/users/:id/approve', (req, res) => {
        try {
            const { id } = req.params;
            const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
            if (!user) return res.status(404).json({ error: 'User not found' });
            db.prepare("UPDATE users SET role = 'user' WHERE id = ?").run(id);
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // POST /api/admin/users/:id/ban — ban a user
    router.post('/users/:id/ban', (req, res) => {
        try {
            const { id } = req.params;
            const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
            if (!user) return res.status(404).json({ error: 'User not found' });
            if (user.role === 'admin') return res.status(400).json({ error: 'Нельзя заблокировать администратора' });
            db.prepare("UPDATE users SET role = 'banned' WHERE id = ?").run(id);
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // POST /api/admin/users/:id/unban — unban a user
    router.post('/users/:id/unban', (req, res) => {
        try {
            const { id } = req.params;
            const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
            if (!user) return res.status(404).json({ error: 'User not found' });
            db.prepare("UPDATE users SET role = 'user' WHERE id = ?").run(id);
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // DELETE /api/admin/users/:id — delete a user
    router.delete('/users/:id', (req, res) => {
        try {
            const { id } = req.params;
            const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
            if (!user) return res.status(404).json({ error: 'User not found' });
            if (user.role === 'admin') return res.status(400).json({ error: 'Нельзя удалить администратора' });
            db.prepare('DELETE FROM users WHERE id = ?').run(id);
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    return router;
}

module.exports = { createAdminRoutes };
