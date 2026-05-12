import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

export const VPN_STATES = {
  DISCONNECTED: 'Disconnected',
  CONNECTING: 'Connecting',
  CONNECTED: 'Connected',
  FAILED: 'Failed',
  FALLBACK: 'Fallback',
};

class VpnService {
  constructor() {
    this.currentState = VPN_STATES.DISCONNECTED;
    this.activeSession = null;
    this.attemptedServer = null;
    this.statusMessage = '';
    this.currentSubscription = null;
    this.listeners = [];
    this.mockTotalReceived = 0;
    this.mockTotalSent = 0;
  }

  /**
   * Fetches latest subscription status for the user
   */
  async getSubscriptionStatus() {
    try {
      const userData = await api.get('/user/profile');
      if (!userData) {
        this.currentSubscription = null;
        return null;
      }

      const subscription = {
        status: userData.subscription_status,
        end_date: userData.subscription_end_date,
        plan_name: userData.plan_name,
      };

      this.currentSubscription = subscription;
      return subscription;
    } catch (err) {
      console.error('Error checking subscription status:', err);
      return null;
    }
  }

  /**
   * Fetches the user's current plan state
   */
  async getUserPlanState() {
    try {
      const userData = await api.get('/user/profile');
      if (!userData) return { plan_type: 'free', is_premium: false };

      const now = new Date();
      const planType = userData.plan_type;
      const subEnd = userData.subscription_end_date ? new Date(userData.subscription_end_date) : null;
      // Fallback: If no trial set, assume 7 days from account creation
      const trialEnd = userData.trial_ends_at ? new Date(userData.trial_ends_at) : new Date(new Date(userData.created_at).getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const isSubActive = planType === 'premium' && (!subEnd || subEnd > now);
      const isTrialActive = trialEnd && trialEnd > now;
      
      // If they have a paid subscription, they are premium. 
      // If they are in the 7-day trial, they are 'free' tier (with limits).
      const isPremium = isSubActive; 

      return {
        plan_type: isPremium ? 'premium' : 'free',
        is_premium: isPremium,
        is_trial: isTrialActive,
        is_trial_expired: trialEnd && trialEnd <= now && !isSubActive,
        daily_limit: userData.daily_data_limit_bytes || 524288000,
        daily_used: userData.daily_data_used_bytes || 0,
        subscription_end_date: subEnd,
        trial_ends_at: trialEnd,
        created_at: userData.created_at
      };
    } catch (err) {
      console.error('Error fetching plan state:', err);
      return { plan_type: 'free', is_premium: false };
    }
  }

  // Add listener for state changes
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  notify() {
    this.listeners.forEach(callback => callback(this.currentState, this.activeSession, this.statusMessage, this.attemptedServer));
  }

  setStatus(msg) {
    this.statusMessage = msg;
    this.notify();
  }

  setState(newState) {
    this.currentState = newState;
    this.notify();
  }

  async getSplitTunnelingConfig() {
    return await api.get('/settings/split-tunneling');
  }

  async setSplitTunnelingConfig(config) {
    return await api.post('/settings/split-tunneling', { config });
  }

  async getFeedbackHistory() {
    return await api.get('/support/feedback');
  }

  async submitFeedback(category, subject, message) {
    return await api.post('/support/feedback', { category, subject, message });
  }

  async getFaqCategories() {
    return await api.get('/faq/categories');
  }

  async getFaqsByCategory(categoryId) {
    return await api.get(`/faq/categories/${categoryId}`);
  }

  async searchFaqs(query) {
    return await api.get(`/faq/search?query=${query}`);
  }

  async getServers() {
    return await api.get('/servers');
  }

  async getOptimalServer() {
    try {
      const candidates = await api.get('/servers/optimal');
      if (!candidates || candidates.length === 0) return null;
      return candidates; // Return the whole list for fallback support
    } catch (err) {
      console.error('[VpnService] Error fetching optimal servers:', err);
      return null;
    }
  }

  async connect(serverId, retryCount = 0) {
    const MAX_RETRIES = 2;

    try {
      const planState = await this.getUserPlanState();
      if (planState.is_trial_expired && !planState.is_premium) {
        throw new Error('Your free trial has expired. Please upgrade to a premium plan to continue using Nerox VPN.');
      }

      this.setState(VPN_STATES.CONNECTING);
      this.setStatus(retryCount > 0 ? `Retrying... (${retryCount})` : 'Authenticating...');
      this.attemptedServer = serverId;
      this.notify();

      const session = await api.post('/sessions', { serverId });
      
      console.log(`[VpnService] Session created: ${session.session_id}`);
      console.log(`[VpnService] Configuration received (Encrypted): \n${session.config}`);
      
      const decryptedConfig = this.decryptConfig(session.config);
      console.log(`[VpnService] Configuration Decrypted`);

      this.setStatus('Securing Tunnel...');
      await this.startNativeTunnel(session.assigned_vpn_ip, decryptedConfig, session.splitTunneling);

      if (this.currentState === VPN_STATES.DISCONNECTED) {
        this.activeSession = session;
        this.disconnect(); 
        return;
      }

      this.activeSession = session;
      this.attemptedServer = null;
      this.setStatus('Connected');
      this.setState(VPN_STATES.CONNECTED);
      return session;

    } catch (err) {
      this.attemptedServer = null;
      if (retryCount < MAX_RETRIES && this.currentState !== VPN_STATES.DISCONNECTED) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        return this.connect(serverId, retryCount + 1);
      }
      this.setState(VPN_STATES.FAILED);
      throw err;
    }
  }

  async getPreferredProtocol() {
    const data = await api.get('/settings/protocol');
    return data.protocol;
  }

  async setPreferredProtocol(protocol) {
    return await api.post('/settings/protocol', { protocol });
  }

  async connectSmart() {
    this.setState(VPN_STATES.CONNECTING);
    this.setStatus('Optimizing Route...');
    
    try {
      const candidates = await this.getOptimalServer();
      if (!candidates || candidates.length === 0) throw new Error('No available servers found');
      
      // Attempt connection to candidates in order (Fallback Logic)
      for (let i = 0; i < candidates.length; i++) {
        const server = candidates[i];
        try {
          if (i > 0) this.setStatus(`Trying alternative (${i})...`);
          return await this.connect(server.server_id);
        } catch (err) {
          console.warn(`[VpnService] Failed to connect to ${server.hostname}, trying next...`);
          if (i === candidates.length - 1) throw err; // Re-throw if it was the last one
        }
      }
    } catch (err) {
      this.setState(VPN_STATES.FAILED);
      throw err;
    }
  }

  async disconnect() {
    try {
      if (!this.activeSession) return;
      const sessionId = this.activeSession.session_id;

      await this.stopNativeTunnel();
      if (sessionId) {
        await api.put(`/sessions/${sessionId}`, {});
      }

      this.activeSession = null;
      this.setState(VPN_STATES.DISCONNECTED);
    } catch (err) {
      console.error('VPN Disconnection Error:', err);
      this.activeSession = null;
      this.setState(VPN_STATES.DISCONNECTED);
    }
  }

  async getTrafficStats() {
    if (this.currentState !== VPN_STATES.CONNECTED) return null;
    
    const downloadSpeed = Math.floor(Math.random() * 4500000) + 500000;
    const uploadSpeed = Math.floor(Math.random() * 1200000) + 100000;
    
    const newDownload = Math.round((downloadSpeed * 3) / 8);
    const newUpload = Math.round((uploadSpeed * 3) / 8);

    this.mockTotalReceived += newDownload;
    this.mockTotalSent += newUpload;

    return {
      downloadSpeed,
      uploadSpeed,
      totalReceived: this.mockTotalReceived,
      totalSent: this.mockTotalSent
    };
  }

  async reportTraffic(sessionId, bytesSent, bytesReceived) {
    try {
      return await api.post('/sessions/report', { sessionId, bytesSent, bytesReceived });
    } catch (err) {
      console.error('Error reporting traffic:', err);
    }
  }

  async startNativeTunnel(ip, config, splitTunneling) {
    console.log(`[NativeTunnel] Starting tunnel for IP: ${ip}`);
    if (splitTunneling && splitTunneling.allowedApps) {
      console.log(`[NativeTunnel] Applying split tunneling for ${splitTunneling.allowedApps.length} apps`);
    }
    return new Promise((resolve) => setTimeout(resolve, 2000));
  }

  decryptConfig(encryptedData) {
    // In a real app, use a crypto library like react-native-aes or crypto-js
    // For this simulation, we'll acknowledge the encrypted format but return the "raw" simulation
    console.log('[Security] Decrypting config using local device key...');
    return "client\ndev tun\nproto udp\n..."; // Simplified mock return
  }

  async stopNativeTunnel() {
    console.log('[NativeTunnel] Stopping tunnel');
    return new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export default new VpnService();
