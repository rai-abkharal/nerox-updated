"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VpnController = void 0;
const VpnService_1 = require("../services/VpnService");
const db_1 = __importDefault(require("../config/db"));
class VpnController {
    static async getServers(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId)
                return res.status(401).json({ error: 'Unauthorized' });
            const servers = await VpnService_1.VpnService.getServers(userId);
            res.json(servers);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    static async startSession(req, res) {
        try {
            const { serverId } = req.body;
            const userId = req.user?.userId;
            const clientIp = req.ip || '0.0.0.0';
            if (!serverId || !userId)
                return res.status(400).json({ error: 'Server ID is required' });
            const session = await VpnService_1.VpnService.startSession(userId, serverId, clientIp);
            res.json(session);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    static async endSession(req, res) {
        try {
            const { sessionId } = req.params;
            if (!sessionId)
                return res.status(400).json({ error: 'Session ID is required' });
            const result = await VpnService_1.VpnService.endSession(sessionId);
            res.json(result);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    static async getLastSessionReport(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId)
                return res.status(401).json({ error: 'Unauthorized' });
            const { rows } = await db_1.default.query(`SELECT s.*, v.location, v.country_code, v.hostname,
         COALESCE(SUM(t.bytes_sent), 0) as bytes_sent,
         COALESCE(SUM(t.bytes_received), 0) as bytes_received
         FROM vpn_sessions s
         JOIN vpn_servers v ON s.server_id = v.server_id
         LEFT JOIN vpn_traffic_stats t ON s.session_id = t.session_id
         WHERE s.user_id = $1
         GROUP BY s.session_id, v.server_id
         ORDER BY s.created_at DESC
         LIMIT 1`, [userId]);
            res.json(rows[0] || null);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    static async reportTraffic(req, res) {
        try {
            const { sessionId, bytesSent, bytesReceived } = req.body;
            const userId = req.user?.userId;
            if (!sessionId || !userId)
                return res.status(400).json({ error: 'Session ID is required' });
            const client = await db_1.default.connect();
            try {
                await client.query('BEGIN');
                // Insert into traffic stats
                await client.query('INSERT INTO vpn_traffic_stats (session_id, bytes_sent, bytes_received) VALUES ($1, $2, $3)', [sessionId, bytesSent, bytesReceived]);
                // Update user's daily usage
                await client.query('UPDATE users SET daily_data_used_bytes = daily_data_used_bytes + $1 WHERE user_id = $2', [bytesSent + bytesReceived, userId]);
                await client.query('COMMIT');
                res.json({ success: true });
            }
            catch (error) {
                await client.query('ROLLBACK');
                throw error;
            }
            finally {
                client.release();
            }
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    static async getOptimalServers(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId)
                return res.status(401).json({ error: 'Unauthorized' });
            const servers = await VpnService_1.VpnService.getOptimalServer(userId, 5);
            res.json(servers);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    static async runSpeedTest(req, res) {
        try {
            const { serverId } = req.body;
            if (!serverId)
                return res.status(400).json({ error: 'Server ID is required' });
            // In a real production app, we would perform an actual bandwidth test.
            // For this migration, we simulate a speed test result based on server health.
            const { rows } = await db_1.default.query('SELECT avg_latency_ms, current_load FROM vpn_servers WHERE server_id = $1', [serverId]);
            const server = rows[0];
            const latency = server ? server.avg_latency_ms : 100;
            const downloadSpeed = Math.max(5, 100 - (server?.current_load || 0)) + (Math.random() * 10);
            const uploadSpeed = downloadSpeed * 0.4 + (Math.random() * 5);
            res.json({
                serverId,
                latencyMs: latency + Math.floor(Math.random() * 20),
                downloadMbps: parseFloat(downloadSpeed.toFixed(2)),
                uploadMbps: parseFloat(uploadSpeed.toFixed(2)),
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}
exports.VpnController = VpnController;
