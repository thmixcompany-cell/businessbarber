const publicMoney = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const publicState = { shop: null, publicBooking: {}, appointments: [], services: [], professionals: [], deposit: {} };
const feedback = document.querySelector("#publicFeedback");
const baseSlots = ["09:00", "10:00", "11:30", "14:00", "15:30", "16:30", "18:00"];
function getSlug() { return new URLSearchParams(window.location.search).get("barbearia") || "barbearia-alpha"; }
function todayIso() { return new Date().toISOString().slice(0, 10); }
function appointmentDate(item) { return item.date || item.day || todayIso(); }
function escapeHtml(text) { return String(text || "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
function getAvailableSlots() {
  const date = document.querySelector("#publicDate").value || todayIso();
  const barber = document.querySelector("#publicProfessional").value;
  const openTime = publicState.shop?.openTime || "09:00";
  const closeTime = publicState.shop?.closeTime || "19:00";
  const occupied = new Set(publicState.appointments.filter((item) => appointmentDate(item) === date && item.barber === barber && !item.open && !["Cancelado", "Recusado"].includes(item.status)).map((item) => item.time));
  return baseSlots.filter((slot) => slot >= openTime && slot <= closeTime && !occupied.has(slot));
}
function renderSlots() {
  const select = document.querySelector("#publicTime"); const slots = getAvailableSlots();
  select.innerHTML = slots.length ? slots.map((slot) => `<option value="${slot}">${slot}</option>`).join("") : '<option value="">Sem horários livres</option>';
  select.disabled = slots.length === 0; document.querySelector("#publicBookingForm button[type='submit']").disabled = slots.length === 0;
  feedback.textContent = slots.length ? "A solicitação só vira reserva após confirmação da equipe." : "Esse profissional não tem horários livres nessa data.";
}
function renderBooking() {
  const shop = publicState.shop || {};
  document.title = `${shop.name || "Agendamento"} | Business Barber`;
  document.querySelector("#publicShopName").textContent = shop.name || "Barbearia";
  document.querySelector("#publicHeadline").textContent = publicState.publicBooking.headline || "Escolha seu horário com segurança.";
  const meta = [shop.city, shop.address, shop.instagram].filter(Boolean).map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  document.querySelector("#publicMeta").innerHTML = meta || '<span>Agendamento online disponível</span>';
  document.querySelector("#publicDepositText").textContent = publicState.deposit.required ? `Sinal de ${publicMoney.format(publicState.deposit.amount || 0)} solicitado somente após confirmação.` : "A equipe confirma seu pedido pelo WhatsApp.";
  document.querySelector("#publicServiceCards").innerHTML = publicState.services.map((s) => `<article><strong>${escapeHtml(s.name)}</strong><span>${publicMoney.format(Number(s.price || 0))}</span><small>${Number(s.duration || 30)} min</small></article>`).join("");
  document.querySelector("#publicService").innerHTML = publicState.services.map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)} - ${publicMoney.format(Number(s.price || 0))}</option>`).join("");
  document.querySelector("#publicProfessional").innerHTML = publicState.professionals.map((p) => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join("");
  const dateInput = document.querySelector("#publicDate"); dateInput.min = todayIso(); if (!dateInput.value) dateInput.value = todayIso(); renderSlots();
}
async function hydrateBooking() {
  try {
    const response = await fetch(`/api/public/booking?barbearia=${encodeURIComponent(getSlug())}`);
    if (!response.ok) throw new Error("not_found"); Object.assign(publicState, await response.json()); renderBooking();
  } catch { feedback.textContent = "Página de agendamento indisponível. Entre em contato com a barbearia."; document.querySelector("#publicBookingForm button").disabled = true; }
}
document.querySelector("#publicDate").addEventListener("change", renderSlots);
document.querySelector("#publicProfessional").addEventListener("change", renderSlots);
document.querySelector("#publicBookingForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const formData = new FormData(event.currentTarget);
  const payload = { barbershopSlug: getSlug(), website: String(formData.get("website") || ""), client: String(formData.get("client") || ""), phone: String(formData.get("phone") || ""), service: String(formData.get("service") || ""), barber: String(formData.get("barber") || ""), date: String(formData.get("date") || ""), time: String(formData.get("time") || ""), whatsappConsent: Boolean(formData.get("whatsappConsent")), privacyAccepted: Boolean(formData.get("privacyAccepted")) };
  if (!payload.time) { feedback.textContent = "Escolha um horário disponível."; return; }
  try {
    const response = await fetch("/api/public/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (response.status === 409) {
      const data = await response.json().catch(() => ({}));
      await hydrateBooking();
      const alternatives = Array.isArray(data.alternatives) ? data.alternatives.filter(Boolean) : [];
      if (alternatives.length) {
        const select = document.querySelector("#publicTime");
        select.value = alternatives[0];
        feedback.textContent = `Esse horário acabou de ser solicitado. Tenho ${alternatives.join(" ou ")} disponível; já deixei uma alternativa selecionada para você.`;
      } else {
        feedback.textContent = "Esse horário acabou de ser solicitado e não encontrei outro próximo com esse profissional. Escolha outro dia ou outro profissional.";
      }
      return;
    }
    if (!response.ok) { const data = await response.json().catch(() => ({})); feedback.textContent = data.error === "consent_required" ? "Aceite os termos e o contato por WhatsApp para continuar." : "Revise seus dados e tente novamente."; return; }
    feedback.textContent = "Pedido recebido! A equipe confirmará seu horário pelo WhatsApp."; event.currentTarget.reset(); await hydrateBooking();
  } catch { feedback.textContent = "Não foi possível enviar agora. Entre em contato com a barbearia."; }
});
hydrateBooking();
