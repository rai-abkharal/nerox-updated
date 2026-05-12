import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { connectRedis } from './config/redis';
import pool from './config/db';
import apiRoutes from './routes/api';
import { initCronJobs } from './cron/jobs';
import { VpnService } from './services/VpnService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middleware
app.use(helmet());
app.use(cors());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use('/avatars', express.static(path.join(__dirname, '../public/avatars')));

// API Routes
app.use('/api', apiRoutes);

// Initialize Cron Jobs
initCronJobs();

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const startServer = async () => {
  try {
    // Connect to DB
    await pool.query('SELECT NOW()');
    console.log('PostgreSQL Connected');

    // Connect to Redis
    await connectRedis();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      VpnService.startMonitoring();
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
