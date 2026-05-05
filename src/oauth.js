/**
 * Minimal OAuth 2.1 authorization for MCP clients.
 *
 * Implements just enough of the MCP authorization spec for clients like
 * Claude desktop / Cowork to connect to a remote MCP server:
 *
 *   - /.well-known/oauth-authorization-server   RFC 8414 metadata
 *   - /.well-known/oauth-protected-resource     RFC 9728 resource metadata
 *   - /oauth/register                           RFC 7591 dynamic client registration
 *   - /oauth/authorize                          PKCE-required authorization endpoint
 *   - /oauth/token                              authorization_code grant
 *
 * Single-instance, in-memory storage. Tokens last 1 hour, codes 10 minutes.
 *
 * Optional consent gate: set MCP_AUTH_PASSCODE in env to require a passcode at
 * the /authorize step. If unset, /authorize auto-approves any registered client
 * — fine for trusted networks but not for the public internet.
 */

const crypto = require('node:crypto');

const CODE_TTL_MS = 10 * 60 * 1000; // 10 min
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 h

const clients = new Map(); // clientId -> { clientSecret, redirectUris, registeredAt }
const codes = new Map(); // code -> { clientId, redirectUri, codeChallenge, codeChallengeMethod, scope, expiresAt }
const tokens = new Map(); // accessToken -> { clientId, scope, expiresAt }

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function purgeExpired() {
  const now = Date.now();
  for (const [k, v] of codes) if (v.expiresAt < now) codes.delete(k);
  for (const [k, v] of tokens) if (v.expiresAt < now) tokens.delete(k);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    let total = 0;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limit) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function parseFormOrJson(body, contentType) {
  if (!body) return {};
  if (contentType && contentType.toLowerCase().includes('application/json')) {
    return JSON.parse(body);
  }
  const out = {};
  for (const [k, v] of new URLSearchParams(body)) out[k] = v;
  return out;
}

function publicBaseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return `${proto}://${host}`;
}

function jsonResponse(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    ...extraHeaders
  });
  res.end(JSON.stringify(body));
}

function htmlResponse(res, status, html) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function getAuthorizationServerMetadata(baseUrl) {
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp']
  };
}

function getProtectedResourceMetadata(baseUrl) {
  return {
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    scopes_supported: ['mcp'],
    bearer_methods_supported: ['header']
  };
}

async function handleRegister(req, res) {
  const body = await readBody(req).catch(() => null);
  let parsed;
  try {
    parsed = parseFormOrJson(body, req.headers['content-type'] || '');
  } catch (error) {
    return jsonResponse(res, 400, { error: 'invalid_client_metadata', error_description: 'Invalid JSON body' });
  }
  const redirectUris = Array.isArray(parsed.redirect_uris) ? parsed.redirect_uris.map(String) : [];
  if (redirectUris.length === 0) {
    return jsonResponse(res, 400, { error: 'invalid_redirect_uri', error_description: 'redirect_uris is required' });
  }

  const clientId = randomToken(16);
  const clientSecret = randomToken(32);
  const now = Math.floor(Date.now() / 1000);
  clients.set(clientId, {
    clientSecret,
    redirectUris,
    registeredAt: now,
    clientName: parsed.client_name || null
  });

  jsonResponse(res, 201, {
    client_id: clientId,
    client_secret: clientSecret,
    client_id_issued_at: now,
    redirect_uris: redirectUris,
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: 'mcp',
    client_name: parsed.client_name || undefined
  });
}

function redirectWithError(res, redirectUri, state, error, description) {
  try {
    const target = new URL(redirectUri);
    target.searchParams.set('error', error);
    if (description) target.searchParams.set('error_description', description);
    if (state) target.searchParams.set('state', state);
    res.writeHead(302, { location: target.toString() });
    res.end();
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end(`${error}: ${description || ''}`);
  }
}

async function handleAuthorize(req, res, url, opts) {
  purgeExpired();
  const params = url.searchParams;
  const responseType = params.get('response_type');
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const state = params.get('state') || '';
  const codeChallenge = params.get('code_challenge');
  const codeChallengeMethod = params.get('code_challenge_method') || 'S256';
  const scope = params.get('scope') || 'mcp';
  const passcode = params.get('passcode');
  const requirePasscode = Boolean(opts && opts.passcode);

  // Validate client + redirect_uri before bouncing to it
  const clientRecord = clients.get(clientId || '');
  if (!clientRecord) {
    return jsonResponse(res, 400, { error: 'invalid_client', error_description: 'Unknown client_id' });
  }
  if (!redirectUri || !clientRecord.redirectUris.includes(redirectUri)) {
    return jsonResponse(res, 400, { error: 'invalid_redirect_uri', error_description: 'redirect_uri mismatch' });
  }

  if (responseType !== 'code') {
    return redirectWithError(res, redirectUri, state, 'unsupported_response_type', 'Only response_type=code is supported');
  }
  if (!codeChallenge) {
    return redirectWithError(res, redirectUri, state, 'invalid_request', 'PKCE required: code_challenge missing');
  }
  if (codeChallengeMethod !== 'S256') {
    return redirectWithError(res, redirectUri, state, 'invalid_request', 'PKCE method must be S256');
  }

  if (requirePasscode && passcode !== opts.passcode) {
    const errorMsg = passcode != null ? 'Incorrect passcode. Try again.' : '';
    return htmlResponse(
      res,
      200,
      `<!doctype html><html><head><meta charset="utf-8"><title>Authorize MCP access</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:420px;margin:80px auto;padding:0 24px;color:#222}
h1{font-size:1.3rem;margin-bottom:.5rem}
p{color:#555;line-height:1.5}
form{margin-top:1.5rem}
input[type=password]{width:100%;padding:.6rem .75rem;font-size:1rem;border:1px solid #bbb;border-radius:6px;box-sizing:border-box}
button{margin-top:1rem;padding:.6rem 1rem;font-size:1rem;background:#111;color:#fff;border:0;border-radius:6px;cursor:pointer}
.error{color:#b00020;font-size:.9rem;margin-top:.5rem}
.client{background:#f5f5f7;padding:.75rem 1rem;border-radius:6px;font-size:.9rem;margin-top:1rem}
.client code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85rem}
</style></head><body>
<h1>Authorize MCP client</h1>
<p>An MCP client wants to connect to <strong>${escapeHtml(req.headers.host || '')}</strong>. Enter the access passcode to allow it.</p>
<div class="client"><div>Client: <code>${escapeHtml(clientRecord.clientName || clientId)}</code></div><div>Scope: <code>${escapeHtml(scope)}</code></div></div>
<form method="get" action="${escapeHtml(url.pathname)}">
  <input type="hidden" name="response_type" value="${escapeHtml(responseType)}">
  <input type="hidden" name="client_id" value="${escapeHtml(clientId)}">
  <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}">
  <input type="hidden" name="state" value="${escapeHtml(state)}">
  <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}">
  <input type="hidden" name="code_challenge_method" value="${escapeHtml(codeChallengeMethod)}">
  <input type="hidden" name="scope" value="${escapeHtml(scope)}">
  <input type="password" name="passcode" placeholder="Passcode" autofocus required>
  ${errorMsg ? `<div class="error">${escapeHtml(errorMsg)}</div>` : ''}
  <button type="submit">Authorize</button>
</form>
</body></html>`
    );
  }

  const code = randomToken(32);
  codes.set(code, {
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    scope,
    expiresAt: Date.now() + CODE_TTL_MS
  });

  const target = new URL(redirectUri);
  target.searchParams.set('code', code);
  if (state) target.searchParams.set('state', state);
  res.writeHead(302, { location: target.toString() });
  res.end();
}

async function handleToken(req, res) {
  purgeExpired();
  const body = await readBody(req).catch(() => '');
  let params;
  try {
    params = parseFormOrJson(body, req.headers['content-type'] || '');
  } catch {
    return jsonResponse(res, 400, { error: 'invalid_request', error_description: 'Invalid body' });
  }

  const grantType = params.grant_type;
  if (grantType !== 'authorization_code') {
    return jsonResponse(res, 400, { error: 'unsupported_grant_type' });
  }

  const code = params.code;
  const codeVerifier = params.code_verifier;
  const redirectUri = params.redirect_uri;
  const clientId = params.client_id;

  const stored = code ? codes.get(code) : null;
  if (!stored) {
    return jsonResponse(res, 400, { error: 'invalid_grant', error_description: 'Unknown or expired code' });
  }
  codes.delete(code); // single-use regardless of outcome

  if (stored.clientId !== clientId) {
    return jsonResponse(res, 400, { error: 'invalid_client' });
  }
  if (stored.redirectUri !== redirectUri) {
    return jsonResponse(res, 400, { error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
  }

  const expectedHash = crypto
    .createHash('sha256')
    .update(codeVerifier || '')
    .digest('base64url');
  if (expectedHash !== stored.codeChallenge) {
    return jsonResponse(res, 400, { error: 'invalid_grant', error_description: 'PKCE verification failed' });
  }

  const accessToken = randomToken(32);
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  tokens.set(accessToken, { clientId, scope: stored.scope, expiresAt });

  jsonResponse(res, 200, {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: Math.floor(TOKEN_TTL_MS / 1000),
    scope: stored.scope
  });
}

function isAuthorized(req) {
  purgeExpired();
  const auth = req.headers.authorization || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const token = auth.slice(7).trim();
  const record = tokens.get(token);
  if (!record) return null;
  if (record.expiresAt < Date.now()) {
    tokens.delete(token);
    return null;
  }
  return record;
}

function unauthorizedResponse(res, baseUrl) {
  res.writeHead(401, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'www-authenticate': `Bearer realm="${baseUrl}", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
  });
  res.end(JSON.stringify({ error: 'unauthorized', error_description: 'OAuth bearer token required' }));
}

function debugStats() {
  purgeExpired();
  return {
    clients: clients.size,
    codes: codes.size,
    tokens: tokens.size
  };
}

module.exports = {
  handleRegister,
  handleAuthorize,
  handleToken,
  isAuthorized,
  unauthorizedResponse,
  getAuthorizationServerMetadata,
  getProtectedResourceMetadata,
  publicBaseUrl,
  debugStats
};
