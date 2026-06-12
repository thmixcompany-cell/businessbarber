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
function localDateIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
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
        slotInviteTemplate: "encaixe_horario_vago",
        reminderTemplate: "lembrete_agendamento",
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
  const smokeRunId = Date.now().toString(36);
  const stripeCheckoutEvent = {
    id: `evt_${smokeRunId}`,
    type: "checkout.session.completed",
    data: {
      object: {
        object: "checkout.session",
        id: `cs_${smokeRunId}`,
        customer: `cus_${smokeRunId}`,
        subscription: `sub_${smokeRunId}`,
        client_reference_id: "shop-alpha",
        customer_details: { email: "demo@businessbarber.local" },
        metadata: { barbershop_id: "shop-alpha", owner_name: "Dono Demo", email: "demo@businessbarber.local", whatsapp: "556631992916", city: "Cuiaba" },
      },
    },
  };
  await fetchJson("/api/stripe/webhook", { method: "POST", body: JSON.stringify(stripeCheckoutEvent) });
  const afterStripe = await fetchJson("/api/admin/state", { headers: { Authorization: `Bearer ${adminSession.token}` } });
  const stripeShop = afterStripe.barbershops.find((shop) => shop.id === "shop-alpha");
  if (stripeShop?.subscriptionStatus !== "active" || stripeShop?.onboarding_email_status !== "pending" || stripeShop?.onboarding_email_error !== "email_not_configured") throw new Error("stripe_onboarding_email_state_invalid");
  const uniqueDigits = String(Date.now()).slice(-8);
  const clientPhone = `5599${uniqueDigits}`;
  const autoClientPhone = `5598${uniqueDigits}`;
  const invitePhone = `5577${uniqueDigits}`;
  const smokeDay = String((Date.now() % 20) + 5).padStart(2, "0");
  const smokeDate = `2028-04-${smokeDay}`;
  const smokeDate2 = `2028-05-${smokeDay}`;
  const smokeDate3 = `2028-06-${smokeDay}`;
  const barberName = `Diego ${smokeRunId}`;
  const otherBarberName = `Rafa ${smokeRunId}`;
  const client = await fetchJson("/api/clients", { method: "POST", headers: auth, body: JSON.stringify({ name: `Cliente Smoke ${smokeRunId}`, phone: clientPhone, ticket: 90, favoriteService: "Corte", consentWhatsapp: true }) });
  const autoClient = await fetchJson("/api/clients", { method: "POST", headers: auth, body: JSON.stringify({ name: `Cliente Auto ${smokeRunId}`, phone: autoClientPhone, ticket: 120, favoriteService: "Barba", consentWhatsapp: true }) });
  await fetchJson(`/api/clients/${client.id}/export`, { headers: auth });
  const message = await fetchJson("/api/whatsapp/send-template", { method: "POST", headers: auth, body: JSON.stringify({ clientId: client.id, variables: [client.name] }) });
  if (!message.simulated) throw new Error("sandbox_should_not_send_real_message");
  const appointment = await fetchJson("/api/appointments", { method: "POST", headers: auth, body: JSON.stringify({ time: "19:30", barber: `Smoke ${smokeRunId}`, client: client.name, service: "Corte", status: "Confirmado", date: smokeDate }) });
  const reminderAt = new Date(Date.now() + 60 * 60 * 1000);
  const reminderDate = localDateIso(reminderAt);
  const reminderTime = `${String(reminderAt.getHours()).padStart(2, "0")}:${String(reminderAt.getMinutes()).padStart(2, "0")}`;
  const reminderAppointment = await fetchJson("/api/appointments", { method: "POST", headers: auth, body: JSON.stringify({ time: reminderTime, barber: `Smoke ${smokeRunId}`, client: client.name, service: "Corte", status: "Confirmado", date: reminderDate }) });
  const reminders = await fetchJson("/api/appointments/reminders/auto-run", { method: "POST", headers: auth, body: JSON.stringify({ windowMinutes: 120, limit: 3 }) });
  if (!reminders.ok || reminders.sent < 1) throw new Error("appointment_reminder_auto_run_failed");
  const directInviteAppointment = await fetchJson("/api/appointments", { method: "POST", headers: auth, body: JSON.stringify({ time: "18:00", barber: barberName, client: "Vago", service: "Corte", status: "Aberto", open: true, date: smokeDate }) });
  const directInvite = await fetchJson("/api/slot-invites/send", { method: "POST", headers: auth, body: JSON.stringify({ appointmentId: directInviteAppointment.id, clientId: client.id }) });
  if (!directInvite.invite || directInvite.invite.appointmentId !== directInviteAppointment.id || !directInvite.invite.expiresAt) throw new Error("slot_invite_send_failed");
  const autoInviteAppointment = await fetchJson("/api/appointments", { method: "POST", headers: auth, body: JSON.stringify({ time: "18:30", barber: otherBarberName, client: "Vago", service: "Barba", status: "Aberto", open: true, date: smokeDate }) });
  const autoRun = await fetchJson("/api/slot-invites/auto-run", { method: "POST", headers: auth, body: JSON.stringify({ limit: 2 }) });
  if (!autoRun.ok || autoRun.sent < 1) throw new Error("slot_invite_auto_run_failed");
  const barberUser = await fetchJson("/api/users", { method: "POST", headers: auth, body: JSON.stringify({ name: barberName, email: `diego.${smokeRunId}@example.com`, password: "BarbeiroSmoke#2026", role: "barber" }) });
  const barberAppointment = await fetchJson("/api/appointments", { method: "POST", headers: auth, body: JSON.stringify({ time: "20:00", barber: barberName, client: "Cliente Diego", service: "Corte", status: "Confirmado", date: smokeDate2 }) });
  const otherAppointment = await fetchJson("/api/appointments", { method: "POST", headers: auth, body: JSON.stringify({ time: "20:30", barber: otherBarberName, client: "Cliente Rafa", service: "Barba", status: "Confirmado", date: smokeDate2 }) });
  const barberSession = await fetchJson("/api/login", { method: "POST", body: JSON.stringify({ email: barberUser.email, password: "BarbeiroSmoke#2026" }) });
  const barberAuth = { Authorization: `Bearer ${barberSession.token}` };
  const barberState = await fetchJson("/api/state", { headers: barberAuth });
  if (barberState.user.role !== "barber" || barberState.appointments.some((item) => item.barber !== barberName)) throw new Error("barber_scope_invalid");
  if (barberState.campaigns.length || barberState.inactiveClients.length || barberState.auditLogs.length) throw new Error("barber_sensitive_data_visible");
  await fetchJson("/api/campaigns", { method: "POST", headers: barberAuth, body: JSON.stringify({ name: "Nao autorizado" }) }, 403);
  await fetchJson(`/api/appointments/${otherAppointment.id}`, { method: "PUT", headers: barberAuth, body: JSON.stringify({ status: "Finalizado" }) }, 403);
  const barberUpdate = await fetchJson(`/api/appointments/${barberAppointment.id}`, { method: "PUT", headers: barberAuth, body: JSON.stringify({ status: "Finalizado", client: "Cliente Alterado" }) });
  if (barberUpdate.status !== "Finalizado" || barberUpdate.client !== "Cliente Diego") throw new Error("barber_update_permissions_invalid");
  const inviteAppointment = await fetchJson("/api/appointments", { method: "POST", headers: auth, body: JSON.stringify({ time: "21:00", barber: barberName, client: "Vago", service: "Corte", status: "Aberto", open: true, date: smokeDate3 }) });
  const invite = { id: `invite-${smokeRunId}`, type: "slot_invite", appointmentId: inviteAppointment.id, client: "Cliente Convite", phone: invitePhone, status: "Convite enviado", time: "21:00", barber: barberName, service: "Corte", createdAt: new Date().toISOString(), barbershopId: "shop-alpha" };
  await fetchJson("/api/state", { method: "PUT", headers: auth, body: JSON.stringify({ messageHistory: [invite] }) });
  const webhookBody = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: "123456789012345" }, messages: [{ id: `wamid.${smokeRunId}`, from: invitePhone, timestamp: "1893456000", type: "text", text: { body: "Sim" } }] } }] }] });
  const webhookSignature = `sha256=${createHmac("sha256", "app_secret_teste").update(webhookBody).digest("hex")}`;
  await fetchJson("/api/webhooks/whatsapp", { method: "POST", headers: { "x-hub-signature-256": webhookSignature }, body: webhookBody });
  const afterWebhook = await fetchJson("/api/appointments", { headers: auth });
  const bookedByWebhook = afterWebhook.find((item) => item.id === inviteAppointment.id);
  if (!bookedByWebhook || bookedByWebhook.open || bookedByWebhook.status !== "Recuperado" || bookedByWebhook.client !== "Cliente Convite") throw new Error("webhook_auto_booking_failed");
  const campaign = await fetchJson("/api/campaigns", { method: "POST", headers: auth, body: JSON.stringify({ name: "Smoke retorno", segment: "Teste", sent: 0, responses: 0, bookings: 0, revenue: 0, recipients: [client.name] }) });
  await fetchJson("/api/integrations/whatsapp/test", { method: "POST", headers: auth, body: JSON.stringify({ to: clientPhone, name: client.name }) });
  const booking = await fetchJson("/api/public/booking?barbearia=barbearia-alpha");
  if (!booking.shop || !Array.isArray(booking.services)) throw new Error("public_booking_shape_invalid");
  const bookingDate = `2028-07-${smokeDay}`;
  const bookingTime = `23:${String(Date.now() % 60).padStart(2, "0")}`;
  await fetchJson("/api/public/appointments", { method: "POST", body: JSON.stringify({ barbershopSlug: "barbearia-alpha", client: `Cliente Site ${smokeRunId}`, phone: `5566${uniqueDigits}`, service: booking.services[0].name, barber: booking.professionals[0].name, date: bookingDate, time: bookingTime }) }, 400);
  await fetchJson("/api/public/appointments", { method: "POST", body: JSON.stringify({ barbershopSlug: "barbearia-alpha", client: `Cliente Site ${smokeRunId}`, phone: `5566${uniqueDigits}`, service: booking.services[0].name, barber: booking.professionals[0].name, date: bookingDate, time: bookingTime, privacyAccepted: true, whatsappConsent: true }) });
  const conflictDate = `2028-08-${smokeDay}`;
  await fetchJson("/api/public/appointments", { method: "POST", body: JSON.stringify({ barbershopSlug: "barbearia-alpha", client: `Cliente Conflito ${smokeRunId}`, phone: `5565${uniqueDigits}`, service: booking.services[0].name, barber: booking.professionals[0].name, date: conflictDate, time: "10:00", privacyAccepted: true, whatsappConsent: true }) });
  const conflict = await fetchJson("/api/public/appointments", { method: "POST", body: JSON.stringify({ barbershopSlug: "barbearia-alpha", client: `Cliente Conflito 2 ${smokeRunId}`, phone: `5564${uniqueDigits}`, service: booking.services[0].name, barber: booking.professionals[0].name, date: conflictDate, time: "10:00", privacyAccepted: true, whatsappConsent: true }) }, 409);
  if (!Array.isArray(conflict.alternatives) || !conflict.alternatives.length) throw new Error("public_booking_alternatives_missing");
  const protectedDb = await fetch(`${baseUrl}/data/db.json`); if (protectedDb.status !== 404) throw new Error("db_file_exposed");
  const protectedServer = await fetch(`${baseUrl}/server.mjs`); if (protectedServer.status !== 404) throw new Error("server_file_exposed");
  const protectedTests = await fetch(`${baseUrl}/tests/smoke.mjs`); if (protectedTests.status !== 404) throw new Error("internal_test_exposed");
  for (const page of ["/", "/app.html", "/public.html?barbearia=barbearia-alpha", "/admin.html", "/cadastro.html", "/sucesso.html", "/onboarding.html", "/privacidade.html", "/termos.html"]) { const res = await fetch(`${baseUrl}${page}`); if (!res.ok) throw new Error(`page_unavailable:${page}`); }
  await fetchJson(`/api/campaigns/${campaign.id}`, { method: "DELETE", headers: auth });
  await fetchJson(`/api/appointments/${otherAppointment.id}`, { method: "DELETE", headers: auth });
  await fetchJson(`/api/appointments/${barberAppointment.id}`, { method: "DELETE", headers: auth });
  await fetchJson(`/api/appointments/${inviteAppointment.id}`, { method: "DELETE", headers: auth });
  await fetchJson(`/api/appointments/${autoInviteAppointment.id}`, { method: "DELETE", headers: auth });
  await fetchJson(`/api/appointments/${directInviteAppointment.id}`, { method: "DELETE", headers: auth });
  await fetchJson(`/api/appointments/${reminderAppointment.id}`, { method: "DELETE", headers: auth });
  await fetchJson(`/api/appointments/${appointment.id}`, { method: "DELETE", headers: auth });
  await fetchJson(`/api/clients/${autoClient.id}`, { method: "DELETE", headers: auth });
  await fetchJson(`/api/clients/${client.id}`, { method: "DELETE", headers: auth });
  console.log("Smoke test V2 passou: segurança, isolamento, LGPD, WhatsApp sandbox, agendamento público, CRUD e páginas OK.");
} finally { server.kill(); }
