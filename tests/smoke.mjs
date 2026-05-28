import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = 4199;
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.mjs"], {
  env: { ...process.env, PORT: String(port), APP_URL: baseUrl, DEMO_MODE: "true", DEMO_EMAIL: "demo@businessbarber.local", DEMO_PASSWORD: "demo123", ADMIN_EMAIL: "admin@test.com", ADMIN_PASSWORD: "AdminTeste#2026", WHATSAPP_MODE: "sandbox" },
  stdio: "ignore",
});

async function fetchJson(path, options = {}, expectedStatus = null) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } });
  const text = await response.text();
  const payload = text && response.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : text;
  if (expectedStatus !== null) { if (response.status !== expectedStatus) throw new Error(`${path}: expected ${expectedStatus}, got ${response.status}`); return payload; }
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path} failed: ${response.status} ${text}`);
  return payload;
}
async function waitForServer() { for (let i = 0; i < 40; i += 1) { try { await fetchJson("/api/health"); return; } catch { await delay(150); } } throw new Error("server_not_ready"); }
try {
  await waitForServer();
  const health = await fetchJson("/api/health");
  if (health.storage !== "json") throw new Error("storage_mode_invalid");
  const session = await fetchJson("/api/login", { method: "POST", body: JSON.stringify({ email: "demo@businessbarber.local", password: "demo123" }) });
  const auth = { Authorization: `Bearer ${session.token}` };
  await fetchJson("/api/admin/state", { headers: auth }, 403);
  await fetchJson("/api/barbershops", { method: "POST", headers: auth, body: JSON.stringify({ name: "Não autorizada" }) }, 403);
  const state = await fetchJson("/api/state", { headers: auth });
  if (!Array.isArray(state.clients) || state.users.some((u) => u.role === "platform_admin")) throw new Error("tenant_scope_invalid");
  const client = await fetchJson("/api/clients", { method: "POST", headers: auth, body: JSON.stringify({ name: "Cliente Smoke", phone: "559999900123", ticket: 90, favoriteService: "Corte", consentWhatsapp: true }) });
  await fetchJson(`/api/clients/${client.id}/export`, { headers: auth });
  const message = await fetchJson("/api/whatsapp/send-template", { method: "POST", headers: auth, body: JSON.stringify({ clientId: client.id, variables: [client.name] }) });
  if (!message.simulated) throw new Error("sandbox_should_not_send_real_message");
  const appointment = await fetchJson("/api/appointments", { method: "POST", headers: auth, body: JSON.stringify({ time: "19:30", barber: "Rafa", client: "Cliente Smoke", service: "Corte", status: "Confirmado", date: "2026-06-01" }) });
  const campaign = await fetchJson("/api/campaigns", { method: "POST", headers: auth, body: JSON.stringify({ name: "Smoke retorno", segment: "Teste", sent: 0, responses: 0, bookings: 0, revenue: 0, recipients: ["Cliente Smoke"] }) });
  await fetchJson("/api/integrations/whatsapp/test", { method: "POST", headers: auth, body: JSON.stringify({ to: "559999900123", name: "Cliente Smoke" }) });
  const booking = await fetchJson("/api/public/booking?barbearia=barbearia-alpha");
  if (!booking.shop || !Array.isArray(booking.services)) throw new Error("public_booking_shape_invalid");
  await fetchJson("/api/public/appointments", { method: "POST", body: JSON.stringify({ barbershopSlug: "barbearia-alpha", client: "Cliente Site", phone: "5566999999999", service: booking.services[0].name, barber: booking.professionals[0].name, date: "2027-01-04", time: "09:00" }) }, 400);
  await fetchJson("/api/public/appointments", { method: "POST", body: JSON.stringify({ barbershopSlug: "barbearia-alpha", client: "Cliente Site", phone: "5566999999999", service: booking.services[0].name, barber: booking.professionals[0].name, date: "2027-01-04", time: "09:00", privacyAccepted: true, whatsappConsent: true }) });
  const protectedDb = await fetch(`${baseUrl}/data/db.json`); if (protectedDb.status !== 404) throw new Error("db_file_exposed");
  const protectedTests = await fetch(`${baseUrl}/tests/smoke.mjs`); if (protectedTests.status !== 404) throw new Error("internal_test_exposed");
  for (const page of ["/", "/app.html", "/public.html?barbearia=barbearia-alpha", "/admin.html", "/privacidade.html", "/termos.html"]) { const res = await fetch(`${baseUrl}${page}`); if (!res.ok) throw new Error(`page_unavailable:${page}`); }
  await fetchJson(`/api/campaigns/${campaign.id}`, { method: "DELETE", headers: auth });
  await fetchJson(`/api/appointments/${appointment.id}`, { method: "DELETE", headers: auth });
  await fetchJson(`/api/clients/${client.id}`, { method: "DELETE", headers: auth });
  console.log("Smoke test V2 passou: segurança, isolamento, LGPD, WhatsApp sandbox, agendamento público, CRUD e páginas OK.");
} finally { server.kill(); }
