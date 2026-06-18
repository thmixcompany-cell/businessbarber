import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "db.json");
const port = Number(process.env.PORT || 4187);
const appUrl = process.env.APP_URL || `http://localhost:${port}`;
const maxBodyBytes = 1024 * 1024;
const sessions = new Map();
const rateLimits = new Map();
let sessionCleanupCounter = 0;
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
const whatsappBusinessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.WHATSAPP_WABA_ID || "";
const whatsappMode = (process.env.WHATSAPP_MODE || "sandbox").toLowerCase();
const whatsappDefaultTemplate = process.env.WHATSAPP_DEFAULT_TEMPLATE || "retorno_cliente_sumido";
const whatsappTemplateLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "pt_BR";
const whatsappSlotInviteTemplate = process.env.WHATSAPP_SLOT_INVITE_TEMPLATE || "encaixe_horario_vago";
const whatsappReminderTemplate = process.env.WHATSAPP_REMINDER_TEMPLATE || "lembrete_agendamento";
const metaAppId = process.env.META_APP_ID || "";
const metaAppSecret = process.env.META_APP_SECRET || whatsappAppSecret;
const metaBusinessId = process.env.META_BUSINESS_ID || "";
const metaSystemUserAccessToken = process.env.META_SYSTEM_USER_ACCESS_TOKEN || "";
const metaEmbeddedSignupConfigId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID || "";
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripePriceId = process.env.STRIPE_PRICE_ID || "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const stripeSuccessUrl = process.env.STRIPE_SUCCESS_URL || `${appUrl.replace(/\/$/, "")}/sucesso.html?session_id={CHECKOUT_SESSION_ID}`;
const stripeCancelUrl = process.env.STRIPE_CANCEL_URL || `${appUrl.replace(/\/$/, "")}/cadastro.html?billing=cancel`;
const billingEntityName = process.env.BILLING_ENTITY_NAME || "ThM IX Company";
const allowTestStripeInProduction = String(process.env.ALLOW_TEST_STRIPE_IN_PRODUCTION || "false").toLowerCase() === "true";
const emailProvider = String(process.env.EMAIL_PROVIDER || "resend").toLowerCase();
const resendApiKey = process.env.RESEND_API_KEY || "";
const emailFrom = process.env.EMAIL_FROM || "Business Barber <onboarding@businessbarber.com.br>";
const emailReplyTo = process.env.EMAIL_REPLY_TO || "thmixcompany@gmail.com";
const onboardingWhatsapp = normalizePhone(process.env.ONBOARDING_WHATSAPP || "556631992916");
const resendClient = emailProvider === "resend" && resendApiKey ? new Resend(resendApiKey) : null;

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

function generateTemporaryPassword(length = 14) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%";
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
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
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data: https://www.facebook.com https://static.xx.fbcdn.net https://www.google.com https://www.google.com.br https://www.googleadservices.com https://www.googletagmanager.com; style-src 'self'; script-src 'self' https://connect.facebook.net https://www.googletagmanager.com; connect-src 'self' https://graph.facebook.com https://www.facebook.com https://www.google.com https://www.google.com.br https://www.googleadservices.com https://www.googletagmanager.com https://googleads.g.doubleclick.net; frame-src https://www.facebook.com https://web.facebook.com; form-action 'self'; base-uri 'self'; frame-ancestors 'none'",
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

function sendRedirect(res, location, status = 303) {
  res.writeHead(status, securityHeaders({ Location: location }));
  res.end();
}

async function readRawBody(req) {
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
  return Buffer.concat(chunks);
}

async function readBody(req) {
  const raw = (await readRawBody(req)).toString("utf8");
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { const error = new Error("invalid_json"); error.statusCode = 400; throw error; }
}

function addAudit(db, action, actor = "system", metadata = {}, barbershopId = null) {
  db.auditLogs = [{ id: makeId("audit"), at: new Date().toISOString(), actor, action, barbershopId, metadata }, ...(db.auditLogs || [])].slice(0, 500);
}

function sessionExpiryMs(session) {
  if (!session) return 0;
  if (typeof session.expiresAt === "number") return session.expiresAt;
  const parsed = Date.parse(session.expiresAt || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanupExpiredSessions(db) {
  const now = Date.now();
  let changed = false;
  for (const [token, session] of sessions.entries()) {
    if (sessionExpiryMs(session) <= now) {
      sessions.delete(token);
      changed = true;
    }
  }
  const before = (db.sessions || []).length;
  db.sessions = (db.sessions || []).filter((session) => sessionExpiryMs(session) > now);
  return changed || db.sessions.length !== before;
}

function createSession(db, user) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 1000 * 60 * 60 * 12;
  const session = { token, userId: user.id, expiresAt: new Date(expiresAt).toISOString() };
  db.sessions = Array.isArray(db.sessions) ? db.sessions : [];
  db.sessions = [session, ...db.sessions.filter((item) => item.token !== token)].slice(0, 1000);
  sessions.set(token, { userId: user.id, expiresAt });
  return { token, expiresAt: new Date(expiresAt).toISOString(), user: publicUser(user) };
}

function getSessionUser(req, db) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  let session = sessions.get(token);
  if (!session) {
    const persisted = (db.sessions || []).find((item) => item.token === token);
    if (persisted) {
      session = { userId: persisted.userId, expiresAt: sessionExpiryMs(persisted) };
      sessions.set(token, session);
    }
  }
  if (!session || sessionExpiryMs(session) < Date.now()) {
    sessions.delete(token);
    db.sessions = (db.sessions || []).filter((item) => item.token !== token);
    return null;
  }
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
    slotInviteTemplate: whatsapp.slotInviteTemplate || whatsappSlotInviteTemplate,
    reminderTemplate: whatsapp.reminderTemplate || whatsappReminderTemplate,
    businessAccountId: whatsapp.businessAccountId || whatsapp.wabaId || whatsappBusinessAccountId,
    wabaId: whatsapp.wabaId || whatsapp.businessAccountId || whatsappBusinessAccountId,
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
    slotInviteTemplate: config.slotInviteTemplate,
    reminderTemplate: config.reminderTemplate,
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

function whatsappCredentialStatus(db, shopId) {
  const config = whatsappInternalConfig(db, shopId);
  return {
    mode: config.mode,
    credentialSource: config.credentialSource,
    requiredForRealSend: {
      WHATSAPP_ACCESS_TOKEN: Boolean(config.accessToken),
      WHATSAPP_PHONE_NUMBER_ID: Boolean(config.phoneNumberId),
      WHATSAPP_APP_SECRET: Boolean(config.appSecret),
      WHATSAPP_VERIFY_TOKEN: Boolean(config.verifyToken),
      WHATSAPP_BUSINESS_ACCOUNT_ID: Boolean(config.businessAccountId || config.wabaId),
    },
    readyForRealSend: config.mode === "production" && Boolean(config.accessToken && config.phoneNumberId),
    readyForWebhookValidation: Boolean(config.appSecret && config.verifyToken),
    phoneNumberIdMasked: maskSecret(config.phoneNumberId),
    businessAccountIdMasked: maskSecret(config.businessAccountId || config.wabaId),
  };
}

async function whatsappHealthcheck(db, shopId) {
  const config = whatsappInternalConfig(db, shopId);
  const credentials = whatsappCredentialStatus(db, shopId);
  if (!config.accessToken || !config.phoneNumberId) {
    return {
      ok: false,
      graphApiReachable: false,
      message: "Configure WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID para testar a Graph API.",
      credentials,
    };
  }
  try {
    const data = await graphGet(`/${config.phoneNumberId}`, config.accessToken, { fields: "id,display_phone_number,verified_name,code_verification_status" });
    return {
      ok: true,
      graphApiReachable: true,
      message: "Credenciais aceitas pela Graph API.",
      credentials,
      phoneNumber: {
        idMasked: maskSecret(data.id),
        displayPhoneNumber: data.display_phone_number || "",
        verifiedName: data.verified_name || "",
        codeVerificationStatus: data.code_verification_status || "",
      },
    };
  } catch (error) {
    return {
      ok: false,
      graphApiReachable: false,
      message: "A Meta recusou a consulta. Verifique token, permissões e phone_number_id.",
      credentials,
      meta: {
        status: error.status || 500,
        code: error.details?.error?.code || "",
        type: error.details?.error?.type || "",
        message: String(error.details?.error?.message || error.message || "meta_graph_get_failed").slice(0, 220),
      },
    };
  }
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
    db.barbershops.push({ id: db.currentBarbershopId, name: "Barbearia Demonstração", slug: "barbearia-demo", city: "", plan: "Piloto", monthlyPrice: 119.9, active: true, openTime: "09:00", closeTime: "19:00" });
  }
  db.users = Array.isArray(db.users) ? db.users : [];
  db.auditLogs = Array.isArray(db.auditLogs) ? db.auditLogs : [];
  db.prospects = Array.isArray(db.prospects) ? db.prospects : [];
  db.stripeEvents = Array.isArray(db.stripeEvents) ? db.stripeEvents : [];
  db.checkoutRequests = Array.isArray(db.checkoutRequests) ? db.checkoutRequests : [];
  db.marketingEvents = Array.isArray(db.marketingEvents) ? db.marketingEvents : [];
  db.sessions = Array.isArray(db.sessions) ? db.sessions : [];
  db.passwordResets = Array.isArray(db.passwordResets) ? db.passwordResets : [];
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
function appointmentTimeMs(appointment) {
  const date = appointmentDate(appointment);
  const time = String(appointment?.time || "00:00");
  const parsed = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}`);
  return parsed.getTime();
}
function normalizePhone(value) { return String(value || "").replace(/\D/g, "").slice(0, 15); }
function validPhone(value) { const phone = normalizePhone(value); return phone.length >= 10 && phone.length <= 15; }
function validSignupWhatsapp(value) { const phone = normalizePhone(value); return phone.length >= 10 && phone.length <= 13; }
function sanitizeText(value, max = 120) { return String(value || "").trim().replace(/[<>]/g, "").slice(0, max); }
function sanitizeEmail(value) { return String(value || "").trim().toLowerCase().slice(0, 180); }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim()); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
function formatMoneyBRL(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}
function slugify(value) { return String(value || "barbearia").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 70) || "barbearia"; }
function uniqueSlug(db, base, excludeId = "") {
  const root = slugify(base);
  let slug = root;
  let index = 2;
  while ((db.barbershops || []).some((shop) => shop.id !== excludeId && shop.slug === slug)) {
    slug = `${root}-${index++}`;
  }
  return slug;
}
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

function recordMarketingEvent(db, event, metadata = {}) {
  db.marketingEvents = Array.isArray(db.marketingEvents) ? db.marketingEvents : [];
  db.marketingEvents.unshift({
    id: makeId("mkt"),
    at: new Date().toISOString(),
    event: sanitizeText(event, 80),
    metadata,
  });
  db.marketingEvents = db.marketingEvents.slice(0, 1000);
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

const publicBaseSlots = ["09:00", "10:00", "11:30", "14:00", "15:30", "16:30", "18:00"];

function publicAvailableAlternatives(db, shop, { date, barber, time }) {
  const shopId = shop.id;
  const openTime = shop.openTime || "09:00";
  const closeTime = shop.closeTime || "19:00";
  const unavailable = new Set(scope(db.appointments, shopId)
    .filter((item) => appointmentDate(item) === date && item.barber === barber && !item.open && !["Cancelado", "Recusado"].includes(item.status))
    .map((item) => item.time));
  return publicBaseSlots
    .filter((slot) => slot >= openTime && slot <= closeTime && slot !== time && !unavailable.has(slot))
    .sort((a, b) => Math.abs(minutesFromTime(a) - minutesFromTime(time)) - Math.abs(minutesFromTime(b) - minutesFromTime(time)))
    .slice(0, 2);
}

function minutesFromTime(time) {
  const [hour, minute] = String(time || "00:00").split(":").map(Number);
  return (hour || 0) * 60 + (minute || 0);
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

function isTemplateParameterMismatch(error) {
  const message = String(error?.details?.error?.message || error?.message || "");
  return message.includes("#132000") || /number of parameters/i.test(message);
}

async function sendWhatsAppTemplateWithFallbacks({ db, shopId, to, templateName, language, variableSets = [] }) {
  let lastError = null;
  for (const variables of variableSets) {
    try {
      return await sendWhatsAppTemplate({ db, shopId, to, templateName, language, variables });
    } catch (error) {
      lastError = error;
      if (!isTemplateParameterMismatch(error)) throw error;
    }
  }
  throw lastError || new Error("whatsapp_send_failed");
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

function unavailableSlotMessage(db, shopId, appointment = {}) {
  const shop = db.barbershops.find((item) => item.id === shopId) || {};
  const alternatives = publicAvailableAlternatives(db, shop, {
    date: appointmentDate(appointment),
    barber: appointment.barber || "",
    time: appointment.time || "",
  });
  if (!alternatives.length) return customerMessages(db, shopId, appointment).unavailable;
  const options = alternatives.length === 1 ? alternatives[0] : `${alternatives[0]} ou ${alternatives[1]}`;
  return `Esse horário acabou de ser preenchido. Tenho ${options} com ${appointment.barber || "a equipe"} no mesmo dia. Se um deles servir, responda com o horário.`;
}

function buildSlotInviteText(db, shopId, appointment, client) {
  const shop = db.barbershops.find((item) => item.id === shopId) || {};
  const service = appointment.service && appointment.service !== "Corte ou barba" ? ` para ${appointment.service}` : "";
  return `Oi, ${client.name}! Aqui é da ${shop.name || "barbearia"}. Abriu um horário ${formatCustomerDate(appointmentDate(appointment))} às ${appointment.time} com ${appointment.barber}${service}. Quer que eu reserve para você? Responda "sim" para confirmar.`;
}

async function sendWhatsAppSlotInvite({ db, shopId, to, appointment, client }) {
  const config = whatsappInternalConfig(db, shopId);
  const shop = db.barbershops.find((item) => item.id === shopId) || {};
  const clientName = client.name || "cliente";
  const shopName = shop.name || "barbearia";
  const date = formatCustomerDate(appointmentDate(appointment));
  const time = appointment.time || "";
  const barber = appointment.barber || "profissional";
  const service = appointment.service || "serviço";
  const dateTime = `${date} às ${time}`.trim();
  return sendWhatsAppTemplateWithFallbacks({
    db,
    shopId,
    to,
    templateName: config.slotInviteTemplate || whatsappSlotInviteTemplate,
    language: config.templateLanguage || whatsappTemplateLanguage,
    variableSets: [
      [clientName, shopName, date, time, barber, service],
      [clientName, shopName, dateTime, barber, service],
      [clientName, shopName, dateTime, barber],
      [clientName, shopName, dateTime],
      [clientName, dateTime],
      [clientName],
    ],
  });
}

async function sendWhatsAppAppointmentReminder({ db, shopId, to, appointment, clientName }) {
  const config = whatsappInternalConfig(db, shopId);
  const shop = db.barbershops.find((item) => item.id === shopId) || {};
  return sendWhatsAppTemplate({
    db,
    shopId,
    to,
    templateName: config.reminderTemplate || whatsappReminderTemplate,
    language: config.templateLanguage || whatsappTemplateLanguage,
    variables: [
      clientName || appointment.client || "cliente",
      shop.name || "barbearia",
      formatCustomerDate(appointmentDate(appointment)),
      appointment.time || "",
      appointment.barber || "profissional",
      appointment.service || "serviço",
    ],
  });
}

function recentInviteForClient(db, shopId, phone, hours = 24) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const ignoredStatuses = new Set(["Falha no envio", "Recusado", "Horário indisponível"]);
  return scope(db.messageHistory, shopId).some((message) => (
    message.type === "slot_invite"
    && normalizePhone(message.phone) === normalizePhone(phone)
    && !ignoredStatuses.has(message.status || "")
    && new Date(message.createdAt || message.at || 0).getTime() >= cutoff
  ));
}

function clientValue(client) {
  return Number(client.value || client.ticket || 0);
}

function eligibleInviteClients(db, shopId, appointment) {
  const wait = scope(db.waitlist, shopId).find((item) => item.period === periodFromTimeForServer(appointment.time));
  const waitBest = wait?.best || "";
  const clientsByName = new Map(scope(db.clients, shopId).map((client) => [client.name, client]));
  const inactive = scope(db.inactiveClients, shopId).map((client) => ({ ...client, ...(clientsByName.get(client.name) || {}) }));
  const candidates = [
    ...(waitBest && clientsByName.has(waitBest) ? [{ ...clientsByName.get(waitBest), intent: wait?.chance || "Alta" }] : []),
    ...inactive,
    ...scope(db.clients, shopId),
  ];
  const seen = new Set();
  return candidates
    .filter((client) => client?.name && normalizePhone(client.phone) && client.consentWhatsapp)
    .filter((client) => {
      const key = normalizePhone(client.phone);
      if (seen.has(key)) return false;
      seen.add(key);
      return !recentInviteForClient(db, shopId, client.phone, 24);
    })
    .sort((a, b) => {
      const intentScore = { Alta: 3, "Média": 2, Media: 2, Baixa: 1 };
      return (intentScore[b.intent] || 0) - (intentScore[a.intent] || 0) || clientValue(b) - clientValue(a);
    });
}

function periodFromTimeForServer(time) {
  const hour = Number(String(time || "0").split(":")[0] || 0);
  if (hour < 12) return "Manhã";
  if (hour < 14) return "Almoço";
  if (hour < 18) return "Tarde";
  return "Noite";
}

function slotInviteAppointment(db, shopId, appointmentId = "") {
  const appointments = scope(db.appointments, shopId)
    .filter((appointment) => appointment.open)
    .sort((a, b) => `${appointmentDate(a)} ${a.time || ""}`.localeCompare(`${appointmentDate(b)} ${b.time || ""}`));
  if (appointmentId) return appointments.find((appointment) => appointment.id === appointmentId) || null;
  const now = new Date();
  return appointments.find((appointment) => {
    const dateText = appointmentDate(appointment);
    if (dateText < now.toISOString().slice(0, 10)) return false;
    const appointmentAt = new Date(`${dateText}T${appointment.time || "00:00"}:00`);
    return Number.isNaN(appointmentAt.getTime()) || appointmentAt.getTime() - now.getTime() >= 60 * 60 * 1000;
  }) || appointments[0] || null;
}

async function createAndSendSlotInvite(db, shopId, { appointmentId = "", clientId = "", actor = "system" } = {}) {
  const appointment = slotInviteAppointment(db, shopId, appointmentId);
  if (!appointment) return { ok: false, error: "open_slot_not_found" };
  const clients = eligibleInviteClients(db, shopId, appointment);
  const client = clientId ? clients.find((item) => item.id === clientId) : clients[0];
  if (!client) return { ok: false, error: "eligible_client_not_found" };

  const messageText = buildSlotInviteText(db, shopId, appointment, client);
  const sendResult = await sendWhatsAppSlotInvite({ db, shopId, to: client.phone, appointment, client }).catch((error) => ({ simulated: false, status: "failed", error }));
  const invite = withTenant({
    id: makeId("invite"),
    type: "slot_invite",
    appointmentId: appointment.id || "",
    clientId: client.id || "",
    client: client.name,
    phone: normalizePhone(client.phone),
    message: messageText,
    status: sendResult.status === "failed" ? "Falha no envio" : (sendResult.simulated ? "Sandbox: pronto" : "Convite enviado"),
    providerMessageId: sendResult.messageId || "",
    time: appointment.time,
    barber: appointment.barber,
    service: appointment.service,
    value: clientValue(client),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  }, shopId);
  db.messageHistory.unshift(invite);
  addAudit(db, "slot_invite.sent", actor, { inviteId: invite.id, appointmentId: appointment.id || "", clientId: client.id || "", simulated: Boolean(sendResult.simulated), status: invite.status }, shopId);
  return { ok: sendResult.status !== "failed", invite, simulated: Boolean(sendResult.simulated), error: sendResult.error?.details?.error?.message || "" };
}

function reminderPhoneForAppointment(db, shopId, appointment) {
  if (normalizePhone(appointment.phone)) return normalizePhone(appointment.phone);
  const client = scope(db.clients, shopId).find((item) => item.name === appointment.client);
  return normalizePhone(client?.phone);
}

function appointmentAlreadyReminded(db, shopId, appointmentId) {
  return scope(db.messageHistory, shopId).some((message) => message.type === "appointment_reminder" && message.appointmentId === appointmentId && !["Falha no envio", "Cancelado"].includes(message.status));
}

async function createAndSendAppointmentReminder(db, shopId, appointment, actor = "system") {
  const phone = reminderPhoneForAppointment(db, shopId, appointment);
  if (!phone) return { ok: false, error: "appointment_phone_not_found", appointmentId: appointment.id || "" };
  if (appointmentAlreadyReminded(db, shopId, appointment.id || "")) return { ok: false, skipped: true, error: "reminder_already_sent", appointmentId: appointment.id || "" };
  const sendResult = await sendWhatsAppAppointmentReminder({ db, shopId, to: phone, appointment, clientName: appointment.client }).catch((error) => ({ simulated: false, status: "failed", error }));
  const reminder = withTenant({
    id: makeId("reminder"),
    type: "appointment_reminder",
    appointmentId: appointment.id || "",
    client: appointment.client,
    phone,
    status: sendResult.status === "failed" ? "Falha no envio" : (sendResult.simulated ? "Sandbox: lembrete pronto" : "Lembrete enviado"),
    providerMessageId: sendResult.messageId || "",
    time: appointment.time,
    barber: appointment.barber,
    service: appointment.service,
    date: appointmentDate(appointment),
    createdAt: new Date().toISOString(),
  }, shopId);
  db.messageHistory.unshift(reminder);
  addAudit(db, "appointment_reminder.sent", actor, { reminderId: reminder.id, appointmentId: appointment.id || "", simulated: Boolean(sendResult.simulated), status: reminder.status }, shopId);
  return { ok: sendResult.status !== "failed", reminder, simulated: Boolean(sendResult.simulated), error: sendResult.error?.details?.error?.message || "" };
}

function reminderCandidates(db, shopId, windowMinutes, limit) {
  const now = Date.now();
  const max = now + windowMinutes * 60 * 1000;
  const blockedStatuses = new Set(["Cancelado", "Recusado", "Faltou", "Sem resposta"]);
  return scope(db.appointments, shopId)
    .filter((appointment) => appointment.id && !appointment.open && !blockedStatuses.has(appointment.status || ""))
    .filter((appointment) => {
      const scheduledAt = appointmentTimeMs(appointment);
      return Number.isFinite(scheduledAt) && scheduledAt >= now && scheduledAt <= max;
    })
    .filter((appointment) => !appointmentAlreadyReminded(db, shopId, appointment.id))
    .sort((a, b) => appointmentTimeMs(a) - appointmentTimeMs(b))
    .slice(0, limit);
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
  const pendingStatuses = new Set(["Convite enviado", "Pronto para envio", "Aguardando resposta", "Sandbox: pronto", "enviado", "simulado"]);
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
    await sendWhatsAppText({ db, shopId, to: inbound.from, text: unavailableSlotMessage(db, shopId, appointment || {}) }).catch(() => null);
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

function stripeConfigured() {
  if (!stripeSecretKey || !stripePriceId) return false;
  if (process.env.NODE_ENV === "production" && stripeSecretKey.startsWith("sk_test_") && !allowTestStripeInProduction) return false;
  return true;
}

function stripeModeLabel() {
  if (stripeSecretKey.startsWith("sk_live_")) return "live";
  if (stripeSecretKey.startsWith("sk_test_")) return "test";
  return stripeSecretKey ? "unknown" : "missing";
}

function stripeProductionReady() {
  return stripeConfigured() && (process.env.NODE_ENV !== "production" || stripeModeLabel() === "live");
}

function emailConfigured() {
  return Boolean(resendApiKey && emailFrom);
}

function buildPasswordResetEmailHtml(user = {}, resetLink = "") {
  const name = escapeHtml(user.name || "tudo bem");
  const link = escapeHtml(resetLink);
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#090806;color:#f8f2e7;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#090806;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background:#14110d;border:1px solid rgba(218,171,91,.34);border-radius:16px;overflow:hidden;">
          <tr><td style="padding:30px;background:linear-gradient(135deg,#17120c,#24190e);">
            <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#d9a95d;font-weight:700;">Business Barber</div>
            <h1 style="margin:14px 0 10px;font-size:30px;line-height:1.1;color:#fff7e8;">Recuperação de senha</h1>
            <p style="margin:0;color:#d8cdbc;font-size:16px;line-height:1.6;">Olá, ${name}. Recebemos uma solicitação para redefinir sua senha.</p>
          </td></tr>
          <tr><td style="padding:28px 30px;">
            <p style="margin:0 0 20px;color:#e7dccb;font-size:16px;line-height:1.65;">Clique no botão abaixo para criar uma nova senha. O link expira em 1 hora.</p>
            <a href="${link}" style="display:inline-block;background:#d9a95d;color:#110d08;text-decoration:none;font-weight:800;border-radius:10px;padding:14px 20px;">Criar nova senha</a>
            <p style="margin:22px 0 0;color:#b8aa98;font-size:13px;line-height:1.55;">Se você não pediu isso, ignore este e-mail.</p>
          </td></tr>
          <tr><td style="padding:18px 30px;border-top:1px solid rgba(255,255,255,.08);color:#b8aa98;font-size:13px;">Business Barber · ThM IX Company</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function buildPasswordResetEmailText(user = {}, resetLink = "") {
  return [
    `Olá, ${user.name || "tudo bem"}.`,
    "",
    "Recebemos uma solicitação para redefinir sua senha no Business Barber.",
    `Crie uma nova senha por este link: ${resetLink}`,
    "",
    "O link expira em 1 hora. Se você não pediu isso, ignore este e-mail.",
    "",
    "Business Barber · ThM IX Company",
  ].join("\n");
}

async function sendPasswordResetEmail(user = {}, resetLink = "") {
  if (!emailConfigured() || !resendClient) return { ok: false, skipped: true, error: "email_not_configured" };
  try {
    const response = await resendClient.emails.send({
      from: emailFrom,
      to: [user.email],
      replyTo: emailReplyTo,
      subject: "Redefina sua senha no Business Barber",
      html: buildPasswordResetEmailHtml(user, resetLink),
      text: buildPasswordResetEmailText(user, resetLink),
    });
    if (response?.error) throw new Error(response.error.message || "resend_send_failed");
    return { ok: true, id: response?.data?.id || response?.id || "" };
  } catch (error) {
    return { ok: false, error: error.message || "email_send_failed" };
  }
}

function onboardingEmailPlan(barbershop = {}) {
  return barbershop.plan ? `Business Barber - Plano ${barbershop.plan}` : "Business Barber - Plano Piloto";
}

function appLoginUrl() {
  return `${appUrl.replace(/\/$/, "")}/app.html`;
}

function buildOnboardingWhatsAppLink(barbershop = {}) {
  const phone = onboardingWhatsapp || "556631992916";
  const message = [
    `Olá, aqui é ${barbershop.ownerName || "o responsável"} da ${barbershop.name || "barbearia"}.`,
    "Pagamento confirmado no Business Barber.",
    "Quero concluir o onboarding e ativar minha barbearia.",
  ].join(" ");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function buildOnboardingEmailHtml(barbershop = {}, account = {}) {
  const ownerName = escapeHtml(barbershop.ownerName || "tudo bem");
  const shopName = escapeHtml(barbershop.name || "sua barbearia");
  const city = escapeHtml(barbershop.city || "Não informada");
  const whatsapp = escapeHtml(barbershop.ownerWhatsapp || "Não informado");
  const email = escapeHtml(barbershop.ownerEmail || "Não informado");
  const loginEmail = escapeHtml(account.email || barbershop.ownerEmail || "Não informado");
  const temporaryPassword = escapeHtml(account.temporaryPassword || "");
  const loginLink = escapeHtml(appLoginUrl());
  const plan = escapeHtml(onboardingEmailPlan(barbershop));
  const value = escapeHtml(`${formatMoneyBRL(barbershop.monthlyPrice || 119.9)}/mês`);
  const whatsappLink = escapeHtml(buildOnboardingWhatsAppLink(barbershop));
  const steps = [
    "Confirmar os dados da barbearia.",
    "Cadastrar serviços, preços e horários.",
    "Configurar o WhatsApp oficial da barbearia.",
    "Importar ou cadastrar a base de clientes.",
    "Preparar a primeira campanha de recuperação.",
  ];

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pagamento confirmado</title>
  </head>
  <body style="margin:0;background:#090806;color:#f8f2e7;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#090806;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#14110d;border:1px solid rgba(218,171,91,.34);border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:34px 30px;background:linear-gradient(135deg,#17120c 0%,#24190e 100%);">
                <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#d9a95d;font-weight:700;">Business Barber</div>
                <h1 style="margin:14px 0 10px;font-size:34px;line-height:1.08;color:#fff7e8;">Pagamento confirmado. Vamos ativar sua barbearia.</h1>
                <p style="margin:0;color:#d8cdbc;font-size:16px;line-height:1.65;">Olá, ${ownerName}. Recebemos a assinatura da <strong style="color:#ffffff;">${shopName}</strong> no Business Barber.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 30px;">
                <p style="margin:0 0 22px;color:#e7dccb;font-size:16px;line-height:1.65;">Agora vamos iniciar a implantação assistida para deixar sua operação pronta para recuperar clientes, preencher horários vagos e acompanhar a receita recuperada pelo painel.</p>
                <a href="${whatsappLink}" style="display:inline-block;background:#d9a95d;color:#110d08;text-decoration:none;font-weight:800;border-radius:12px;padding:15px 22px;margin:0 0 28px;">Concluir onboarding no WhatsApp</a>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 26px;background:#21180f;border:1px solid rgba(217,169,93,.32);border-radius:14px;">
                  <tr><td style="padding:20px 22px;">
                    <h2 style="margin:0 0 12px;font-size:18px;color:#fff;">Acesso ao painel</h2>
                    <p style="margin:0 0 8px;color:#d8cdbc;"><strong style="color:#fff;">Link:</strong> <a href="${loginLink}" style="color:#d9a95d;">${loginLink}</a></p>
                    <p style="margin:0 0 8px;color:#d8cdbc;"><strong style="color:#fff;">E-mail:</strong> ${loginEmail}</p>
                    ${temporaryPassword ? `<p style="margin:0 0 10px;color:#d8cdbc;"><strong style="color:#fff;">Senha temporária:</strong> <span style="font-family:Consolas,Menlo,monospace;color:#fff;background:rgba(255,255,255,.08);padding:4px 7px;border-radius:7px;">${temporaryPassword}</span></p>` : ""}
                    <p style="margin:0;color:#b8aa98;font-size:13px;line-height:1.55;">Por segurança, troque esta senha no primeiro acesso. O painel ficará bloqueado até a alteração.</p>
                  </td></tr>
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 26px;background:#1b1712;border:1px solid rgba(255,255,255,.08);border-radius:14px;">
                  <tr><td style="padding:20px 22px;">
                    <h2 style="margin:0 0 14px;font-size:18px;color:#fff;">Dados recebidos</h2>
                    <p style="margin:0 0 8px;color:#d8cdbc;"><strong style="color:#fff;">Barbearia:</strong> ${shopName}</p>
                    <p style="margin:0 0 8px;color:#d8cdbc;"><strong style="color:#fff;">Cidade:</strong> ${city}</p>
                    <p style="margin:0 0 8px;color:#d8cdbc;"><strong style="color:#fff;">Responsável:</strong> ${ownerName}</p>
                    <p style="margin:0 0 8px;color:#d8cdbc;"><strong style="color:#fff;">E-mail:</strong> ${email}</p>
                    <p style="margin:0 0 8px;color:#d8cdbc;"><strong style="color:#fff;">WhatsApp:</strong> ${whatsapp}</p>
                    <p style="margin:0 0 8px;color:#d8cdbc;"><strong style="color:#fff;">Plano:</strong> ${plan}</p>
                    <p style="margin:0;color:#d8cdbc;"><strong style="color:#fff;">Valor:</strong> ${value}</p>
                  </td></tr>
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#10100d;border:1px solid rgba(217,169,93,.24);border-radius:14px;">
                  <tr><td style="padding:20px 22px;">
                    <h2 style="margin:0 0 14px;font-size:18px;color:#fff;">Próximos passos</h2>
                    ${steps.map((step, index) => `<p style="margin:0 0 10px;color:#e7dccb;line-height:1.5;"><span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:999px;background:rgba(217,169,93,.18);color:#d9a95d;font-weight:800;margin-right:8px;">${index + 1}</span>${escapeHtml(step)}</p>`).join("")}
                  </td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 30px;border-top:1px solid rgba(255,255,255,.08);color:#b8aa98;font-size:13px;">Business Barber é um produto da ThM IX Company.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildOnboardingEmailText(barbershop = {}, account = {}) {
  return [
    `Olá, ${barbershop.ownerName || "tudo bem"}.`,
    "",
    `Recebemos a assinatura da ${barbershop.name || "sua barbearia"} no Business Barber.`,
    "",
    "Agora vamos iniciar a implantação assistida para deixar sua operação pronta para recuperar clientes, preencher horários vagos e acompanhar a receita recuperada pelo painel.",
    "",
    "Próximos passos:",
    "1. Confirmar os dados da barbearia.",
    "2. Cadastrar serviços, preços e horários.",
    "3. Configurar o WhatsApp oficial da barbearia.",
    "4. Importar ou cadastrar a base de clientes.",
    "5. Preparar a primeira campanha de recuperação.",
    "",
    "Dados recebidos:",
    `Barbearia: ${barbershop.name || "Não informada"}`,
    `Cidade: ${barbershop.city || "Não informada"}`,
    `Responsável: ${barbershop.ownerName || "Não informado"}`,
    `E-mail: ${barbershop.ownerEmail || "Não informado"}`,
    `WhatsApp: ${barbershop.ownerWhatsapp || "Não informado"}`,
    `Plano: ${onboardingEmailPlan(barbershop)}`,
    `Valor: ${formatMoneyBRL(barbershop.monthlyPrice || 119.9)}/mês`,
    "",
    "Acesso ao painel:",
    `Link: ${appLoginUrl()}`,
    `E-mail: ${account.email || barbershop.ownerEmail || "Não informado"}`,
    ...(account.temporaryPassword ? [`Senha temporária: ${account.temporaryPassword}`] : []),
    "Troque esta senha no primeiro acesso. O painel ficará bloqueado até a alteração.",
    "",
    `Concluir onboarding no WhatsApp: ${buildOnboardingWhatsAppLink(barbershop)}`,
    "",
    "Business Barber é um produto da ThM IX Company.",
  ].join("\n");
}

async function sendOnboardingEmail(barbershop = {}, account = {}) {
  if (barbershop.onboarding_email_status === "sent" && barbershop.onboarding_email_sent_at) {
    return { ok: true, skipped: true, status: "sent", reason: "already_sent" };
  }
  const now = new Date().toISOString();
  const recipient = sanitizeEmail(barbershop.ownerEmail || barbershop.billing?.customerEmail || "");
  barbershop.onboarding_email_last_attempt_at = now;
  barbershop.onboarding_email_status = "pending";

  if (!validEmail(recipient)) {
    barbershop.onboarding_email_status = "failed";
    barbershop.onboarding_email_error = "missing_recipient_email";
    return { ok: false, status: "failed", error: "missing_recipient_email" };
  }
  if (!emailConfigured() || !resendClient) {
    barbershop.onboarding_email_error = "email_not_configured";
    return { ok: false, skipped: true, status: "pending", error: "email_not_configured" };
  }

  try {
    const response = await resendClient.emails.send({
      from: emailFrom,
      to: [recipient],
      replyTo: emailReplyTo,
      subject: "Pagamento confirmado — vamos ativar sua barbearia",
      html: buildOnboardingEmailHtml(barbershop, account),
      text: buildOnboardingEmailText(barbershop, account),
    });
    if (response?.error) throw new Error(response.error.message || "resend_send_failed");
    barbershop.onboarding_email_status = "sent";
    barbershop.onboarding_email_sent_at = new Date().toISOString();
    barbershop.onboarding_email_error = "";
    barbershop.onboarding_email_provider = "resend";
    barbershop.onboarding_email_message_id = response?.data?.id || response?.id || "";
    return { ok: true, status: "sent", id: barbershop.onboarding_email_message_id };
  } catch (error) {
    barbershop.onboarding_email_status = "failed";
    barbershop.onboarding_email_error = String(error?.message || error || "resend_send_failed").slice(0, 500);
    return { ok: false, status: "failed", error: barbershop.onboarding_email_error };
  }
}

function ensureOwnerUserAfterPayment(db, barbershop) {
  if (!barbershop?.id) return { created: false, reason: "missing_barbershop" };
  const existingOwner = (db.users || []).find((user) => user.role === "owner" && user.barbershopId === barbershop.id && user.active !== false);
  if (existingOwner) return { created: false, user: existingOwner, reason: "owner_exists" };

  const email = sanitizeEmail(barbershop.ownerEmail || barbershop.billing?.customerEmail || "");
  if (!validEmail(email)) return { created: false, reason: "missing_owner_email" };

  const existingByEmail = (db.users || []).find((user) => String(user.email || "").toLowerCase() === email);
  if (existingByEmail) {
    existingByEmail.role = "owner";
    existingByEmail.barbershopId = barbershop.id;
    existingByEmail.active = true;
    return { created: false, user: existingByEmail, email, reason: "email_reassigned" };
  }

  const temporaryPassword = generateTemporaryPassword();
  const user = {
    id: makeId("user"),
    name: sanitizeText(barbershop.ownerName || "Dono da barbearia", 120),
    email,
    role: "owner",
    barbershopId: barbershop.id,
    active: true,
    passwordHash: hashPassword(temporaryPassword),
    mustChangePassword: true,
    forcePasswordChange: true,
    createdAt: new Date().toISOString(),
    createdBy: "stripe_checkout",
  };
  db.users.push(user);
  addAudit(db, "user.auto_created_post_payment", "system", { userId: user.id, email }, barbershop.id);
  return { created: true, user, email, temporaryPassword };
}

async function stripeRequest(pathname, params) {
  if (!stripeSecretKey) {
    const error = new Error("stripe_not_configured");
    error.statusCode = 503;
    throw error;
  }
  const response = await fetch(`https://api.stripe.com/v1${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `stripe_failed_${response.status}`);
    error.statusCode = 502;
    error.stripe = payload?.error || {};
    throw error;
  }
  return payload;
}

async function createStripeCheckoutSession({ db, user = null, shopId = "", source = "public", signup = null }) {
  if (!stripeConfigured()) {
    const error = new Error("stripe_not_configured");
    error.statusCode = 503;
    throw error;
  }
  const shop = shopId ? db.barbershops.find((item) => item.id === shopId) : null;
  const defaultSuccessUrl = `${appUrl.replace(/\/$/, "")}/sucesso.html?session_id={CHECKOUT_SESSION_ID}`;
  const defaultCancelUrl = `${appUrl.replace(/\/$/, "")}/cadastro.html?billing=cancel`;
  const successUrl = !stripeSuccessUrl || stripeSuccessUrl.includes("/app.html?billing=success") ? defaultSuccessUrl : stripeSuccessUrl;
  const cancelUrl = !stripeCancelUrl || stripeCancelUrl.includes("/app.html?billing=cancel") ? defaultCancelUrl : stripeCancelUrl;
  const contactEmail = signup?.email || user?.email || shop?.ownerEmail || "";
  const params = {
    mode: "subscription",
    "line_items[0][price]": stripePriceId,
    "line_items[0][quantity]": "1",
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: "true",
    client_reference_id: shopId || "public",
    "metadata[source]": source,
    "metadata[billing_entity]": billingEntityName,
    "metadata[product_brand]": "Business Barber",
    "metadata[barbershop_id]": shopId || "",
    "metadata[barbershop_name]": shop?.name || signup?.barbershopName || "",
    "metadata[owner_name]": signup?.ownerName || shop?.ownerName || "",
    "metadata[email]": contactEmail,
    "metadata[whatsapp]": signup?.whatsapp || shop?.ownerWhatsapp || "",
    "metadata[city]": signup?.city || shop?.city || "",
    "metadata[team]": signup?.team || shop?.teamSize || "",
    "metadata[instagram]": signup?.instagram || shop?.instagram || "",
    "metadata[notes]": signup?.notes || shop?.onboardingNotes || "",
    "subscription_data[metadata][barbershop_id]": shopId || "",
    "subscription_data[metadata][source]": source,
    "subscription_data[metadata][billing_entity]": billingEntityName,
    "subscription_data[metadata][product_brand]": "Business Barber",
    "subscription_data[metadata][barbershop_name]": shop?.name || signup?.barbershopName || "",
    "subscription_data[metadata][owner_name]": signup?.ownerName || shop?.ownerName || "",
    "subscription_data[metadata][email]": contactEmail,
    "subscription_data[metadata][whatsapp]": signup?.whatsapp || shop?.ownerWhatsapp || "",
    "subscription_data[metadata][city]": signup?.city || shop?.city || "",
    "subscription_data[metadata][team]": signup?.team || shop?.teamSize || "",
    "subscription_data[metadata][instagram]": signup?.instagram || shop?.instagram || "",
    "subscription_data[metadata][notes]": signup?.notes || shop?.onboardingNotes || "",
  };
  if (contactEmail) params.customer_email = contactEmail;
  const session = await stripeRequest("/checkout/sessions", params);
  db.checkoutRequests.unshift({
    id: makeId("checkout"), at: new Date().toISOString(), source, shopId: shopId || null,
    sessionId: session.id, url: session.url, actor: contactEmail || user?.email || "public",
    barbershopName: shop?.name || signup?.barbershopName || "", status: "checkout_created",
  });
  db.checkoutRequests = db.checkoutRequests.slice(0, 100);
  return session;
}

async function createSignupCheckout(req, res) {
  if (isRateLimited(req, "signup-checkout", 20)) return sendJson(res, 429, { error: "rate_limited" });
  const body = await readBody(req);
  const barbershopName = sanitizeText(body.barbershopName || body.barbershop || body.name, 120);
  const ownerName = sanitizeText(body.ownerName || body.owner, 120);
  const email = sanitizeEmail(body.email);
  const whatsapp = normalizePhone(body.whatsapp || body.phone);
  const city = sanitizeText(body.city, 80);
  const team = Math.max(1, Number.parseInt(body.team || "1", 10) || 1);
  const instagram = sanitizeText(body.instagram || "", 80);
  const notes = sanitizeText(body.notes || "", 500);
  if (!validSignupWhatsapp(whatsapp)) {
    return sendJson(res, 400, { error: "whatsapp_invalido", message: "WhatsApp inválido. Informe DDD e número com 10 a 13 dígitos." });
  }
  if (!barbershopName || !ownerName || !validEmail(email)) {
    return sendJson(res, 400, { error: "invalid_signup", message: "Informe barbearia, responsável, email válido e WhatsApp com DDD." });
  }
  const db = await readDb();
  const now = new Date().toISOString();
  let shop = (db.barbershops || []).find((item) => String(item.ownerEmail || "").toLowerCase() === email && ["pending_payment", "lead"].includes(String(item.subscriptionStatus || item.billing?.status || "")));
  if (!shop) {
    shop = {
      id: makeId("shop"),
      name: barbershopName,
      slug: uniqueSlug(db, barbershopName),
      city,
      ownerName,
      ownerEmail: email,
      ownerWhatsapp: whatsapp,
      teamSize: team,
      instagram,
      onboardingNotes: notes,
      plan: "Piloto",
      monthlyPrice: 119.9,
      active: false,
      lifecycleStatus: "pending_payment",
      subscriptionStatus: "pending_payment",
      billing: { provider: "stripe", status: "pending_payment", source: "landing_signup" },
      openTime: "09:00",
      closeTime: "19:00",
      createdAt: now,
    };
    db.barbershops.push(shop);
  } else {
    Object.assign(shop, { name: barbershopName, city, ownerName, ownerEmail: email, ownerWhatsapp: whatsapp, teamSize: team, instagram, onboardingNotes: notes, updatedAt: now });
    shop.billing = { ...(shop.billing || {}), provider: "stripe", status: shop.billing?.status || "pending_payment", source: "landing_signup" };
  }
  db.prospects = Array.isArray(db.prospects) ? db.prospects : [];
  if (!db.prospects.some((prospect) => String(prospect.email || "").toLowerCase() === email && prospect.barbershopId === shop.id)) {
    db.prospects.unshift({ id: makeId("prospect"), barbershopId: shop.id, barbershop: barbershopName, owner: ownerName, email, whatsapp, city, team: 1, pain: "Cadastro iniciado pela landing", status: "Pagamento pendente", next: "Aguardar checkout Stripe", createdAt: now });
  }
  const session = await createStripeCheckoutSession({ db, shopId: shop.id, source: "landing_signup", signup: { barbershopName, ownerName, email, whatsapp, city, team, instagram, notes } });
  shop.billing = { ...(shop.billing || {}), checkoutSessionId: session.id, lastCheckoutAt: now, status: shop.billing?.status || "pending_payment" };
  recordMarketingEvent(db, "checkout_created", { shopId: shop.id, sessionId: session.id, source: "landing_signup", city, team, plan: "Piloto", value: 119.9 });
  addAudit(db, "billing.signup_checkout_created", email, { shopId: shop.id, sessionId: session.id }, shop.id);
  await writeDb(db);
  return sendJson(res, 201, { url: session.url, shopId: shop.id, sessionId: session.id });
}

function parseStripeSignature(header = "") {
  return Object.fromEntries(String(header).split(",").map((part) => part.split("=")).filter((item) => item.length === 2));
}

function verifyStripeSignature(rawBody, signatureHeader) {
  if (!stripeWebhookSecret) return false;
  const parts = parseStripeSignature(signatureHeader);
  const timestamp = parts.t;
  const expected = parts.v1;
  if (!timestamp || !expected) return false;
  const actual = createHmac("sha256", stripeWebhookSecret).update(`${timestamp}.${rawBody}`).digest("hex");
  return safeCompare(actual, expected);
}

function updateShopBillingFromStripe(db, event) {
  const obj = event?.data?.object || {};
  const meta = obj.metadata || obj.subscription_details?.metadata || obj.parent?.subscription_details?.metadata || {};
  const shopId = meta.barbershop_id || obj.client_reference_id || meta.barbershopId || "";
  let shop = shopId ? db.barbershops.find((item) => item.id === shopId) : null;
  if (!shop && obj.customer) shop = db.barbershops.find((item) => item.billing?.customerId === obj.customer);
  if (!shop) return { matched: false, shopId, shop: null };
  const now = new Date().toISOString();
  const subscriptionId = obj.subscription || obj.id || shop.billing?.subscriptionId || "";
  shop.billing = {
    ...(shop.billing || {}),
    provider: "stripe",
    lastEvent: event.type,
    lastEventAt: now,
    customerId: obj.customer || shop.billing?.customerId || "",
    subscriptionId,
    checkoutSessionId: obj.object === "checkout.session" ? obj.id : shop.billing?.checkoutSessionId || "",
    customerEmail: obj.customer_details?.email || obj.customer_email || meta.email || shop.billing?.customerEmail || shop.ownerEmail || "",
    currentPeriodEnd: obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : shop.billing?.currentPeriodEnd || "",
  };
  if (event.type === "checkout.session.completed") shop.billing.status = "active";
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") shop.billing.status = obj.status || shop.billing.status || "active";
  if (event.type === "customer.subscription.deleted") shop.billing.status = "canceled";
  if (event.type === "invoice.payment_succeeded") shop.billing.status = "active";
  if (event.type === "invoice.payment_failed") shop.billing.status = "past_due";
  shop.subscriptionStatus = shop.billing.status;
  shop.lifecycleStatus = shop.billing.status === "active" ? "active" : shop.lifecycleStatus || shop.billing.status;
  shop.active = shop.billing.status === "active" ? true : shop.active;
  if (meta.owner_name && !shop.ownerName) shop.ownerName = sanitizeText(meta.owner_name, 120);
  if (meta.email && !shop.ownerEmail) shop.ownerEmail = sanitizeEmail(meta.email);
  if (meta.whatsapp && !shop.ownerWhatsapp) shop.ownerWhatsapp = normalizePhone(meta.whatsapp);
  if (meta.city && !shop.city) shop.city = sanitizeText(meta.city, 80);
  if (meta.team && !shop.teamSize) shop.teamSize = Math.max(1, Number.parseInt(meta.team, 10) || 1);
  if (meta.instagram && !shop.instagram) shop.instagram = sanitizeText(meta.instagram, 80);
  if (meta.notes && !shop.onboardingNotes) shop.onboardingNotes = sanitizeText(meta.notes, 500);
  const prospect = (db.prospects || []).find((item) => item.barbershopId === shop.id || String(item.email || "").toLowerCase() === String(shop.ownerEmail || "").toLowerCase());
  if (prospect) {
    prospect.status = shop.billing.status === "active" ? "Piloto pago" : shop.billing.status || prospect.status;
    prospect.next = shop.billing.status === "active" ? "Fazer onboarding da barbearia" : prospect.next;
    prospect.updatedAt = now;
  }
  return { matched: true, shopId: shop.id, shop };
}

async function handleStripeWebhook(req, res) {
  const rawBuffer = await readRawBody(req);
  const rawBody = rawBuffer.toString("utf8");
  if (stripeWebhookSecret && !verifyStripeSignature(rawBody, req.headers["stripe-signature"] || "")) {
    return sendJson(res, 400, { error: "invalid_stripe_signature" });
  }
  let event;
  try { event = JSON.parse(rawBody); } catch { return sendJson(res, 400, { error: "invalid_stripe_payload" }); }
  const db = await readDb();
  const update = updateShopBillingFromStripe(db, event);
  if (event.type === "checkout.session.completed" && update.shop) {
    recordMarketingEvent(db, "purchase_confirmed", { shopId: update.shopId, sessionId: event?.data?.object?.id || "", plan: update.shop.plan || "Piloto", value: Number(update.shop.monthlyPrice || 119.9) });
    const accountResult = ensureOwnerUserAfterPayment(db, update.shop);
    const emailResult = await sendOnboardingEmail(update.shop, accountResult.created ? { email: accountResult.email, temporaryPassword: accountResult.temporaryPassword } : { email: update.shop.ownerEmail || update.shop.billing?.customerEmail || "" });
    addAudit(
      db,
      emailResult.ok ? "onboarding.email_sent" : `onboarding.email_${emailResult.status || "failed"}`,
      "system",
      { provider: "resend", skipped: Boolean(emailResult.skipped), error: emailResult.error || "", messageId: emailResult.id || "", accountCreated: Boolean(accountResult.created), accountReason: accountResult.reason || "" },
      update.shopId,
    );
  }
  db.stripeEvents.unshift({ id: event.id || makeId("stripeevt"), type: event.type, at: new Date().toISOString(), matched: update.matched, shopId: update.shopId || null });
  db.stripeEvents = db.stripeEvents.slice(0, 200);
  addAudit(db, "stripe.webhook_received", "stripe", { type: event.type, matched: update.matched, shopId: update.shopId || "" }, update.shopId || null);
  await writeDb(db);
  return sendJson(res, 200, { received: true });
}

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;
  if (pathname === "/api/health" && req.method === "GET") {
    return sendJson(res, 200, {
      status: "ok",
      uptime: process.uptime(),
      storage: storageProvider,
      databaseConnected: true,
      whatsappConfigured: Boolean(whatsappAccessToken && whatsappPhoneNumberId),
      stripeConfigured: stripeConfigured(),
      stripeMode: stripeModeLabel(),
      stripeProductionReady: stripeProductionReady(),
      emailConfigured: emailConfigured(),
      billingEntity: billingEntityName,
    });
  }
  if (pathname === "/api/webhooks/whatsapp") return handleWebhook(req, res, url);
  if (pathname === "/api/stripe/webhook") return handleStripeWebhook(req, res);
  if (pathname === "/api/marketing-event" && req.method === "POST") {
    if (isRateLimited(req, "marketing-event", 80)) return sendJson(res, 429, { error: "rate_limited" });
    const body = await readBody(req);
    const db = await readDb();
    recordMarketingEvent(db, sanitizeText(body.event, 80), {
      page: sanitizeText(body.page, 180),
      target: sanitizeText(body.target, 180),
      source: sanitizeText(body.source, 80),
      medium: sanitizeText(body.medium, 80),
      campaign: sanitizeText(body.campaign, 120),
      term: sanitizeText(body.term, 120),
      content: sanitizeText(body.content, 120),
      gclid: sanitizeText(body.gclid, 120),
      fbclid: sanitizeText(body.fbclid, 180),
      referrer: sanitizeText(body.referrer, 240),
      sessionId: sanitizeText(body.sessionId, 80),
    });
    await writeDb(db);
    return sendJson(res, 201, { ok: true });
  }
  if (pathname === "/api/billing/signup-checkout" && req.method === "POST") return createSignupCheckout(req, res);
  if (pathname === "/api/billing/checkout" && req.method === "GET") {
    const db = await readDb();
    try { const session = await createStripeCheckoutSession({ db, source: "landing" }); await writeDb(db); return sendRedirect(res, session.url); }
    catch (error) { console.error("Stripe checkout public error:", error.message, error.stripe || ""); return sendText(res, error.statusCode || 500, "Stripe checkout indisponível. Confira as variáveis STRIPE_SECRET_KEY e STRIPE_PRICE_ID."); }
  }
  if (pathname === "/api/auth/forgot-password" && req.method === "POST") {
    if (isRateLimited(req, "forgot-password", 5)) return sendJson(res, 429, { error: "too_many_attempts" });
    const body = await readBody(req);
    const email = sanitizeEmail(body.email);
    const db = await readDb();
    const user = (db.users || []).find((item) => String(item.email || "").toLowerCase() === email && item.active !== false);
    if (user) {
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      db.passwordResets = [{ token, userId: user.id, expiresAt, usedAt: "", createdAt: new Date().toISOString() }, ...(db.passwordResets || []).filter((item) => item.userId !== user.id && Date.parse(item.expiresAt || "") > Date.now())].slice(0, 200);
      const resetLink = `${appUrl.replace(/\/$/, "")}/app.html?reset_token=${encodeURIComponent(token)}`;
      const emailResult = await sendPasswordResetEmail(user, resetLink);
      addAudit(db, emailResult.ok ? "auth.password_reset_email_sent" : "auth.password_reset_email_failed", email || "unknown", { error: emailResult.error || "", skipped: Boolean(emailResult.skipped) }, user.barbershopId || null);
      await writeDb(db);
    }
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/auth/reset-password" && req.method === "POST") {
    if (isRateLimited(req, "reset-password", 8)) return sendJson(res, 429, { error: "too_many_attempts" });
    const body = await readBody(req);
    const token = sanitizeText(body.token, 120);
    const newPassword = String(body.newPassword || body.password || "");
    if (!token || newPassword.length < 10) return sendJson(res, 400, { error: "invalid_reset" });
    const db = await readDb();
    const reset = (db.passwordResets || []).find((item) => item.token === token && !item.usedAt);
    if (!reset || Date.parse(reset.expiresAt || "") <= Date.now()) return sendJson(res, 400, { error: "invalid_or_expired_token" });
    const user = (db.users || []).find((item) => item.id === reset.userId && item.active !== false);
    if (!user) return sendJson(res, 400, { error: "invalid_or_expired_token" });
    user.passwordHash = hashPassword(newPassword);
    user.mustChangePassword = false;
    user.forcePasswordChange = false;
    user.passwordChangedAt = new Date().toISOString();
    reset.usedAt = new Date().toISOString();
    addAudit(db, "auth.password_reset_completed", user.email, {}, user.barbershopId || null);
    await writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname.startsWith("/api/public/") && isRateLimited(req, "public", 25)) return sendJson(res, 429, { error: "rate_limited" });
  if (pathname === "/api/login" && isRateLimited(req, "login", 10)) return sendJson(res, 429, { error: "too_many_attempts" });
  const db = await readDb();
  sessionCleanupCounter += 1;
  if (sessionCleanupCounter % 25 === 0 && cleanupExpiredSessions(db)) await writeDb(db);

  if (pathname === "/api/login" && req.method === "POST") {
    const body = await readBody(req);
    const email = sanitizeText(body.email, 180).toLowerCase();
    const user = db.users.find((item) => String(item.email).toLowerCase() === email && item.active !== false);
    if (!user || !verifyPassword(body.password || "", user.passwordHash)) {
      addAudit(db, "auth.login_failed", email || "unknown", {}, user?.barbershopId || null); await writeDb(db);
      return sendJson(res, 401, { error: "invalid_credentials" });
    }
    if (String(user.passwordHash).startsWith("sha256:")) user.passwordHash = hashPassword(body.password);
    const session = createSession(db, user);
    addAudit(db, "auth.login_success", email, {}, user.barbershopId || null); await writeDb(db);
    return sendJson(res, 200, session);
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
    if (scope(db.appointments, shop.id).some((item) => appointmentConflicts(item, appointment))) {
      const alternatives = publicAvailableAlternatives(db, shop, { date, barber: appointment.barber, time });
      return sendJson(res, 409, { error: "slot_unavailable", alternatives });
    }
    db.appointments.push(appointment); addAudit(db, "public_booking.requested", "public", { appointmentId: appointment.id }, shop.id); await writeDb(db);
    return sendJson(res, 201, { id: appointment.id, status: appointment.status, message: "Solicitação enviada. Aguarde confirmação pelo WhatsApp." });
  }

  const user = requireAuth(req, res, db); if (!user) return;
  const shopId = shopIdFor(user, db);
  const actor = user.email;

  if (pathname === "/api/logout" && req.method === "POST") {
    const token = String(req.headers.authorization || "").startsWith("Bearer ") ? String(req.headers.authorization).slice(7) : "";
    if (token) {
      sessions.delete(token);
      db.sessions = (db.sessions || []).filter((session) => session.token !== token);
      await writeDb(db);
    }
    return sendJson(res, 200, { ok: true });
  }
  if (pathname === "/api/me" && req.method === "GET") return sendJson(res, 200, { user: publicUser(user), currentBarbershopId: shopId });
  if (pathname === "/api/auth/change-password" && req.method === "POST") {
    const body = await readBody(req);
    const nextPassword = String(body.password || "");
    if (nextPassword.length < 10) return sendJson(res, 400, { error: "password_min_10" });
    user.passwordHash = hashPassword(nextPassword);
    user.mustChangePassword = false;
    user.forcePasswordChange = false;
    user.passwordChangedAt = new Date().toISOString();
    addAudit(db, "auth.password_changed", actor, { forced: Boolean(body.forced) }, shopId);
    await writeDb(db);
    return sendJson(res, 200, { ok: true, user: publicUser(user) });
  }
  if (user.forcePasswordChange) {
    return sendJson(res, 428, { error: "password_change_required", user: publicUser(user) });
  }
  if (pathname === "/api/billing/create-checkout-session" && req.method === "POST") {
    if (isBarber(user)) return sendJson(res, 403, { error: "owner_required" });
    try { const session = await createStripeCheckoutSession({ db, user, shopId, source: "app" }); await writeDb(db); return sendJson(res, 200, { url: session.url, id: session.id }); }
    catch (error) { console.error("Stripe checkout error:", error.message, error.stripe || ""); return sendJson(res, error.statusCode || 500, { error: "stripe_checkout_failed", message: error.message }); }
  }
  if (pathname === "/api/billing/create-portal-session" && req.method === "POST") {
    if (isBarber(user)) return sendJson(res, 403, { error: "owner_required" });
    const shop = db.barbershops.find((item) => item.id === shopId);
    if (!shop?.billing?.customerId) return sendJson(res, 409, { error: "stripe_customer_not_found" });
    try { const portal = await stripeRequest("/billing_portal/sessions", { customer: shop.billing.customerId, return_url: `${appUrl.replace(/\/$/, "")}/app.html?billing=portal` }); return sendJson(res, 200, { url: portal.url }); }
    catch (error) { return sendJson(res, error.statusCode || 500, { error: "stripe_portal_failed", message: error.message }); }
  }
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
    const body = await readBody(req); const shop = { id: body.id || makeId("shop"), name: sanitizeText(body.name), slug: sanitizeText(body.slug || body.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""), city: sanitizeText(body.city), plan: body.plan || "Piloto", monthlyPrice: Number(body.monthlyPrice || 119.9), active: true, openTime: body.openTime || "09:00", closeTime: body.closeTime || "19:00" };
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

  if (pathname === "/api/slot-invites/send" && req.method === "POST") {
    if (isBarber(user)) return sendJson(res, 403, { error: "manager_required" });
    const body = await readBody(req);
    const result = await createAndSendSlotInvite(db, shopId, { appointmentId: sanitizeText(body.appointmentId, 80), clientId: sanitizeText(body.clientId, 80), actor });
    await writeDb(db);
    return result.ok ? sendJson(res, 201, result) : sendJson(res, 422, result);
  }
  if (pathname === "/api/slot-invites/auto-run" && req.method === "POST") {
    if (isBarber(user)) return sendJson(res, 403, { error: "manager_required" });
    const body = await readBody(req);
    const limit = Math.max(1, Math.min(5, Number(body.limit || 3)));
    const openSlots = scope(db.appointments, shopId)
      .filter((appointment) => appointment.open)
      .sort((a, b) => `${appointmentDate(a)} ${a.time || ""}`.localeCompare(`${appointmentDate(b)} ${b.time || ""}`))
      .slice(0, limit);
    const results = [];
    for (const appointment of openSlots) {
      const alreadyInvited = scope(db.messageHistory, shopId).some((message) => message.type === "slot_invite" && message.appointmentId === appointment.id && !["Sem resposta", "Recusado", "Horário indisponível", "Falha no envio"].includes(message.status));
      if (alreadyInvited) continue;
      results.push(await createAndSendSlotInvite(db, shopId, { appointmentId: appointment.id, actor }));
    }
    addAudit(db, "slot_invite.auto_run", actor, { attempted: openSlots.length, sent: results.filter((item) => item.ok).length }, shopId);
    await writeDb(db);
    return sendJson(res, 200, { ok: true, attempted: openSlots.length, sent: results.filter((item) => item.ok).length, results });
  }
  if (pathname === "/api/appointments/reminders/auto-run" && req.method === "POST") {
    if (isBarber(user)) return sendJson(res, 403, { error: "manager_required" });
    const body = await readBody(req);
    const limit = Math.max(1, Math.min(20, Number(body.limit || 10)));
    const windowMinutes = Math.max(15, Math.min(24 * 60, Number(body.windowMinutes || 180)));
    const appointments = reminderCandidates(db, shopId, windowMinutes, limit);
    const results = [];
    for (const appointment of appointments) {
      results.push(await createAndSendAppointmentReminder(db, shopId, appointment, actor));
    }
    addAudit(db, "appointment_reminder.auto_run", actor, { attempted: appointments.length, sent: results.filter((item) => item.ok).length, windowMinutes }, shopId);
    await writeDb(db);
    return sendJson(res, 200, { ok: true, attempted: appointments.length, sent: results.filter((item) => item.ok).length, results });
  }

  if (pathname === "/api/integrations" && req.method === "GET") return sendJson(res, 200, integrationFor(db, shopId));
  if (pathname === "/api/integrations/whatsapp/embedded-config" && req.method === "GET") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "owner_required" });
    return sendJson(res, 200, embeddedSignupPublicConfig());
  }
  if (pathname === "/api/integrations/whatsapp/healthcheck" && req.method === "GET") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "owner_required" });
    if (isRateLimited(req, "whatsapp-healthcheck", 20)) return sendJson(res, 429, { error: "rate_limited" });
    return sendJson(res, 200, await whatsappHealthcheck(db, shopId));
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
        slotInviteTemplate: previous.slotInviteTemplate || whatsappSlotInviteTemplate,
        reminderTemplate: previous.reminderTemplate || whatsappReminderTemplate,
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
        slotInviteTemplate: sanitizeText(incomingWhatsapp.slotInviteTemplate || currentPrivate.slotInviteTemplate || currentPublic.whatsapp.slotInviteTemplate || whatsappSlotInviteTemplate),
        reminderTemplate: sanitizeText(incomingWhatsapp.reminderTemplate || currentPrivate.reminderTemplate || currentPublic.whatsapp.reminderTemplate || whatsappReminderTemplate),
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
