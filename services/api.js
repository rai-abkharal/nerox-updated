import AsyncStorage from '@react-native-async-storage/async-storage';

// ✅ Use this for PHYSICAL Android phone (your PC's WiFi IP)
const API_URL = 'http://192.168.0.102:5000/api';

// 🖥️ Use this for ANDROID EMULATOR instead (comment out the one above)
// const API_URL = 'http://10.0.2.2:5000/api';

class Api {
  async getAuthToken() {
    return await AsyncStorage.getItem('auth_token');
  }

  async setAuthToken(token) {
    if (token) {
      await AsyncStorage.setItem('auth_token', token);
    } else {
      await AsyncStorage.removeItem('auth_token');
    }
  }

  async request(endpoint, options = {}) {
    const token = await this.getAuthToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        await AsyncStorage.removeItem('auth_token');
      }
      throw new Error(data.error || 'Something went wrong');
    }

    return data;
  }

  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  post(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) });
  }

  put(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }
}

export default new Api();
