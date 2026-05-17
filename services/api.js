import AsyncStorage from '@react-native-async-storage/async-storage';

// Use this for PHYSICAL Android phone / production API.
const API_URL = 'http://162.243.197.241:5000/api';
const DEBUG_API = typeof __DEV__ === 'undefined' ? true : __DEV__;

const SENSITIVE_KEYS = [
  'authorization',
  'password',
  'token',
  'auth_token',
  'jwt',
];

const isSensitiveKey = key =>
  SENSITIVE_KEYS.some(sensitiveKey => key.toLowerCase().includes(sensitiveKey));

const maskSensitive = value => {
  if (Array.isArray(value)) {
    return value.map(maskSensitive);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).reduce((safeValue, key) => {
      safeValue[key] = isSensitiveKey(key)
        ? '[masked]'
        : maskSensitive(value[key]);
      return safeValue;
    }, {});
  }

  return value;
};

const parseRequestBody = body => {
  if (!body || typeof body !== 'string') {
    return body;
  }

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
};

const parseResponseBody = responseText => {
  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
};

const logApi = (level, message, payload) => {
  if (!DEBUG_API) {
    return;
  }

  if (payload === undefined) {
    console[level](`[API] ${message}`);
    return;
  }

  console[level](`[API] ${message}`, payload);
};

const getNetworkDiagnostics = url => {
  const tips = [
    'Check that the backend server is running and reachable from the phone.',
    'If backend is on your PC, a physical phone needs your PC WiFi IP. Android emulator usually needs http://10.0.2.2:<port>.',
    'Check firewall/security group rules and make sure the API port is open.',
  ];

  if (/^https:\/\/\d{1,3}(\.\d{1,3}){3}/.test(url)) {
    tips.push(
      'HTTPS is using a raw IP address. Mobile apps often reject this if the SSL certificate is self-signed, expired, or issued for a domain instead of this IP.',
    );
  }

  return tips;
};

// For Android emulator, use http://10.0.2.2:<port>/api instead.
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
    const method = options.method || 'GET';
    const url = `${API_URL}${endpoint}`;
    const startedAt = Date.now();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    logApi('log', `--> ${method} ${url}`, {
      headers: maskSensitive(headers),
      body: maskSensitive(parseRequestBody(options.body)),
    });

    let response;
    let responseText = '';

    try {
      response = await fetch(url, {
        ...options,
        headers,
      });

      responseText = await response.text();
    } catch (error) {
      const duration = Date.now() - startedAt;
      logApi('error', `XX ${method} ${url} (${duration}ms)`, {
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
        diagnostics: getNetworkDiagnostics(url),
      });

      throw new Error(
        `${
          error?.message || 'Network request failed'
        } - open Metro/log-android and check [API] logs for details.`,
      );
    }

    const data = parseResponseBody(responseText);
    const duration = Date.now() - startedAt;

    logApi(
      response.ok ? 'log' : 'error',
      `<-- ${response.status} ${method} ${url} (${duration}ms)`,
      {
        response: maskSensitive(data),
        rawResponse: typeof data === 'string' ? data : undefined,
      },
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        await AsyncStorage.removeItem('auth_token');
      }
      throw new Error(
        data?.error || data?.message || responseText || 'Something went wrong',
      );
    }

    return data;
  }

  get(endpoint, options = {}) {
    return this.request(endpoint, {...options, method: 'GET'});
  }

  post(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  put(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, {...options, method: 'DELETE'});
  }
}

export default new Api();
