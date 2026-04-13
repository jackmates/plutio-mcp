const DEFAULT_API_BASE = 'https://api.plutio.com/v1.11';

function getEnv(name, fallback = undefined) {
  const value = process.env[name];
  if (value == null || value === '') {
    return fallback;
  }
  return value;
}

function loadConfig() {
  return {
    apiBase: getEnv('PLUTIO_API_BASE', DEFAULT_API_BASE),
    clientId: getEnv('PLUTIO_CLIENT_ID'),
    clientSecret: getEnv('PLUTIO_CLIENT_SECRET'),
    business: getEnv('PLUTIO_BUSINESS'),
    userAgent: getEnv('PLUTIO_USER_AGENT', 'plutio-mcp/0.1.0')
  };
}

function assertBaseConfig(config) {
  const missing = [];
  if (!config.clientId) missing.push('PLUTIO_CLIENT_ID');
  if (!config.clientSecret) missing.push('PLUTIO_CLIENT_SECRET');
  if (!config.business) missing.push('PLUTIO_BUSINESS');

  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

module.exports = {
  DEFAULT_API_BASE,
  loadConfig,
  assertBaseConfig
};
