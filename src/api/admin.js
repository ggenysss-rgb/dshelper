const express = require('express');
const { authenticateToken } = require('./auth');

function createAdminRoutes(db) {
    const router = express.Router();
    const usersCols = (() => {
        try {
            return new Set(db.prepare('PRAGMA table_info(users)').all().map(c => c.name));
        } catch (_) {
            return new Set();
        }
    })();
    const hasRole = usersCols.has('role');

    const isFallbackAdmin = (u) =>
        u?.id === 1 || u?.username === 'd1reevo' || u?.username === 'd1reevof';

    function requireAdmin(req, res, next) {
        try {
            const userId = req.user?.userId;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const dbUser = hasRole
                ? db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(userId)
                : db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);

            const effectiveUser = {
                id: dbUser?.id ?? req.user?.userId,
                username: dbUser?.username ?? req.user?.username,
                role: dbUser?.role ?? req.user?.role,
            };

            const isAdmin = effectiveUser.role === 'admin' || isFallbackAdmin(effectiveUser);
            if (!isAdmin) {
                return res.status(403).json({ error: 'Доступ запрещён. Требуются права администратора.' });
            }

            req.user = { ...req.user, ...effectiveUser, role: effectiveUser.role || 'admin' };
            next();
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    // All admin routes require auth + admin role
    router.use(authenticateToken, requireAdmin);

    // GET /api/admin/users — list all users
    router.get('/users', (req, res) => {
        try {
            const hasCreatedAt = usersCols.has('created_at');
            const query = hasRole && hasCreatedAt
                ? 'SELECT id, username, role, created_at FROM users ORDER BY created_at DESC'
                : 'SELECT id, username FROM users ORDER BY id DESC';
            const rows = db.prepare(query).all();
            const users = rows.map(u => ({
                id: u.id,
                username: u.username,
                role: u.role || (u.username === 'd1reevo' || u.id === 1 ? 'admin' : 'user'),
                created_at: u.created_at || 0,
            }));
            res.json(users);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // POST /api/admin/users/:id/approve — approve a pending user
    router.post('/users/:id/approve', (req, res) => {
        try {
            if (!hasRole) return res.status(503).json({ error: 'Schema outdated: role column is missing' });
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
            if (!hasRole) return res.status(503).json({ error: 'Schema outdated: role column is missing' });
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
            if (!hasRole) return res.status(503).json({ error: 'Schema outdated: role column is missing' });
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
            if (!hasRole) return res.status(503).json({ error: 'Schema outdated: role column is missing' });
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
