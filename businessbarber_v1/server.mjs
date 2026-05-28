import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "db.json");
const port = Number(process.env.PORT || 4187);
const maxBodyBytes = 1024 * 1024;
const sessions = new Map();
const rateLimits = new Map();

const defaultData = {
  user: {
    id: "user-demo",
    name: "Dono Demo",
    email: "demo@businessbarber.local",
    role: "owner",
    barbershopId: "shop-alpha",
  },
  currentBarbershopId: "shop-alpha",
  barbershops: [
    {
      id: "shop-alpha",
      name: "Barbearia Alpha",
      slug: "barbearia-alpha",
      city: "Cuiaba",
      plan: "Profissional",
      monthlyPrice: 197,
      setupPrice: 497,
      openTime: "09:00",
      closeTime: "19:00",
      active: true,
    },
  ],
  users: [
    {
      id: "user-demo",
      name: "Dono Demo",
      email: "demo@businessbarber.local",
      role: "owner",
      barbershopId: "shop-alpha",
      active: true,
      passwordHash: hashPassword("demo123"),
    },
    {
      id: "user-platform-admin", name: "Administrador Business Barber", email: "admin@businessbarber.local", role: "platform_admin", barbershopId: null, active: true,
      passwordHash: hashPassword("TrocarAgora#BB2026"),
    },
  ],
  recoveredRevenue: 2430,
  openSlots: 4,
  clients: [
    {
      id: "client-lucas",
      name: "Lucas Andrade",
      phone: "559999900001",
      lastVisit: "2026-04-02",
      favoriteService: "Corte",
      preferredPeriod: "Tarde",
      ticket: 85,
      professional: "Diego",
      status: "Inativo",
    },
    {
      id: "client-marcos",
      name: "Marcos Paulo",
      phone: "559999900002",
      lastVisit: "2026-03-17",
      favoriteService: "Corte + barba",
      preferredPeriod: "Noite",
      ticket: 110,
      professional: "Rafa",
      status: "Inativo",
    },
    {
      id: "client-bruno",
      name: "Bruno Vieira",
      phone: "559999900003",
      lastVisit: "2026-02-23",
      favoriteService: "Corte + barba",
      preferredPeriod: "Tarde",
      ticket: 130,
      professional: "Caio",
      status: "Inativo",
    },
  ],
  professionals: [
    { id: "pro-rafa", name: "Rafa", commission: 45, active: true },
    { id: "pro-diego", name: "Diego", commission: 45, active: true },
    { id: "pro-caio", name: "Caio", commission: 40, active: true },
  ],
  services: [
    { id: "svc-corte", name: "Corte", price: 70, duration: 45 },
    { id: "svc-barba", name: "Barba", price: 45, duration: 30 },
    { id: "svc-combo", name: "Corte + barba", price: 110, duration: 75 },
  ],
  integrations: {
    whatsapp: {
      provider: "whatsapp_cloud_api",
      mode: "sandbox",
      phoneNumberId: "",
      tokenConfigured: false,
      defaultTemplate: "retorno_cliente_sumido",
      status: "simulado",
      lastTestAt: "",
    },
    pix: {
      provider: "manual_pix",
      mode: "sandbox",
      key: "",
      depositAmount: 15,
      status: "simulado",
      lastTestAt: "",
    },
  },
  publicBooking: {
    enabled: true,
    slug: "barbearia-alpha",
    depositRequired: true,
    headline: "Agende seu corte sem perder horário",
  },
  onboardingChecklist: [
    { id: "clients", label: "Importar clientes", done: true },
    { id: "services", label: "Configurar serviços", done: true },
    { id: "professionals", label: "Cadastrar equipe", done: true },
    { id: "integrations", label: "Testár WhatsApp e Pix", done: false },
    { id: "campaign", label: "Rodar primeira campanha", done: true },
  ],
  auditLogs: [],
  prospects: [
    {
      barbershop: "Barbearia Alpha",
      owner: "Rafael",
      team: 4,
      pain: "3 horários vagos por semana",
      status: "Contato inicial",
      next: "Enviar demo",
    },
    {
      barbershop: "Studio Corte Fino",
      owner: "Diego",
      team: 6,
      pain: "clientes somem depois do primeiro corte",
      status: "Demo marcada",
      next: "Mostrar protótipo",
    },
    {
      barbershop: "Navalha Club",
      owner: "Caio",
      team: 3,
      pain: "cancelamento em cima da hora",
      status: "Piloto proposto",
      next: "Fechar R$ 197/mês",
    },
  ],
  campaigns: [
    {
      id: "camp-retorno-45",
      name: "Retorno 45+ dias",
      segment: "Sumidos há 45 dias",
      sent: 12,
      responses: 5,
      bookings: 3,
      revenue: 255,
      status: "Enviada",
      createdAt: "2026-05-24",
    },
  ],
  inactiveClients: [
    { name: "Lucas Andrade", lastVisit: 52, value: 85, intent: "Alta", selected: false },
    { name: "Marcos Paulo", lastVisit: 68, value: 110, intent: "Alta", selected: false },
    { name: "Tiago Ramos", lastVisit: 45, value: 70, intent: "Média", selected: false },
    { name: "Bruno Vieira", lastVisit: 91, value: 130, intent: "Alta", selected: false },
    { name: "Henrique Costa", lastVisit: 39, value: 55, intent: "Baixa", selected: false },
  ],
  appointments: [
    { time: "09:00", barber: "Rafa", client: "André Lima", service: "Corte degradê", status: "Confirmado" },
    { time: "10:00", barber: "Diego", client: "Vago", service: "Corte ou barba", status: "Aberto", open: true },
    { time: "11:30", barber: "Caio", client: "Felipe Souza", service: "Corte + barba", status: "Sinal Pix" },
    { time: "14:00", barber: "Rafa", client: "Vago", service: "Corte rápido", status: "Aberto", open: true },
    { time: "15:30", barber: "Caio", client: "Ronaldo Reis", service: "Barba", status: "Confirmado" },
    { time: "16:30", barber: "Diego", client: "Vago", service: "Corte + barba", status: "Aberto", open: true },
    { time: "18:00", barber: "Rafa", client: "Mateus Nunes", service: "Corte", status: "Confirmado" },
  ],
  waitlist: [
    { period: "Manhã", people: 8, best: "Lucas Andrade", chance: "82%" },
    { period: "Almoço", people: 5, best: "João Pedro", chance: "71%" },
    { period: "Tarde", people: 11, best: "Bruno Vieira", chance: "88%" },
    { period: "Noite", people: 7, best: "Marcos Paulo", chance: "76%" },
  ],
  clubPlans: [
    { name: "Corte em dia", price: 89, perk: "2 cortes por mês", subscribers: 14 },
    { name: "Corte + barba", price: 129, perk: "2 cortes e 1 barba", subscribers: 9 },
    { name: "Prioridade", price: 149, perk: "agenda prioritária + desconto", subscribers: 5 },
  ],
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
};

function hashPassword(password) {
  return `sha256:${createHash("sha256").update(String(password)).digest("hex")}`;
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function publicState(db) {
  return {
    ...db,
    users: (db.users || []).map(publicUser),
  };
}

function mergeDbData(data) {
  const source = data && typeof data === "object"  ?data : {};
  return {
    ...defaultData,
    ...source,
    user: { ...defaultData.user, ...(source.user || {}) },
    currentBarbershopId: source.currentBarbershopId || defaultData.currentBarbershopId,
    barbershops: Array.isArray(source.barbershops) && source.barbershops.length  ?source.barbershops : defaultData.barbershops,
    users:
      Array.isArray(source.users) && source.users.length
         ?source.users.map((user) => ({
            ...user,
            passwordHash: user.passwordHash || hashPassword("demo123"),
          }))
        : defaultData.users,
    clients: Array.isArray(source.clients)  ?source.clients : defaultData.clients,
    professionals: Array.isArray(source.professionals)  ?source.professionals : defaultData.professionals,
    services: Array.isArray(source.services)  ?source.services : defaultData.services,
    prospects: Array.isArray(source.prospects)  ?source.prospects : defaultData.prospects,
    campaigns: Array.isArray(source.campaigns)  ?source.campaigns : defaultData.campaigns,
    inactiveClients: Array.isArray(source.inactiveClients)  ?source.inactiveClients : defaultData.inactiveClients,
    appointments: Array.isArray(source.appointments)  ?source.appointments : defaultData.appointments,
    waitlist: Array.isArray(source.waitlist)  ?source.waitlist : defaultData.waitlist,
    clubPlans: Array.isArray(source.clubPlans)  ?source.clubPlans : defaultData.clubPlans,
    integrations: {
      ...defaultData.integrations,
      ...(source.integrations || {}),
      whatsapp: {
        ...defaultData.integrations.whatsapp,
        ...((source.integrations || {}).whatsapp || {}),
      },
      pix: {
        ...defaultData.integrations.pix,
        ...((source.integrations || {}).pix || {}),
      },
    },
    publicBooking: { ...defaultData.publicBooking, ...(source.publicBooking || {}) },
    onboardingChecklist: Array.isArray(source.onboardingChecklist)
       ?source.onboardingChecklist
      : defaultData.onboardingChecklist,
    auditLogs: Array.isArray(source.auditLogs)  ?source.auditLogs.slice(0, 200) : [],
  };
}

function securityHeaders(extra = {}) {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'self'",
    ...extra,
  };
}

function addAudit(db, action, actor = "system", metadata = {}) {
  db.auditLogs = [
    {
      id: makeId("audit"),
      at: new Date().toISOString(),
      actor,
      action,
      metadata,
    },
    ...(db.auditLogs || []),
  ].slice(0, 200);
}

function getSessionUser(req, db) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) return null;
  return (db.users || []).find((item) => item.id === session.userId && item.active !== false) || null;
}
function getActor(req, db) { return getSessionUser(req, db)?.email || "anonymous"; }
function requireAuth(req, res, db) { const user = getSessionUser(req, db); if (!user) { sendJson(res, 401, { error: "authentication_required" }); return null; } return user; }
function isPlatformAdmin(user) { return user?.role === "platform_admin"; }
function customerState(db, user) {
  const safe = publicState(db); delete safe.prospects;
  safe.barbershops = (db.barbershops || []).filter((shop) => !user.barbershopId || shop.id === user.barbershopId);
  safe.users = (db.users || []).filter((member) => !user.barbershopId || member.barbershopId === user.barbershopId).map(publicUser);
  return safe;
}
function publicBookingState(db) {
  return { barbershops: (db.barbershops || []).filter((shop) => shop.active !== false).map(({ id, name, slug, city, openTime, closeTime }) => ({ id, name, slug, city, openTime, closeTime })), publicBooking: db.publicBooking, services: db.services || [], professionals: (db.professionals || []).filter((item) => item.active !== false).map(({ id, name, active }) => ({ id, name, active })), appointments: (db.appointments || []).map(({ time, barber, date, day, open }) => ({ time, barber, date, day, open: Boolean(open) })) };
}

function createSession(user) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 1000 * 60 * 60 * 12;
  sessions.set(token, { userId: user.id, expiresAt });
  return { token, expiresAt: new Date(expiresAt).toISOString() };
}

function isRateLimited(req, pathname) {
  const ip = req.socket.remoteAddress || "local";
  const key = `${ip}:${pathname}`;
  const now = Date.now();
  const current = rateLimits.get(key) || { count: 0, resetAt: now + 60_000 };
  if (current.resetAt < now) {
    rateLimits.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  rateLimits.set(key, current);
  return current.count > 120;
}

async function ensureDb() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(dbPath)) {
    await writeFile(dbPath, JSON.stringify(defaultData, null, 2));
  }
}

async function readDb() {
  await ensureDb();
  const parsed = JSON.parse(await readFile(dbPath, "utf8"));
  const merged = mergeDbData(parsed);
  if (JSON.stringify(parsed) !== JSON.stringify(merged)) {
    await writeDb(merged);
  }
  return merged;
}

async function writeDb(data) {
  await ensureDb();
  await writeFile(dbPath, JSON.stringify(mergeDbData(data), null, 2));
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
  return raw  ?JSON.parse(raw) : {};
}

function sendJson(res, status, payload) {
  res.writeHead(status, securityHeaders({ "Content-Type": "application/json; charset=utf-8" }));
  res.end(JSON.stringify(payload));
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function parseClientCsv(csv) {
  const lines = csv
    .split(/\r\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const [headerLine, ...rows] = lines;
  if (!headerLine) return [];
  const headers = headerLine.split(",").map((item) => item.trim().toLowerCase());
  return rows.map((row) => {
    const values = row.split(",").map((item) => item.trim());
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    return {
      id: makeId("client"),
      name: record.nome || record.name || "Cliente sem nome",
      phone: record.whatsapp || record.telefone || record.phone || "",
      lastVisit: record.ultima_visita || record["última_visita"] || record.lastvisit || "",
      favoriteService: record.servico || record.service || "Corte",
      preferredPeriod: record.periodo || record.period || "Tarde",
      ticket: Number(record.ticket || record.valor || 0),
      professional: record.profissional || record.professional || "",
      status: record.status || "Importado",
    };
  });
}

function appointmentDate(appointment) {
  return appointment.date || appointment.day || new Date().toISOString().slice(0, 10);
}

function appointmentConflicts(left, right) {
  return (
    appointmentDate(left) === appointmentDate(right) &&
    String(left.time || "") === String(right.time || "") &&
    String(left.barber || "") === String(right.barber || "") &&
    !left.open
  );
}

async function handleApi(req, res, pathname) {
  const db = await readDb();

  if (pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, storage: dbPath });
  }

  if (pathname === "/api/login" && req.method === "POST") {
    const body = await readBody(req);
    if (!body.email) return sendJson(res, 400, { error: "email_required" });
    const user = (db.users || []).find((item) => item.email === body.email && item.active !== false);
    if (!user || !safeCompare(user.passwordHash || "", hashPassword(body.password || ""))) {
      addAudit(db, "auth.login_failed", body.email || "unknown", { email: body.email });
      await writeDb(db);
      return sendJson(res, 401, { error: "invalid_credentials" });
    }
    const session = createSession(user);
    addAudit(db, "auth.login", user.email, { role: user.role, barbershopId: user.barbershopId });
    await writeDb(db);
    return sendJson(res, 200, { user: publicUser(user), ...session });
  }

  if (pathname === "/api/logout" && req.method === "POST") {
    const header = req.headers.authorization || ""; const token = header.startsWith("Bearer ") ? header.slice(7) : ""; sessions.delete(token); return sendJson(res, 200, { ok: true });
  }
  if (pathname === "/api/public/booking" && req.method === "GET") return sendJson(res, 200, publicBookingState(db));
  if (pathname === "/api/public/appointments" && req.method === "POST") {
    const body = await readBody(req);
    const appointment = { id: makeId("appt"), barbershopId: db.currentBarbershopId, time: String(body.time || ""), barber: String(body.barber || ""), client: String(body.client || "").slice(0, 120), phone: String(body.phone || "").slice(0, 30), service: String(body.service || "").slice(0, 120), status: body.status === "Sinal Pix" ? "Sinal Pix" : "Confirmado", open: false, source: "public-booking", date: String(body.date || "").slice(0, 10) };
    if (!appointment.time || !appointment.barber || !appointment.client) return sendJson(res, 400, { error: "missing_booking_fields" });
    if ((db.appointments || []).some((item) => appointmentConflicts(item, appointment))) return sendJson(res, 409, { error: "slot_unavailable" });
    db.appointments = [...(db.appointments || []), appointment]; addAudit(db, "appointment.public_created", "public-booking", { id: appointment.id, time: appointment.time }); await writeDb(db);
    return sendJson(res, 201, { id: appointment.id, status: appointment.status, time: appointment.time });
  }
  const authenticatedUser = requireAuth(req, res, db); if (!authenticatedUser) return;
  if (pathname === "/api/me" && req.method === "GET") return sendJson(res, 200, { user: publicUser(authenticatedUser), currentBarbershopId: authenticatedUser.barbershopId || db.currentBarbershopId });
  if (pathname === "/api/admin/state" && req.method === "GET") { if (!isPlatformAdmin(authenticatedUser)) return sendJson(res, 403, { error: "admin_required" }); return sendJson(res, 200, publicState(db)); }
  if (pathname === "/api/admin/state" && req.method === "PUT") { if (!isPlatformAdmin(authenticatedUser)) return sendJson(res, 403, { error: "admin_required" }); const body = await readBody(req); const next = { ...db, ...body, users: db.users }; addAudit(next, "admin.state_updated", authenticatedUser.email, { keys: Object.keys(body) }); await writeDb(next); return sendJson(res, 200, publicState(next)); }
  if (pathname === "/api/state" && req.method === "GET") return sendJson(res, 200, customerState(db, authenticatedUser));
  if (pathname === "/api/state" && req.method === "PUT") {
    const body = await readBody(req); const allowedKeys = ["recoveredRevenue", "openSlots", "clients", "professionals", "services", "integrations", "publicBooking", "onboardingChecklist", "campaigns", "inactiveClients", "appointments", "waitlist", "clubPlans", "messageHistory", "pixCharges"];
    const updates = Object.fromEntries(allowedKeys.filter((key) => Object.hasOwn(body, key)).map((key) => [key, body[key]])); const next = { ...db, ...updates }; addAudit(next, "state.updated", authenticatedUser.email, { keys: Object.keys(updates) }); await writeDb(next); return sendJson(res, 200, customerState(next, authenticatedUser));
  }

  if (pathname === "/api/barbershops" && req.method === "GET") {
    return sendJson(res, 200, db.barbershops || []);
  }

  if (pathname === "/api/barbershops" && req.method === "POST") {
    const body = await readBody(req);
    const barbershop = {
      id: makeId("shop"),
      slug: String(body.slug || body.name || "barbearia").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      active: true,
      monthlyPrice: 197,
      setupPrice: 497,
      ...body,
    };
    db.barbershops = [barbershop, ...(db.barbershops || [])];
    addAudit(db, "barbershop.created", getActor(req, db), { id: barbershop.id, name: barbershop.name });
    await writeDb(db);
    return sendJson(res, 201, barbershop);
  }

  if (pathname.startsWith("/api/barbershops/") && req.method === "PUT") {
    const id = pathname.split("/").pop();
    const body = await readBody(req);
    db.barbershops = (db.barbershops || []).map((item) => (item.id === id  ?{ ...item, ...body, id } : item));
    addAudit(db, "barbershop.updated", getActor(req, db), { id });
    await writeDb(db);
    return sendJson(res, 200, db.barbershops.find((item) => item.id === id));
  }

  if (pathname === "/api/users" && req.method === "GET") {
    return sendJson(res, 200, (db.users || []).map(publicUser));
  }

  if (pathname === "/api/users" && req.method === "POST") {
    const body = await readBody(req);
    if (!body.email || !body.name) return sendJson(res, 400, { error: "name_email_required" });
    const user = {
      id: makeId("user"),
      name: body.name,
      email: body.email,
      role: body.role || "barber",
      barbershopId: body.barbershopId || db.currentBarbershopId,
      active: body.active !== false,
      passwordHash: hashPassword(body.password || "demo123"),
    };
    db.users = [...(db.users || []), user];
    addAudit(db, "user.created", getActor(req, db), { id: user.id, role: user.role });
    await writeDb(db);
    return sendJson(res, 201, publicUser(user));
  }

  if (pathname.startsWith("/api/users/") && req.method === "PUT") {
    const id = pathname.split("/").pop();
    const body = await readBody(req);
    db.users = (db.users || []).map((user) =>
      user.id === id
         ?{
            ...user,
            ...body,
            id,
            passwordHash: body.password  ?hashPassword(body.password) : user.passwordHash,
          }
        : user,
    );
    addAudit(db, "user.updated", getActor(req, db), { id });
    await writeDb(db);
    return sendJson(res, 200, publicUser(db.users.find((user) => user.id === id)));
  }

  if (pathname === "/api/clients" && req.method === "GET") {
    return sendJson(res, 200, db.clients || []);
  }

  if (pathname === "/api/clients" && req.method === "POST") {
    const body = await readBody(req);
    const client = { id: makeId("client"), barbershopId: db.currentBarbershopId, status: "Ativo", ...body };
    db.clients = [...(db.clients || []), client];
    addAudit(db, "client.created", getActor(req, db), { id: client.id, name: client.name });
    await writeDb(db);
    return sendJson(res, 201, client);
  }

  if (pathname.startsWith("/api/clients/") && pathname.endsWith("/export") && req.method === "GET") {
    const id = pathname.split("/").at(-2);
    const client = (db.clients || []).find((item) => item.id === id);
    if (!client) return sendJson(res, 404, { error: "client_not_found" });
    const appointments = (db.appointments || []).filter((item) => item.client === client.name);
    const campaigns = (db.campaigns || []).filter((campaign) => (campaign.recipients || []).includes(client.name));
    return sendJson(res, 200, { client, appointments, campaigns });
  }

  if (pathname.startsWith("/api/clients/") && req.method === "PUT") {
    const id = pathname.split("/").pop();
    const body = await readBody(req);
    db.clients = (db.clients || []).map((client) => (client.id === id  ?{ ...client, ...body, id } : client));
    addAudit(db, "client.updated", getActor(req, db), { id });
    await writeDb(db);
    return sendJson(res, 200, db.clients.find((client) => client.id === id));
  }

  if (pathname.startsWith("/api/clients/") && req.method === "DELETE") {
    const id = pathname.split("/").pop();
    db.clients = (db.clients || []).filter((client) => client.id !== id);
    addAudit(db, "client.deleted", getActor(req, db), { id });
    await writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/import/clients" && req.method === "POST") {
    const body = await readBody(req);
    const imported = parseClientCsv(body.csv || "");
    db.clients = [...(db.clients || []), ...imported];
    addAudit(db, "client.imported", getActor(req, db), { imported: imported.length });
    await writeDb(db);
    return sendJson(res, 200, { imported: imported.length, clients: db.clients });
  }

  if (pathname === "/api/appointments" && req.method === "GET") {
    return sendJson(res, 200, db.appointments || []);
  }

  if (pathname === "/api/appointments" && req.method === "POST") {
    const body = await readBody(req);
    const appointment = { id: makeId("appt"), barbershopId: db.currentBarbershopId, status: "Confirmado", ...body };
    const conflict = (db.appointments || []).some((item) => appointmentConflicts(item, appointment));
    if (conflict) return sendJson(res, 409, { error: "slot_unavailable" });
    db.appointments = [...(db.appointments || []), appointment];
    db.openSlots = (db.appointments || []).filter((item) => item.open).length;
    addAudit(db, "appointment.created", getActor(req, db), { id: appointment.id, time: appointment.time });
    await writeDb(db);
    return sendJson(res, 201, appointment);
  }

  if (pathname.startsWith("/api/appointments/") && req.method === "PUT") {
    const id = pathname.split("/").pop();
    const body = await readBody(req);
    const target = { id, ...body };
    const conflict = (db.appointments || []).some((item, index) => {
      const itemId = item.id || `legacy-${index}`;
      return itemId !== id && appointmentConflicts(item, target);
    });
    if (conflict) return sendJson(res, 409, { error: "slot_unavailable" });
    db.appointments = (db.appointments || []).map((item, index) => {
      const itemId = item.id || `legacy-${index}`;
      return itemId === id  ?{ ...item, ...body, id } : item;
    });
    db.openSlots = (db.appointments || []).filter((item) => item.open).length;
    addAudit(db, "appointment.updated", getActor(req, db), { id });
    await writeDb(db);
    return sendJson(res, 200, db.appointments.find((item, index) => (item.id || `legacy-${index}`) === id));
  }

  if (pathname.startsWith("/api/appointments/") && req.method === "DELETE") {
    const id = pathname.split("/").pop();
    db.appointments = (db.appointments || []).filter((item, index) => (item.id || `legacy-${index}`) !== id);
    db.openSlots = (db.appointments || []).filter((item) => item.open).length;
    addAudit(db, "appointment.deleted", getActor(req, db), { id });
    await writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/campaigns" && req.method === "GET") {
    return sendJson(res, 200, db.campaigns || []);
  }

  if (pathname === "/api/campaigns" && req.method === "POST") {
    const body = await readBody(req);
    const campaign = {
      id: makeId("camp"),
      status: "Enviada",
      createdAt: new Date().toISOString().slice(0, 10),
      sent: 0,
      responses: 0,
      bookings: 0,
      revenue: 0,
      ...body,
    };
    db.campaigns = [campaign, ...(db.campaigns || [])];
    db.recoveredRevenue = Number(db.recoveredRevenue || 0) + Number(campaign.revenue || 0);
    addAudit(db, "campaign.created", getActor(req, db), { id: campaign.id, sent: campaign.sent });
    await writeDb(db);
    return sendJson(res, 201, campaign);
  }

  if (pathname.startsWith("/api/campaigns/") && req.method === "PUT") {
    const id = pathname.split("/").pop();
    const body = await readBody(req);
    db.campaigns = (db.campaigns || []).map((campaign) => (campaign.id === id  ?{ ...campaign, ...body, id } : campaign));
    addAudit(db, "campaign.updated", getActor(req, db), { id });
    await writeDb(db);
    return sendJson(res, 200, db.campaigns.find((campaign) => campaign.id === id));
  }

  if (pathname.startsWith("/api/campaigns/") && req.method === "DELETE") {
    const id = pathname.split("/").pop();
    db.campaigns = (db.campaigns || []).filter((campaign) => campaign.id !== id);
    addAudit(db, "campaign.deleted", getActor(req, db), { id });
    await writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/integrations" && req.method === "GET") {
    return sendJson(res, 200, db.integrations || defaultData.integrations);
  }

  if (pathname === "/api/integrations" && req.method === "PUT") {
    const body = await readBody(req);
    db.integrations = {
      ...db.integrations,
      ...body,
      whatsapp: { ...(db.integrations || {}).whatsapp, ...(body.whatsapp || {}) },
      pix: { ...(db.integrations || {}).pix, ...(body.pix || {}) },
    };
    addAudit(db, "integration.updated", getActor(req, db), { providers: Object.keys(body) });
    await writeDb(db);
    return sendJson(res, 200, db.integrations);
  }

  if (pathname === "/api/integrations/whatsapp/test" && req.method === "POST") {
    const body = await readBody(req);
    db.integrations.whatsapp.lastTestAt = new Date().toISOString();
    db.integrations.whatsapp.status = "teste_ok";
    addAudit(db, "integration.whatsapp_tested", getActor(req, db), { to: body.to || "cliente" });
    await writeDb(db);
    return sendJson(res, 200, {
      ok: true,
      simulated: true,
      message: `Mensagem simuladá para ${body.to || "cliente"}`,
    });
  }

  if (pathname === "/api/integrations/pix/test" && req.method === "POST") {
    const body = await readBody(req);
    db.integrations.pix.lastTestAt = new Date().toISOString();
    db.integrations.pix.status = "teste_ok";
    addAudit(db, "integration.pix_tested", getActor(req, db), { amount: Number(body.amount || 15) });
    await writeDb(db);
    return sendJson(res, 200, {
      ok: true,
      simulated: true,
      chargeId: makeId("pix"),
      amount: Number(body.amount || 15),
    });
  }

  if (pathname === "/api/audit-logs" && req.method === "GET") {
    return sendJson(res, 200, db.auditLogs || []);
  }

  return sendJson(res, 404, { error: "not_found" });
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const normalizedRequest = requested.toLowerCase();
  const blocked = normalizedRequest.startsWith("/data/") || normalizedRequest.startsWith("/.git/") || normalizedRequest.endsWith(".log") || normalizedRequest.endsWith(".err") || normalizedRequest.endsWith(".csv") || normalizedRequest.endsWith(".sql") || normalizedRequest.endsWith(".md") || normalizedRequest === "/.env.example";
  if (blocked) { res.writeHead(404, securityHeaders({ "Content-Type": "text/plain; charset=utf-8" })); res.end("Not found"); return; }
  const safePath = path.normalize(decodeURIComponent(requested)).replace(/^[/\\]+/, "");
  const filePath = path.resolve(__dirname, safePath);
  if (!filePath.startsWith(__dirname + path.sep) && filePath !== __dirname) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, securityHeaders({ "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" }));
    res.end(data);
  } catch {
    res.writeHead(404, securityHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    if (pathname.startsWith("/api/")) {
      if (isRateLimited(req, pathname)) {
        return sendJson(res, 429, { error: "rate_limited" });
      }
      await handleApi(req, res, pathname);
      return;
    }
    await serveStatic(req, res, pathname);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "server_error" });
  }
});

await ensureDb();
server.listen(port, "0.0.0.0", () => {
  console.log(`Business Barber rodando em http://0.0.0.0:${port}`);
});

