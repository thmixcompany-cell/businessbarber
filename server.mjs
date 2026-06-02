import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "db.json");
const port = Number(process.env.PORT || 4187);
const appUrl = process.env.APP_URL || `http://localhost:${port}`;
const maxBodyBytes = 1024 * 1024;
const sessions = new Map();
const rateLimits = new Map();
const storageProvider = String(process.env.STORAGE_PROVIDER || "json").toLowerCase();
const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseStateId = process.env.SUPABASE_STATE_ID || "businessbarber-production";
const demoMode = String(process.env.DEMO_MODE || "false").toLowerCase() === "true";
const legacyAuthEnabled = String(process.env.ALLOW_LEGACY_AUTH || "false").toLowerCase() === "true";
const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";
const whatsappAccessToken = process.env.WHATSAPP_ACCESS_TOKEN || "";
const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const whatsappVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "";
const whatsappAppSecret = process.env.WHATSAPP_APP_SECRET || "";
const whatsappMode = (process.env.WHATSAPP_MODE || "sandbox").toLowerCase();
const whatsappDefaultTemplate = process.env.WHATSAPP_DEFAULT_TEMPLATE || "retorno_cliente_sumido";
const whatsappTemplateLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "pt_BR";
const metaAppId = process.env.META_APP_ID || "";
const metaAppSecret = process.env.META_APP_SECRET || whatsappAppSecret;
const metaBusinessId = process.env.META_BUSINESS_ID || "";
const metaSystemUserAccessToken = process.env.META_SYSTEM_USER_ACCESS_TOKEN || "";
const metaEmbeddedSignupConfigId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID || "";

const tenantCollections = [
  "clients", "professionals", "services", "campaigns", "inactiveClients", "appointments", "waitlist", "clubPlans", "messageHistory", "pixCharges",
];

function envText(key, fallback = "") {
  return String(process.env[key] || fallback).trim();
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt:${salt}:${key}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (storedHash.startsWith("scrypt:")) {
    const [, salt, expected] = storedHash.split(":");
    const actual = scryptSync(String(password), salt, 64).toString("hex");
    return safeCompare(actual, expected);
  }
  if (legacyAuthEnabled && storedHash.startsWith("sha256:")) {
    const actual = `sha256:${createHash("sha256").update(String(password)).digest("hex")}`;
    return safeCompare(actual, storedHash);
  }
  return false;
}

function safeCompare(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function securityHeaders(extra = {}) {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data: https://www.facebook.com https://static.xx.fbcdn.net; style-src 'self'; script-src 'self' https://connect.facebook.net; connect-src 'self' https://graph.facebook.com https://www.facebook.com; frame-src https://www.facebook.com https://web.facebook.com; form-action 'self'; base-uri 'self'; frame-ancestors 'none'",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    ...extra,
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, securityHeaders({ "Content-Type": "application/json; charset=utf-8" }));
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, securityHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
  res.end(text);
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBodyBytes) {
      const error = new Error("payload_too_large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { const error = new Error("invalid_json"); error.statusCode = 400; throw error; }
}

function addAudit(db, action, actor = "system", metadata = {}, barbershopId = null) {
  db.auditLogs = [{ id: makeId("audit"), at: new Date().toISOString(), actor, action, barbershopId, metadata }, ...(db.auditLogs || [])].slice(0, 500);
}

function createSession(user) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 1000 * 60 * 60 * 12;
  sessions.set(token, { userId: user.id, expiresAt });
  return { token, expiresAt: new Date(expiresAt).toISOString(), user: publicUser(user) };
}

function getSessionUser(req, db) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) return null;
  return (db.users || []).find((user) => user.id === session.userId && user.active !== false) || null;
}

function requireAuth(req, res, db) {
  const user = getSessionUser(req, db);
  if (!user) { sendJson(res, 401, { error: "authentication_required" }); return null; }
  return user;
}

function isPlatformAdmin(user) { return user?.role === "platform_admin"; }
function shopIdFor(user, db) { return user?.barbershopId || db.currentBarbershopId; }
function canManageTeam(user) { return isPlatformAdmin(user) || ["owner", "manager"].includes(user?.role); }
function canManageSettings(user) { return isPlatformAdmin(user) || user?.role === "owner"; }
function sameTenant(entity, shopId) { return entity?.barbershopId === shopId; }
function scope(list, shopId) { return (list || []).filter((item) => sameTenant(item, shopId)); }
function withTenant(item, shopId) { return { ...item, barbershopId: shopId }; }
function normalizedName(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}
function isBarber(user) { return user?.role === "barber"; }
function ownsAppointment(user, appointment) {
  if (!isBarber(user)) return true;
  return normalizedName(appointment?.barber) === normalizedName(user?.name);
}
function staffAppointments(db, user, shopId) {
  const appointments = scope(db.appointments, shopId);
  return isBarber(user) ? appointments.filter((item) => ownsAppointment(user, item)) : appointments;
}
function replaceTenantCollection(db, name, shopId, items) {
  db[name] = [...(db[name] || []).filter((item) => !sameTenant(item, shopId)), ...(items || []).map((item) => withTenant(item, shopId))];
}

function maskSecret(value, visible = 4) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= visible * 2) return "*".repeat(text.length);
  return `${text.slice(0, visible)}...${text.slice(-visible)}`;
}

function whatsappSourceFor(db, shopId) {
  const fallback = db.integrations || {};
  return (db.integrationsByShop || {})[shopId] || fallback;
}

function whatsappInternalConfig(db, shopId) {
  const source = whatsappSourceFor(db, shopId);
  const whatsapp = source.whatsapp || {};
  const accessToken = whatsapp.accessToken || whatsappAccessToken;
  const phoneNumberId = whatsapp.phoneNumberId || whatsappPhoneNumberId;
  const appSecret = whatsapp.appSecret || whatsappAppSecret;
  const verifyToken = whatsapp.verifyToken || whatsappVerifyToken;
  return {
    provider: "whatsapp_cloud_api",
    mode: whatsapp.mode || whatsappMode,
    defaultTemplate: whatsapp.defaultTemplate || whatsappDefaultTemplate,
    templateLanguage: whatsapp.templateLanguage || whatsappTemplateLanguage,
    businessAccountId: whatsapp.businessAccountId || whatsapp.wabaId || "",
    wabaId: whatsapp.wabaId || whatsapp.businessAccountId || "",
    displayPhoneNumber: whatsapp.displayPhoneNumber || "",
    verifiedName: whatsapp.verifiedName || "",
    embeddedSignupConnectedAt: whatsapp.embeddedSignupConnectedAt || "",
    accessToken,
    phoneNumberId,
    appSecret,
    verifyToken,
    credentialSource: whatsapp.accessToken && whatsapp.phoneNumberId ? "barbershop" : (whatsappAccessToken && whatsappPhoneNumberId ? "server" : "none"),
  };
}

function publicWhatsappConfig(db, shopId) {
  const config = whatsappInternalConfig(db, shopId);
  const source = whatsappSourceFor(db, shopId);
  const publicStatus = source.whatsapp?.status || (Boolean(config.accessToken && config.phoneNumberId) ? "pronto_para_teste" : "aguardando_credenciais");
  const embeddedSignupReady = Boolean(metaAppId && metaEmbeddedSignupConfigId && metaAppSecret);
  return {
    provider: config.provider,
    mode: config.mode,
    defaultTemplate: config.defaultTemplate,
    templateLanguage: config.templateLanguage,
    businessAccountIdConfigured: Boolean(config.businessAccountId),
    wabaIdConfigured: Boolean(config.wabaId),
    tokenConfigured: Boolean(config.accessToken),
    phoneNumberIdConfigured: Boolean(config.phoneNumberId),
    appSecretConfigured: Boolean(config.appSecret),
    verifyTokenConfigured: Boolean(config.verifyToken),
    phoneNumberIdMasked: maskSecret(config.phoneNumberId),
    businessAccountIdMasked: maskSecret(config.businessAccountId),
    wabaIdMasked: maskSecret(config.wabaId),
    displayPhoneNumber: config.displayPhoneNumber,
    verifiedName: config.verifiedName,
    credentialSource: config.credentialSource,
    status: publicStatus,
    lastTestAt: source.whatsapp?.lastTestAt || "",
    embeddedSignupReady,
    embeddedSignupConfigured: Boolean(config.embeddedSignupConnectedAt),
    connectedAt: config.embeddedSignupConnectedAt,
  };
}

function integrationFor(db, shopId) {
  const fallback = db.integrations || {};
  const source = whatsappSourceFor(db, shopId);
  return {
    whatsapp: publicWhatsappConfig(db, shopId),
    pix: {
      provider: "manual_pix",
      mode: "manual",
      depositAmount: 15,
      status: "configuracao_manual",
      ...(source.pix || {}),
    },
  };
}

function normalizeDb(raw) {
  const db = raw && typeof raw === "object" ? raw : {};
  db.currentBarbershopId = db.currentBarbershopId || "shop-alpha";
  db.barbershops = Array.isArray(db.barbershops) ? db.barbershops : [];
  if (!db.barbershops.length) {
    db.barbershops.push({ id: db.currentBarbershopId, name: "Barbearia Demonstração", slug: "barbearia-demo", city: "", plan: "Piloto", monthlyPrice: 197, active: true, openTime: "09:00", closeTime: "19:00" });
  }
  db.users = Array.isArray(db.users) ? db.users : [];
  db.auditLogs = Array.isArray(db.auditLogs) ? db.auditLogs : [];
  db.prospects = Array.isArray(db.prospects) ? db.prospects : [];
  db.integrationsByShop = db.integrationsByShop || {};
  db.publicBookingByShop = db.publicBookingByShop || {};
  db.onboardingByShop = db.onboardingByShop || {};
  for (const name of tenantCollections) {
    db[name] = (Array.isArray(db[name]) ? db[name] : []).map((item) => withTenant(item, item.barbershopId || db.currentBarbershopId));
  }
  if (!db.integrationsByShop[db.currentBarbershopId] && db.integrations) db.integrationsByShop[db.currentBarbershopId] = db.integrations;
  if (!db.publicBookingByShop[db.currentBarbershopId] && db.publicBooking) db.publicBookingByShop[db.currentBarbershopId] = db.publicBooking;
  if (!db.onboardingByShop[db.currentBarbershopId] && db.onboardingChecklist) db.onboardingByShop[db.currentBarbershopId] = db.onboardingChecklist;
  const bootstrapEmails = new Set([envText("ADMIN_EMAIL"), envText("OWNER_EMAIL"), demoMode ? envText("DEMO_EMAIL", "demo@businessbarber.local") : ""].filter(Boolean).map((email) => email.toLowerCase()));
  db.users = db.users.filter((user) => !String(user.email || "").endsWith("@businessbarber.local") || bootstrapEmails.has(String(user.email || "").toLowerCase()));
  bootstrapUser(db, envText("ADMIN_EMAIL"), envText("ADMIN_PASSWORD"), "Administrador Business Barber", "platform_admin", null);
  bootstrapUser(db, envText("OWNER_EMAIL"), envText("OWNER_PASSWORD"), envText("OWNER_NAME", "Dono da Barbearia"), "owner", envText("OWNER_BARBERSHOP_ID", db.currentBarbershopId));
  if (demoMode) {
    bootstrapUser(db, envText("DEMO_EMAIL", "demo@businessbarber.local"), envText("DEMO_PASSWORD"), "Dono Demo", "owner", db.currentBarbershopId);
  }
  return db;
}

function bootstrapUser(db, email, password, name, role, barbershopId) {
  if (!email || !password) return;
  const existing = db.users.find((item) => item.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    if (!existing.passwordHash || String(process.env.RESET_BOOTSTRAP_PASSWORD || "").toLowerCase() === "true") existing.passwordHash = hashPassword(password);
    existing.name = name || existing.name;
    existing.role = role || existing.role;
    existing.barbershopId = barbershopId;
    existing.active = true;
    return;
  }
  db.users.push({ id: makeId("user"), email, name, role, barbershopId, active: true, passwordHash: hashPassword(password), createdAt: new Date().toISOString() });
}

async function ensureLocalDb() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(dbPath)) await writeFile(dbPath, JSON.stringify(normalizeDb({}), null, 2));
}

function assertSupabaseConfigured() {
  if (!supabaseUrl || !supabaseSecret) throw new Error("supabase_not_configured");
}

// New Supabase secret keys (sb_secret_...) are API keys, not JWT bearer tokens.
// Legacy service_role JWT keys may still be sent as Bearer tokens for compatibility.
function supabaseHeaders(extra = {}) {
  const headers = { apikey: supabaseSecret, ...extra };
  if (!supabaseSecret.startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${supabaseSecret}`;
  }
  return headers;
}

async function readSupabaseState() {
  assertSupabaseConfigured();
  const response = await fetch(`${supabaseUrl}/rest/v1/bb_app_state?id=eq.${encodeURIComponent(supabaseStateId)}&select=payload`, {
    headers: supabaseHeaders(),
  });
  if (!response.ok) throw new Error(`supabase_read_failed_${response.status}`);
  const rows = await response.json();
  if (!rows.length) {
    await ensureLocalDb();
    const seed = normalizeDb(JSON.parse(await readFile(dbPath, "utf8")));
    await writeSupabaseState(seed);
    return seed;
  }
  return normalizeDb(rows[0].payload);
}

async function writeSupabaseState(data) {
  assertSupabaseConfigured();
  const response = await fetch(`${supabaseUrl}/rest/v1/bb_app_state`, {
    method: "POST",
    headers: supabaseHeaders({
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify({ id: supabaseStateId, payload: normalizeDb(data), updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`supabase_write_failed_${response.status}`);
}

async function readDb() {
  if (storageProvider === "supabase") return readSupabaseState();
  await ensureLocalDb();
  const raw = JSON.parse(await readFile(dbPath, "utf8"));
  return normalizeDb(raw);
}

async function writeDb(data) {
  const normalized = normalizeDb(data);
  if (storageProvider === "supabase") return writeSupabaseState(normalized);
  await ensureLocalDb();
  await writeFile(dbPath, JSON.stringify(normalized, null, 2));
}

function isRateLimited(req, bucket, limit = 120) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwarded || req.socket.remoteAddress || "local";
  const key = `${ip}:${bucket}`;
  const now = Date.now();
  const entry = rateLimits.get(key) || { count: 0, resetAt: now + 60_000 };
  if (entry.resetAt < now) { rateLimits.set(key, { count: 1, resetAt: now + 60_000 }); return false; }
  entry.count += 1; rateLimits.set(key, entry); return entry.count > limit;
}

function appointmentDate(appointment) { return appointment.date || appointment.day || new Date().toISOString().slice(0, 10); }
function appointmentConflicts(left, right) {
  return appointmentDate(left) === appointmentDate(right) && String(left.time || "") === String(right.time || "") && String(left.barber || "") === String(right.barber || "") && !left.open && !["Cancelado", "Recusado"].includes(left.status);
}
function normalizePhone(value) { return String(value || "").replace(/\D/g, "").slice(0, 15); }
function validPhone(value) { const phone = normalizePhone(value); return phone.length >= 10 && phone.length <= 15; }
function sanitizeText(value, max = 120) { return String(value || "").trim().replace(/[<>]/g, "").slice(0, max); }
function sanitizeCredential(value, max = 5000) { return String(value || "").trim().slice(0, max); }
function graphUrl(pathname, params = {}) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}${pathname}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== "") url.searchParams.set(key, String(value));
  });
  return url;
}

async function graphGet(pathname, token, params = {}) {
  const response = await fetch(graphUrl(pathname, params), { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("meta_graph_get_failed");
    error.status = response.status;
    error.details = payload;
    throw error;
  }
  return payload;
}

async function graphPost(pathname, token, params = {}) {
  const response = await fetch(graphUrl(pathname, params), { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("meta_graph_post_failed");
    error.status = response.status;
    error.details = payload;
    throw error;
  }
  return payload;
}

function embeddedSignupPublicConfig() {
  const enabled = Boolean(metaAppId && metaEmbeddedSignupConfigId && metaAppSecret);
  return {
    enabled,
    appId: metaAppId,
    configId: metaEmbeddedSignupConfigId,
    graphVersion,
    callbackUrl: `${appUrl.replace(/\/$/, "")}/api/webhooks/whatsapp`,
    message: enabled
      ? "Embedded Signup configurado. A barbearia pode conectar o WhatsApp pela Meta."
      : "Configure META_APP_ID, META_APP_SECRET e META_EMBEDDED_SIGNUP_CONFIG_ID no servidor.",
  };
}

async function exchangeEmbeddedSignupCode(code) {
  const url = graphUrl("/oauth/access_token", {
    client_id: metaAppId,
    client_secret: metaAppSecret,
    code,
  });
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const error = new Error("meta_oauth_exchange_failed");
    error.status = response.status;
    error.details = payload;
    throw error;
  }
  return payload.access_token;
}

async function resolveEmbeddedSignupAssets({ userAccessToken, wabaId, phoneNumberId, displayPhoneNumber, verifiedName }) {
  let resolvedWabaId = sanitizeCredential(wabaId, 80);
  let resolvedPhoneNumberId = sanitizeCredential(phoneNumberId, 80);
  let phoneNumberDisplay = sanitizeText(displayPhoneNumber, 80);
  let resolvedVerifiedName = sanitizeText(verifiedName, 120);

  if (!resolvedWabaId && userAccessToken && metaSystemUserAccessToken) {
    const debug = await graphGet("/debug_token", metaSystemUserAccessToken, { input_token: userAccessToken });
    const targets = (debug.data?.granular_scopes || [])
      .filter((scope) => scope.scope === "whatsapp_business_management")
      .flatMap((scope) => scope.target_ids || []);
    resolvedWabaId = String(targets[0] || "");
  }

  if (!resolvedWabaId && metaBusinessId && metaSystemUserAccessToken) {
    const shared = await graphGet(`/${metaBusinessId}/client_whatsapp_business_accounts`, metaSystemUserAccessToken, { fields: "id,name,message_template_namespace,currency,timezone_id" });
    resolvedWabaId = String(shared.data?.[0]?.id || "");
  }

  if (!resolvedPhoneNumberId && resolvedWabaId) {
    const token = userAccessToken || metaSystemUserAccessToken;
    if (token) {
      const phones = await graphGet(`/${resolvedWabaId}/phone_numbers`, token, { fields: "id,display_phone_number,verified_name" });
      const phone = phones.data?.[0] || {};
      resolvedPhoneNumberId = String(phone.id || "");
      phoneNumberDisplay = phone.display_phone_number || phoneNumberDisplay;
      resolvedVerifiedName = phone.verified_name || resolvedVerifiedName;
    }
  }

  return { wabaId: resolvedWabaId, phoneNumberId: resolvedPhoneNumberId, displayPhoneNumber: phoneNumberDisplay, verifiedName: resolvedVerifiedName };
}

async function subscribeEmbeddedSignupWaba(wabaId, accessToken) {
  if (!wabaId || !accessToken) return { ok: false, skipped: true };
  try {
    await graphPost(`/${wabaId}/subscribed_apps`, accessToken);
    return { ok: true };
  } catch (error) {
    return { ok: false, status: error.status || 500, details: error.details || {} };
  }
}

function customerState(db, user) {
  const shopId = shopIdFor(user, db);
  const shop = db.barbershops.find((item) => item.id === shopId);
  const campaigns = scope(db.campaigns, shopId);
  const appointments = staffAppointments(db, user, shopId);
  const appointmentClientNames = new Set(appointments.map((item) => item.client).filter(Boolean));
  const clients = isBarber(user) ? scope(db.clients, shopId).filter((client) => appointmentClientNames.has(client.name)) : scope(db.clients, shopId);
  const users = isBarber(user) ? [publicUser(user)] : scope(db.users, shopId).map(publicUser);
  const professionals = isBarber(user) ? scope(db.professionals, shopId).filter((item) => normalizedName(item.name) === normalizedName(user.name)) : scope(db.professionals, shopId);
  const recoveredRevenue = campaigns.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
  return {
    user: publicUser(user), currentBarbershopId: shopId, barbershops: shop ? [shop] : [],
    users, clients, professionals, services: scope(db.services, shopId),
    campaigns: isBarber(user) ? [] : campaigns, inactiveClients: isBarber(user) ? [] : scope(db.inactiveClients, shopId), appointments, waitlist: isBarber(user) ? [] : scope(db.waitlist, shopId), clubPlans: isBarber(user) ? [] : scope(db.clubPlans, shopId), messageHistory: isBarber(user) ? [] : scope(db.messageHistory, shopId), pixCharges: isBarber(user) ? scope(db.pixCharges, shopId).filter((item) => appointments.some((appointment) => appointment.id && appointment.id === item.appointmentId)) : scope(db.pixCharges, shopId),
    recoveredRevenue, openSlots: appointments.filter((item) => item.open).length,
    integrations: integrationFor(db, shopId),
    publicBooking: db.publicBookingByShop[shopId] || { enabled: true, slug: shop?.slug || "", depositRequired: false, headline: `Agende seu horário na ${shop?.name || "barbearia"}` },
    onboardingChecklist: db.onboardingByShop[shopId] || [],
    auditLogs: isBarber(user) ? [] : (db.auditLogs || []).filter((log) => !log.barbershopId || log.barbershopId === shopId).slice(0, 100),
  };
}

function publicIntegrationsByShop(db) {
  return Object.fromEntries(
    Object.keys(db.integrationsByShop || {}).map((shopId) => [shopId, integrationFor(db, shopId)]),
  );
}

function adminState(db) {
  return { ...db, users: db.users.map(publicUser), integrations: undefined, integrationsByShop: publicIntegrationsByShop(db) };
}

function getPublicShop(db, slug) {
  return db.barbershops.find((shop) => shop.active !== false && shop.slug === slug) || null;
}

function publicBookingState(db, slug) {
  const shop = getPublicShop(db, slug);
  if (!shop) return null;
  const shopId = shop.id;
  const booking = db.publicBookingByShop[shopId] || db.publicBooking || {};
  if (booking.enabled === false) return null;
  return {
    shop: {
      id: shop.id, name: shop.name, slug: shop.slug, city: shop.city, address: shop.address || "", instagram: shop.instagram || "", whatsapp: shop.whatsapp || "", openTime: shop.openTime, closeTime: shop.closeTime, coverImage: shop.coverImage || "", rating: shop.rating || "",
    },
    publicBooking: booking,
    services: scope(db.services, shopId).filter((item) => item.active !== false).map(({ id, name, price, duration, durationMinutes }) => ({ id, name, price, duration: duration || durationMinutes || 30 })),
    professionals: scope(db.professionals, shopId).filter((item) => item.active !== false).map(({ id, name, photo }) => ({ id, name, photo: photo || "" })),
    appointments: scope(db.appointments, shopId).map(({ time, barber, date, day, open, status }) => ({ time, barber, date, day, open: Boolean(open), status })),
    deposit: { required: Boolean(booking.depositRequired), amount: Number(integrationFor(db, shopId).pix.depositAmount || 0), paymentLive: false },
  };
}

function parseClientCsv(csv, shopId) {
  const lines = String(csv || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const [headerLine, ...rows] = lines;
  if (!headerLine) return [];
  const headers = headerLine.split(",").map((item) => item.trim().toLowerCase());
  return rows.map((row) => {
    const values = row.split(",").map((item) => item.trim());
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    return withTenant({ id: makeId("client"), name: sanitizeText(record.nome || record.name || "Cliente sem nome"), phone: normalizePhone(record.whatsapp || record.telefone || record.phone), lastVisit: record.ultima_visita || record["última_visita"] || record.lastvisit || "", favoriteService: sanitizeText(record.servico || record.service || "Corte"), preferredPeriod: sanitizeText(record.periodo || record.period || "Tarde"), ticket: Number(record.ticket || record.valor || 0), professional: sanitizeText(record.profissional || record.professional), status: record.status || "Importado", consentWhatsapp: false }, shopId);
  });
}

async function sendWhatsAppTemplate({ db, shopId, to, templateName, language, variables = [] }) {
  const config = whatsappInternalConfig(db, shopId);
  const selectedTemplate = templateName || config.defaultTemplate || whatsappDefaultTemplate;
  const selectedLanguage = language || config.templateLanguage || whatsappTemplateLanguage;
  if (config.mode !== "production" || !config.accessToken || !config.phoneNumberId) return { simulated: true, status: "sandbox", messageId: null };
  const templateVariables = selectedTemplate === "hello_world" ? [] : variables;
  const components = templateVariables.length ? [{ type: "body", parameters: templateVariables.map((text) => ({ type: "text", text: String(text) })) }] : undefined;
  const payload = { messaging_product: "whatsapp", to: normalizePhone(to), type: "template", template: { name: selectedTemplate, language: { code: selectedLanguage }, ...(components ? { components } : {}) } };
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${config.phoneNumberId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error("whatsapp_send_failed"); error.details = result; throw error; }
  return { simulated: false, status: "sent", messageId: result.messages?.[0]?.id || null };
}

async function sendWhatsAppText({ db, shopId, to, text }) {
  const config = whatsappInternalConfig(db, shopId);
  if (config.mode !== "production" || !config.accessToken || !config.phoneNumberId) return { simulated: true, status: "sandbox", messageId: null };
  const payload = { messaging_product: "whatsapp", to: normalizePhone(to), type: "text", text: { preview_url: false, body: String(text || "").slice(0, 4000) } };
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${config.phoneNumberId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error("whatsapp_text_failed"); error.details = result; throw error; }
  return { simulated: false, status: "sent", messageId: result.messages?.[0]?.id || null };
}

function normalizeReplyText(text) {
  return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function classifyWhatsAppReply(text) {
  const normalized = normalizeReplyText(text);
  if (!normalized) return "unknown";
  if (/\b(sim|s|quero|pode|reserva|reservar|confirmo|confirmar|bora|fechado|ok|pode marcar|marca)\b/.test(normalized)) return "positive";
  if (/\b(nao|n|hoje nao|depois|outro dia|cancelar|nao posso|indisponivel)\b/.test(normalized)) return "negative";
  return "ambiguous";
}

function formatCustomerDate(dateText) {
  const date = new Date(`${dateText || new Date().toISOString().slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "na data combinada";
  const today = new Date().toISOString().slice(0, 10);
  if ((dateText || "").slice(0, 10) === today) return "hoje";
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }).format(date);
}

function customerMessageContext(db, shopId, appointment = {}) {
  const shop = db.barbershops.find((item) => item.id === shopId) || {};
  const booking = db.publicBookingByShop[shopId] || {};
  const pix = integrationFor(db, shopId).pix || {};
  const depositRequired = Boolean(booking.depositRequired || appointment.depositRequired);
  return {
    shopName: shop.name || "barbearia",
    date: formatCustomerDate(appointmentDate(appointment)),
    time: appointment.time || "horário combinado",
    barber: appointment.barber || "profissional",
    service: appointment.service || "serviço",
    depositRequired,
    depositAmount: Number(pix.depositAmount || 15),
    pixKey: pix.key || "",
  };
}

function customerMessages(db, shopId, appointment = {}) {
  const context = customerMessageContext(db, shopId, appointment);
  return {
    confirmed: `Perfeito. Seu horário ficou confirmado para ${context.date} às ${context.time} com ${context.barber}. Te esperamos na ${context.shopName}.`,
    pixRequired: `Perfeito. Pré-reservei seu horário para ${context.date} às ${context.time} com ${context.barber}. Para confirmar, envie o sinal de R$ ${context.depositAmount}${context.pixKey ? ` pelo Pix: ${context.pixKey}` : " pelo Pix da barbearia"}. Assim que o sinal for marcado, sua reserva fica confirmada.`,
    unavailable: "Esse horário acabou de ser preenchido. Vou verificar outra opção para você.",
    declined: "Tudo bem. Quando quiser outro horário, é só chamar por aqui.",
    ambiguous: "Consegui ver sua resposta. Para eu reservar automaticamente, responda apenas \"sim\". Se preferir outro horário, me diga qual período fica melhor.",
  };
}

function extractWhatsAppInboundMessages(body) {
  return (body.entry || []).flatMap((entry) => entry.changes || []).flatMap((change) => {
    const value = change?.value || {};
    const metadata = value.metadata || {};
    return (value.messages || []).map((message) => ({
      from: normalizePhone(message.from),
      text: message.text?.body || message.button?.text || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "",
      messageId: message.id || "",
      phoneNumberId: metadata.phone_number_id || "",
      timestamp: message.timestamp || "",
    }));
  }).filter((message) => message.from && message.text);
}

function findPendingSlotInvite(db, shopId, phone) {
  const now = Date.now();
  const pendingStatuses = new Set(["Convite enviado", "Pronto para envio", "Aguardando resposta", "enviado", "simulado"]);
  return scope(db.messageHistory, shopId)
    .filter((message) => message.type === "slot_invite")
    .filter((message) => normalizePhone(message.phone) === normalizePhone(phone))
    .filter((message) => pendingStatuses.has(message.status || ""))
    .filter((message) => !message.expiresAt || new Date(message.expiresAt).getTime() >= now)
    .sort((a, b) => new Date(b.createdAt || b.at || 0).getTime() - new Date(a.createdAt || a.at || 0).getTime())[0] || null;
}

async function processSlotInviteReply(db, shopId, inbound) {
  const invite = findPendingSlotInvite(db, shopId, inbound.from);
  const intent = classifyWhatsAppReply(inbound.text);
  if (!invite) return { matched: false, intent };

  invite.responseText = inbound.text;
  invite.responseIntent = intent;
  invite.respondedAt = new Date().toISOString();
  invite.providerResponseId = inbound.messageId;

  if (intent === "negative") {
    invite.status = "Recusado";
    addAudit(db, "slot_invite.declined", "whatsapp", { inviteId: invite.id, phone: maskSecret(inbound.from) }, shopId);
    await sendWhatsAppText({ db, shopId, to: inbound.from, text: customerMessages(db, shopId).declined }).catch(() => null);
    return { matched: true, intent, status: invite.status };
  }

  if (intent !== "positive") {
    invite.status = "Cliente respondeu";
    addAudit(db, "slot_invite.needs_review", "whatsapp", { inviteId: invite.id, phone: maskSecret(inbound.from), intent }, shopId);
    await sendWhatsAppText({ db, shopId, to: inbound.from, text: customerMessages(db, shopId).ambiguous }).catch(() => null);
    return { matched: true, intent, status: invite.status };
  }

  const appointment = scope(db.appointments, shopId).find((item, index) => (invite.appointmentId && item.id === invite.appointmentId) || (!invite.appointmentId && String(index) === String(invite.appointmentIndex)));
  if (!appointment || !appointment.open) {
    invite.status = "Horário indisponível";
    addAudit(db, "slot_invite.slot_unavailable", "whatsapp", { inviteId: invite.id, phone: maskSecret(inbound.from) }, shopId);
    await sendWhatsAppText({ db, shopId, to: inbound.from, text: customerMessages(db, shopId, appointment || {}).unavailable }).catch(() => null);
    return { matched: true, intent, status: invite.status };
  }

  const context = customerMessageContext(db, shopId, appointment);
  const messages = customerMessages(db, shopId, appointment);
  appointment.client = invite.client || "Cliente WhatsApp";
  appointment.phone = inbound.from;
  appointment.status = context.depositRequired ? "Sinal Pix" : "Recuperado";
  appointment.open = false;
  appointment.recovered = true;
  appointment.recoveredAt = new Date().toISOString();
  appointment.depositRequired = context.depositRequired;
  appointment.depositStatus = appointment.depositRequired ? "aguardando_pagamento" : "nao_exigido";
  appointment.source = "whatsapp_auto_reply";
  invite.status = appointment.depositRequired ? "Aguardando Pix" : "Agendado";
  invite.bookedAt = appointment.recoveredAt;
  invite.appointmentId = appointment.id || invite.appointmentId || "";
  addAudit(db, "slot_invite.auto_booked", "whatsapp", { inviteId: invite.id, appointmentId: appointment.id || "", phone: maskSecret(inbound.from) }, shopId);
  await sendWhatsAppText({ db, shopId, to: inbound.from, text: appointment.depositRequired ? messages.pixRequired : messages.confirmed }).catch(() => null);
  return { matched: true, intent, status: invite.status, appointmentId: appointment.id || "" };
}

function verifyWhatsAppSignatureWithSecret(req, rawBody, appSecret) {
  if (!appSecret) return false;
  const signature = String(req.headers["x-hub-signature-256"] || "");
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  return safeCompare(signature, expected);
}

function whatsappAppSecrets(db) {
  return [
    whatsappAppSecret,
    ...Object.values(db.integrationsByShop || {}).map((item) => item?.whatsapp?.appSecret),
  ].filter(Boolean);
}

function verifyWhatsAppSignature(req, rawBody, db) {
  const secrets = whatsappAppSecrets(db);
  if (!secrets.length) return true;
  return secrets.some((secret) => verifyWhatsAppSignatureWithSecret(req, rawBody, secret));
}

function findShopIdByWhatsAppPhoneNumberId(db, phoneNumberId) {
  const target = String(phoneNumberId || "");
  if (!target) return null;
  for (const [shopId, integration] of Object.entries(db.integrationsByShop || {})) {
    if (String(integration?.whatsapp?.phoneNumberId || "") === target) return shopId;
  }
  return whatsappPhoneNumberId && target === whatsappPhoneNumberId ? db.currentBarbershopId : null;
}

async function handleWebhook(req, res, url) {
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const db = await readDb();
    const verifyTokens = [
      whatsappVerifyToken,
      ...Object.values(db.integrationsByShop || {}).map((item) => item?.whatsapp?.verifyToken),
    ].filter(Boolean);
    if (mode === "subscribe" && verifyTokens.some((item) => safeCompare(token || "", item))) return sendText(res, 200, challenge || "");
    return sendText(res, 403, "Verification failed");
  }
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf8");
  const db = await readDb();
  if (!verifyWhatsAppSignature(req, rawBody, db)) return sendJson(res, 401, { error: "invalid_signature" });
  const body = JSON.parse(rawBody || "{}");
  const phoneNumberIds = (body.entry || [])
    .flatMap((entry) => entry.changes || [])
    .map((change) => change?.value?.metadata?.phone_number_id)
    .filter(Boolean);
  const shopId = phoneNumberIds.map((id) => findShopIdByWhatsAppPhoneNumberId(db, id)).find(Boolean) || null;
  const inboundMessages = extractWhatsAppInboundMessages(body);
  const replyResults = [];
  if (shopId && inboundMessages.length) {
    for (const inbound of inboundMessages) {
      replyResults.push(await processSlotInviteReply(db, shopId, inbound));
    }
  }
  addAudit(db, "whatsapp.webhook_received", "meta", { entries: Array.isArray(body.entry) ? body.entry.length : 0, phoneNumberIds, inboundMessages: inboundMessages.length, autoReplies: replyResults.filter((item) => item.matched).length }, shopId);
  await writeDb(db);
  return sendJson(res, 200, { received: true });
}

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;
  if (pathname === "/api/webhooks/whatsapp") return handleWebhook(req, res, url);
  if (pathname === "/api/health") {
    try {
      if (storageProvider === "supabase") await readSupabaseState();
      return sendJson(res, 200, { ok: true, storage: storageProvider, databaseConnected: true, whatsappConfigured: Boolean(whatsappAccessToken && whatsappPhoneNumberId) });
    } catch (error) {
      console.error("Health check database error:", error.message);
      return sendJson(res, 503, { ok: false, storage: storageProvider, databaseConnected: false, whatsappConfigured: Boolean(whatsappAccessToken && whatsappPhoneNumberId) });
    }
  }
  if (pathname.startsWith("/api/public/") && isRateLimited(req, "public", 25)) return sendJson(res, 429, { error: "rate_limited" });
  if (pathname === "/api/login" && isRateLimited(req, "login", 10)) return sendJson(res, 429, { error: "too_many_attempts" });
  const db = await readDb();

  if (pathname === "/api/login" && req.method === "POST") {
    const body = await readBody(req);
    const email = sanitizeText(body.email, 180).toLowerCase();
    const user = db.users.find((item) => String(item.email).toLowerCase() === email && item.active !== false);
    if (!user || !verifyPassword(body.password || "", user.passwordHash)) {
      addAudit(db, "auth.login_failed", email || "unknown", {}, user?.barbershopId || null); await writeDb(db);
      return sendJson(res, 401, { error: "invalid_credentials" });
    }
    if (String(user.passwordHash).startsWith("sha256:")) user.passwordHash = hashPassword(body.password);
    addAudit(db, "auth.login_success", email, {}, user.barbershopId || null); await writeDb(db);
    return sendJson(res, 200, createSession(user));
  }

  if (pathname === "/api/public/booking" && req.method === "GET") {
    const state = publicBookingState(db, searchParams.get("barbearia") || "");
    return state ? sendJson(res, 200, state) : sendJson(res, 404, { error: "booking_not_found" });
  }

  if (pathname === "/api/public/appointments" && req.method === "POST") {
    const body = await readBody(req);
    if (body.website) return sendJson(res, 200, { received: true });
    const shop = getPublicShop(db, sanitizeText(body.barbershopSlug, 80));
    if (!shop) return sendJson(res, 404, { error: "barbershop_not_found" });
    if (!body.privacyAccepted || !body.whatsappConsent) return sendJson(res, 400, { error: "consent_required" });
    const state = publicBookingState(db, shop.slug);
    const serviceAllowed = state.services.some((item) => item.name === body.service);
    const barberAllowed = state.professionals.some((item) => item.name === body.barber);
    const date = String(body.date || "");
    const time = String(body.time || "");
    if (!serviceAllowed || !barberAllowed || !date || !time || !validPhone(body.phone) || !sanitizeText(body.client, 100)) return sendJson(res, 400, { error: "invalid_booking" });
    if (date < new Date().toISOString().slice(0, 10)) return sendJson(res, 400, { error: "invalid_date" });
    const appointment = withTenant({ id: makeId("appt"), time, barber: sanitizeText(body.barber), client: sanitizeText(body.client, 100), phone: normalizePhone(body.phone), service: sanitizeText(body.service), status: "Solicitado", depositRequired: Boolean(state.deposit.required), depositStatus: state.deposit.required ? "aguardando_pagamento" : "nao_exigido", open: false, source: "public-booking", date, whatsappConsent: true, privacyAcceptedAt: new Date().toISOString(), createdAt: new Date().toISOString() }, shop.id);
    if (scope(db.appointments, shop.id).some((item) => appointmentConflicts(item, appointment))) return sendJson(res, 409, { error: "slot_unavailable" });
    db.appointments.push(appointment); addAudit(db, "public_booking.requested", "public", { appointmentId: appointment.id }, shop.id); await writeDb(db);
    return sendJson(res, 201, { id: appointment.id, status: appointment.status, message: "Solicitação enviada. Aguarde confirmação pelo WhatsApp." });
  }

  const user = requireAuth(req, res, db); if (!user) return;
  const shopId = shopIdFor(user, db);
  const actor = user.email;

  if (pathname === "/api/logout" && req.method === "POST") return sendJson(res, 200, { ok: true });
  if (pathname === "/api/me" && req.method === "GET") return sendJson(res, 200, { user: publicUser(user), currentBarbershopId: shopId });
  if (pathname === "/api/state" && req.method === "GET") return sendJson(res, 200, customerState(db, user));
  if (pathname === "/api/state" && req.method === "PUT") {
    if (isBarber(user)) return sendJson(res, 403, { error: "manager_required" });
    const body = await readBody(req);
    for (const name of tenantCollections) if (Array.isArray(body[name])) replaceTenantCollection(db, name, shopId, body[name]);
    if (canManageSettings(user) && body.publicBooking) db.publicBookingByShop[shopId] = { ...(db.publicBookingByShop[shopId] || {}), ...body.publicBooking };
    if (canManageSettings(user) && Array.isArray(body.onboardingChecklist)) db.onboardingByShop[shopId] = body.onboardingChecklist;
    addAudit(db, "state.updated", actor, { collections: tenantCollections.filter((name) => Array.isArray(body[name])) }, shopId); await writeDb(db);
    return sendJson(res, 200, customerState(db, user));
  }

  if (pathname === "/api/admin/state" && req.method === "GET") return isPlatformAdmin(user) ? sendJson(res, 200, adminState(db)) : sendJson(res, 403, { error: "admin_required" });
  if (pathname === "/api/admin/state" && req.method === "PUT") {
    if (!isPlatformAdmin(user)) return sendJson(res, 403, { error: "admin_required" });
    const body = await readBody(req); if (Array.isArray(body.prospects)) db.prospects = body.prospects;
    addAudit(db, "admin.state_updated", actor, { keys: Object.keys(body) }, null); await writeDb(db); return sendJson(res, 200, adminState(db));
  }

  if (pathname === "/api/barbershops" && req.method === "GET") return sendJson(res, 200, isPlatformAdmin(user) ? db.barbershops : db.barbershops.filter((shop) => shop.id === shopId));
  if (pathname === "/api/barbershops" && req.method === "POST") {
    if (!isPlatformAdmin(user)) return sendJson(res, 403, { error: "admin_required" });
    const body = await readBody(req); const shop = { id: body.id || makeId("shop"), name: sanitizeText(body.name), slug: sanitizeText(body.slug || body.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""), city: sanitizeText(body.city), plan: body.plan || "Piloto", monthlyPrice: Number(body.monthlyPrice || 197), active: true, openTime: body.openTime || "09:00", closeTime: body.closeTime || "19:00" };
    db.barbershops.push(shop); addAudit(db, "barbershop.created", actor, { id: shop.id }, null); await writeDb(db); return sendJson(res, 201, shop);
  }
  if (pathname.startsWith("/api/barbershops/") && req.method === "PUT") {
    const id = pathname.split("/").pop(); if (!isPlatformAdmin(user) && id !== shopId) return sendJson(res, 403, { error: "forbidden" });
    const body = await readBody(req); db.barbershops = db.barbershops.map((shop) => shop.id === id ? { ...shop, ...body, id } : shop); addAudit(db, "barbershop.updated", actor, { id }, id); await writeDb(db); return sendJson(res, 200, db.barbershops.find((shop) => shop.id === id));
  }

  if (pathname === "/api/users" && req.method === "GET") return sendJson(res, 200, isPlatformAdmin(user) ? db.users.map(publicUser) : scope(db.users, shopId).map(publicUser));
  if (pathname === "/api/users" && req.method === "POST") {
    if (!canManageTeam(user)) return sendJson(res, 403, { error: "manager_required" });
    const body = await readBody(req); if (!body.password || String(body.password).length < 10) return sendJson(res, 400, { error: "temporary_password_min_10" });
    const role = isPlatformAdmin(user) ? (body.role || "barber") : (["owner", "manager", "barber"].includes(body.role) ? body.role : "barber");
    const targetShopId = isPlatformAdmin(user) && body.barbershopId ? body.barbershopId : shopId;
    const newUser = { id: body.id || makeId("user"), name: sanitizeText(body.name), email: sanitizeText(body.email, 180).toLowerCase(), role, barbershopId: targetShopId, active: true, passwordHash: hashPassword(body.password), mustChangePassword: true };
    if (!newUser.email || db.users.some((item) => item.email === newUser.email)) return sendJson(res, 409, { error: "email_already_used" });
    db.users.push(newUser); addAudit(db, "user.created", actor, { id: newUser.id, role }, targetShopId); await writeDb(db); return sendJson(res, 201, publicUser(newUser));
  }
  if (pathname.startsWith("/api/users/") && req.method === "PUT") {
    if (!canManageTeam(user)) return sendJson(res, 403, { error: "manager_required" });
    const id = pathname.split("/").pop(); const target = db.users.find((item) => item.id === id); if (!target || (!isPlatformAdmin(user) && target.barbershopId !== shopId)) return sendJson(res, 404, { error: "user_not_found" });
    const body = await readBody(req); const next = { ...target, name: body.name !== undefined ? sanitizeText(body.name) : target.name, role: body.role || target.role, active: body.active !== undefined ? Boolean(body.active) : target.active };
    if (body.password) { if (String(body.password).length < 10) return sendJson(res, 400, { error: "temporary_password_min_10" }); next.passwordHash = hashPassword(body.password); next.mustChangePassword = true; }
    db.users = db.users.map((item) => item.id === id ? next : item); addAudit(db, "user.updated", actor, { id }, target.barbershopId); await writeDb(db); return sendJson(res, 200, publicUser(next));
  }

  if (pathname === "/api/clients" && req.method === "GET") {
    if (isBarber(user)) {
      const names = new Set(staffAppointments(db, user, shopId).map((item) => item.client).filter(Boolean));
      return sendJson(res, 200, scope(db.clients, shopId).filter((client) => names.has(client.name)));
    }
    return sendJson(res, 200, scope(db.clients, shopId));
  }
  if (pathname === "/api/clients" && req.method === "POST") {
    if (isBarber(user)) return sendJson(res, 403, { error: "manager_required" });
    const body = await readBody(req); const client = withTenant({ id: makeId("client"), name: sanitizeText(body.name), phone: normalizePhone(body.phone), lastVisit: body.lastVisit || "", favoriteService: sanitizeText(body.favoriteService), preferredPeriod: sanitizeText(body.preferredPeriod), ticket: Number(body.ticket || 0), professional: sanitizeText(body.professional), status: body.status || "Ativo", consentWhatsapp: Boolean(body.consentWhatsapp), createdAt: new Date().toISOString() }, shopId);
    db.clients.push(client); addAudit(db, "client.created", actor, { id: client.id }, shopId); await writeDb(db); return sendJson(res, 201, client);
  }
  if (pathname.startsWith("/api/clients/") && pathname.endsWith("/export") && req.method === "GET") {
    const id = pathname.split("/").at(-2); const client = scope(db.clients, shopId).find((item) => item.id === id); if (!client) return sendJson(res, 404, { error: "client_not_found" });
    return sendJson(res, 200, { client, appointments: scope(db.appointments, shopId).filter((item) => item.client === client.name), campaigns: scope(db.campaigns, shopId).filter((item) => (item.recipients || []).includes(client.name)) });
  }
  if (pathname.startsWith("/api/clients/") && req.method === "PUT") {
    if (isBarber(user)) return sendJson(res, 403, { error: "manager_required" });
    const id = pathname.split("/").pop(); const client = scope(db.clients, shopId).find((item) => item.id === id); if (!client) return sendJson(res, 404, { error: "client_not_found" }); const body = await readBody(req);
    db.clients = db.clients.map((item) => item.id === id ? { ...item, ...body, id, barbershopId: shopId, phone: body.phone !== undefined ? normalizePhone(body.phone) : item.phone } : item); addAudit(db, "client.updated", actor, { id }, shopId); await writeDb(db); return sendJson(res, 200, db.clients.find((item) => item.id === id));
  }
  if (pathname.startsWith("/api/clients/") && req.method === "DELETE") {
    if (isBarber(user)) return sendJson(res, 403, { error: "manager_required" });
    const id = pathname.split("/").pop(); const client = scope(db.clients, shopId).find((item) => item.id === id); if (!client) return sendJson(res, 404, { error: "client_not_found" });
    db.clients = db.clients.filter((item) => item.id !== id); db.appointments = db.appointments.map((item) => sameTenant(item, shopId) && item.client === client.name ? { ...item, client: "Cliente removido", phone: "" } : item); addAudit(db, "client.deleted_lgpd", actor, { id }, shopId); await writeDb(db); return sendJson(res, 200, { ok: true });
  }
  if (pathname === "/api/import/clients" && req.method === "POST") {
    if (isBarber(user)) return sendJson(res, 403, { error: "manager_required" });
    const body = await readBody(req); const imported = parseClientCsv(body.csv, shopId); db.clients.push(...imported); addAudit(db, "client.imported", actor, { imported: imported.length, consentRequired: true }, shopId); await writeDb(db); return sendJson(res, 200, { imported: imported.length, clients: scope(db.clients, shopId) });
  }

  if (pathname === "/api/appointments" && req.method === "GET") return sendJson(res, 200, staffAppointments(db, user, shopId));
  if (pathname === "/api/appointments" && req.method === "POST") {
    if (isBarber(user)) return sendJson(res, 403, { error: "manager_required" });
    const body = await readBody(req); const appointment = withTenant({ id: makeId("appt"), status: body.status || "Confirmado", ...body }, shopId); if (scope(db.appointments, shopId).some((item) => appointmentConflicts(item, appointment))) return sendJson(res, 409, { error: "slot_unavailable" }); db.appointments.push(appointment); addAudit(db, "appointment.created", actor, { id: appointment.id }, shopId); await writeDb(db); return sendJson(res, 201, appointment);
  }
  if (pathname.startsWith("/api/appointments/") && req.method === "PUT") {
    const id = pathname.split("/").pop(); const target = scope(db.appointments, shopId).find((item, idx) => (item.id || `legacy-${idx}`) === id); if (!target) return sendJson(res, 404, { error: "appointment_not_found" }); if (!ownsAppointment(user, target)) return sendJson(res, 403, { error: "appointment_forbidden" }); const body = await readBody(req); const barberPatch = isBarber(user) ? { status: body.status || target.status, pixPaid: body.pixPaid !== undefined ? Boolean(body.pixPaid) : target.pixPaid, pixPaidAt: body.pixPaidAt || target.pixPaidAt, finishedAt: body.finishedAt || target.finishedAt, missedAt: body.missedAt || target.missedAt } : body; const next = { ...target, ...barberPatch, id, barbershopId: shopId }; if (!isBarber(user) && scope(db.appointments, shopId).some((item) => item.id !== id && appointmentConflicts(item, next))) return sendJson(res, 409, { error: "slot_unavailable" }); db.appointments = db.appointments.map((item) => item.id === id ? next : item); addAudit(db, "appointment.updated", actor, { id, role: user.role }, shopId); await writeDb(db); return sendJson(res, 200, next);
  }
  if (pathname.startsWith("/api/appointments/") && req.method === "DELETE") { if (isBarber(user)) return sendJson(res, 403, { error: "manager_required" }); const id = pathname.split("/").pop(); db.appointments = db.appointments.filter((item) => !(sameTenant(item, shopId) && item.id === id)); addAudit(db, "appointment.deleted", actor, { id }, shopId); await writeDb(db); return sendJson(res, 200, { ok: true }); }

  if (pathname === "/api/campaigns" && req.method === "GET") return sendJson(res, 200, isBarber(user) ? [] : scope(db.campaigns, shopId));
  if (pathname === "/api/campaigns" && req.method === "POST") { if (isBarber(user)) return sendJson(res, 403, { error: "manager_required" }); const body = await readBody(req); const campaign = withTenant({ id: makeId("camp"), status: "Rascunho", createdAt: new Date().toISOString().slice(0, 10), sent: 0, responses: 0, bookings: 0, revenue: 0, ...body }, shopId); db.campaigns.unshift(campaign); addAudit(db, "campaign.created", actor, { id: campaign.id }, shopId); await writeDb(db); return sendJson(res, 201, campaign); }
  if (pathname.startsWith("/api/campaigns/") && req.method === "PUT") { if (isBarber(user)) return sendJson(res, 403, { error: "manager_required" }); const id = pathname.split("/").pop(); const found = scope(db.campaigns, shopId).find((item) => item.id === id); if (!found) return sendJson(res, 404, { error: "campaign_not_found" }); const body = await readBody(req); const next = { ...found, ...body, id, barbershopId: shopId }; db.campaigns = db.campaigns.map((item) => item.id === id ? next : item); addAudit(db, "campaign.updated", actor, { id }, shopId); await writeDb(db); return sendJson(res, 200, next); }
  if (pathname.startsWith("/api/campaigns/") && req.method === "DELETE") { if (isBarber(user)) return sendJson(res, 403, { error: "manager_required" }); const id = pathname.split("/").pop(); db.campaigns = db.campaigns.filter((item) => !(sameTenant(item, shopId) && item.id === id)); addAudit(db, "campaign.deleted", actor, { id }, shopId); await writeDb(db); return sendJson(res, 200, { ok: true }); }

  if (pathname === "/api/integrations" && req.method === "GET") return sendJson(res, 200, integrationFor(db, shopId));
  if (pathname === "/api/integrations/whatsapp/embedded-config" && req.method === "GET") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "owner_required" });
    return sendJson(res, 200, embeddedSignupPublicConfig());
  }
  if (pathname === "/api/integrations/whatsapp/embedded-complete" && req.method === "POST") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "owner_required" });
    const config = embeddedSignupPublicConfig();
    if (!config.enabled) return sendJson(res, 400, { error: "embedded_signup_not_configured", message: config.message });

    const body = await readBody(req);
    const signup = body.signup && typeof body.signup === "object" ? body.signup : {};
    const code = sanitizeCredential(body.code, 2000);
    if (!code) return sendJson(res, 400, { error: "authorization_code_required" });

    let userAccessToken = "";
    try {
      userAccessToken = await exchangeEmbeddedSignupCode(code);
    } catch (error) {
      addAudit(db, "integration.whatsapp_embedded_failed", actor, { step: "oauth_exchange", status: error.status || 500 }, shopId);
      return sendJson(res, 502, { error: "meta_oauth_exchange_failed", message: "A Meta não liberou o token da conexão. Revise o App ID, App Secret e configuração do Embedded Signup." });
    }

    const requestedWabaId = body.wabaId || body.businessAccountId || signup.waba_id || signup.whatsapp_business_account_id || signup.business_id;
    const requestedPhoneNumberId = body.phoneNumberId || signup.phone_number_id;
    let resolved;
    try {
      resolved = await resolveEmbeddedSignupAssets({
        userAccessToken,
        wabaId: requestedWabaId,
        phoneNumberId: requestedPhoneNumberId,
        displayPhoneNumber: body.displayPhoneNumber || signup.display_phone_number,
        verifiedName: body.verifiedName || signup.verified_name,
      });
    } catch (error) {
      addAudit(db, "integration.whatsapp_embedded_failed", actor, { step: "asset_resolution", status: error.status || 500 }, shopId);
      return sendJson(res, 502, { error: "whatsapp_assets_not_found", message: "Não consegui localizar o número conectado na conta WhatsApp Business. Confirme se a conta e o número foram selecionados no fluxo da Meta." });
    }

    if (!resolved.phoneNumberId) return sendJson(res, 422, { error: "phone_number_id_required", message: "A Meta conectou a conta, mas não retornou um Phone Number ID." });
    const subscription = await subscribeEmbeddedSignupWaba(resolved.wabaId, userAccessToken || metaSystemUserAccessToken);
    const source = whatsappSourceFor(db, shopId);
    const previous = source.whatsapp || {};
    db.integrationsByShop[shopId] = {
      ...source,
      whatsapp: {
        ...previous,
        accessToken: userAccessToken,
        phoneNumberId: resolved.phoneNumberId,
        businessAccountId: resolved.wabaId || previous.businessAccountId || "",
        wabaId: resolved.wabaId || previous.wabaId || "",
        displayPhoneNumber: resolved.displayPhoneNumber || previous.displayPhoneNumber || "",
        verifiedName: resolved.verifiedName || previous.verifiedName || "",
        appSecret: previous.appSecret || metaAppSecret,
        verifyToken: previous.verifyToken || whatsappVerifyToken,
        provider: "whatsapp_cloud_api",
        mode: "production",
        defaultTemplate: previous.defaultTemplate || whatsappDefaultTemplate,
        templateLanguage: previous.templateLanguage || whatsappTemplateLanguage,
        status: "conectado_meta",
        embeddedSignupConnectedAt: new Date().toISOString(),
        lastTestAt: previous.lastTestAt || "",
      },
      pix: source.pix || integrationFor(db, shopId).pix,
    };
    addAudit(db, "integration.whatsapp_embedded_connected", actor, { wabaId: maskSecret(resolved.wabaId), phoneNumberId: maskSecret(resolved.phoneNumberId), subscription }, shopId);
    await writeDb(db);
    return sendJson(res, 200, integrationFor(db, shopId));
  }
  if (pathname === "/api/integrations" && req.method === "PUT") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "owner_required" });
    const body = await readBody(req);
    const source = whatsappSourceFor(db, shopId);
    const currentPublic = integrationFor(db, shopId);
    const currentPrivate = source.whatsapp || {};
    const incomingWhatsapp = body.whatsapp || {};
    const nextWhatsapp = incomingWhatsapp.clearCredentials
      ? {}
      : {
          accessToken: currentPrivate.accessToken || "",
          phoneNumberId: currentPrivate.phoneNumberId || "",
          appSecret: currentPrivate.appSecret || "",
          verifyToken: currentPrivate.verifyToken || "",
          businessAccountId: currentPrivate.businessAccountId || "",
          wabaId: currentPrivate.wabaId || "",
          displayPhoneNumber: currentPrivate.displayPhoneNumber || "",
          verifiedName: currentPrivate.verifiedName || "",
          embeddedSignupConnectedAt: currentPrivate.embeddedSignupConnectedAt || "",
        };
    for (const key of ["accessToken", "phoneNumberId", "appSecret", "verifyToken", "businessAccountId"]) {
      if (incomingWhatsapp[key] !== undefined && String(incomingWhatsapp[key]).trim()) nextWhatsapp[key] = sanitizeCredential(incomingWhatsapp[key]);
    }
    db.integrationsByShop[shopId] = {
      whatsapp: {
        ...nextWhatsapp,
        provider: "whatsapp_cloud_api",
        mode: incomingWhatsapp.mode || currentPrivate.mode || currentPublic.whatsapp.mode,
        defaultTemplate: sanitizeText(incomingWhatsapp.defaultTemplate || currentPrivate.defaultTemplate || currentPublic.whatsapp.defaultTemplate),
        templateLanguage: sanitizeText(incomingWhatsapp.templateLanguage || currentPrivate.templateLanguage || currentPublic.whatsapp.templateLanguage, 20),
        status: currentPrivate.status || currentPublic.whatsapp.status,
        lastTestAt: currentPrivate.lastTestAt || "",
      },
      pix: { ...currentPublic.pix, provider: body.pix?.provider || currentPublic.pix.provider, mode: body.pix?.mode || currentPublic.pix.mode, key: sanitizeText(body.pix?.key || currentPublic.pix.key, 120), depositAmount: Number(body.pix?.depositAmount || currentPublic.pix.depositAmount) },
    };
    addAudit(db, "integration.updated", actor, { whatsapp: true, pix: true }, shopId); await writeDb(db); return sendJson(res, 200, integrationFor(db, shopId));
  }
  if (pathname === "/api/integrations/whatsapp/test" && req.method === "POST") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "owner_required" }); const body = await readBody(req); if (!validPhone(body.to)) return sendJson(res, 400, { error: "valid_phone_required" });
    try { const result = await sendWhatsAppTemplate({ db, shopId, to: body.to, templateName: integrationFor(db, shopId).whatsapp.defaultTemplate, variables: [sanitizeText(body.name || "Cliente")] }); const source = whatsappSourceFor(db, shopId); db.integrationsByShop[shopId] = { ...source, whatsapp: { ...(source.whatsapp || {}), status: result.simulated ? "sandbox_pronto" : "mensagem_enviada", lastTestAt: new Date().toISOString() } }; addAudit(db, "integration.whatsapp_tested", actor, { simulated: result.simulated, messageId: result.messageId }, shopId); await writeDb(db); return sendJson(res, 200, { ok: true, simulated: result.simulated, message: result.simulated ? "Estrutura pronta. Configure as credenciais Meta da barbearia para enviar de verdade." : "Mensagem enviada pela WhatsApp Cloud API da barbearia." }); } catch (error) { return sendJson(res, 502, { error: "whatsapp_send_failed", message: "A Meta recusou o envio. Verifique token, numero e template aprovado.", meta: { code: error.details?.error?.code || "", subcode: error.details?.error?.error_subcode || "", type: error.details?.error?.type || "", message: error.details?.error?.message || "" } }); }
  }
  if (pathname === "/api/whatsapp/send-template" && req.method === "POST") {
    const body = await readBody(req); const client = scope(db.clients, shopId).find((item) => item.id === body.clientId); if (!client) return sendJson(res, 404, { error: "client_not_found" }); if (!client.consentWhatsapp) return sendJson(res, 409, { error: "whatsapp_consent_required" });
    try { const result = await sendWhatsAppTemplate({ db, shopId, to: client.phone, templateName: body.templateName || integrationFor(db, shopId).whatsapp.defaultTemplate, variables: Array.isArray(body.variables) ? body.variables : [client.name] }); db.messageHistory.push(withTenant({ id: makeId("msg"), clientId: client.id, client: client.name, status: result.simulated ? "simulado" : "enviado", providerMessageId: result.messageId, at: new Date().toISOString() }, shopId)); addAudit(db, "whatsapp.template_sent", actor, { clientId: client.id, simulated: result.simulated }, shopId); await writeDb(db); return sendJson(res, 200, result); } catch { return sendJson(res, 502, { error: "whatsapp_send_failed" }); }
  }
  if (pathname === "/api/integrations/pix/test" && req.method === "POST") return sendJson(res, 200, { ok: true, simulated: true, message: "Pix permanece em modo manual até configurar um provedor homologado." });
  if (pathname === "/api/audit-logs" && req.method === "GET") return sendJson(res, 200, isBarber(user) ? [] : (isPlatformAdmin(user) ? db.auditLogs : db.auditLogs.filter((log) => log.barbershopId === shopId)));
  return sendJson(res, 404, { error: "not_found" });
}

const mimeTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml; charset=utf-8", ".ico": "image/x-icon" };
async function serveStatic(res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const lower = requested.toLowerCase();
  const blocked = lower.startsWith("/data/") || lower.startsWith("/.git/") || lower.startsWith("/supabase/") || lower.startsWith("/docs/") || lower.startsWith("/tests/") || lower.startsWith("/scripts/") || /\.(log|err|csv|sql|md|json|example)$/i.test(lower) || lower === "/server.mjs" || lower === "/dockerfile" || lower === "/package.json";
  if (blocked) return sendText(res, 404, "Not found");
  const safePath = path.normalize(decodeURIComponent(requested)).replace(/^[/\\]+/, "");
  const filePath = path.resolve(__dirname, safePath);
  if (!filePath.startsWith(__dirname + path.sep) && filePath !== __dirname) return sendText(res, 403, "Forbidden");
  try { const data = await readFile(filePath); res.writeHead(200, securityHeaders({ "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" })); res.end(data); } catch { sendText(res, 404, "Not found"); }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, appUrl);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return await serveStatic(res, url.pathname);
  } catch (error) {
    console.error(error);
    return sendJson(res, error.statusCode || 500, { error: error.message || "server_error" });
  }
});

await ensureLocalDb();
server.listen(port, "0.0.0.0", () => console.log(`Business Barber rodando em http://0.0.0.0:${port} | storage=${storageProvider}`));
