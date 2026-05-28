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
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'",
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
function replaceTenantCollection(db, name, shopId, items) {
  db[name] = [...(db[name] || []).filter((item) => !sameTenant(item, shopId)), ...(items || []).map((item) => withTenant(item, shopId))];
}

function integrationFor(db, shopId) {
  const fallback = db.integrations || {};
  const source = (db.integrationsByShop || {})[shopId] || fallback;
  return {
    whatsapp: {
      provider: "whatsapp_cloud_api",
      mode: whatsappMode,
      defaultTemplate: whatsappDefaultTemplate,
      templateLanguage: whatsappTemplateLanguage,
      status: whatsappAccessToken && whatsappPhoneNumberId ? "pronto_para_teste" : "aguardando_credenciais",
      tokenConfigured: Boolean(whatsappAccessToken),
      phoneNumberIdConfigured: Boolean(whatsappPhoneNumberId),
      ...(source.whatsapp || {}),
      tokenConfigured: Boolean(whatsappAccessToken),
      phoneNumberIdConfigured: Boolean(whatsappPhoneNumberId),
    },
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

async function readSupabaseState() {
  assertSupabaseConfigured();
  const response = await fetch(`${supabaseUrl}/rest/v1/bb_app_state?id=eq.${encodeURIComponent(supabaseStateId)}&select=payload`, {
    headers: { apikey: supabaseSecret, Authorization: `Bearer ${supabaseSecret}` },
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
    headers: {
      apikey: supabaseSecret,
      Authorization: `Bearer ${supabaseSecret}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
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

function customerState(db, user) {
  const shopId = shopIdFor(user, db);
  const shop = db.barbershops.find((item) => item.id === shopId);
  const campaigns = scope(db.campaigns, shopId);
  const appointments = scope(db.appointments, shopId);
  const recoveredRevenue = campaigns.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
  return {
    user: publicUser(user), currentBarbershopId: shopId, barbershops: shop ? [shop] : [],
    users: scope(db.users, shopId).map(publicUser), clients: scope(db.clients, shopId), professionals: scope(db.professionals, shopId), services: scope(db.services, shopId),
    campaigns, inactiveClients: scope(db.inactiveClients, shopId), appointments, waitlist: scope(db.waitlist, shopId), clubPlans: scope(db.clubPlans, shopId), messageHistory: scope(db.messageHistory, shopId), pixCharges: scope(db.pixCharges, shopId),
    recoveredRevenue, openSlots: appointments.filter((item) => item.open).length,
    integrations: integrationFor(db, shopId),
    publicBooking: db.publicBookingByShop[shopId] || { enabled: true, slug: shop?.slug || "", depositRequired: false, headline: `Agende seu horário na ${shop?.name || "barbearia"}` },
    onboardingChecklist: db.onboardingByShop[shopId] || [],
    auditLogs: (db.auditLogs || []).filter((log) => !log.barbershopId || log.barbershopId === shopId).slice(0, 100),
  };
}

function adminState(db) {
  return { ...db, users: db.users.map(publicUser), integrations: undefined };
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

async function sendWhatsAppTemplate({ to, templateName, language = whatsappTemplateLanguage, variables = [] }) {
  if (whatsappMode !== "production" || !whatsappAccessToken || !whatsappPhoneNumberId) return { simulated: true, status: "sandbox", messageId: null };
  const components = variables.length ? [{ type: "body", parameters: variables.map((text) => ({ type: "text", text: String(text) })) }] : undefined;
  const payload = { messaging_product: "whatsapp", to: normalizePhone(to), type: "template", template: { name: templateName || whatsappDefaultTemplate, language: { code: language }, ...(components ? { components } : {}) } };
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${whatsappPhoneNumberId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${whatsappAccessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error("whatsapp_send_failed"); error.details = result; throw error; }
  return { simulated: false, status: "sent", messageId: result.messages?.[0]?.id || null };
}

function verifyWhatsAppSignature(req, rawBody) {
  if (!whatsappAppSecret) return true;
  const signature = String(req.headers["x-hub-signature-256"] || "");
  const expected = `sha256=${createHmac("sha256", whatsappAppSecret).update(rawBody).digest("hex")}`;
  return safeCompare(signature, expected);
}

async function handleWebhook(req, res, url) {
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && whatsappVerifyToken && safeCompare(token || "", whatsappVerifyToken)) return sendText(res, 200, challenge || "");
    return sendText(res, 403, "Verification failed");
  }
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (!verifyWhatsAppSignature(req, rawBody)) return sendJson(res, 401, { error: "invalid_signature" });
  const body = JSON.parse(rawBody || "{}");
  const db = await readDb();
  addAudit(db, "whatsapp.webhook_received", "meta", { entries: Array.isArray(body.entry) ? body.entry.length : 0 }, null);
  await writeDb(db);
  return sendJson(res, 200, { received: true });
}

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;
  if (pathname === "/api/webhooks/whatsapp") return handleWebhook(req, res, url);
  if (pathname === "/api/health") return sendJson(res, 200, { ok: true, storage: storageProvider, whatsappConfigured: Boolean(whatsappAccessToken && whatsappPhoneNumberId) });
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

  if (pathname === "/api/clients" && req.method === "GET") return sendJson(res, 200, scope(db.clients, shopId));
  if (pathname === "/api/clients" && req.method === "POST") {
    const body = await readBody(req); const client = withTenant({ id: makeId("client"), name: sanitizeText(body.name), phone: normalizePhone(body.phone), lastVisit: body.lastVisit || "", favoriteService: sanitizeText(body.favoriteService), preferredPeriod: sanitizeText(body.preferredPeriod), ticket: Number(body.ticket || 0), professional: sanitizeText(body.professional), status: body.status || "Ativo", consentWhatsapp: Boolean(body.consentWhatsapp), createdAt: new Date().toISOString() }, shopId);
    db.clients.push(client); addAudit(db, "client.created", actor, { id: client.id }, shopId); await writeDb(db); return sendJson(res, 201, client);
  }
  if (pathname.startsWith("/api/clients/") && pathname.endsWith("/export") && req.method === "GET") {
    const id = pathname.split("/").at(-2); const client = scope(db.clients, shopId).find((item) => item.id === id); if (!client) return sendJson(res, 404, { error: "client_not_found" });
    return sendJson(res, 200, { client, appointments: scope(db.appointments, shopId).filter((item) => item.client === client.name), campaigns: scope(db.campaigns, shopId).filter((item) => (item.recipients || []).includes(client.name)) });
  }
  if (pathname.startsWith("/api/clients/") && req.method === "PUT") {
    const id = pathname.split("/").pop(); const client = scope(db.clients, shopId).find((item) => item.id === id); if (!client) return sendJson(res, 404, { error: "client_not_found" }); const body = await readBody(req);
    db.clients = db.clients.map((item) => item.id === id ? { ...item, ...body, id, barbershopId: shopId, phone: body.phone !== undefined ? normalizePhone(body.phone) : item.phone } : item); addAudit(db, "client.updated", actor, { id }, shopId); await writeDb(db); return sendJson(res, 200, db.clients.find((item) => item.id === id));
  }
  if (pathname.startsWith("/api/clients/") && req.method === "DELETE") {
    const id = pathname.split("/").pop(); const client = scope(db.clients, shopId).find((item) => item.id === id); if (!client) return sendJson(res, 404, { error: "client_not_found" });
    db.clients = db.clients.filter((item) => item.id !== id); db.appointments = db.appointments.map((item) => sameTenant(item, shopId) && item.client === client.name ? { ...item, client: "Cliente removido", phone: "" } : item); addAudit(db, "client.deleted_lgpd", actor, { id }, shopId); await writeDb(db); return sendJson(res, 200, { ok: true });
  }
  if (pathname === "/api/import/clients" && req.method === "POST") {
    const body = await readBody(req); const imported = parseClientCsv(body.csv, shopId); db.clients.push(...imported); addAudit(db, "client.imported", actor, { imported: imported.length, consentRequired: true }, shopId); await writeDb(db); return sendJson(res, 200, { imported: imported.length, clients: scope(db.clients, shopId) });
  }

  if (pathname === "/api/appointments" && req.method === "GET") return sendJson(res, 200, scope(db.appointments, shopId));
  if (pathname === "/api/appointments" && req.method === "POST") {
    const body = await readBody(req); const appointment = withTenant({ id: makeId("appt"), status: body.status || "Confirmado", ...body }, shopId); if (scope(db.appointments, shopId).some((item) => appointmentConflicts(item, appointment))) return sendJson(res, 409, { error: "slot_unavailable" }); db.appointments.push(appointment); addAudit(db, "appointment.created", actor, { id: appointment.id }, shopId); await writeDb(db); return sendJson(res, 201, appointment);
  }
  if (pathname.startsWith("/api/appointments/") && req.method === "PUT") {
    const id = pathname.split("/").pop(); const target = scope(db.appointments, shopId).find((item, idx) => (item.id || `legacy-${idx}`) === id); if (!target) return sendJson(res, 404, { error: "appointment_not_found" }); const body = await readBody(req); const next = { ...target, ...body, id, barbershopId: shopId }; if (scope(db.appointments, shopId).some((item) => item.id !== id && appointmentConflicts(item, next))) return sendJson(res, 409, { error: "slot_unavailable" }); db.appointments = db.appointments.map((item) => item.id === id ? next : item); addAudit(db, "appointment.updated", actor, { id }, shopId); await writeDb(db); return sendJson(res, 200, next);
  }
  if (pathname.startsWith("/api/appointments/") && req.method === "DELETE") { const id = pathname.split("/").pop(); db.appointments = db.appointments.filter((item) => !(sameTenant(item, shopId) && item.id === id)); addAudit(db, "appointment.deleted", actor, { id }, shopId); await writeDb(db); return sendJson(res, 200, { ok: true }); }

  if (pathname === "/api/campaigns" && req.method === "GET") return sendJson(res, 200, scope(db.campaigns, shopId));
  if (pathname === "/api/campaigns" && req.method === "POST") { const body = await readBody(req); const campaign = withTenant({ id: makeId("camp"), status: "Rascunho", createdAt: new Date().toISOString().slice(0, 10), sent: 0, responses: 0, bookings: 0, revenue: 0, ...body }, shopId); db.campaigns.unshift(campaign); addAudit(db, "campaign.created", actor, { id: campaign.id }, shopId); await writeDb(db); return sendJson(res, 201, campaign); }
  if (pathname.startsWith("/api/campaigns/") && req.method === "PUT") { const id = pathname.split("/").pop(); const found = scope(db.campaigns, shopId).find((item) => item.id === id); if (!found) return sendJson(res, 404, { error: "campaign_not_found" }); const body = await readBody(req); const next = { ...found, ...body, id, barbershopId: shopId }; db.campaigns = db.campaigns.map((item) => item.id === id ? next : item); addAudit(db, "campaign.updated", actor, { id }, shopId); await writeDb(db); return sendJson(res, 200, next); }
  if (pathname.startsWith("/api/campaigns/") && req.method === "DELETE") { const id = pathname.split("/").pop(); db.campaigns = db.campaigns.filter((item) => !(sameTenant(item, shopId) && item.id === id)); addAudit(db, "campaign.deleted", actor, { id }, shopId); await writeDb(db); return sendJson(res, 200, { ok: true }); }

  if (pathname === "/api/integrations" && req.method === "GET") return sendJson(res, 200, integrationFor(db, shopId));
  if (pathname === "/api/integrations" && req.method === "PUT") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "owner_required" });
    const body = await readBody(req); const current = integrationFor(db, shopId);
    db.integrationsByShop[shopId] = { whatsapp: { ...current.whatsapp, provider: "whatsapp_cloud_api", defaultTemplate: sanitizeText(body.whatsapp?.defaultTemplate || current.whatsapp.defaultTemplate), templateLanguage: body.whatsapp?.templateLanguage || current.whatsapp.templateLanguage }, pix: { ...current.pix, provider: body.pix?.provider || current.pix.provider, mode: body.pix?.mode || current.pix.mode, key: sanitizeText(body.pix?.key || current.pix.key, 120), depositAmount: Number(body.pix?.depositAmount || current.pix.depositAmount) } };
    addAudit(db, "integration.updated", actor, { whatsapp: true, pix: true }, shopId); await writeDb(db); return sendJson(res, 200, integrationFor(db, shopId));
  }
  if (pathname === "/api/integrations/whatsapp/test" && req.method === "POST") {
    if (!canManageSettings(user)) return sendJson(res, 403, { error: "owner_required" }); const body = await readBody(req); if (!validPhone(body.to)) return sendJson(res, 400, { error: "valid_phone_required" });
    try { const result = await sendWhatsAppTemplate({ to: body.to, templateName: integrationFor(db, shopId).whatsapp.defaultTemplate, variables: [sanitizeText(body.name || "Cliente")] }); db.integrationsByShop[shopId] = { ...integrationFor(db, shopId), whatsapp: { ...integrationFor(db, shopId).whatsapp, status: result.simulated ? "sandbox_pronto" : "mensagem_enviada", lastTestAt: new Date().toISOString() } }; addAudit(db, "integration.whatsapp_tested", actor, { simulated: result.simulated, messageId: result.messageId }, shopId); await writeDb(db); return sendJson(res, 200, { ok: true, simulated: result.simulated, message: result.simulated ? "Estrutura pronta. Configure as credenciais Meta no Render para enviar de verdade." : "Mensagem enviada pela WhatsApp Cloud API." }); } catch (error) { return sendJson(res, 502, { error: "whatsapp_send_failed", message: "A Meta recusou o envio. Verifique token, número e template aprovado." }); }
  }
  if (pathname === "/api/whatsapp/send-template" && req.method === "POST") {
    const body = await readBody(req); const client = scope(db.clients, shopId).find((item) => item.id === body.clientId); if (!client) return sendJson(res, 404, { error: "client_not_found" }); if (!client.consentWhatsapp) return sendJson(res, 409, { error: "whatsapp_consent_required" });
    try { const result = await sendWhatsAppTemplate({ to: client.phone, templateName: body.templateName || whatsappDefaultTemplate, variables: Array.isArray(body.variables) ? body.variables : [client.name] }); db.messageHistory.push(withTenant({ id: makeId("msg"), clientId: client.id, client: client.name, status: result.simulated ? "simulado" : "enviado", providerMessageId: result.messageId, at: new Date().toISOString() }, shopId)); addAudit(db, "whatsapp.template_sent", actor, { clientId: client.id, simulated: result.simulated }, shopId); await writeDb(db); return sendJson(res, 200, result); } catch { return sendJson(res, 502, { error: "whatsapp_send_failed" }); }
  }
  if (pathname === "/api/integrations/pix/test" && req.method === "POST") return sendJson(res, 200, { ok: true, simulated: true, message: "Pix permanece em modo manual até configurar um provedor homologado." });
  if (pathname === "/api/audit-logs" && req.method === "GET") return sendJson(res, 200, isPlatformAdmin(user) ? db.auditLogs : db.auditLogs.filter((log) => log.barbershopId === shopId));
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
