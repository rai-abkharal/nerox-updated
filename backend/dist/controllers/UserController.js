"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = void 0;
const db_1 = __importDefault(require("../config/db"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class UserController {
    static async getProfile(req, res) {
        try {
            const userId = req.user?.userId;
            const { rows } = await db_1.default.query(`SELECT user_id, username, email, role, plan_type, trial_ends_at, 
                subscription_end_date, daily_data_limit_bytes, daily_data_used_bytes, 
                avatar_url, display_name, referral_code, created_at 
         FROM users WHERE user_id = $1`, [userId]);
            if (rows.length === 0)
                return res.status(404).json({ error: 'User not found' });
            const user = rows[0];
            // Fetch active devices
            const devicesRes = await db_1.default.query('SELECT device_id, model, os, last_active_at FROM user_devices WHERE user_id = $1 ORDER BY last_active_at DESC', [userId]);
            user.devices = devicesRes.rows;
            res.json(user);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    static async updateProfile(req, res) {
        try {
            const userId = req.user?.userId;
            const { displayName } = req.body;
            await db_1.default.query('UPDATE users SET display_name = $1, updated_at = NOW() WHERE user_id = $2', [displayName, userId]);
            res.json({ success: true });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    static async getUsageStats(req, res) {
        try {
            const userId = req.user?.userId;
            const { rows } = await db_1.default.query(`SELECT 
            COALESCE(SUM(vs.total_bytes_sent), 0) as total_upload, 
            COALESCE(SUM(vs.total_bytes_received), 0) as total_download,
            COUNT(vs.session_id) as total_sessions,
            COALESCE(SUM(EXTRACT(EPOCH FROM (vs.end_time - vs.start_time))/60), 0) as total_active_minutes
         FROM vpn_sessions vs
         WHERE vs.user_id = $1`, [userId]);
            res.json(rows[0]);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    static async uploadAvatar(req, res) {
        try {
            const userId = req.user?.userId;
            const { base64, fileName, type } = req.body;
            if (!base64 || !userId)
                return res.status(400).json({ error: 'Invalid data' });
            // In a real production app, we would upload to S3/Cloudinary.
            // For this migration, we'll simulate a local storage save and return a public URL.
            const buffer = Buffer.from(base64, 'base64');
            const dir = path_1.default.join(__dirname, '../../public/avatars');
            if (!fs_1.default.existsSync(dir))
                fs_1.default.mkdirSync(dir, { recursive: true });
            const safeFileName = `${userId}-${Date.now()}-${fileName}`;
            const filePath = path_1.default.join(dir, safeFileName);
            fs_1.default.writeFileSync(filePath, buffer);
            const publicUrl = `${process.env.APP_URL || 'http://localhost:3000'}/avatars/${safeFileName}`;
            await db_1.default.query('UPDATE users SET avatar_url = $1 WHERE user_id = $2', [publicUrl, userId]);
            res.json({ success: true, avatarUrl: publicUrl });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}
exports.UserController = UserController;
