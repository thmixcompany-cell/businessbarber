import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const dbPath = path.join(rootDir, "data", "db.json");
const confirm = process.argv.includes("--confirm");
const storageProvider = String(process.env.STORAGE_PROVIDER || "json").toLowerCase();
const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseStateId = process.env.SUPABASE_STATE_ID || "businessbarber-production";

function supabaseHeaders(extra = {}) {
  const headers = { apikey: supabaseSecret, ...extra };
  if (!supabaseSecret.startsWith("sb_secret_")) headers.Authorization = `Bearer ${supabaseSecret}`;
  return headers;
}

async function readState() {
  if (storageProvider !== "supabase") {
    return JSON.parse(await readFile(dbPath, "utf8"));
  }
  if (!supabaseUrl || !supabaseSecret) throw new Error("Supabase não configurado. Defina SUPABASE_URL e SUPABASE_SECRET_KEY.");
  const response = await fetch(`${supabaseUrl}/rest/v1/bb_app_state?id=eq.${encodeURIComponent(supabaseStateId)}&select=payload`, {
    headers: supabaseHeaders(),
  });
  if (!response.ok) throw new Error(`Falha ao ler Supabase: ${response.status}`);
  const rows = await response.json();
  if (!rows.length) throw new Error(`Nenhum estado encontrado para SUPABASE_STATE_ID=${supabaseStateId}`);
  return rows[0].payload || {};
}

async function writeState(db) {
  if (storageProvider !== "supabase") {
    await writeFile(dbPath, JSON.stringify(db, null, 2));
    return;
  }
  const response = await fetch(`${supabaseUrl}/rest/v1/bb_app_state`, {
    method: "POST",
    headers: supabaseHeaders({
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify({ id: supabaseStateId, payload: db, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Falha ao gravar Supabase: ${response.status}`);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function removeWhere(db, key, predicate) {
  const before = asArray(db[key]);
  const removed = before.filter(predicate);
  db[key] = before.filter((item) => !predicate(item));
  return removed;
}

function cleanDemoData(db) {
  const removed = {
    barbershops: removeWhere(db, "barbershops", (item) => item.id === "shop-alpha"),
    clients: removeWhere(db, "clients", (item) => ["client-lucas", "client-marcos", "client-bruno"].some((prefix) => String(item.id || "").startsWith(prefix))),
    users: removeWhere(db, "users", (item) => ["admin@test.com", "demo@businessbarber.local"].includes(String(item.email || "").toLowerCase())),
  };

  const removedShopIds = new Set(removed.barbershops.map((item) => item.id).filter(Boolean));
  const removedClientIds = new Set(removed.clients.map((item) => item.id).filter(Boolean));
  const removedClientNames = new Set(removed.clients.map((item) => String(item.name || "").toLowerCase()).filter(Boolean));

  removed.auditLogs = removeWhere(db, "auditLogs", (item) => removedShopIds.has(item.barbershopId) || removedClientIds.has(item.metadata?.clientId));
  removed.messageHistory = removeWhere(db, "messageHistory", (item) => (
    removedShopIds.has(item.barbershopId) ||
    removedClientIds.has(item.clientId) ||
    removedClientNames.has(String(item.client || "").toLowerCase())
  ));
  removed.campaigns = removeWhere(db, "campaigns", (item) => (
    removedShopIds.has(item.barbershopId) ||
    asArray(item.recipients).some((name) => removedClientNames.has(String(name || "").toLowerCase()))
  ));

  for (const key of ["integrationsByShop", "publicBookingByShop", "onboardingByShop"]) {
    if (!db[key] || typeof db[key] !== "object") continue;
    for (const shopId of removedShopIds) {
      if (Object.prototype.hasOwnProperty.call(db[key], shopId)) {
        removed[key] = removed[key] || [];
        removed[key].push({ shopId });
        delete db[key][shopId];
      }
    }
  }

  if (removedShopIds.has(db.currentBarbershopId)) {
    db.currentBarbershopId = asArray(db.barbershops)[0]?.id || "";
  }

  return removed;
}

const db = await readState();
const removed = cleanDemoData(db);
const summary = Object.fromEntries(Object.entries(removed).map(([key, value]) => [key, value.length]));

console.log("Relatório de limpeza de dados demo:");
console.table(summary);
console.log(`Storage: ${storageProvider}`);

if (!confirm) {
  console.log("Dry-run concluído. Nada foi gravado.");
  console.log("Para gravar, rode novamente com: node scripts/clean-demo-data.mjs --confirm");
  process.exit(0);
}

await writeState(db);
console.log("Limpeza confirmada e gravada com sucesso.");
