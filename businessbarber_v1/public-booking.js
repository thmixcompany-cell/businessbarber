const publicDefaults = {
  barbershops: [{ id: "shop-alpha", name: "Barbearia Alpha", slug: "barbearia-alpha" }],
  publicBooking: {
    headline: "Agende seu corte sem perder horário.",
    depositRequired: true,
  },
  appointments: [],
  services: [
    { name: "Corte", price: 70 },
    { name: "Barba", price: 45 },
    { name: "Corte + barba", price: 110 },
  ],
  professionals: [
    { name: "Rafa", active: true },
    { name: "Diego", active: true },
    { name: "Caio", active: true },
  ],
};

const publicMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const publicState = { ...publicDefaults };
const feedback = document.querySelector("#publicFeedback");
const baseSlots = ["09:00", "10:00", "11:30", "14:00", "15:30", "16:30", "18:00"];

function getSlug() {
  const params = new URLSearchParams(window.location.search);
  return params.get("barbearia") || publicState.publicBooking.slug || "barbearia-alpha";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function appointmentDate(appointment) {
  return appointment.date || appointment.day || todayIso();
}

function getAvailableSlots() {
  const date = document.querySelector("#publicDate").value || todayIso();
  const barber = document.querySelector("#publicProfessional").value;
  const slug = getSlug();
  const shop = publicState.barbershops.find((item) => item.slug === slug) || publicState.barbershops[0] || {};
  const openTime = shop.openTime || "09:00";
  const closeTime = shop.closeTime || "19:00";
  const occupied = new Set(
    (publicState.appointments || [])
      .filter((appointment) => appointmentDate(appointment) === date)
      .filter((appointment) => appointment.barber === barber)
      .filter((appointment) => !appointment.open)
      .map((appointment) => appointment.time),
  );
  return baseSlots.filter((slot) => slot >= openTime && slot <= closeTime && !occupied.has(slot));
}

function renderAvailableTimes() {
  const select = document.querySelector("#publicTime");
  const slots = getAvailableSlots();
  select.innerHTML = slots.length
    ?
    slots.map((slot) => `<option value="${slot}">${slot}</option>`).join("")
    : `<option value="">Sem horários livres</option>`;
  select.disabled = slots.length === 0;
  document.querySelector(".public-booking-form button[type='submit']").disabled = slots.length === 0;
  feedback.textContent = slots.length
     ? "Horários sujeitos à confirmação da equipe."
    : "Esse profissional não tem horários livres nessa data.";
}

function renderPublicBooking() {
  const slug = getSlug();
  const shop = publicState.barbershops.find((item) => item.slug === slug) || publicState.barbershops[0];
  document.querySelector("#publicShopName").textContent = shop.name || "Barbearia";
  document.querySelector("#publicHeadline").textContent = publicState.publicBooking.headline;

  document.querySelector("#publicService").innerHTML = publicState.services
    .map((service) => `<option value="${service.name}">${service.name} - ${publicMoney.format(Number(service.price || 0))}</option>`)
    .join("");

  document.querySelector("#publicProfessional").innerHTML = publicState.professionals
    .filter((professional) => professional.active !== false)
    .map((professional) => `<option value="${professional.name}">${professional.name}</option>`)
    .join("");

  const dateInput = document.querySelector("#publicDate");
  dateInput.min = todayIso();
  if (!dateInput.value) dateInput.value = todayIso();
  document.querySelector("#publicPixDeposit").checked = Boolean(publicState.publicBooking.depositRequired);
  renderAvailableTimes();
}

async function hydratePublicBooking() {
  try {
    const response = await fetch("/api/public/booking");
    if (!response.ok) throw new Error("api_unavailable");
    const state = await response.json();
    Object.assign(publicState, {
      ...publicDefaults,
      ...state,
      services: state.services || publicDefaults.services,
      professionals: state.professionals || publicDefaults.professionals,
      barbershops: state.barbershops || publicDefaults.barbershops,
      appointments: state.appointments || publicDefaults.appointments,
      publicBooking: { ...publicDefaults.publicBooking, ...(state.publicBooking || {}) },
    });
  } catch (error) {
    feedback.textContent = "Modo demonstração ativo.";
  }
  renderPublicBooking();
}

["#publicDate", "#publicProfessional"].forEach((selector) => {
  document.querySelector(selector).addEventListener("change", renderAvailableTimes);
});

document.querySelector("#publicBookingForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const appointment = {
    time: String(formData.get("time") || ""),
    barber: String(formData.get("barber") || ""),
    client: String(formData.get("client") || ""),
    phone: String(formData.get("phone") || ""),
    service: String(formData.get("service") || ""),
    status: formData.get("pixDeposit")  ? "Sinal Pix" : "Confirmado",
    open: false,
    source: "public-booking",
    date: String(formData.get("date") || ""),
  };

  try {
    if (!appointment.time) {
      feedback.textContent = "Escolha um horário disponível antes de confirmar.";
      return;
    }
    const response = await fetch("/api/public/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(appointment),
    });
    if (response.status === 409) {
      feedback.textContent = "Esse horário acabou de ser ocupado. Escolha outro horário.";
      await hydratePublicBooking();
      return;
    }
    if (!response.ok) throw new Error("booking_failed");
    feedback.textContent = "Agendamento recebido. A equipe vai confirmar pelo WhatsApp.";
    publicState.appointments.push(appointment);
    event.currentTarget.reset();
    renderPublicBooking();
  } catch (error) {
    feedback.textContent = "Não foi possível salvar agora. Chame a barbearia pelo WhatsApp.";
  }
});

hydratePublicBooking();
