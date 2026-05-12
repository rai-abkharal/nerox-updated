import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthService } from '../services/AuthService';

export class AuthController {

  // POST /api/auth/register
  static async register(req: Request, res: Response) {
    try {
      const { email, password, username, deviceInfo, referralCode } = req.body;

      if (!email || !password || !username) {
        return res.status(400).json({ error: 'Email, username, and password are required.' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      }

      const token = await AuthService.register(email.toLowerCase().trim(), password, username.trim(), referralCode);
      
      // Extract userId from token (or refactor service to return it)
      const decoded: any = jwt.decode(token);
      if (decoded?.userId) {
        await AuthService.registerDevice(decoded.userId, deviceInfo);
      }

      res.json({ success: true, token });

    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // POST /api/auth/login
  static async login(req: Request, res: Response) {
    try {
      const { email, password, deviceInfo } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }

      const token = await AuthService.login(email.toLowerCase().trim(), password);

      const decoded: any = jwt.decode(token);
      if (decoded?.userId) {
        await AuthService.registerDevice(decoded.userId, deviceInfo);
      }

      res.json({ success: true, token });

    } catch (error: any) {
      res.status(401).json({ error: error.message });
    }
  }
}
