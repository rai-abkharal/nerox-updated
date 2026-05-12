"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentController = void 0;
const db_1 = __importDefault(require("../config/db"));
const SubscriptionService_1 = require("../services/SubscriptionService");
class PaymentController {
    static async getPlans(req, res) {
        try {
            const { rows } = await db_1.default.query('SELECT * FROM subscription_plans ORDER BY price_usd ASC');
            res.json(rows);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    static async calculateCustomPrice(req, res) {
        try {
            const duration = parseInt(req.query.duration) || 1;
            const devices = parseInt(req.query.devices) || 1;
            const result = SubscriptionService_1.SubscriptionService.calculateCustomPrice(duration, devices);
            res.json(result);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    static async verifyPurchase(req, res) {
        try {
            const { platform, productId, purchaseToken } = req.body;
            const userId = req.user?.userId;
            if (!userId)
                return res.status(401).json({ error: 'Unauthorized' });
            if (!platform || !productId || !purchaseToken) {
                return res.status(400).json({ error: 'Platform, Product ID, and Purchase Token are required' });
            }
            // 1. Double-Redemption Protection (Idempotency)
            const existingTx = await db_1.default.query('SELECT transaction_id FROM payment_transactions WHERE purchase_token = $1', [purchaseToken]);
            if (existingTx.rows.length > 0) {
                return res.status(400).json({ error: 'This transaction has already been processed' });
            }
            // 2. Platform-Specific Verification (Simulated)
            let isVerified = false;
            if (platform === 'google') {
                isVerified = await PaymentController.verifyWithGoogle(productId, purchaseToken);
            }
            else if (platform === 'apple') {
                isVerified = await PaymentController.verifyWithApple(productId, purchaseToken);
            }
            else {
                return res.status(400).json({ error: 'Unsupported platform' });
            }
            if (!isVerified) {
                return res.status(400).json({ error: 'Payment verification failed' });
            }
            // 3. Process Subscription Update
            const planRes = await db_1.default.query('SELECT * FROM subscription_plans WHERE google_product_id = $1 OR apple_product_id = $1 OR name = $1', [productId]);
            if (planRes.rows.length === 0)
                return res.status(400).json({ error: 'Invalid product' });
            const plan = planRes.rows[0];
            const durationMonths = plan.duration_months || 1;
            const expiryDate = new Date();
            expiryDate.setMonth(expiryDate.getMonth() + durationMonths);
            const client = await db_1.default.connect();
            try {
                await client.query('BEGIN');
                // Record Transaction
                await client.query(`INSERT INTO payment_transactions (user_id, platform, product_id, purchase_token, status, amount_paid)
           VALUES ($1, $2, $3, $4, 'completed', $5)`, [userId, platform, productId, purchaseToken, plan.price_usd]);
                // Update User
                await client.query(`UPDATE users SET 
            plan_type = 'premium', 
            subscription_end_date = $1,
            max_devices = $2
           WHERE user_id = $3`, [expiryDate, plan.max_devices || 5, userId]);
                // Create Subscription Record
                await client.query(`INSERT INTO subscriptions (user_id, plan_id, status, start_date, end_date)
           VALUES ($1, $2, 'active', NOW(), $3)`, [userId, plan.plan_id, expiryDate]);
                await client.query('COMMIT');
                res.json({ success: true, message: 'Purchase verified and applied' });
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
            console.error('[Payment] Verification error:', error);
            res.status(500).json({ error: error.message });
        }
    }
    static async verifyWithGoogle(productId, token) {
        // Simulation: Call Google Play Developer API (androidpublisher.purchases.subscriptions.get)
        console.log(`[GooglePlay] Verifying token ${token.substring(0, 10)}...`);
        // In production, use googleapis library with a service account
        return true;
    }
    static async verifyWithApple(productId, token) {
        // Simulation: Call App Store Server API
        console.log(`[AppStore] Verifying receipt ${token.substring(0, 10)}...`);
        // In production, use jsonwebtoken to sign a request to Apple's API
        return true;
    }
}
exports.PaymentController = PaymentController;
