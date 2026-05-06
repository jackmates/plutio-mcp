const { URL } = require('node:url');
const { RateLimiter } = require('./rate-limiter');

const TOKEN_SAFETY_WINDOW_MS = 60_000;

class PlutioClient {
  constructor(config) {
    this.config = config;
    this.tokenCache = null;
    this.tokenInflight = null;
    this.rateLimiter = new RateLimiter(config.maxRequestsPerHour || 1000);
  }

  getRateLimiter() {
    return this.rateLimiter;
  }

  async getAccessToken() {
    if (
      this.tokenCache &&
      this.tokenCache.expiresAt - Date.now() > TOKEN_SAFETY_WINDOW_MS
    ) {
      return this.tokenCache.accessToken;
    }

    if (!this.tokenInflight) {
      this.tokenInflight = this.refreshAccessToken().finally(() => {
        this.tokenInflight = null;
      });
    }
    const cache = await this.tokenInflight;
    return cache.accessToken;
  }

  async refreshAccessToken() {
    const form = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'client_credentials'
    });

    const response = await fetch(`${this.config.apiBase}/oauth/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': this.config.userAgent
      },
      body: form.toString()
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Token request failed (${response.status}): ${text}`);
    }

    const json = await response.json();
    const expiresInSeconds = Number(json.expires_in || 3600);
    this.tokenCache = {
      accessToken: json.access_token,
      expiresAt: Date.now() + expiresInSeconds * 1000
    };
    return this.tokenCache;
  }

  async request(path, { method = 'GET', query, body, business } = {}) {
    await this.rateLimiter.acquire();
    const accessToken = await this.getAccessToken();
    const url = new URL(path, this.config.apiBase.endsWith('/') ? this.config.apiBase : `${this.config.apiBase}/`);

    if (query && typeof query === 'object') {
      for (const [key, value] of Object.entries(query)) {
        if (value == null) continue;
        url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
    }

    const headers = {
      authorization: `Bearer ${accessToken}`,
      business: business || this.config.business,
      'user-agent': this.config.userAgent,
      accept: 'application/json'
    };

    // Always set Content-Type: application/json for write methods so Plutio's
    // API doesn't 400 with an HTML error when the body is empty or when only
    // a path-style write is intended. Body defaults to {} for write methods.
    const upperMethod = String(method || 'GET').toUpperCase();
    const writeMethods = new Set(['POST', 'PUT', 'PATCH']);
    let payload;
    if (writeMethods.has(upperMethod)) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body !== undefined ? body : {});
    } else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    const response = await fetch(url, {
      method: upperMethod,
      headers,
      body: payload
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Plutio request failed (${response.status}) ${method} ${url}: ${text}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    return response.text();
  }
}

module.exports = {
  PlutioClient
};
