"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VpnService = void 0;
const db_1 = __importDefault(require("../config/db"));
const crypto_1 = __importDefault(require("crypto"));
class VpnService {
    static async getServers(userId) {
        // 1. Check user subscription
        const userRes = await db_1.default.query('SELECT plan_type, subscription_end_date FROM users WHERE user_id = $1', [userId]);
        const isPremium = userRes.rows[0]?.plan_type === 'premium' &&
            (!userRes.rows[0]?.subscription_end_date || new Date(userRes.rows[0]?.subscription_end_date) > new Date());
        // 2. Build Query
        let queryText = `
      SELECT server_id, hostname, location, country_code, current_load, 
             protocol, status, "is_premium", "is_streaming_optimized", avg_latency_ms
      FROM vpn_servers 
      WHERE status = 'active' 
      AND COALESCE(current_load, 0) < 100
    `;
        if (!isPremium) {
            queryText += ' AND "is_premium" = FALSE';
        }
        const { rows } = await db_1.default.query(queryText);
        return rows;
    }
    /**
     * Continuous Monitoring Simulation
     * Periodically updates server health metrics and tracks downtime
     */
    static startMonitoring() {
        console.log('[Monitoring] Starting continuous server health checks...');
        setInterval(async () => {
            try {
                const { rows: servers } = await db_1.default.query('SELECT server_id, hostname, status FROM vpn_servers');
                for (const server of servers) {
                    // Simulation: 5% chance of server going offline
                    const isFailing = Math.random() < 0.05;
                    const newStatus = isFailing ? 'maintenance' : 'active';
                    const cpuUsage = isFailing ? 0 : Math.floor(Math.random() * 80) + 10;
                    const latency = isFailing ? 999 : Math.floor(Math.random() * 200) + 20;
                    const loadChange = isFailing ? 0 : Math.floor(Math.random() * 5) - 2;
                    // Detect status change for downtime logging
                    if (server.status !== newStatus) {
                        console.log(`[Monitoring] Server ${server.hostname} status changed to ${newStatus}`);
                        await db_1.default.query('INSERT INTO server_availability_logs (server_id, status, reason) VALUES ($1, $2, $3)', [server.server_id, newStatus, isFailing ? 'Automated health check failure' : 'Back online']);
                    }
                    await db_1.default.query(`UPDATE vpn_servers 
             SET cpu_usage = $1, 
                 avg_latency_ms = $2, 
                 current_load = GREATEST(0, LEAST(100, current_load + $3)),
                 status = $4,
                 last_health_check = NOW() 
             WHERE server_id = $5`, [cpuUsage, latency, loadChange, newStatus, server.server_id]);
                    // Record metrics for long-term tracking
                    if (!isFailing) {
                        await db_1.default.query(`INSERT INTO server_metrics (server_id, cpu_usage, avg_latency_ms, active_connections) 
               VALUES ($1, $2, $3, (SELECT current_load FROM vpn_servers WHERE server_id = $1))`, [server.server_id, cpuUsage, latency]);
                    }
                }
            }
            catch (err) {
                console.error('[Monitoring] Error during health check:', err);
            }
        }, 60000); // Every 60 seconds
    }
    /**
     * Ported from PLpgSQL: get_smart_servers
     * Handles regional access, premium filtering, and load balancing
     */
    static async getSmartServers(userId, amount = 3, preferredProtocol = 'Auto') {
        // 1. Get user plan and authorized regions
        const userRes = await db_1.default.query('SELECT plan_type, authorized_regions FROM users WHERE user_id = $1', [userId]);
        if (userRes.rows.length === 0)
            throw new Error('User not found');
        const user = userRes.rows[0];
        const isPremium = user.plan_type === 'premium';
        const authorizedRegions = user.authorized_regions || ['Global'];
        // 2. Build Query
        let queryText = `
      SELECT 
        s.server_id, s.hostname, s.ip_address, s.location, 
        s.country_code, COALESCE(s.current_load, 0) as current_load, 
        s.protocol, s."is_premium", s."is_streaming_optimized", s.status
      FROM vpn_servers s
      WHERE s.status = 'active'
      AND COALESCE(s.current_load, 0) < 100
    `;
        const queryParams = [];
        // 3. Access Logic
        if (isPremium) {
            if (!authorizedRegions.includes('Global')) {
                queryParams.push(authorizedRegions);
                queryText += ` AND s.country_code = ANY($${queryParams.length})`;
            }
        }
        else {
            // Free users restricted to 5 specific countries (US, GB, DE, SG, CA)
            const freeCountries = ['US', 'GB', 'DE', 'SG', 'CA'];
            queryParams.push(freeCountries);
            queryText += ` 
        AND s."is_premium" = FALSE 
        AND s."is_streaming_optimized" = FALSE
        AND s.country_code = ANY($${queryParams.length})
      `;
        }
        // Protocol filter
        if (preferredProtocol !== 'Auto') {
            queryParams.push(preferredProtocol);
            queryText += ` AND s.protocol = $${queryParams.length}`;
        }
        queryText += ` ORDER BY s."is_premium" DESC, s.current_load ASC LIMIT $${queryParams.length + 1}`;
        queryParams.push(amount);
        const { rows } = await db_1.default.query(queryText, queryParams);
        // Fallback: If no restricted servers found for free user, give them any non-premium server
        if (rows.length === 0 && !isPremium) {
            const fallbackRes = await db_1.default.query('SELECT * FROM vpn_servers WHERE status = $1 AND "is_premium" = FALSE LIMIT $2', ['active', amount]);
            return fallbackRes.rows;
        }
        return rows;
    }
    /**
     * Ported from PLpgSQL: get_optimal_network_node
     * Intelligent selection scoring logic
     */
    static async getOptimalServer(userId, limit = 1) {
        const { rows } = await db_1.default.query(`
      SELECT 
        s.server_id, s.hostname, s.ip_address, s.location, s.country_code,
        s.current_load, s.avg_latency_ms, s."is_premium",
        (
          (COALESCE(s.current_load, 0)::FLOAT / 100.0 * 40.0) +  -- 40% Load weight
          (COALESCE(s.cpu_usage, 0)::FLOAT / 100.0 * 20.0) +     -- 20% CPU weight
          (LEAST(COALESCE(s.avg_latency_ms, 0), 500)::FLOAT / 500.0 * 40.0) -- 40% Latency weight
        ) as score
      FROM vpn_servers s
      WHERE s.status = 'active'
      AND COALESCE(s.current_load, 0) < 100
      AND (s."is_premium" = FALSE OR EXISTS (
        SELECT 1 FROM users WHERE user_id = $1 AND plan_type = 'premium'
      ))
      ORDER BY score ASC
      LIMIT $2
    `, [userId, limit]);
        return limit === 1 ? (rows[0] || null) : rows;
    }
    static async recordHealth(serverId, cpu, latency, connections) {
        await db_1.default.query(`UPDATE vpn_servers SET cpu_usage = $1, avg_latency_ms = $2, current_load = $3, last_health_check = NOW() WHERE server_id = $4`, [cpu, latency, connections, serverId]);
        await db_1.default.query(`INSERT INTO server_metrics (server_id, cpu_usage, avg_latency_ms, active_connections) VALUES ($1, $2, $3, $4)`, [serverId, cpu, latency, connections]);
    }
    static async startSession(userId, serverId, clientIp) {
        // 1. Validate User and Subscription
        const userRes = await db_1.default.query('SELECT plan_type, subscription_end_date, trial_ends_at, preferred_protocol, split_tunneling_config FROM users WHERE user_id = $1', [userId]);
        if (userRes.rows.length === 0)
            throw new Error('User not found');
        const user = userRes.rows[0];
        const preferredProtocol = user.preferred_protocol || 'Auto';
        const now = new Date();
        const isPremium = user.plan_type === 'premium' && (!user.subscription_end_date || new Date(user.subscription_end_date) > now);
        const isTrialActive = user.trial_ends_at && new Date(user.trial_ends_at) > now;
        // 2. Validate Server Access
        const serverRes = await db_1.default.query('SELECT server_id, hostname, ip_address, "is_premium", protocol, location, country_code FROM vpn_servers WHERE server_id = $1 AND status = $2', [serverId, 'active']);
        if (serverRes.rows.length === 0)
            throw new Error('Server not found or inactive');
        const server = serverRes.rows[0];
        if (server.is_premium && !isPremium) {
            throw new Error('Premium subscription required to access this server');
        }
        if (!isPremium && !isTrialActive) {
            // Check data cap for free users
            const usageRes = await db_1.default.query('SELECT daily_data_used_bytes FROM users WHERE user_id = $1', [userId]);
            const used = usageRes.rows[0]?.daily_data_used_bytes || 0;
            if (used >= 524288000) { // 500MB
                throw new Error('Daily data limit reached. Upgrade to premium for unlimited access.');
            }
        }
        // 3. Create Session
        const assignedVpnIp = `10.8.0.${Math.floor(Math.random() * 254) + 1}`;
        const { rows } = await db_1.default.query(`INSERT INTO vpn_sessions (user_id, server_id, client_ip, assigned_vpn_ip, status) VALUES ($1, $2, $3, $4, 'active') RETURNING session_id, assigned_vpn_ip`, [userId, serverId, clientIp, assignedVpnIp]);
        await db_1.default.query('UPDATE vpn_servers SET current_load = current_load + 1 WHERE server_id = $1', [serverId]);
        const session = rows[0];
        // 4. Select Protocol (Auto Logic)
        let selectedProtocol = preferredProtocol;
        if (selectedProtocol === 'Auto') {
            // WireGuard is primary, fallback to OpenVPN if server protocol doesn't match
            if (server.protocol === 'WireGuard') {
                selectedProtocol = 'WireGuard';
            }
            else if (server.protocol === 'OpenVPN' || server.protocol === 'UDP' || server.protocol === 'TCP') {
                selectedProtocol = 'OpenVPN';
            }
            else {
                selectedProtocol = server.protocol; // Fallback to whatever the server supports
            }
        }
        // 5. Generate and Encrypt VPN Configuration
        const rawConfig = this.generateVpnConfig(server.hostname, selectedProtocol, assignedVpnIp);
        const config = this.encryptConfig(rawConfig);
        return {
            ...session,
            protocol: selectedProtocol,
            splitTunneling: user.split_tunneling_config || {},
            server: {
                hostname: server.hostname,
                location: server.location,
                country_code: server.country_code
            },
            config
        };
    }
    static encryptConfig(text) {
        const algorithm = 'aes-256-cbc';
        const key = Buffer.from(process.env.VPN_CONFIG_KEY || '64_char_hex_key_here_for_prod_env', 'hex');
        const iv = crypto_1.default.randomBytes(16);
        const cipher = crypto_1.default.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return `${iv.toString('hex')}:${encrypted}`;
    }
    static generateVpnConfig(hostname, protocol, assignedIp) {
        if (protocol === 'WireGuard') {
            return `
[Interface]
PrivateKey = (Mock Private Key)
Address = ${assignedIp}/32
DNS = 1.1.1.1

[Peer]
PublicKey = (Mock Server Public Key)
Endpoint = ${hostname}:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
      `.trim();
        }
        else if (protocol === 'IKEv2' || protocol === 'IPSec') {
            return `
config setup
    charondebug="ike 1, knl 1, cfg 0"
    uniqueids=no

conn nerox-vpn
    keyexchange=${protocol === 'IKEv2' ? 'ikev2' : 'ikev1'}
    ike=aes256-sha256-modp2048!
    esp=aes256-sha256!
    left=%defaultroute
    leftauth=pubkey
    leftcert=clientCert.pem
    leftid=client@nerox.app
    right=${hostname}
    rightauth=pubkey
    rightid=@${hostname}
    rightsubnet=0.0.0.0/0
    auto=start
      `.trim();
        }
        else {
            // Default to OpenVPN
            const port = 1194; // Simplified
            return `
client
dev tun
proto udp
remote ${hostname} ${port}
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
auth-user-pass
cipher AES-256-GCM
verb 3
<ca>
-----BEGIN CERTIFICATE-----
MIIB... (Mock CA Cert)
-----END CERTIFICATE-----
</ca>
ifconfig ${assignedIp} 255.255.255.0
      `.trim();
        }
    }
    static async endSession(sessionId) {
        const { rows } = await db_1.default.query(`UPDATE vpn_sessions 
       SET status = 'disconnected', end_time = NOW() 
       WHERE session_id = $1 AND status = 'active'
       RETURNING server_id`, [sessionId]);
        if (rows.length > 0) {
            const serverId = rows[0].server_id;
            // Decrease server load
            await db_1.default.query('UPDATE vpn_servers SET current_load = GREATEST(0, current_load - 1) WHERE server_id = $1', [serverId]);
        }
        return { success: true };
    }
}
exports.VpnService = VpnService;
