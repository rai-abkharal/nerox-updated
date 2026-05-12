import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import pool from '../config/db';
import { SubscriptionService } from '../services/SubscriptionService';

export class PaymentController {
  static async getPlans(req: Request, res: Response) {
    try {
      const { rows } = await pool.query('SELECT * FROM subscription_plans ORDER BY price_usd ASC');
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async calculateCustomPrice(req: Request, res: Response) {
    try {
      const duration = parseFloat(req.query.duration as string) || 1;
      const devices = parseInt(req.query.devices as string) || 1;
      
      const result = SubscriptionService.calculateCustomPrice(duration, devices);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async verifyPurchase(req: AuthRequest, res: Response) {
    try {
      const { platform, productId, purchaseToken } = req.body;
      const userId = req.user?.userId;

      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!platform || !productId || !purchaseToken) {
        return res.status(400).json({ error: 'Platform, Product ID, and Purchase Token are required' });
      }

      // 1. Double-Redemption Protection (Idempotency)
      const existingTx = await pool.query(
        'SELECT transaction_id FROM payment_transactions WHERE purchase_token = $1',
        [purchaseToken]
      );
      if (existingTx.rows.length > 0) {
        return res.status(400).json({ error: 'This transaction has already been processed' });
      }

      // 2. Platform-Specific Verification (Simulated)
      let isVerified = false;
      if (platform === 'google') {
        isVerified = await PaymentController.verifyWithGoogle(productId, purchaseToken);
      } else if (platform === 'apple') {
        isVerified = await PaymentController.verifyWithApple(productId, purchaseToken);
      } else {
        return res.status(400).json({ error: 'Unsupported platform' });
      }

      if (!isVerified) {
        return res.status(400).json({ error: 'Payment verification failed' });
      }

      // 3. Process Subscription Update
      const planRes = await pool.query(
        'SELECT * FROM subscription_plans WHERE google_product_id = $1 OR apple_product_id = $1 OR name = $1',
        [productId]
      );
      
      if (planRes.rows.length === 0) return res.status(400).json({ error: 'Invalid product' });
      const plan = planRes.rows[0];

      const durationMonths = plan.duration_months || 1;
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + durationMonths);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Record Transaction
        await client.query(
          `INSERT INTO payment_transactions (user_id, platform, product_id, purchase_token, status, amount, amount_paid)
           VALUES ($1, $2, $3, $4, 'completed', $5, $5)`,
          [userId, platform, productId, purchaseToken, plan.price_usd]
        );

        // Update User
        await client.query(
          `UPDATE users SET 
            plan_type = 'premium', 
            subscription_end_date = $1,
            max_devices = $2
           WHERE user_id = $3`,
          [expiryDate, plan.max_devices || 5, userId]
        );

        // Create/Update Subscription Record
        await client.query(
          `INSERT INTO subscriptions (user_id, plan_id, status, start_date, end_date)
           VALUES ($1, $2, 'active', NOW(), $3)
           ON CONFLICT (user_id) DO UPDATE SET 
            plan_id = EXCLUDED.plan_id,
            status = EXCLUDED.status,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date`,
          [userId, plan.plan_id, expiryDate]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: 'Purchase verified and applied' });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error('[Payment] Verification error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // ✅ Mock purchase endpoint — upgrades plan by plan_id directly.
  // Used during development before real store product IDs are configured.
  static async mockPurchase(req: AuthRequest, res: Response) {
    try {
      const { planId, customDuration, customDevices, customRegion } = req.body;
      const userId = req.user?.userId;

      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!planId) return res.status(400).json({ error: 'planId is required' });

      const planRes = await pool.query('SELECT * FROM subscription_plans WHERE plan_id = $1', [planId]);
      if (planRes.rows.length === 0) return res.status(404).json({ error: 'Plan not found' });
      const plan = planRes.rows[0];

      const isFree = parseFloat(plan.price_usd) === 0;
      let durationMonths = 1;
      
      if (customDuration) {
        const durStr = customDuration.toString();
        if (durStr === '1w') durationMonths = 0.25;
        else if (durStr === '3m') durationMonths = 3;
        else if (durStr === '12m') durationMonths = 12;
        else durationMonths = parseFloat(durStr) || 1;
      } else {
        durationMonths = parseFloat(plan.duration_months as string) || 1;
      }

      const devices = parseInt((customDevices || plan.max_devices || 5) as string);
      
      // Map custom regions to country codes
      let authorizedRegions = ['Global'];
      if (customRegion === 'US Only') authorizedRegions = ['US'];
      else if (customRegion === 'Europe') authorizedRegions = ['GB', 'DE', 'FR', 'NL', 'SE'];
      else if (customRegion === 'Global') authorizedRegions = ['Global'];

      const expiryDate = new Date();
      if (!isFree) {
        const totalDays = Math.ceil(durationMonths * 30.44);
        expiryDate.setDate(expiryDate.getDate() + totalDays);
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          `UPDATE users SET 
            plan_type = $1, 
            subscription_end_date = $2,
            max_devices = $3,
            authorized_regions = $4
           WHERE user_id = $5`,
          [isFree ? 'free' : 'premium', isFree ? null : expiryDate, devices, authorizedRegions, userId]
        );

        if (!isFree) {
          await client.query(
            `INSERT INTO payment_transactions (user_id, platform, product_id, purchase_token, status, amount, amount_paid)
             VALUES ($1, 'mock', $2, $3, 'completed', $4, $4)`,
            [userId, plan.plan_id, `mock_${Date.now()}`, plan.price_usd]
          );

          // Create/Update Subscription Record
          await client.query(
            `INSERT INTO subscriptions (user_id, plan_id, status, start_date, end_date)
             VALUES ($1, $2, 'active', NOW(), $3)
             ON CONFLICT (user_id) DO UPDATE SET 
              plan_id = EXCLUDED.plan_id,
              status = EXCLUDED.status,
              start_date = EXCLUDED.start_date,
              end_date = EXCLUDED.end_date`,
            [userId, plan.plan_id, expiryDate]
          );
        }

        await client.query('COMMIT');
        res.json({ success: true, message: `${plan.name} plan activated!`, plan });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error('[Payment] Mock purchase error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  private static async verifyWithGoogle(productId: string, token: string): Promise<boolean> {
    console.log(`[GooglePlay] Verifying token ${token.substring(0, 10)}...`);
    return true; 
  }

  private static async verifyWithApple(productId: string, token: string): Promise<boolean> {
    console.log(`[AppStore] Verifying receipt ${token.substring(0, 10)}...`);
    return true;
  }
}
