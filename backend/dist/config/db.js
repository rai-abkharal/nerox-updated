"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = void 0;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
});
// Auto-migration for missing columns
const runMigrations = async () => {
    try {
        const client = await pool.connect();
        try {
            await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(50) UNIQUE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_data_reset_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_protocol VARCHAR(20) DEFAULT 'Auto';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS split_tunneling_config JSONB DEFAULT '{}';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS kill_switch_enabled BOOLEAN DEFAULT FALSE;

        ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE;
        ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS is_streaming_optimized BOOLEAN DEFAULT FALSE;
        ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS cpu_usage INTEGER DEFAULT 0;
        ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS avg_latency_ms INTEGER DEFAULT 0;

        ALTER TABLE vpn_sessions ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        ALTER TABLE vpn_sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

        ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT FALSE;
        ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS features_meta JSONB DEFAULT '{}';

        ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS google_product_id VARCHAR(255);
        ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS apple_product_id VARCHAR(255);

        CREATE TABLE IF NOT EXISTS payment_transactions (
          transaction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID REFERENCES users(user_id),
          platform VARCHAR(50),
          product_id VARCHAR(255),
          purchase_token TEXT UNIQUE,
          status VARCHAR(50),
          amount_paid DECIMAL(10, 2),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS referral_usage (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          referrer_id UUID REFERENCES users(user_id),
          referee_id UUID REFERENCES users(user_id) UNIQUE,
          referral_code VARCHAR(50),
          reward_days INTEGER DEFAULT 7,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS user_devices (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID REFERENCES users(user_id),
          device_id VARCHAR(255),
          model VARCHAR(100),
          os VARCHAR(50),
          last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(user_id, device_id)
        );

        CREATE TABLE IF NOT EXISTS support_feedback (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
          category VARCHAR(100),
          subject VARCHAR(255),
          message TEXT NOT NULL,
          admin_response TEXT,
          status VARCHAR(50) DEFAULT 'pending',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS server_metrics (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          server_id UUID REFERENCES vpn_servers(server_id) ON DELETE CASCADE,
          cpu_usage INTEGER,
          avg_latency_ms INTEGER,
          active_connections INTEGER,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS server_availability_logs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          server_id UUID REFERENCES vpn_servers(server_id) ON DELETE CASCADE,
          status VARCHAR(50),
          reason TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        -- Seed Plans
        INSERT INTO subscription_plans (name, duration_months, price_usd, max_devices, features_meta)
        VALUES 
        ('Free', 1, 0.00, 1, '{"locations_limit": 5, "streaming": false, "ads": true, "speed": "2Mbps", "priority_support": false}')
        ON CONFLICT (name) DO UPDATE SET 
          price_usd = EXCLUDED.price_usd, 
          max_devices = EXCLUDED.max_devices, 
          features_meta = EXCLUDED.features_meta;

        INSERT INTO subscription_plans (name, duration_months, price_usd, max_devices, features_meta)
        VALUES 
        ('Monthly', 1, 9.99, 3, '{"locations_limit": -1, "streaming": true, "ads": false, "speed": "Ultra", "priority_support": true}')
        ON CONFLICT (name) DO UPDATE SET 
          price_usd = EXCLUDED.price_usd, 
          max_devices = EXCLUDED.max_devices, 
          features_meta = EXCLUDED.features_meta;

        INSERT INTO subscription_plans (name, duration_months, price_usd, max_devices, features_meta)
        VALUES 
        ('Yearly', 12, 79.99, 3, '{"locations_limit": -1, "streaming": true, "ads": false, "speed": "Ultra", "priority_support": true}')
        ON CONFLICT (name) DO UPDATE SET 
          price_usd = EXCLUDED.price_usd, 
          max_devices = EXCLUDED.max_devices, 
          features_meta = EXCLUDED.features_meta;

        INSERT INTO subscription_plans (name, duration_months, price_usd, max_devices, is_custom)
        VALUES 
        ('Custom Plan', 1, 9.99, 1, TRUE)
        ON CONFLICT (name) DO UPDATE SET 
          price_usd = EXCLUDED.price_usd;
      `);
            console.log('✅ Database migrations checked/applied');
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        console.error('❌ Migration Error:', err);
    }
};
runMigrations();
const query = (text, params) => pool.query(text, params);
exports.query = query;
exports.default = pool;
