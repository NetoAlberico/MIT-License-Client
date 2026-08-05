/*!
 * MIT License Server — controla dispositivos por token E contas de usuário
 * (usuário + senha) com revogação de verdade.
 * -----------------------------------------------------------------------
 * Duas formas de acesso, pode usar uma ou as duas:
 *
 * A) TOKEN DIRETO (sem conta) — o token já carrega tudo assinado, e este
 *    servidor só limita quantos aparelhos podem usá-lo:
 *   POST /activate   { token, deviceId }
 *   GET  /devices?nonce=...      (exige x-admin-key)
 *   POST /reset      { nonce }   (exige x-admin-key)
 *
 * B) CONTA DE USUÁRIO (usuário + senha) — a senha fica guardada (com hash,
 *    nunca em texto puro) aqui no servidor, o que permite REVOGAR o acesso
 *    de alguém na hora, sem precisar trocar a chave secreta de todo mundo:
 *   POST   /users              (exige x-admin-key) — cria uma conta nova
 *   GET    /users              (exige x-admin-key) — lista as contas
 *   DELETE /users?username=... (exige x-admin-key) — revoga uma conta
 *   POST   /users/reset-devices { username } (exige x-admin-key)
 *   POST   /login   { username, password, deviceId } — chamado pelos apps
 *   GET    /account-status?username=...  — checagem leve e periódica (sem
 *          senha) pra saber se a conta continua ativa, usada pelos apps
 *          pra detectar revogação mesmo com o token local ainda "válido".
 *
 * GET /health — só pra testar se o Worker está no ar.
 * -----------------------------------------------------------------------
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-key",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

    const url = new URL(request.url);
    try {
      if (url.pathname === "/activate" && request.method === "POST") return await handleActivate(request, env);
      if (url.pathname === "/devices" && request.method === "GET") return await handleDevicesLookup(request, env);
      if (url.pathname === "/reset" && request.method === "POST") return await handleReset(request, env);

      if (url.pathname === "/users" && request.method === "POST") return await handleCreateUser(request, env);
      if (url.pathname === "/users" && request.method === "GET") return await handleListUsers(request, env);
      if (url.pathname === "/users" && request.method === "DELETE") return await handleDeleteUser(request, env);
      if (url.pathname === "/users/reset-devices" && request.method === "POST")
        return await handleResetUserDevices(request, env);
      if (url.pathname === "/login" && request.method === "POST") return await handleLogin(request, env);
      if (url.pathname === "/account-status" && request.method === "GET")
        return await handleAccountStatus(request, env);

      if (url.pathname === "/health") return json({ ok: true });
    } catch (err) {
      return json({ ok: false, error: "Erro interno no servidor de licenças." }, 500);
    }
    return json({ ok: false, error: "Rota não encontrada." }, 404);
  },
};

/* ------------------------------- POST /activate (token direto) ------------------------------- */
async function handleActivate(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !body.token || !body.deviceId) {
    return json({ ok: false, error: "Requisição inválida (faltou token ou deviceId)." }, 400);
  }
  if (!env.SECRET) {
    return json({ ok: false, error: "Servidor sem SECRET configurada." }, 500);
  }

  const result = await verifyToken(body.token, env.SECRET);
  if (!result.ok) return json({ ok: false, error: result.error }, 400);

  const { nonce, maxDevices, start, end } = result.payload;
  const today = todayStr();
  if (today < start) return json({ ok: false, error: "Este token ainda não é válido." }, 403);
  if (today > end) return json({ ok: false, error: "Este token já venceu." }, 403);

  const check = await checkAndRegisterDevice(env, `dev:${nonce}`, body.deviceId, maxDevices);
  if (!check.ok) return json(check, 403);
  return json(check);
}

/* ------------------------------- GET /devices ------------------------------- */
async function handleDevicesLookup(request, env) {
  if (!isAdmin(request, env)) return json({ ok: false, error: "Não autorizado." }, 401);

  const url = new URL(request.url);
  const nonce = url.searchParams.get("nonce");
  if (!nonce) return json({ ok: false, error: "Informe o nonce do token." }, 400);

  const deviceIds = await getDeviceList(env, `dev:${nonce}`);
  return json({ ok: true, nonce, devicesUsed: deviceIds.length, deviceIds });
}

/* -------------------------------- POST /reset -------------------------------- */
async function handleReset(request, env) {
  if (!isAdmin(request, env)) return json({ ok: false, error: "Não autorizado." }, 401);

  const body = await request.json().catch(() => null);
  if (!body || !body.nonce) return json({ ok: false, error: "Informe o nonce do token." }, 400);

  await env.ACTIVATIONS.delete(`dev:${body.nonce}`);
  return json({ ok: true });
}

/* ============================================================================
   CONTAS DE USUÁRIO (usuário + senha)
   ========================================================================= */

/* ------------------------------- POST /users (criar) ------------------------------- */
async function handleCreateUser(request, env) {
  if (!isAdmin(request, env)) return json({ ok: false, error: "Não autorizado." }, 401);
  if (!env.USERS) return json({ ok: false, error: "Servidor sem KV de USERS configurado." }, 500);

  const body = await request.json().catch(() => null);
  if (!body || !body.cliente || !body.appId || !body.start || !body.end) {
    return json({ ok: false, error: "Dados incompletos (cliente, app, início e fim são obrigatórios)." }, 400);
  }

  // Gera um nome de usuário único a partir do nome do cliente, a menos que
  // um tenha sido pedido explicitamente.
  const base = slugify(body.username || body.cliente) || "usuario";
  let username = base;
  let attempt = 0;
  while (await env.USERS.get(`user:${username}`)) {
    attempt++;
    username = `${base}${attempt + 1}`;
  }

  const password = (body.password || "").trim() || generatePassword();
  const { hash, salt } = await hashPassword(password);

  const record = {
    username,
    passwordHash: hash,
    salt,
    cliente: body.cliente,
    appId: body.appId,
    type: body.type || "P",
    start: body.start,
    end: body.end,
    maxDevices: parseInt(body.maxDevices, 10) || 0,
    active: true,
    createdAt: new Date().toISOString(),
  };
  await env.USERS.put(`user:${username}`, JSON.stringify(record));

  // A senha em texto puro só existe nesta resposta — depois disso, só o
  // hash fica guardado. Se for perdida, é preciso trocar a senha da conta.
  return json({ ok: true, username, password, cliente: record.cliente });
}

/* ------------------------------- GET /users (listar) ------------------------------- */
async function handleListUsers(request, env) {
  if (!isAdmin(request, env)) return json({ ok: false, error: "Não autorizado." }, 401);
  if (!env.USERS) return json({ ok: false, error: "Servidor sem KV de USERS configurado." }, 500);

  const list = await env.USERS.list({ prefix: "user:" });
  const users = [];
  for (const key of list.keys) {
    const raw = await env.USERS.get(key.name);
    if (!raw) continue;
    const record = JSON.parse(raw);
    delete record.passwordHash;
    delete record.salt;
    const deviceIds = await getDeviceList(env, `dev:user:${record.username}`);
    record.devicesUsed = deviceIds.length;
    users.push(record);
  }
  return json({ ok: true, users });
}

/* ------------------------------- DELETE /users (revogar) ------------------------------- */
async function handleDeleteUser(request, env) {
  if (!isAdmin(request, env)) return json({ ok: false, error: "Não autorizado." }, 401);
  const url = new URL(request.url);
  const username = (url.searchParams.get("username") || "").trim().toLowerCase();
  if (!username) return json({ ok: false, error: "Informe o usuário." }, 400);

  await env.USERS.delete(`user:${username}`);
  await env.ACTIVATIONS.delete(`dev:user:${username}`);
  return json({ ok: true });
}

/* ------------------------------- POST /users/reset-devices ------------------------------- */
async function handleResetUserDevices(request, env) {
  if (!isAdmin(request, env)) return json({ ok: false, error: "Não autorizado." }, 401);
  const body = await request.json().catch(() => null);
  const username = (body && body.username ? body.username : "").trim().toLowerCase();
  if (!username) return json({ ok: false, error: "Informe o usuário." }, 400);

  await env.ACTIVATIONS.delete(`dev:user:${username}`);
  return json({ ok: true });
}

/* --------------------------------- POST /login --------------------------------- */
async function handleLogin(request, env) {
  if (!env.USERS) return json({ ok: false, error: "Servidor sem KV de USERS configurado." }, 500);
  const body = await request.json().catch(() => null);
  if (!body || !body.username || !body.password || !body.deviceId) {
    return json({ ok: false, error: "Informe usuário e senha." }, 400);
  }
  const username = body.username.trim().toLowerCase();
  const raw = await env.USERS.get(`user:${username}`);
  if (!raw) return json({ ok: false, error: "Usuário ou senha incorretos." }, 401);
  const record = JSON.parse(raw);

  if (record.active === false) {
    return json({ ok: false, error: "Este acesso foi desativado. Fale com quem gerencia sua assinatura." }, 403);
  }

  const validPassword = await verifyPassword(body.password, record.salt, record.passwordHash);
  if (!validPassword) return json({ ok: false, error: "Usuário ou senha incorretos." }, 401);

  const today = todayStr();
  if (today < record.start) return json({ ok: false, error: `Este acesso só é válido a partir de ${record.start}.` }, 403);
  if (today > record.end) return json({ ok: false, error: `Seu acesso venceu em ${record.end}.` }, 403);

  const check = await checkAndRegisterDevice(env, `dev:user:${username}`, body.deviceId, record.maxDevices);
  if (!check.ok) return json(check, 403);

  // Emite um token assinado no mesmo formato usado no resto do sistema —
  // o app trata isso exatamente como um token colado manualmente, incluindo
  // ficar funcionando offline depois deste login.
  const nonce = `u-${username}`;
  const payloadStr = `2|${encodeURIComponent(record.cliente)}|${record.appId}|${record.type}|${record.start}|${record.end}|${nonce}|${record.maxDevices || 0}`;
  const sig = await hmacHex(payloadStr, env.SECRET);
  const token = `MIT-${strToB64url(payloadStr)}.${sig}`;

  return json({ ok: true, token, username });
}

/* --------------------------------- GET /account-status --------------------------------- */
// Checagem leve (sem senha), pra detectar se uma conta foi revogada mesmo
// que o token guardado localmente ainda pareça válido pela data.
async function handleAccountStatus(request, env) {
  if (!env.USERS) return json({ ok: true, active: true }); // sem contas configuradas — não bloqueia por conta
  const url = new URL(request.url);
  const username = (url.searchParams.get("username") || "").trim().toLowerCase();
  if (!username) return json({ ok: false, error: "Informe o usuário." }, 400);

  const raw = await env.USERS.get(`user:${username}`);
  if (!raw) return json({ ok: true, active: false });
  const record = JSON.parse(raw);
  const today = todayStr();
  const active = record.active !== false && today <= record.end;
  return json({ ok: true, active });
}

/* ------------------------------- utilidades de dispositivo ------------------------------- */
async function getDeviceList(env, key) {
  try {
    const raw = await env.ACTIVATIONS.get(key);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}
async function checkAndRegisterDevice(env, key, deviceId, maxDevices) {
  if (!maxDevices || maxDevices <= 0) return { ok: true, unlimited: true };
  const deviceIds = await getDeviceList(env, key);
  if (deviceIds.includes(deviceId)) return { ok: true, devicesUsed: deviceIds.length, maxDevices };
  if (deviceIds.length >= maxDevices) {
    return {
      ok: false,
      limitReached: true,
      error: `Limite de ${maxDevices} dispositivo${maxDevices === 1 ? "" : "s"} atingido.`,
      devicesUsed: deviceIds.length,
      maxDevices,
    };
  }
  deviceIds.push(deviceId);
  await env.ACTIVATIONS.put(key, JSON.stringify(deviceIds));
  return { ok: true, devicesUsed: deviceIds.length, maxDevices };
}

function isAdmin(request, env) {
  const provided = request.headers.get("x-admin-key");
  return !!env.ADMIN_KEY && provided === env.ADMIN_KEY;
}

/* --------------------------- senha (PBKDF2 — nunca guardamos texto puro) --------------------------- */
async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}
async function verifyPassword(password, saltHex, expectedHashHex) {
  const { hash } = await hashPassword(password, saltHex);
  return hash === expectedHashHex;
}
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function slugify(str) {
  return (str || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9.]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.|\.$/g, "");
}
function generatePassword() {
  // Sem 0/O, 1/I/l — evita confusão na hora de digitar/ler em voz alta.
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
}

/* --------------------------- criptografia (mesma lógica dos outros arquivos) --------------------------- */
function strToB64url(str) {
  const utf8 = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode("0x" + p1));
  return btoa(utf8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToStr(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  return decodeURIComponent(
    atob(b64)
      .split("")
      .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("")
  );
}
function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
async function hmacHex(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return bytesToHex(new Uint8Array(sig).slice(0, 12));
}
function pad2(n) {
  return String(n).padStart(2, "0");
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Payload = "1|cliente|appId|tipo|inicio|fim|nonce" (tokens antigos, sem
// limite de dispositivos) ou "2|cliente|appId|tipo|inicio|fim|nonce|maxDevices".
async function verifyToken(rawToken, secret) {
  const clean = (rawToken || "").trim().replace(/^MIT-/i, "");
  const dotIdx = clean.lastIndexOf(".");
  if (dotIdx === -1) return { ok: false, error: "Formato de token inválido." };
  const payloadB64 = clean.slice(0, dotIdx);
  const sig = clean.slice(dotIdx + 1).toLowerCase();

  let payloadStr;
  try {
    payloadStr = b64urlToStr(payloadB64);
  } catch (err) {
    return { ok: false, error: "Não foi possível ler o token." };
  }

  const parts = payloadStr.split("|");
  if (parts.length < 7) return { ok: false, error: "Token corrompido." };
  const [v, cEnc, appId, type, start, end, nonce, maxDevicesStr] = parts;

  let expectedSig;
  try {
    expectedSig = await hmacHex(payloadStr, secret);
  } catch (err) {
    return { ok: false, error: "Não foi possível validar o token." };
  }
  if (expectedSig !== sig) return { ok: false, error: "Token inválido ou adulterado." };

  const maxDevices = v === "2" ? parseInt(maxDevicesStr, 10) || 0 : 0;

  return {
    ok: true,
    payload: { v, cliente: decodeURIComponent(cEnc), appId, type, start, end, nonce, maxDevices },
  };
}

