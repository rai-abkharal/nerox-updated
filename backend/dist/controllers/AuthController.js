"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const AuthService_1 = require("../services/AuthService");
class AuthController {
    // POST /api/auth/register
    static async register(req, res) {
        try {
            const { email, password, username, deviceInfo, referralCode } = req.body;
            if (!email || !password || !username) {
                return res.status(400).json({ error: 'Email, username, and password are required.' });
            }
            if (password.length < 6) {
                return res.status(400).json({ error: 'Password must be at least 6 characters.' });
            }
            const token = await AuthService_1.AuthService.register(email.toLowerCase().trim(), password, username.trim(), referralCode);
            // Extract userId from token (or refactor service to return it)
            const decoded = jsonwebtoken_1.default.decode(token);
            if (decoded?.userId) {
                await AuthService_1.AuthService.registerDevice(decoded.userId, deviceInfo);
            }
            res.json({ success: true, token });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
    // POST /api/auth/login
    static async login(req, res) {
        try {
            const { email, password, deviceInfo } = req.body;
            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required.' });
            }
            const token = await AuthService_1.AuthService.login(email.toLowerCase().trim(), password);
            const decoded = jsonwebtoken_1.default.decode(token);
            if (decoded?.userId) {
                await AuthService_1.AuthService.registerDevice(decoded.userId, deviceInfo);
            }
            res.json({ success: true, token });
        }
        catch (error) {
            res.status(401).json({ error: error.message });
        }
    }
}
exports.AuthController = AuthController;
