"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminController = void 0;
const db_1 = __importDefault(require("../config/db"));
class AdminController {
    // GET /api/admin/audit-logs
    static async getAuditLogs(req, res) {
        try {
            const isAdmin = req.user?.role === 'admin';
            if (!isAdmin)
                return res.status(403).json({ error: 'Access denied' });
            const { action, entityType, limit = 50, offset = 0 } = req.query;
            let queryText = 'SELECT * FROM audit_logs';
            const params = [];
            if (action || entityType) {
                queryText += ' WHERE';
                if (action) {
                    params.push(action);
                    queryText += ` action = $${params.length}`;
                }
                if (entityType) {
                    if (params.length > 0)
                        queryText += ' AND';
                    params.push(entityType);
                    queryText += ` entity_type = $${params.length}`;
                }
            }
            queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
            params.push(limit, offset);
            const { rows } = await db_1.default.query(queryText, params);
            res.json(rows);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    // GET /api/admin/network-stats
    static async getNetworkStats(req, res) {
        try {
            const isAdmin = req.user?.role === 'admin';
            if (!isAdmin)
                return res.status(403).json({ error: 'Access denied' });
            // Aggregate global stats
            const sessionStats = await db_1.default.query(`
        SELECT 
          COUNT(*) filter (where status = 'active') as active_sessions,
          SUM(total_bytes_sent + total_bytes_received) as total_data_transfer
        FROM vpn_sessions
      `);
            const serverStats = await db_1.default.query(`
        SELECT 
          COUNT(*) as total_servers,
          AVG(current_load) as avg_load,
          AVG(cpu_usage) as avg_cpu
        FROM vpn_servers
        WHERE status = 'active'
      `);
            res.json({
                sessions: sessionStats.rows[0],
                servers: serverStats.rows[0],
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    // GET /api/admin/servers/:id/metrics
    static async getServerMetrics(req, res) {
        try {
            const isAdmin = req.user?.role === 'admin';
            if (!isAdmin)
                return res.status(403).json({ error: 'Access denied' });
            const { id } = req.params;
            const { hours = 24 } = req.query;
            const { rows } = await db_1.default.query(`SELECT cpu_usage, avg_latency_ms, active_connections, created_at 
         FROM server_metrics 
         WHERE server_id = $1 AND created_at > NOW() - INTERVAL '1 hour' * $2
         ORDER BY created_at ASC`, [id, hours]);
            res.json(rows);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}
exports.AdminController = AdminController;
