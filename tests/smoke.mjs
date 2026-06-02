import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const port = 4199;
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.mjs"], {
  env: { ...process.env, PORT: String(port), APP_URL: baseUrl, DEMO_MODE: "true", DEMO_EMAIL: "demo@businessbarber.local", DEMO_PASSWORD: "demo123", ADMIN_EMAIL: "admin@test.com", ADMIN_PASSWORD: "AdminTeste#2026", WHATSAPP_MODE: "sandbox", META_APP_ID: "1234567890", META_APP_SECRET: "meta_secret_teste", META_EMBEDDED_SIGNUP_CONFIG_ID: "config_teste" },
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
  const embeddedConfig = await fetchJson("/api/integrations/whatsapp/embedded-config", { headers: auth });
  const embeddedConfigJson = JSON.stringify(embeddedConfig);
  if (!embeddedConfig.enabled || embeddedConfig.appId !== "1234567890" || embeddedConfigJson.includes("meta_secret_teste")) throw new Error("embedded_signup_config_invalid");
  const integration = await fetchJson("/api/integrations", {
    method: "PUT",
    headers: auth,
    body: JSON.stringify({
      whatsapp: {
        mode: "sandbox",
        defaultTemplate: "retorno_cliente_sumido",
        templateLanguage: "pt_BR",
        phoneNumberId: "123456789012345",
        accessToken: "EAATEST_SECRET_TOKEN",
        appSecret: "app_secret_teste",
        verifyToken: "verify_token_teste",
      },
      pix: { provider: "manual_pix", mode: "manual", depositAmount: 15 },
    }),
  });
  const integrationJson = JSON.stringify(integration);
  if (!integration.whatsapp.tokenConfigured || !integration.whatsapp.phoneNumberIdConfigured) throw new Error("whatsapp_credentials_not_registered");
  if (integrationJson.includes("EAATEST_SECRET_TOKEN") || integrationJson.includes("app_secret_teste") || integrationJson.includes("verify_token_teste")) throw new Error("whatsapp_secret_leaked");
  const adminSession = await fetchJson("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@test.com", password: "AdminTeste#2026" }) });
  const adminState = await fetchJson("/api/admin/state", { headers: { Authorization: `Bearer ${adminSession.token}` } });
  const adminJson = JSON.stringify(adminState);
  if (adminJson.includes("EAATEST_SECRET_TOKEN") || adminJson.includes("app_secret_teste") || adminJson.includes("verify_token_teste")) throw new Error("whatsapp_secret_leaked_to_admin_state");
  const client = await fetchJson("/api/clients", { method: "POST", headers: auth, body: JSON.stringify({ name: "Cliente Smoke", phone: "559999900123", ticket: 90, favoriteService: "Corte", consentWhatsapp: true }) });
  await fetchJson(`/api/clients/${client.id}/export`, { headers: auth });
  const message = await fetchJson("/api/whatsapp/send-template", { method: "POST", headers: auth, body: JSON.stringify({ clientId: client.id, variables: [client.name] }) });
  if (!message.simulated) throw new Error("sandbox_should_not_send_real_message");
  const smokeRunId = Date.now().toString(36);
  const appointment = await fetchJson("/api/appointments", { method: "POST", headers: auth, body: JSON.stringify({ time: "19:30", barber: `Smoke ${smokeRunId}`, client: "Cliente Smoke", service: "Corte", status: "Confirmado", date: "2030-01-02" }) });
  const barberUser = await fetchJson("/api/users", { method: "POST", headers: auth, body: JSON.stringify({ name: "Diego", email: `diego.${smokeRunId}@example.com`, password: "BarbeiroSmoke#2026", role: "barber" }) });
  const barberAppointment = await fetchJson("/api/appointments", { method: "POST", headers: auth, body: JSON.stringify({ time: "20:00", barber: "Diego", client: "Cliente Diego", service: "Corte", status: "Confirmado", date: "2030-01-03" }) });
  const otherAppointment = await fetchJson("/api/appointments", { method: "POST", headers: auth, body: JSON.stringify({ time: "20:30", barber: "Rafa", client: "Cliente Rafa", service: "Barba", status: "Confirmado", date: "2030-01-03" }) });
  const barberSession = await fetchJson("/api/login", { method: "POST", body: JSON.stringify({ email: barberUser.email, password: "BarbeiroSmoke#2026" }) });
  const barberAuth = { Authorization: `Bearer ${barberSession.token}` };
  const barberState = await fetchJson("/api/state", { headers: barberAuth });
  if (barberState.user.role !== "barber" || barberState.appointments.some((item) => item.barber !== "Diego")) throw new Error("barber_scope_invalid");
  if (barberState.campaigns.length || barberState.inactiveClients.length || barberState.auditLogs.length) throw new Error("barber_sensitive_data_visible");
  await fetchJson("/api/campaigns", { method: "POST", headers: barberAuth, body: JSON.stringify({ name: "Nao autorizado" }) }, 403);
  await fetchJson(`/api/appointments/${otherAppointment.id}`, { method: "PUT", headers: barberAuth, body: JSON.stringify({ status: "Finalizado" }) }, 403);
  const barberUpdate = await fetchJson(`/api/appointments/${barberAppointment.id}`, { method: "PUT", headers: barberAuth, body: JSON.stringify({ status: "Finalizado", client: "Cliente Alterado" }) });
  if (barberUpdate.status !== "Finalizado" || barberUpdate.client !== "Cliente Diego") throw new Error("barber_update_permissions_invalid");
  const inviteAppointment = await fetchJson("/api/appointments", { method: "POST", headers: auth, body: JSON.stringify({ time: "21:00", barber: "Diego", client: "Vago", service: "Corte", status: "Aberto", open: true, date: "2030-01-04" }) });
  const invite = { id: `invite-${smokeRunId}`, type: "slot_invite", appointmentId: inviteAppointment.id, client: "Cliente Convite", phone: "559999900456", status: "Convite enviado", time: "21:00", barber: "Diego", service: "Corte", createdAt: new Date().toISOString(), barbershopId: "shop-alpha" };
  await fetchJson("/api/state", { method: "PUT", headers: auth, body: JSON.stringify({ messageHistory: [invite] }) });
  const webhookBody = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: "123456789012345" }, messages: [{ id: `wamid.${smokeRunId}`, from: "559999900456", timestamp: "1893456000", type: "text", text: { body: "Sim" } }] } }] }] });
  const webhookSignature = `sha256=${createHmac("sha256", "app_secret_teste").update(webhookBody).digest("hex")}`;
  await fetchJson("/api/webhooks/whatsapp", { method: "POST", headers: { "x-hub-signature-256": webhookSignature }, body: webhookBody });
  const afterWebhook = await fetchJson("/api/appointments", { headers: auth });
  const bookedByWebhook = afterWebhook.find((item) => item.id === inviteAppointment.id);
  if (!bookedByWebhook || bookedByWebhook.open || bookedByWebhook.status !== "Recuperado" || bookedByWebhook.client !== "Cliente Convite") throw new Error("webhook_auto_booking_failed");
  const campaign = await fetchJson("/api/campaigns", { method: "POST", headers: auth, body: JSON.stringify({ name: "Smoke retorno", segment: "Teste", sent: 0, responses: 0, bookings: 0, revenue: 0, recipients: ["Cliente Smoke"] }) });
  await fetchJson("/api/integrations/whatsapp/test", { method: "POST", headers: auth, body: JSON.stringify({ to: "559999900123", name: "Cliente Smoke" }) });
  const booking = await fetchJson("/api/public/booking?barbearia=barbearia-alpha");
  if (!booking.shop || !Array.isArray(booking.services)) throw new Error("public_booking_shape_invalid");
  const bookingDate = `2030-02-${String((Date.now() % 20) + 5).padStart(2, "0")}`;
  const bookingTime = `23:${String(Date.now() % 60).padStart(2, "0")}`;
  await fetchJson("/api/public/appointments", { method: "POST", body: JSON.stringify({ barbershopSlug: "barbearia-alpha", client: "Cliente Site", phone: "5566999999999", service: booking.services[0].name, barber: booking.professionals[0].name, date: bookingDate, time: bookingTime }) }, 400);
  await fetchJson("/api/public/appointments", { method: "POST", body: JSON.stringify({ barbershopSlug: "barbearia-alpha", client: "Cliente Site", phone: "5566999999999", service: booking.services[0].name, barber: booking.professionals[0].name, date: bookingDate, time: bookingTime, privacyAccepted: true, whatsappConsent: true }) });
  const protectedDb = await fetch(`${baseUrl}/data/db.json`); if (protectedDb.status !== 404) throw new Error("db_file_exposed");
  const protectedServer = await fetch(`${baseUrl}/server.mjs`); if (protectedServer.status !== 404) throw new Error("server_file_exposed");
  const protectedTests = await fetch(`${baseUrl}/tests/smoke.mjs`); if (protectedTests.status !== 404) throw new Error("internal_test_exposed");
  for (const page of ["/", "/app.html", "/public.html?barbearia=barbearia-alpha", "/admin.html", "/privacidade.html", "/termos.html"]) { const res = await fetch(`${baseUrl}${page}`); if (!res.ok) throw new Error(`page_unavailable:${page}`); }
  await fetchJson(`/api/campaigns/${campaign.id}`, { method: "DELETE", headers: auth });
  await fetchJson(`/api/appointments/${otherAppointment.id}`, { method: "DELETE", headers: auth });
  await fetchJson(`/api/appointments/${barberAppointment.id}`, { method: "DELETE", headers: auth });
  await fetchJson(`/api/appointments/${inviteAppointment.id}`, { method: "DELETE", headers: auth });
  await fetchJson(`/api/appointments/${appointment.id}`, { method: "DELETE", headers: auth });
  await fetchJson(`/api/clients/${client.id}`, { method: "DELETE", headers: auth });
  console.log("Smoke test V2 passou: segurança, isolamento, LGPD, WhatsApp sandbox, agendamento público, CRUD e páginas OK.");
} finally { server.kill(); }
