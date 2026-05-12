import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { VpnService } from '../services/VpnService';
import pool from '../config/db';

export class VpnController {
  static async getServers(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const servers = await VpnService.getServers(userId);
      res.json(servers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async startSession(req: AuthRequest, res: Response) {
    try {
      const { serverId } = req.body;
      const userId = req.user?.userId;
      const clientIp = req.ip || '0.0.0.0';

      if (!serverId || !userId) return res.status(400).json({ error: 'Server ID is required' });

      const session = await VpnService.startSession(userId, serverId, clientIp);
      res.json(session);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async endSession(req: AuthRequest, res: Response) {
    try {
      const { sessionId } = req.params;
      if (!sessionId) return res.status(400).json({ error: 'Session ID is required' });

      const result = await VpnService.endSession(sessionId as string);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getLastSessionReport(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { rows } = await pool.query(
        `SELECT s.*, v.location, v.country_code, v.hostname,
         COALESCE(SUM(t.bytes_sent), 0) as bytes_sent,
         COALESCE(SUM(t.bytes_received), 0) as bytes_received,
         COALESCE(EXTRACT(EPOCH FROM (COALESCE(s.end_time, NOW()) - s.created_at))::INTEGER, 0) as duration_seconds
         FROM vpn_sessions s
         JOIN vpn_servers v ON s.server_id = v.server_id
         LEFT JOIN vpn_traffic_stats t ON s.session_id = t.session_id
         WHERE s.user_id = $1
         GROUP BY s.session_id, v.server_id
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [userId]
      );

      res.json(rows[0] || null);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async reportTraffic(req: AuthRequest, res: Response) {
    try {
      const { sessionId, bytesSent, bytesReceived } = req.body;
      const userId = req.user?.userId;

      if (!sessionId || !userId) return res.status(400).json({ error: 'Session ID is required' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Insert into traffic stats
        await client.query(
          'INSERT INTO vpn_traffic_stats (session_id, bytes_sent, bytes_received) VALUES ($1, $2, $3)',
          [sessionId, bytesSent, bytesReceived]
        );

        // Update user's daily usage
        await client.query(
          'UPDATE users SET daily_data_used_bytes = daily_data_used_bytes + $1 WHERE user_id = $2',
          [bytesSent + bytesReceived, userId]
        );

        await client.query('COMMIT');
        res.json({ success: true });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getOptimalServers(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const servers = await VpnService.getOptimalServer(userId, 5);
      res.json(servers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async runSpeedTest(req: AuthRequest, res: Response) {
    try {
      const { serverId } = req.body;
      if (!serverId) return res.status(400).json({ error: 'Server ID is required' });

      // In a real production app, we would perform an actual bandwidth test.
      // For this migration, we simulate a speed test result based on server health.
      const { rows } = await pool.query(
        'SELECT avg_latency_ms, current_load FROM vpn_servers WHERE server_id = $1',
        [serverId]
      );
      
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
