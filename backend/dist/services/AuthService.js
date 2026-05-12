"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const db_1 = __importDefault(require("../config/db"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
class AuthService {
    // ─── Register (Sign Up) ───────────────────────────────────────────────
    static async register(email, password, username, referralCodeApplied) {
        // Check if email already exists
        const existing = await db_1.default.query('SELECT user_id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            throw new Error('An account with this email already exists.');
        }
        const referralCode = Math.random().toString(36).substring(2, 10).toUpperCase();
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const { rows } = await db_1.default.query(`INSERT INTO users (username, email, password_hash, plan_type, trial_ends_at, referral_code)
       VALUES ($1, $2, $3, 'free', NOW() + INTERVAL '7 days', $4)
       RETURNING user_id, role`, [username, email, passwordHash, referralCode]);
        const user = rows[0];
        // Handle incoming referral code
        if (referralCodeApplied) {
            try {
                const { ReferralService } = require('./ReferralService');
                await ReferralService.applyReferral(user.user_id, referralCodeApplied);
            }
            catch (err) {
                console.warn(`[AuthService] Could not apply referral code ${referralCodeApplied}:`, err);
                // We don't block registration if referral fails
            }
        }
        return jsonwebtoken_1.default.sign({ userId: user.user_id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
    }
    // ─── Login (Sign In) ──────────────────────────────────────────────────
    static async login(email, password) {
        const { rows } = await db_1.default.query('SELECT user_id, role, password_hash, failed_attempts, locked_until FROM users WHERE email = $1', [email]);
        if (rows.length === 0) {
            throw new Error('No account found with this email.');
        }
        const user = rows[0];
        // Check if account is locked
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            const remainingMinutes = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
            throw new Error(`Account is locked due to too many failed attempts. Try again in ${remainingMinutes} minutes.`);
        }
        if (!user.password_hash) {
            throw new Error('This account was created with OTP. Please use OTP login.');
        }
        const isValid = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!isValid) {
            // Increment failed attempts
            const newFailures = (user.failed_attempts || 0) + 1;
            let lockedUntil = null;
            if (newFailures >= 5) {
                lockedUntil = new Date(Date.now() + 15 * 60000); // Lock for 15 mins
                console.warn(`[Security] Account locked for ${email} due to 5+ failures`);
            }
            await db_1.default.query('UPDATE users SET failed_attempts = $1, locked_until = $2 WHERE user_id = $3', [newFailures, lockedUntil, user.user_id]);
            throw new Error('Incorrect password. Please try again.');
        }
        // Reset failed attempts on success
        await db_1.default.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE user_id = $1', [user.user_id]);
        return jsonwebtoken_1.default.sign({ userId: user.user_id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
    }
    static async registerDevice(userId, deviceInfo) {
        if (!deviceInfo || !deviceInfo.deviceId)
            return;
        await db_1.default.query(`INSERT INTO user_devices (user_id, device_id, model, os, last_active_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, device_id) DO UPDATE SET 
         model = EXCLUDED.model, 
         os = EXCLUDED.os, 
         last_active_at = NOW()`, [userId, deviceInfo.deviceId, deviceInfo.model, deviceInfo.os]);
    }
}
exports.AuthService = AuthService;
