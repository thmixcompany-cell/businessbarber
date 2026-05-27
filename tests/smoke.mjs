import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = 4199;
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.mjs"], {
  env: { ...process.env, PORT: String(port) },
  stdio: "ignore",
});

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body  ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text  ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed: ${response.status} ${text}`);
  }
  return payload;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await request("/api/health");
      return;
    } catch (error) {
      await delay(150);
    }
  }
  throw new Error("server_not_ready");
}

try {
  await waitForServer();
  const session = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "demo@businessbarber.local", password: "demo123" }),
  });
  const auth = { Authorization: `Bearer ${session.token}` };

  const state = await request("/api/state", { headers: auth });
  if (!Array.isArray(state.clients) || !Array.isArray(state.appointments)) {
    throw new Error("state_shape_invalid");
  }

  const client = await request("/api/clients", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      name: "Cliente Smoke",
      phone: "559999900123",
      ticket: 90,
      favoriteService: "Corte",
    }),
  });
  await request(`/api/clients/${client.id}/export`, { headers: auth });

  const appointment = await request("/api/appointments", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      time: "19:30",
      barber: "Rafa",
      client: "Cliente Smoke",
      service: "Corte",
      status: "Confirmado",
    }),
  });

  const campaign = await request("/api/campaigns", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      name: "Smoke retorno",
      segment: "Teste",
      sent: 1,
      responses: 1,
      bookings: 1,
      revenue: 90,
      recipients: ["Cliente Smoke"],
    }),
  });

  await request("/api/integrations", {
    method: "PUT",
    headers: auth,
    body: JSON.stringify({
      whatsapp: { provider: "simulado", mode: "sandbox" },
      pix: { provider: "manual_pix", depositAmount: 15 },
    }),
  });
  await request("/api/integrations/whatsapp/test", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ to: "559999900123" }),
  });
  await request("/api/integrations/pix/test", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ amount: 15 }),
  });

  const auditLogs = await request("/api/audit-logs", { headers: auth });
  if (!Array.isArray(auditLogs) || auditLogs.length === 0) {
    throw new Error("audit_logs_missing");
  }

  await request(`/api/campaigns/${campaign.id}`, { method: "DELETE", headers: auth });
  await request(`/api/appointments/${appointment.id}`, { method: "DELETE", headers: auth });
  await request(`/api/clients/${client.id}`, { method: "DELETE", headers: auth });

  const publicPage = await fetch(`${baseUrl}/public.html`);
  if (!publicPage.ok) throw new Error("public_page_unavailable");

  const adminPage = await fetch(`${baseUrl}/admin.html`);
  if (!adminPage.ok) throw new Error("admin_page_unavailable");

  console.log("Smoke test passou: API, login, CRUD, integracoes, auditoria, pagina publica e admin OK.");
} finally {
  server.kill();
}
