var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// api/_src/session.ts
var session_exports = {};
__export(session_exports, {
  default: () => handler
});
module.exports = __toCommonJS(session_exports);

// server/admin/audit.ts
var import_promises = require("node:fs/promises");
var import_node_os = __toESM(require("node:os"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var MAX_ENTRIES = 500;
function resolveLogFile() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return import_node_path.default.join(import_node_os.default.tmpdir(), "qualitics-admin-change-log.json");
  }
  return import_node_path.default.join(process.cwd(), "data", "admin-change-log.json");
}
var memoryCache = null;
async function readAll() {
  if (memoryCache) return memoryCache;
  try {
    const raw = await (0, import_promises.readFile)(resolveLogFile(), "utf8");
    const parsed = JSON.parse(raw);
    memoryCache = Array.isArray(parsed) ? parsed : [];
  } catch {
    memoryCache = [];
  }
  return memoryCache;
}
async function writeAll(entries) {
  memoryCache = entries;
  const file = resolveLogFile();
  await (0, import_promises.mkdir)(import_node_path.default.dirname(file), { recursive: true });
  await (0, import_promises.writeFile)(file, JSON.stringify(entries, null, 2), "utf8");
}
async function appendChangeLog(entry) {
  const full = {
    ...entry,
    id: `chg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    changedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const all = await readAll();
  const next = [full, ...all].slice(0, MAX_ENTRIES);
  try {
    await writeAll(next);
  } catch {
    memoryCache = next;
  }
  return full;
}
async function listChangeLogs(limit = 50) {
  const all = await readAll();
  return all.slice(0, Math.max(1, Math.min(limit, 200)));
}

// server/admin/password.ts
var import_node_crypto = require("node:crypto");
var import_node_util = require("node:util");
var scryptAsync = (0, import_node_util.promisify)(import_node_crypto.scrypt);
var SCRYPT_KEYLEN = 64;
var HASH_PREFIX = "scrypt";
function parsePasswordHash(serialized) {
  const [prefix, saltB64, hashB64] = serialized.split(":");
  if (prefix !== HASH_PREFIX || !saltB64 || !hashB64) return null;
  try {
    return {
      salt: Buffer.from(saltB64, "base64"),
      hash: Buffer.from(hashB64, "base64")
    };
  } catch {
    return null;
  }
}
async function hashWithSalt(password, salt) {
  return await scryptAsync(password, salt, SCRYPT_KEYLEN);
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  return (0, import_node_crypto.timingSafeEqual)(a, b);
}
async function verifyAdminPassword(password) {
  if (!password || !password.trim()) return false;
  const configuredHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (!configuredHash) return false;
  const parts = parsePasswordHash(configuredHash);
  if (!parts) return false;
  const derived = await hashWithSalt(password, parts.salt);
  return safeEqual(derived, parts.hash);
}
function isAdminPasswordConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD_HASH?.trim());
}

// server/admin/session.ts
var import_node_crypto2 = require("node:crypto");
var ADMIN_SESSION_COOKIE = "qa_admin_session";
var ADMIN_IDLE_MS = 30 * 60 * 1e3;
var ADMIN_ABSOLUTE_MS = 8 * 60 * 60 * 1e3;
function getSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") {
    return "dev-only-admin-session-secret";
  }
  throw new Error("ADMIN_SESSION_SECRET is not configured");
}
function sign(body) {
  return (0, import_node_crypto2.createHmac)("sha256", getSessionSecret()).update(body).digest("base64url");
}
function encodeSession(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}
function decodeSession(token) {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !(0, import_node_crypto2.timingSafeEqual)(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    );
    if (typeof payload.sid !== "string" || typeof payload.iat !== "number" || typeof payload.exp !== "number" || typeof payload.lastActivity !== "number") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
function createSessionPayload(now = Date.now()) {
  return {
    sid: (0, import_node_crypto2.randomBytes)(16).toString("hex"),
    iat: now,
    exp: now + ADMIN_ABSOLUTE_MS,
    lastActivity: now
  };
}
function isSessionValid(payload, now = Date.now()) {
  if (!payload) return false;
  if (now > payload.exp) return false;
  if (now - payload.lastActivity > ADMIN_IDLE_MS) return false;
  return true;
}
function touchSession(payload, now = Date.now()) {
  return { ...payload, lastActivity: now };
}
function buildSetCookieHeader(token, maxAgeSeconds) {
  const parts = [
    `${ADMIN_SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    parts.push("Secure");
  }
  if (typeof maxAgeSeconds === "number") parts.push(`Max-Age=${maxAgeSeconds}`);
  return parts.join("; ");
}
function buildClearCookieHeader() {
  const parts = [
    `${ADMIN_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ];
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    parts.push("Secure");
  }
  return parts.join("; ");
}
function readCookieValue(cookieHeader, name) {
  if (!cookieHeader) return void 0;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return void 0;
}
function requireAdminFromCookie(cookieHeader) {
  const token = readCookieValue(cookieHeader, ADMIN_SESSION_COOKIE);
  const payload = decodeSession(token);
  if (!isSessionValid(payload)) {
    return {
      ok: false,
      status: 403,
      message: "\uAD00\uB9AC\uC790 \uAD8C\uD55C\uC774 \uC5C6\uC5B4 \uAC80\uC0AC DATA\uB97C \uC218\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."
    };
  }
  return { ok: true, session: payload };
}

// server/admin/routes.ts
function asRecord(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {};
}
function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === "string");
}
function asStatus(value) {
  const rec = asRecord(value);
  return {
    isAnalysisEligible: Boolean(rec.isAnalysisEligible),
    errorCodes: asStringArray(rec.errorCodes)
  };
}
function ok(body, setCookie) {
  return { status: 200, body, setCookie };
}
function fail(status, message, setCookie) {
  return { status, body: { ok: false, message }, setCookie };
}
async function handleAdminRoute(req) {
  const method = req.method.toUpperCase();
  const { pathname, cookieHeader, searchParams } = req;
  if (pathname === "/api/admin/login" && method === "POST") {
    try {
      if (!isAdminPasswordConfigured()) {
        return fail(503, "\uAD00\uB9AC\uC790 \uBE44\uBC00\uBC88\uD638\uAC00 \uC11C\uBC84\uC5D0 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
      }
      const body = asRecord(req.body);
      const password = typeof body.password === "string" ? body.password : "";
      if (!password.trim()) {
        return fail(400, "\uAD00\uB9AC\uC790 \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
      }
      const valid = await verifyAdminPassword(password);
      if (!valid) {
        return fail(401, "\uAD00\uB9AC\uC790 \uBE44\uBC00\uBC88\uD638\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      }
      const session = createSessionPayload();
      return ok(
        {
          ok: true,
          message: "\uAD00\uB9AC\uC790 \uBAA8\uB4DC\uB85C \uB85C\uADF8\uC778\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
          expiresAt: session.exp
        },
        buildSetCookieHeader(
          encodeSession(session),
          Math.floor(ADMIN_ABSOLUTE_MS / 1e3)
        )
      );
    } catch {
      return fail(500, "\uB85C\uADF8\uC778 \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.");
    }
  }
  if (pathname === "/api/admin/logout" && method === "POST") {
    return ok({ ok: true }, buildClearCookieHeader());
  }
  if (pathname === "/api/admin/session" && method === "GET") {
    const token = readCookieValue(cookieHeader, ADMIN_SESSION_COOKIE);
    const payload = decodeSession(token);
    if (!isSessionValid(payload)) {
      return {
        status: 200,
        body: { authenticated: false },
        setCookie: token ? buildClearCookieHeader() : void 0
      };
    }
    const refreshed = touchSession(payload);
    return ok(
      {
        authenticated: true,
        expiresAt: refreshed.exp,
        sessionId: refreshed.sid
      },
      buildSetCookieHeader(encodeSession(refreshed))
    );
  }
  if (pathname === "/api/inspection-data/changes" && method === "GET") {
    const auth = requireAdminFromCookie(cookieHeader);
    if (!auth.ok) {
      return fail(auth.status, auth.message);
    }
    const limit = Number(searchParams.get("limit") ?? "50");
    const items = await listChangeLogs(limit);
    const refreshed = touchSession(auth.session);
    return ok(
      { ok: true, items },
      buildSetCookieHeader(encodeSession(refreshed))
    );
  }
  const patchMatch = pathname.match(/^\/api\/inspection-data\/([^/]+)$/);
  if (patchMatch && method === "PATCH") {
    const auth = requireAdminFromCookie(cookieHeader);
    if (!auth.ok) {
      return fail(auth.status, auth.message);
    }
    const id = decodeURIComponent(patchMatch[1] ?? "");
    if (!id) {
      return fail(400, "\uC218\uC815 \uB300\uC0C1 ID\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
    }
    const body = asRecord(req.body);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) {
      return fail(400, "\uC218\uC815 \uC0AC\uC720\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
    }
    const before = asRecord(body.before);
    const after = asRecord(body.after);
    const fields = asStringArray(body.fields);
    const clientInfo = req.userAgent?.slice(0, 240) ?? "unknown";
    const entry = await appendChangeLog({
      recordId: id,
      fields: fields.length > 0 ? fields : Object.keys(after),
      before,
      after,
      reason,
      sessionId: auth.session.sid,
      clientInfo,
      statusBefore: asStatus(body.statusBefore),
      statusAfter: asStatus(body.statusAfter)
    });
    const refreshed = touchSession(auth.session);
    return ok(
      {
        ok: true,
        changeId: entry.id,
        message: "\uAC80\uC0AC DATA\uAC00 \uC218\uC815\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uBCC0\uACBD \uB0B4\uC6A9\uC774 \uC804\uCCB4 \uBD84\uC11D \uBA54\uB274\uC5D0 \uBC18\uC601\uB418\uC5C8\uC2B5\uB2C8\uB2E4."
      },
      buildSetCookieHeader(encodeSession(refreshed))
    );
  }
  return null;
}

// api/_src/runAdminApi.ts
function readCookieHeader(req) {
  const raw = req.headers.cookie;
  if (Array.isArray(raw)) return raw.join("; ");
  return raw;
}
function parseBody(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (Buffer.isBuffer(raw)) {
    return parseBody(raw.toString("utf8"));
  }
  return raw;
}
function applyResult(res, result) {
  const cookies = result.setCookie ? Array.isArray(result.setCookie) ? result.setCookie : [result.setCookie] : [];
  if (cookies.length === 1) res.setHeader("Set-Cookie", cookies[0]);
  else if (cookies.length > 1) res.setHeader("Set-Cookie", cookies);
  res.status(result.status).json(result.body);
}
async function runAdminApi(req, res, pathname) {
  try {
    const url = new URL(req.url ?? pathname, "http://localhost");
    const result = await handleAdminRoute({
      method: req.method ?? "GET",
      pathname,
      cookieHeader: readCookieHeader(req),
      searchParams: url.searchParams,
      body: parseBody(req.body),
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : void 0
    });
    if (!result) {
      res.status(404).json({ ok: false, message: "Not found" });
      return false;
    }
    applyResult(res, result);
    return true;
  } catch (err) {
    const message = err instanceof Error && /ADMIN_SESSION_SECRET/.test(err.message) ? "ADMIN_SESSION_SECRET \uD658\uACBD\uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." : "\uC11C\uBC84 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.";
    console.error("[admin-api]", err);
    res.status(500).json({ ok: false, message });
    return true;
  }
}

// api/_src/session.ts
async function handler(req, res) {
  await runAdminApi(req, res, "/api/admin/session");
}
module.exports = module.exports.default || module.exports;
