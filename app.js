const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

const storageKey = "businessBarberState";
const authKey = "businessBarberAuth";
let apiEnabled = false;

const defaultState = {
  user: {
    id: "user-demo",
    name: "Dono Demo",
    email: "",
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
      monthlyPrice: 119.9,
      setupPrice: 497,
      openTime: "09:00",
      closeTime: "19:00",
      active: true,
      billing: { provider: "stripe", status: "pending" },
    },
  ],
  users: [
    {
      id: "user-demo",
      name: "Dono Demo",
      email: "",
      role: "owner",
      barbershopId: "shop-alpha",
      active: true,
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
      tokenConfigured: false,
      phoneNumberIdConfigured: false,
      appSecretConfigured: false,
      verifyTokenConfigured: false,
      businessAccountIdConfigured: false,
      wabaIdConfigured: false,
      phoneNumberIdMasked: "",
      businessAccountIdMasked: "",
      wabaIdMasked: "",
      displayPhoneNumber: "",
      verifiedName: "",
      credentialSource: "none",
      defaultTemplate: "retorno_cliente_sumido",
      templateLanguage: "pt_BR",
      slotInviteTemplate: "encaixe_horario_vago",
      reminderTemplate: "lembrete_agendamento",
      status: "simulado",
      lastTestAt: "",
      embeddedSignupReady: false,
      embeddedSignupConfigured: false,
      connectedAt: "",
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
    { id: "integrations", label: "Ativar WhatsApp e Pix", done: false },
    { id: "campaign", label: "Rodar primeira campanha", done: true },
  ],
  auditLogs: [],
  messageHistory: [],
  pixCharges: [],
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
      next: "Fechar R$ 119,90/mês",
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

function loadSavedState() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || {};
  } catch (error) {
    return {};
  }
}

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(authKey)) || {};
  } catch (error) {
    return {};
  }
}

function isStrongPassword(password) {
  const value = String(password || "");
  return value.length >= 10 && value.length <= 128 && /[A-Za-zÀ-ÿ]/.test(value) && /\d/.test(value);
}

function passwordPolicyMessage() {
  return "Use uma senha com 10 a 128 caracteres, incluindo letras e números.";
}

async function apiFetch(url, options = {}, retries = 1) {
  const session = getSession();
  const headers = {
    ...(options.headers || {}),
    ...(session.token  ?{ Authorization: `Bearer ${session.token}` } : {}),
  };
  const request = () => fetch(url, { ...options, headers });
  try {
    const response = await request();
    if (!response.ok && response.status >= 500 && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return apiFetch(url, options, retries - 1);
    }
    return response;
  } catch (error) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return apiFetch(url, options, retries - 1);
    }
    throw error;
  }
}

const savedState = loadSavedState();
const state = {
  ...defaultState,
  ...savedState,
  user: { ...defaultState.user, ...(savedState.user || {}) },
  barbershops: (savedState.barbershops || defaultState.barbershops).map((item) => ({ ...item })),
  users: (savedState.users || defaultState.users).map((item) => ({ ...item })),
  prospects: (savedState.prospects || defaultState.prospects).map((item) => ({ ...item })),
  clients: (savedState.clients || defaultState.clients).map((item) => ({ ...item })),
  professionals: (savedState.professionals || defaultState.professionals).map((item) => ({ ...item })),
  services: (savedState.services || defaultState.services).map((item) => ({ ...item })),
  integrations: {
    ...defaultState.integrations,
    ...(savedState.integrations || {}),
    whatsapp: {
      ...defaultState.integrations.whatsapp,
      ...((savedState.integrations || {}).whatsapp || {}),
    },
    pix: {
      ...defaultState.integrations.pix,
      ...((savedState.integrations || {}).pix || {}),
    },
  },
  publicBooking: { ...defaultState.publicBooking, ...(savedState.publicBooking || {}) },
  onboardingChecklist: (savedState.onboardingChecklist || defaultState.onboardingChecklist).map((item) => ({ ...item })),
  auditLogs: (savedState.auditLogs || defaultState.auditLogs).map((item) => ({ ...item })),
  messageHistory: (savedState.messageHistory || defaultState.messageHistory).map((item) => ({ ...item })),
  pixCharges: (savedState.pixCharges || defaultState.pixCharges).map((item) => ({ ...item })),
  campaigns: (savedState.campaigns || defaultState.campaigns).map((item) => ({ ...item })),
  inactiveClients: (savedState.inactiveClients || defaultState.inactiveClients).map((item) => ({ ...item })),
  appointments: (savedState.appointments || defaultState.appointments).map((item) => ({ ...item })),
  waitlist: (savedState.waitlist || defaultState.waitlist).map((item) => ({ ...item })),
  clubPlans: (savedState.clubPlans || defaultState.clubPlans).map((item) => ({ ...item })),
};

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
  if (apiEnabled && !isBarberUser()) {
    apiFetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    }).catch(() => {
      apiEnabled = false;
    });
  }
}

function resetState() {
  localStorage.removeItem(storageKey);
  Object.assign(state, {
    ...defaultState,
    user: { ...defaultState.user },
    barbershops: defaultState.barbershops.map((item) => ({ ...item })),
    users: defaultState.users.map((item) => ({ ...item })),
    prospects: defaultState.prospects.map((item) => ({ ...item })),
    clients: defaultState.clients.map((item) => ({ ...item })),
    professionals: defaultState.professionals.map((item) => ({ ...item })),
    services: defaultState.services.map((item) => ({ ...item })),
    integrations: {
      ...defaultState.integrations,
      whatsapp: { ...defaultState.integrations.whatsapp },
      pix: { ...defaultState.integrations.pix },
    },
    publicBooking: { ...defaultState.publicBooking },
    onboardingChecklist: defaultState.onboardingChecklist.map((item) => ({ ...item })),
    auditLogs: defaultState.auditLogs.map((item) => ({ ...item })),
    messageHistory: defaultState.messageHistory.map((item) => ({ ...item })),
    pixCharges: defaultState.pixCharges.map((item) => ({ ...item })),
    campaigns: defaultState.campaigns.map((item) => ({ ...item })),
    inactiveClients: defaultState.inactiveClients.map((item) => ({ ...item })),
    appointments: defaultState.appointments.map((item) => ({ ...item })),
    waitlist: defaultState.waitlist.map((item) => ({ ...item })),
    clubPlans: defaultState.clubPlans.map((item) => ({ ...item })),
  });
  saveState();
}

function mergeState(nextState) {
  Object.assign(state, {
    ...state,
    ...nextState,
    user: { ...state.user, ...(nextState.user || {}) },
    barbershops: (nextState.barbershops || state.barbershops || []).map((item) => ({ ...item })),
    users: (nextState.users || state.users || []).map((item) => ({ ...item })),
    prospects: (nextState.prospects || state.prospects || []).map((item) => ({ ...item })),
    clients: (nextState.clients || state.clients || []).map((item) => ({ ...item })),
    professionals: (nextState.professionals || state.professionals || []).map((item) => ({ ...item })),
    services: (nextState.services || state.services || []).map((item) => ({ ...item })),
    integrations: {
      ...state.integrations,
      ...(nextState.integrations || {}),
      whatsapp: { ...(state.integrations || {}).whatsapp, ...((nextState.integrations || {}).whatsapp || {}) },
      pix: { ...(state.integrations || {}).pix, ...((nextState.integrations || {}).pix || {}) },
    },
    publicBooking: { ...state.publicBooking, ...(nextState.publicBooking || {}) },
    onboardingChecklist: (nextState.onboardingChecklist || state.onboardingChecklist || []).map((item) => ({ ...item })),
    auditLogs: (nextState.auditLogs || state.auditLogs || []).map((item) => ({ ...item })),
    messageHistory: (nextState.messageHistory || state.messageHistory || []).map((item) => ({ ...item })),
    pixCharges: (nextState.pixCharges || state.pixCharges || []).map((item) => ({ ...item })),
    campaigns: (nextState.campaigns || state.campaigns || []).map((item) => ({ ...item })),
    inactiveClients: (nextState.inactiveClients || state.inactiveClients || []).map((item) => ({ ...item })),
    appointments: (nextState.appointments || state.appointments || []).map((item) => ({ ...item })),
    waitlist: (nextState.waitlist || state.waitlist || []).map((item) => ({ ...item })),
    clubPlans: (nextState.clubPlans || state.clubPlans || []).map((item) => ({ ...item })),
  });
}

async function hydrateStateFromApi() {
  try {
    const response = await apiFetch("/api/state");
    if (!response.ok) throw new Error("api_unavailable");
    const apiState = await response.json();
    apiEnabled = true;
    mergeState(apiState);
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch (error) {
    apiEnabled = false;
  }
}

const scheduleList = document.querySelector("#scheduleList");
const inactiveClients = document.querySelector("#inactiveClients");
const waitlistGrid = document.querySelector("#waitlistGrid");
const clubPlans = document.querySelector("#clubPlans");
const setupList = document.querySelector("#setupList");
const pilotSteps = document.querySelector("#pilotSteps");
const pilotQuestions = document.querySelector("#pilotQuestions");
const pipelineBoard = document.querySelector("#pipelineBoard");
const clientAdminList = document.querySelector("#clientAdminList");
const servicesList = document.querySelector("#servicesList");
const professionalsList = document.querySelector("#professionalsList");
const campaignHistory = document.querySelector("#campaignHistory");
const messageOutbox = document.querySelector("#messageOutbox");
const dashboardInviteQueue = document.querySelector("#dashboardInviteQueue");
const onboardingList = document.querySelector("#onboardingList");
const reportGrid = document.querySelector("#reportGrid");
const campaignReportList = document.querySelector("#campaignReportList");
const clientHistoryBox = document.querySelector("#clientHistoryBox");
const appointmentForm = document.querySelector("#appointmentForm");
const scheduleDate = document.querySelector("#scheduleDate");
const employeeScheduleDate = document.querySelector("#employeeScheduleDate");
const employeeAgendaTitle = document.querySelector("#employeeAgendaTitle");
const employeeSummary = document.querySelector("#employeeSummary");
const employeeScheduleList = document.querySelector("#employeeScheduleList");
const employeeNextCard = document.querySelector("#employeeNextCard");
const scheduleTitle = document.querySelector("#scheduleTitle");
const priorityList = document.querySelector("#priorityList");
const priorityHeaderAction = document.querySelector("#priorityHeaderAction");
const nextActionTitle = document.querySelector("#nextActionTitle");
const nextActionText = document.querySelector("#nextActionText");
const prioritySignalChance = document.querySelector("#prioritySignalChance");
const prioritySignalTicket = document.querySelector("#prioritySignalTicket");
const prioritySignalTime = document.querySelector("#prioritySignalTime");
const inviteModal = document.querySelector("#inviteModal");
const inviteModalTitle = document.querySelector("#inviteModalTitle");
const inviteSummary = document.querySelector("#inviteSummary");
const inviteMessage = document.querySelector("#inviteMessage");
const integrationStatus = document.querySelector("#integrationStatus");
const barbershopList = document.querySelector("#barbershopList");
const userList = document.querySelector("#userList");
const auditList = document.querySelector("#auditList");
const bookingLink = document.querySelector("#bookingLink");
const loginScreen = document.querySelector("#loginScreen");
const appShell = document.querySelector("#appShell");
const passwordChangeScreen = document.querySelector("#passwordChangeScreen");
const passwordChangeForm = document.querySelector("#passwordChangeForm");
const forgotPasswordScreen = document.querySelector("#forgotPasswordScreen");
const forgotPasswordForm = document.querySelector("#forgotPasswordForm");
const resetPasswordScreen = document.querySelector("#resetPasswordScreen");
const resetPasswordForm = document.querySelector("#resetPasswordForm");
const mobileMenuToggle = document.querySelector("#mobileMenuToggle");
const sidebarOverlay = document.querySelector("#sidebarOverlay");
const toast = document.querySelector("#toast");
let pendingInvite = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2800);
}

function needsPasswordChange(user = {}) {
  return Boolean(user.forcePasswordChange);
}

function showPasswordChange(session = getSession()) {
  if (loginScreen) loginScreen.classList.add("hidden");
  if (forgotPasswordScreen) forgotPasswordScreen.classList.add("hidden");
  if (resetPasswordScreen) resetPasswordScreen.classList.add("hidden");
  if (appShell) appShell.hidden = true;
  if (passwordChangeScreen) passwordChangeScreen.classList.remove("hidden");
  if (session?.user) {
    localStorage.setItem(authKey, JSON.stringify(session));
  }
}

function showAuthenticatedApp() {
  if (passwordChangeScreen) passwordChangeScreen.classList.add("hidden");
  if (forgotPasswordScreen) forgotPasswordScreen.classList.add("hidden");
  if (resetPasswordScreen) resetPasswordScreen.classList.add("hidden");
  loginScreen.classList.add("hidden");
  appShell.hidden = false;
}

function daysSince(dateText) {
  if (!dateText) return 999;
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return 999;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function appointmentDate(appointment) {
  return appointment.date || appointment.day || todayIso();
}

function selectedScheduleDate() {
  return scheduleDate.value || todayIso();
}

function selectedEmployeeDate() {
  return employeeScheduleDate?.value || todayIso();
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isBarberUser() {
  return state.user?.role === "barber";
}

function barberOwnsAppointment(appointment) {
  if (!isBarberUser()) return true;
  return normalizeName(appointment.barber) === normalizeName(state.user?.name);
}

function isSameSlot(left, right) {
  return (
    appointmentDate(left) === appointmentDate(right) &&
    String(left.time || "") === String(right.time || "") &&
    String(left.barber || "") === String(right.barber || "") &&
    !left.open
  );
}

function hasSlotConflict(appointment, ignoredIndex = -1) {
  return state.appointments.some((item, index) => index !== ignoredIndex && isSameSlot(item, appointment));
}

function formatDateTitle(dateText) {
  const date = new Date(`${dateText}T12:00:00`);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(date);
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function buildWhatsAppLink(phone, message) {
  const normalized = normalizePhone(phone);
  if (!normalized) return "";
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

function applyTemplate(template, client) {
  return template
    .replaceAll("{{nome}}", client.name || "cliente")
    .replaceAll("{{serviço}}", client.favoriteService || "serviço")
    .replaceAll("{{barbearia}}", currentShop().name || "barbearia");
}

function currentShop() {
  return state.barbershops.find((shop) => shop.id === state.currentBarbershopId) || state.barbershops[0];
}

function periodFromTime(time) {
  const hour = Number(String(time || "0").split(":")[0] || 0);
  if (hour < 12) return "Manhã";
  if (hour < 14) return "Almoço";
  if (hour < 18) return "Tarde";
  return "Noite";
}

function periodLabel(period) {
  const labels = {
    "Manhã": "da manhã",
    Almoço: "do almoço",
    Tarde: "da tarde",
    Noite: "da noite",
  };
  return labels[period] || String(period || "do dia").toLowerCase();
}

function dayAppointments() {
  return state.appointments
    .map((item, originalIndex) => ({ ...item, originalIndex }))
    .filter((item) => appointmentDate(item) === selectedScheduleDate())
    .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
}

function bestOpenSlot() {
  const openSlots = dayAppointments().filter((item) => item.open);
  if (!openSlots.length) return null;
  const selectedDate = selectedScheduleDate();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const futureSlots = openSlots.filter((slot) => {
    if (selectedDate !== todayIso()) return true;
    const [hour, minute] = String(slot.time || "00:00").split(":").map(Number);
    return hour * 60 + (minute || 0) >= nowMinutes;
  });
  return futureSlots[0] || openSlots[0];
}

function highIntentClients() {
  return [...(state.inactiveClients || [])].sort((a, b) => {
    const intentScore = { Alta: 3, "Média": 2, Baixa: 1 };
    return (intentScore[b.intent] || 0) - (intentScore[a.intent] || 0) || Number(b.value || 0) - Number(a.value || 0);
  });
}

function waitlistForSlot(slot) {
  const period = slot  ?periodFromTime(slot.time) : null;
  return (state.waitlist || []).find((item) => item.period === period) || (state.waitlist || [])[0];
}

function clientDetailsByName(name) {
  const client = (state.clients || []).find((item) => item.name === name);
  const inactive = (state.inactiveClients || []).find((item) => item.name === name);
  if (client || inactive) {
    return {
      name,
      phone: client?.phone || inactive?.phone || "",
      value: Number(inactive?.value || client?.ticket || 0),
      favoriteService: client?.favoriteService || "",
      intent: inactive?.intent || client?.status || "",
    };
  }
  return null;
}

function suggestedClientForSlot(slot) {
  const wait = waitlistForSlot(slot);
  const waitClient = wait  ?clientDetailsByName(wait.best) : null;
  if (waitClient) return waitClient;
  const client = highIntentClients()[0];
  const details = client  ?clientDetailsByName(client.name) : null;
  return client
     ?{
      name: client.name,
      phone: client.phone || details?.phone || "",
      value: Number(client.value || 0),
      favoriteService: client.favoriteService || slot.service || "",
      intent: client.intent || "",
    }
    : null;
}

function buildInviteMessage(slot, client) {
  const shop = currentShop().name || "barbearia";
  const service = slot.service && slot.service !== "Corte ou barba"  ?` para ${slot.service}` : "";
  return `Oi, ${client.name}! Aqui é da ${shop}. Abriu um horário hoje às ${slot.time} com ${slot.barber}${service}. Quer que eu reserve para você?`;
}

function buildCustomerSlotInviteMessage(slot, client) {
  const shop = currentShop().name || "barbearia";
  const service = slot.service && slot.service !== "Corte ou barba" ? ` para ${slot.service}` : "";
  const date = appointmentDate(slot) === todayIso() ? "hoje" : formatDateTitle(appointmentDate(slot));
  return `Oi, ${client.name}! Aqui é da ${shop}. Abriu um horário ${date} às ${slot.time} com ${slot.barber}${service}. Quer que eu reserve para você? Responda "sim" para confirmar.`;
}

function invitePayloadFromSlot(index) {
  const slot = state.appointments[index];
  if (!slot || !slot.open) return null;
  const client = suggestedClientForSlot({ ...slot, originalIndex: index });
  if (!client) return null;
  const message = buildCustomerSlotInviteMessage(slot, client);
  return {
    appointmentIndex: index,
    slot,
    client,
    message,
    link: buildWhatsAppLink(client.phone, message),
  };
}

function openInviteModal(index) {
  const payload = invitePayloadFromSlot(index);
  if (!payload) {
    showToast("Não há cliente sugerido para este horário agora.");
    return;
  }
  pendingInvite = payload;
  inviteModalTitle.textContent = `Preencher ${payload.slot.time} com ${payload.slot.barber}`;
  inviteSummary.innerHTML = `
    <article>
      <strong>${esc(payload.slot.time)}</strong>
      <span>${esc(payload.slot.barber)} · ${esc(payload.slot.service)}</span>
    </article>
    <article>
      <strong>${esc(payload.client.name)}</strong>
      <span>${esc(payload.client.intent || "Cliente sugerido")} · ${money.format(Number(payload.client.value || 0))}</span>
    </article>
    <article>
      <strong>${payload.link  ?"WhatsApp pronto" : "Sem telefone"}</strong>
      <span>${payload.link  ?"Link será registrado no histórico" : "Copie a mensagem manualmente"}</span>
    </article>
  `;
  inviteMessage.value = payload.message;
  inviteModal.classList.remove("hidden");
  inviteModal.setAttribute("aria-hidden", "false");
}

function closeInviteModal() {
  pendingInvite = null;
  inviteModal.classList.add("hidden");
  inviteModal.setAttribute("aria-hidden", "true");
}

function completeSlotFromInvite(invite, status = "Agendado") {
  const slot = state.appointments[invite.appointmentIndex];
  if (!slot || !slot.open) return false;
  slot.client = invite.client.name;
  slot.status = status;
  slot.open = false;
  slot.recovered = true;
  slot.invitedAt = new Date().toISOString();
  state.recoveredRevenue += Number(invite.client.value || 0);
  state.openSlots = state.appointments.filter((item) => item.open).length;
  return true;
}

function addInviteHistory(status, shouldBook = false) {
  if (!pendingInvite) return;
  const message = inviteMessage.value.trim() || pendingInvite.message;
  const entry = {
    id: `msg-${Date.now().toString(36)}`,
    type: "slot_invite",
    client: pendingInvite.client.name,
    phone: pendingInvite.client.phone || "",
    message,
    link: buildWhatsAppLink(pendingInvite.client.phone, message),
    status,
    appointmentIndex: pendingInvite.appointmentIndex,
    appointmentId: pendingInvite.slot.id || "",
    time: pendingInvite.slot.time,
    barber: pendingInvite.slot.barber,
    service: pendingInvite.slot.service,
    value: Number(pendingInvite.client.value || 0),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
  if (shouldBook) {
    const booked = completeSlotFromInvite(pendingInvite, "Recuperado");
    entry.status = booked  ?"Agendado" : "Horário indisponível";
  }
  state.messageHistory.unshift(entry);
  saveState();
  closeInviteModal();
  renderAll();
  showToast(entry.status === "Agendado"  ?"Convite registrado e horário agendado." : "Convite registrado no histórico.");
}

async function sendPendingInviteNow() {
  if (!pendingInvite) return;
  if (!apiEnabled) {
    addInviteHistory("Convite enviado", false);
    return;
  }
  const response = await apiFetch("/api/slot-invites/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appointmentId: pendingInvite.slot.id || "" }),
  }).catch(() => null);
  if (!response?.ok) {
    const result = response ? await response.json().catch(() => ({})) : {};
    const messages = {
      open_slot_not_found: "Esse horário não está mais livre.",
      eligible_client_not_found: "Nenhum cliente elegível com consentimento WhatsApp para esse horário.",
    };
    showToast(messages[result.error] || "Não foi possível enviar o convite agora.");
    return;
  }
  const result = await response.json();
  state.messageHistory.unshift(result.invite);
  closeInviteModal();
  await hydrateStateFromApi();
  renderAll();
  showToast(result.simulated ? "Convite registrado em sandbox. Com WhatsApp em produção, ele será enviado automaticamente." : "Convite enviado pela Cloud API.");
}

function renderPriorityBoard() {
  if (!priorityList) return;
  const slot = bestOpenSlot();
  const clients = highIntentClients();
  const hotClients = clients.filter((client) => client.intent === "Alta");
  const selectedClients = hotClients.length  ?hotClients : clients.slice(0, 3);
  const wait = waitlistForSlot(slot);
  const pixPending = dayAppointments().filter((item) => item.status === "Sinal Pix" && !item.pixPaid);
  const priorities = [];

  if (slot) {
    const period = wait?.period  ?periodLabel(wait.period) : periodLabel(periodFromTime(slot.time));
    priorities.push({
      strong: true,
      title: `Preencher ${slot.time} com ${slot.barber}`,
      text: wait
         ?`${wait.people} clientes aguardam o período ${period}; melhor chance: ${wait.best} (${wait.chance}).`
        : `${selectedClients.length} clientes sem retorno podem receber convite para esse horário.`,
      button: `Preencher ${slot.time}`,
      attrs: `data-fill-priority-slot="${slot.originalIndex}"`,
      primary: true,
    });
  } else {
    priorities.push({
      strong: true,
      title: "Agenda sem horários vagos agora",
      text: "Use este momento para confirmar presenças e preparar clientes para encaixes futuros.",
      button: "Ver agenda",
      attrs: `data-priority-view="dashboard"`,
      primary: false,
    });
  }

  priorities.push({
    title: `Chamar ${selectedClients.length || 0} clientes com maior chance de retorno`,
    text: selectedClients.length
       ?`Potencial estimado de ${money.format(selectedClients.reduce((sum, client) => sum + Number(client.value || 0), 0))}; comece por ${selectedClients[0].name}.`
      : "Nenhum cliente sem retorno cadastrado para priorizar agora.",
    button: "Selecionar clientes",
    attrs: `data-priority-view="reactivation"`,
  });

  priorities.push(
    pixPending.length
       ?{
        title: `Confirmar sinal Pix de ${pixPending.length} atendimento${pixPending.length > 1  ?"s" : ""}`,
        text: `Reduz risco de falta em horários já reservados para hoje.`,
        button: "Revisar sinais",
        attrs: `data-priority-view="dashboard"`,
      }
      : {
        title: "Revisar lista de espera para encaixes do dia",
        text: wait  ?`${wait.people} clientes aguardam o período ${periodLabel(wait.period)}; melhor chance: ${wait.best} (${wait.chance}).` : "Use os períodos mais pedidos para ocupar cancelamentos sem improviso.",
        button: "Abrir lista",
        attrs: `data-priority-view="waitlist"`,
      },
  );

  priorityList.innerHTML = priorities
    .map(
      (item, index) => `
        <article class="priority-item ${item.strong  ?"strong" : ""}">
          <span class="priority-number">${index + 1}</span>
          <div>
            <strong>${esc(item.title)}</strong>
            <p>${esc(item.text)}</p>
          </div>
          <button class="${item.primary  ?"primary-button" : "tiny-button"}" ${item.attrs} type="button">${esc(item.button)}</button>
        </article>
      `,
    )
    .join("");

  if (priorityHeaderAction) {
    priorityHeaderAction.textContent = slot  ?"Ver retornos" : "Ver lista";
    priorityHeaderAction.dataset.priorityView = slot  ?"reactivation" : "waitlist";
  }

  if (nextActionTitle && nextActionText) {
    const signalGrid = document.querySelector(".signal-grid");
    if (slot) {
      const likelyClient = wait  ?clients.find((client) => client.name === wait.best) || selectedClients[0] : selectedClients[0];
      nextActionTitle.textContent = `${slot.time} com ${slot.barber} está aberto`;
      nextActionText.textContent = wait
         ?`${wait.people} clientes preferem esse período; ${wait.best} tem ${wait.chance} de chance de resposta.`
        : `${selectedClients.length} clientes com chance de retorno podem receber convite.`;
      document.querySelector("#fillBestSlot").textContent = `Preencher ${slot.time}`;
      if (prioritySignalChance) prioritySignalChance.textContent = wait?.chance || "70%";
      if (prioritySignalTicket) prioritySignalTicket.textContent = money.format(Number(likelyClient?.value || 0) || Number(slot.ticket || 0));
      if (prioritySignalTime) prioritySignalTime.textContent = `${Math.max(3, Math.min(12, selectedClients.length * 2 + 2))} min`;
      signalGrid?.removeAttribute("hidden");
    } else {
      nextActionTitle.textContent = "Nenhum horário aberto no dia selecionado";
      nextActionText.textContent = "Acompanhe confirmações, Pix pendentes e lista de espera para manter a agenda protegida.";
      document.querySelector("#fillBestSlot").textContent = "Ver lista de espera";
      if (prioritySignalChance) prioritySignalChance.textContent = "-";
      if (prioritySignalTicket) prioritySignalTicket.textContent = money.format(0);
      if (prioritySignalTime) prioritySignalTime.textContent = "0 min";
      signalGrid?.setAttribute("hidden", "");
    }
  }
}

function persistCampaign(campaign) {
  if (!apiEnabled) return Promise.resolve(campaign);
  return apiFetch(`/api/campaigns/${campaign.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(campaign),
  })
    .then((response) => (response.ok  ?response.json() : campaign))
    .catch(() => campaign);
}

function renderMetrics() {
  const setMetric = (selector, value) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  };

  setMetric("#recoveredRevenue", money.format(state.recoveredRevenue));
  const dayOpenSlots = state.appointments.filter((item) => appointmentDate(item) === selectedScheduleDate() && item.open).length;
  const paidSignals = (state.pixCharges || []).filter((charge) => String(charge.status || "").toLowerCase().includes("pago"));
  const paidSignalsTotal = paidSignals.reduce((sum, charge) => sum + Number(charge.amount || 0), 0);
  setMetric("#openSlotsCount", String(dayOpenSlots));
  setMetric("#inactiveCount", String((state.inactiveClients || []).length));
  setMetric("#noshowAvoided", money.format(paidSignalsTotal));
  const recoveredAppointments = (state.appointments || []).filter((item) => item.recovered).length;
  const readyWaitlists = (state.waitlist || []).filter((item) => Number(item.people || 0) > 0).length;
  setMetric("#recoveredRevenueHint", recoveredAppointments ? `${recoveredAppointments} atendimento${recoveredAppointments > 1 ? "s" : ""} recuperado${recoveredAppointments > 1 ? "s" : ""}` : "Nenhuma receita atribuída ainda");
  setMetric("#openSlotsHint", dayOpenSlots ? (readyWaitlists ? `${readyWaitlists} lista${readyWaitlists === 1 ? "" : "s"} de espera com clientes` : "Nenhum cliente na lista de espera") : "Agenda sem vagas abertas");
  setMetric("#inactiveHint", (state.inactiveClients || []).length ? "Clientes há 45 dias ou mais sem voltar" : "Importe clientes para identificar retornos");
  setMetric("#confirmedSignalsHint", paidSignals.length ? `${paidSignals.length} sinal${paidSignals.length > 1 ? "is" : ""} confirmado${paidSignals.length > 1 ? "s" : ""}` : "Nenhum sinal confirmado ainda");

  // Estes indicadores existem apenas no painel do fundador.
  // No painel da barbearia, não podem interromper o render das demais telas.
  const contacts = (state.prospects || []).length;
  const demos = (state.prospects || []).filter((prospect) => ["Demo marcada", "Piloto proposto", "Piloto pago"].includes(prospect.status)).length;
  const pilots = (state.prospects || []).filter((prospect) => prospect.status === "Piloto pago").length;
  setMetric("#contactsMetric", `${contacts}/10`);
  setMetric("#demosMetric", `${demos}/5`);
  setMetric("#pilotsMetric", `${pilots}/3`);
}

function populateBarberFilter() {
  const filter = document.querySelector("#barberFilter");
  if (!filter) return;
  const previous = filter.value || "all";
  const professionals = (state.professionals || []).filter((item) => item.active !== false && item.name);
  filter.innerHTML = `<option value="all">Todos</option>${professionals.map((item) => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join("")}`;
  filter.value = previous === "all" || professionals.some((item) => item.name === previous) ? previous : "all";
}

function populateAppointmentSelects() {
  if (!appointmentForm) return;
  const barberSelect = appointmentForm.elements.barber;
  const serviceSelect = appointmentForm.elements.service;
  if (barberSelect?.tagName === "SELECT") {
    const previous = barberSelect.value;
    const professionals = (state.professionals || []).filter((item) => item.active !== false && item.name);
    barberSelect.innerHTML = professionals.map((item) => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join("") || '<option value="">Cadastre um barbeiro</option>';
    if (professionals.some((item) => item.name === previous)) barberSelect.value = previous;
  }
  if (serviceSelect?.tagName === "SELECT") {
    const previous = serviceSelect.value;
    const services = (state.services || []).filter((item) => item.active !== false && item.name);
    serviceSelect.innerHTML = services.map((item) => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join("") || '<option value="">Cadastre um serviço</option>';
    if (services.some((item) => item.name === previous)) serviceSelect.value = previous;
  }
}

function ensureSelectOption(select, value) {
  if (!select || select.tagName !== "SELECT" || !value) return;
  const exists = Array.from(select.options).some((option) => option.value === value);
  if (!exists) {
    select.insertAdjacentHTML("afterbegin", `<option value="${esc(value)}">${esc(value)}</option>`);
  }
}

function renderSchedule() {
  if (scheduleDate && !scheduleDate.value) {
    scheduleDate.value = todayIso();
  }
  if (appointmentForm.elements.date && !appointmentForm.elements.date.value) {
    appointmentForm.elements.date.value = selectedScheduleDate();
  }
  if (scheduleTitle) {
    scheduleTitle.textContent = formatDateTitle(selectedScheduleDate());
  }
  const filter = document.querySelector("#barberFilter").value;
  const appointments = state.appointments
    .map((item, originalIndex) => ({ ...item, originalIndex }))
    .filter((item) => appointmentDate(item) === selectedScheduleDate())
    .filter((item) => filter === "all" || item.barber === filter);

  scheduleList.innerHTML = appointments.length
    ?
    appointments
    .map((item, index) => {
      const className = item.open  ?"appointment open" : item.recovered  ?"appointment recovered" : "appointment";
      const pillClass = item.open
         ?"status-pill warning"
        : item.recovered
           ?"status-pill good"
          : item.status === "Sinal Pix"
             ?"status-pill pix"
            : "status-pill";
      const statusText = item.pixPaid  ?"Pix pago" : item.status;
      const hasPixAction = item.status === "Sinal Pix" && !item.pixPaid;
      const action = item.open
        ?
        `<div class="appointment-actions appointment-actions-two"><button class="tiny-button" data-fill-slot="${item.originalIndex}" type="button">Preencher</button><button class="tiny-button" data-edit-appointment="${item.originalIndex}" type="button">Editar</button></div>`
        : `<div class="appointment-actions ${hasPixAction  ?"appointment-actions-three" : "appointment-actions-two"}">${hasPixAction  ?`<button class="tiny-button" data-mark-pix="${item.originalIndex}" type="button">Marcar Pix</button>` : ""}<button class="tiny-button" data-edit-appointment="${item.originalIndex}" type="button">Editar</button><button class="tiny-button" data-cancel-appointment="${item.originalIndex}" type="button">Cancelar</button></div>`;
      const serviceText = [item.barber, item.service].filter(Boolean).join(" · ");

      return `
        <article class="${className}">
          <div class="time">${esc(item.time)}</div>
          <div class="appointment-body">
            <div class="appointment-header">
              <div class="appointment-main">
                <strong>${esc(item.client)}</strong>
                <span>${esc(serviceText)}</span>
              </div>
              <span class="${pillClass} appointment-status">${esc(statusText)}</span>
            </div>
            ${action}
          </div>
        </article>
      `;
    })
    .join("")
    : `<article class="empty-state"><strong>Nenhum horário nesta data</strong><span>Crie um agendamento manualmente ou libere horários pela página pública.</span></article>`;

  document.querySelectorAll("[data-fill-slot]").forEach((button) => {
    button.addEventListener("click", () => fillSlot(Number(button.dataset.fillSlot)));
  });
  document.querySelectorAll("[data-cancel-appointment]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.cancelAppointment);
      state.appointments[index] = {
        ...state.appointments[index],
        client: "Vago",
        status: "Aberto",
        open: true,
        recovered: false,
      };
      state.openSlots = state.appointments.filter((item) => item.open).length;
      saveState();
      renderAll();
      showToast("Horário cancelado e reaberto.");
    });
  });
  document.querySelectorAll("[data-mark-pix]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.markPix);
      const appointment = state.appointments[index];
      appointment.pixPaid = true;
      appointment.pixPaidAt = new Date().toISOString();
      state.pixCharges.unshift({
        id: `pix-${Date.now().toString(36)}`,
        appointmentId: appointment.id || `legacy-${index}`,
        client: appointment.client,
        amount: Number(state.integrations.pix.depositAmount || 15),
        status: "Pago manualmente",
        paidAt: appointment.pixPaidAt,
      });
      saveState();
      renderAll();
      showToast("Sinal Pix marcado como pago.");
    });
  });
  document.querySelectorAll("[data-edit-appointment]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.editAppointment);
      const appointment = state.appointments[index];
      appointmentForm.elements.editIndex.value = String(index);
      appointmentForm.elements.date.value = appointmentDate(appointment);
      appointmentForm.elements.time.value = appointment.time || "";
      ensureSelectOption(appointmentForm.elements.barber, appointment.barber || "");
      appointmentForm.elements.barber.value = appointment.barber || "";
      appointmentForm.elements.client.value = appointment.client || "";
      ensureSelectOption(appointmentForm.elements.service, appointment.service || "");
      appointmentForm.elements.service.value = appointment.service || "";
      appointmentForm.elements.status.value = appointment.status || "Confirmado";
      appointmentForm.closest("details")?.setAttribute("open", "");
      document.querySelector("#appointmentSubmit").textContent = "Salvar";
      showToast("Edite o horário no formulário de agenda.");
    });
  });
}

function employeeAppointments() {
  return (state.appointments || [])
    .map((item, originalIndex) => ({ ...item, originalIndex }))
    .filter((item) => appointmentDate(item) === selectedEmployeeDate())
    .filter((item) => barberOwnsAppointment(item))
    .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
}

async function updateEmployeeAppointment(index, patch, message) {
  const appointment = state.appointments[index];
  if (!appointment || !barberOwnsAppointment(appointment)) {
    showToast("Esse horário não pertence ao seu usuário.");
    return;
  }
  const next = { ...appointment, ...patch };
  state.appointments[index] = next;
  saveState();
  renderAll();
  if (apiEnabled && appointment.id) {
    const response = await apiFetch(`/api/appointments/${appointment.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (response?.ok) {
      state.appointments[index] = await response.json();
      saveState();
      renderAll();
    }
  }
  showToast(message);
}

function renderEmployeePanel() {
  if (!employeeScheduleList) return;
  if (employeeScheduleDate && !employeeScheduleDate.value) {
    employeeScheduleDate.value = todayIso();
  }
  const appointments = employeeAppointments();
  const booked = appointments.filter((item) => !item.open);
  const finished = booked.filter((item) => ["Finalizado", "Recuperado"].includes(item.status));
  const pixPending = booked.filter((item) => item.status === "Sinal Pix" && !item.pixPaid);
  const nextAppointment = booked.find((item) => !["Finalizado", "Faltou", "Cancelado"].includes(item.status));
  const totalTicket = booked.reduce((sum, item) => sum + Number(item.ticket || item.value || 0), 0);

  if (employeeAgendaTitle) {
    employeeAgendaTitle.textContent = `${state.user?.name || "Profissional"} - ${formatDateTitle(selectedEmployeeDate())}`;
  }
  if (employeeSummary) {
    employeeSummary.innerHTML = `
      <article><strong>${booked.length}</strong><span>atendimentos</span></article>
      <article><strong>${finished.length}</strong><span>finalizados</span></article>
      <article><strong>${pixPending.length}</strong><span>Pix pendente</span></article>
      <article><strong>${money.format(totalTicket)}</strong><span>ticket previsto</span></article>
    `;
  }
  if (employeeNextCard) {
    employeeNextCard.innerHTML = nextAppointment
      ? `
        <span class="eyebrow">${nextAppointment.time}</span>
        <strong>${esc(nextAppointment.client)}</strong>
        <p>${esc(nextAppointment.service || "Serviço")} com ${esc(nextAppointment.barber)}. Status atual: ${esc(nextAppointment.pixPaid ? "Pix pago" : nextAppointment.status || "Confirmado")}.</p>
      `
      : `
        <span class="eyebrow">Agenda em dia</span>
        <strong>Nenhum atendimento pendente</strong>
        <p>Quando houver novos horários para você, eles aparecem aqui com as ações rápidas.</p>
      `;
  }

  employeeScheduleList.innerHTML = appointments.length
    ? appointments
        .map((item) => {
          const className = item.open ? "appointment open" : item.recovered ? "appointment recovered" : "appointment";
          const pillClass = item.status === "Sinal Pix" && !item.pixPaid ? "status-pill pix" : item.status === "Finalizado" || item.recovered ? "status-pill good" : "status-pill";
          const statusText = item.pixPaid ? "Pix pago" : item.status || "Confirmado";
          const actions = item.open
            ? `<span class="muted">Horário livre para o gerente preencher.</span>`
            : `
              <div class="appointment-actions appointment-actions-three employee-actions">
                ${item.status === "Sinal Pix" && !item.pixPaid ? `<button class="tiny-button" data-employee-action="pix" data-index="${item.originalIndex}" type="button">Marcar Pix</button>` : `<button class="tiny-button" data-employee-action="confirm" data-index="${item.originalIndex}" type="button">Confirmar</button>`}
                <button class="tiny-button" data-employee-action="finish" data-index="${item.originalIndex}" type="button">Finalizar</button>
                <button class="tiny-button" data-employee-action="miss" data-index="${item.originalIndex}" type="button">Faltou</button>
              </div>
            `;
          return `
            <article class="${className}">
              <div class="time">${esc(item.time)}</div>
              <div class="appointment-body">
                <div class="appointment-header">
                  <div class="appointment-main">
                    <strong>${esc(item.client)}</strong>
                    <span>${esc(item.service || "Serviço não informado")}</span>
                  </div>
                  <span class="${pillClass} appointment-status">${esc(statusText)}</span>
                </div>
                ${actions}
              </div>
            </article>
          `;
        })
        .join("")
    : `<article class="empty-state"><strong>Nenhum horário para você nessa data</strong><span>Confira outra data ou fale com o gerente da barbearia.</span></article>`;

  employeeScheduleList.querySelectorAll("[data-employee-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      const action = button.dataset.employeeAction;
      if (action === "pix") updateEmployeeAppointment(index, { pixPaid: true, pixPaidAt: new Date().toISOString() }, "Pix marcado como pago.");
      if (action === "confirm") updateEmployeeAppointment(index, { status: "Confirmado" }, "Presença confirmada.");
      if (action === "finish") updateEmployeeAppointment(index, { status: "Finalizado", finishedAt: new Date().toISOString() }, "Atendimento finalizado.");
      if (action === "miss") updateEmployeeAppointment(index, { status: "Faltou", missedAt: new Date().toISOString() }, "Falta registrada.");
    });
  });
}

function fillSlot(index) {
  openInviteModal(index);
}

function renderSuggestions() {
  const clients = highIntentClients();
  const hotClients = clients.filter((client) => client.intent === "Alta");
  const selectedClients = hotClients.length  ?hotClients : clients.slice(0, 3);
  const selectedRevenue = selectedClients.reduce((sum, client) => sum + Number(client.value || 0), 0);
  const pixPending = dayAppointments().filter((item) => item.status === "Sinal Pix" && !item.pixPaid);
  const frequentClients = (state.clients || []).filter((client) => client.status !== "Inativo").length || Math.max(1, Math.round((state.clubPlans || []).reduce((sum, plan) => sum + Number(plan.subscribers || 0), 0) / 6));
  const frequentLabel = `${frequentClients} cliente${frequentClients === 1  ?"" : "s"} frequente${frequentClients === 1  ?"" : "s"}`;
  const suggestions = [
    { title: `Chamar ${selectedClients.length} clientes para retorno`, subtitle: `Potencial estimado de ${money.format(selectedRevenue)}`, action: "reactivation", button: "Selecionar clientes" },
    {
      title: pixPending.length  ?`Revisar sinal de ${pixPending.length} atendimento${pixPending.length > 1  ?"s" : ""}` : "Preparar lista para cancelamentos",
      subtitle: pixPending.length  ?"Reduz risco de falta hoje" : "Mantém encaixes prontos para o dia",
      action: "pix",
      button: pixPending.length  ?"Ver agenda" : "Abrir lista",
    },
    { title: `Oferecer fidelização para ${frequentLabel}`, subtitle: `Receita prevista de ${money.format(frequentClients * 129)}`, action: "club", button: "Ver clientes" },
  ];

  document.querySelector("#smartSuggestions").innerHTML = suggestions
    .map(
      (item) => `
        <div class="suggestion">
          <div>
            <strong>${esc(item.title)}</strong>
            <span>${esc(item.subtitle)}</span>
          </div>
          <button class="tiny-button" data-suggestion="${item.action}" type="button">${esc(item.button)}</button>
        </div>
      `,
    )
    .join("");

  document.querySelectorAll("[data-suggestion]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.suggestion;
      if (action === "reactivation") {
        document.querySelector('[data-view="reactivation"]').click();
        state.inactiveClients.forEach((client) => {
          client.selected = client.intent === "Alta";
        });
        saveState();
        renderInactiveClients();
        showToast("Clientes quentes selecionados para campanha de retorno.");
        return;
      }

      if (action === "club") {
        document.querySelector('[data-view="club"]').click();
        showToast("Ofertas de clube prontas para clientes frequentes.");
        return;
      }

      const pixPending = dayAppointments().filter((item) => item.status === "Sinal Pix" && !item.pixPaid);
      document.querySelector(`[data-view="${pixPending.length  ?"dashboard" : "waitlist"}"]`).click();
      showToast(pixPending.length  ?"Revise os sinais Pix pendentes na agenda." : "Lista aberta para preparar encaixes.");
    });
  });
}

function renderInactiveClients() {
  const clients = state.inactiveClients || [];
  const highIntent = clients.filter((client) => client.intent === "Alta");
  const totalPotential = clients.reduce((sum, client) => sum + Number(client.value || 0), 0);
  const maxDays = clients.reduce((max, client) => Math.max(max, Number(client.lastVisit || 0)), 0);
  const highIntentSummary = document.querySelector("#highIntentSummary");
  const potentialSummary = document.querySelector("#potentialSummary");
  const windowSummary = document.querySelector("#windowSummary");

  if (highIntentSummary) highIntentSummary.textContent = String(highIntent.length);
  if (potentialSummary) potentialSummary.textContent = money.format(totalPotential);
  if (windowSummary) windowSummary.textContent = `${maxDays} dias`;

  inactiveClients.innerHTML = `
    <div class="return-table-head" aria-hidden="true">
      <span>Cliente</span>
      <span>Última visita</span>
      <span>Ticket estimado</span>
      <span>Chance</span>
      <span>Seleção</span>
    </div>
    ${clients
      .map((client, index) => {
        const intentLabel = client.intent === "Média"  ?"Média" : client.intent;
        return `
          <label class="client-row return-row">
            <span class="return-client">
              <input class="return-checkbox" type="checkbox" data-client="${index}" ${client.selected ?"checked" : ""} />
              <span>
                <strong>${esc(client.name)}</strong>
                <small>${esc(client.favoriteService || "Serviço preferido não informado")}</small>
              </span>
            </span>
            <span class="return-cell">
              <small>Última visita</small>
              <strong>${esc(client.lastVisit)} dias</strong>
            </span>
            <span class="return-cell">
              <small>Ticket estimado</small>
              <strong>${money.format(client.value)}</strong>
            </span>
            <span class="return-cell">
              <small>Chance de retorno</small>
              <strong>${esc(intentLabel)}</strong>
            </span>
            <span class="${client.selected ?"status-pill good" : "status-pill"}">${client.selected ?"Selecionado" : "Não selecionado"}</span>
          </label>
        `;
      })
      .join("")}
  `;

  document.querySelectorAll("[data-client]").forEach((input) => {
    input.addEventListener("change", () => {
      state.inactiveClients[Number(input.dataset.client)].selected = input.checked;
      saveState();
      updateCampaignResult();
    });
  });

  updateCampaignResult();
}

function updateCampaignResult() {
  const selected = state.inactiveClients.filter((client) => client.selected);
  const total = selected.reduce((sum, client) => sum + client.value, 0);
  document.querySelector("#campaignResult").textContent = `${selected.length} clientes selecionados. Potencial: ${money.format(total)}.`;
}

function renderWaitlist() {
  waitlistGrid.innerHTML = state.waitlist
    .map(
      (item) => `
        <article class="wait-card">
          <strong>${esc(item.period)}</strong>
          <span>${esc(item.people)} clientes esperando · melhor chance: ${esc(item.best)} (${esc(item.chance)})</span>
          <button class="tiny-button" data-wait-period="${esc(item.period)}" type="button">Enviar convites</button>
        </article>
      `,
    )
    .join("");

  document.querySelectorAll("[data-wait-period]").forEach((button) => {
    button.addEventListener("click", () => {
      showToast(`Convites enviados para a lista do período ${button.dataset.waitPeriod}.`);
    });
  });
}

function renderCampaignHistory() {
  if (!campaignHistory) return;
  const campaigns = state.campaigns || [];
  campaignHistory.innerHTML = campaigns
    .slice(0, 4)
    .map(
      (campaign) => `
        <article>
          <strong>${esc(campaign.name)}</strong>
          <span>${esc(campaign.status)} · ${Number(campaign.sent || 0)} enviados · ${Number(campaign.responses || 0)} respostas · ${Number(campaign.bookings || 0)} agendamentos · ${money.format(Number(campaign.revenue || 0))}</span>
          <div class="campaign-actions">
            <button class="tiny-button" data-campaign-action="pause" data-campaign-id="${esc(campaign.id)}" type="button">${campaign.status === "Pausada"  ?"Retomar" : "Pausar"}</button>
            <button class="tiny-button" data-campaign-action="duplicate" data-campaign-id="${esc(campaign.id)}" type="button">Duplicar</button>
            <button class="tiny-button" data-campaign-action="delete" data-campaign-id="${esc(campaign.id)}" type="button">Excluir</button>
          </div>
        </article>
      `,
    )
    .join("");

  document.querySelectorAll("[data-campaign-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const campaign = state.campaigns.find((item) => item.id === button.dataset.campaignId);
      if (!campaign) return;
      const action = button.dataset.campaignAction;
      if (action === "delete") {
        state.campaigns = state.campaigns.filter((item) => item.id !== campaign.id);
        if (apiEnabled) await apiFetch(`/api/campaigns/${campaign.id}`, { method: "DELETE" }).catch(() => {});
        saveState();
        renderAll();
        showToast("Campanha excluída.");
        return;
      }
      if (action === "duplicate") {
        const copy = { ...campaign, id: `camp-${Date.now().toString(36)}`, name: `${campaign.name} cópia`, status: "Rascunho", sent: 0, responses: 0, bookings: 0, revenue: 0 };
        state.campaigns.unshift(copy);
        saveState();
        renderAll();
        showToast("Campanha duplicada como rascunho.");
        return;
      }
      campaign.status = campaign.status === "Pausada"  ?"Enviada" : "Pausada";
      await persistCampaign(campaign);
      saveState();
      renderAll();
      showToast(`Campanha ${campaign.status.toLowerCase()}.`);
    });
  });
}

function renderMessageOutbox() {
  if (!messageOutbox) return;
  const messages = (state.messageHistory || []).slice(0, 6);
  messageOutbox.innerHTML = messages.length
    ?
    messages
        .map(
          (message) => {
            const statusClass = message.status === "Agendado"  ?"good" : message.status === "Sem resposta"  ?"warning" : "";
            const details = [
              message.time  ?`${message.time}${message.barber  ?` com ${message.barber}` : ""}` : "",
              message.service || "",
              message.value  ?`Ticket ${money.format(Number(message.value || 0))}` : "",
            ].filter(Boolean).join(" · ");
            return `
            <article class="message-card">
              <div class="message-card-main">
                <div>
                  <strong>${esc(message.client)}</strong>
                  <span>${esc(details || "Mensagem de retorno")}</span>
                </div>
                <span class="status-pill ${statusClass}">${esc(message.status)}</span>
              </div>
              <div class="message-meta">
                <span>WhatsApp</span>
                <strong>${esc(message.phone || "sem número cadastrado")}</strong>
              </div>
              <div class="campaign-actions">
                ${message.link  ?`<a class="tiny-button as-link" href="${esc(message.link)}" target="_blank" rel="noreferrer" data-message-sent="${esc(message.id)}">Abrir WhatsApp</a>` : ""}
                ${message.clientId ? `<button class="tiny-button" data-cloud-send="${esc(message.id)}" type="button">Enviar Cloud API</button>` : ""}
                <button class="tiny-button" data-copy-message="${esc(message.id)}" type="button">Copiar texto</button>
                ${message.type === "slot_invite" && message.status !== "Agendado"  ?`<button class="tiny-button" data-invite-response="${esc(message.id)}" type="button">Respondeu</button><button class="tiny-button" data-invite-book="${esc(message.id)}" type="button">Agendar</button>` : ""}
              </div>
            </article>
          `;
          },
        )
        .join("")
    : `<article><span>Nenhuma mensagem gerada ainda.</span></article>`;

  document.querySelectorAll("[data-copy-message]").forEach((button) => {
    button.addEventListener("click", async () => {
      const message = state.messageHistory.find((item) => item.id === button.dataset.copyMessage);
      if (!message) return;
      try {
        await navigator.clipboard.writeText(message.message);
      } catch (error) {
        // Clipboard can fail in local contexts; the message remains visible in history.
      }
      message.status = "Copiada";
      saveState();
      renderMessageOutbox();
      showToast("Mensagem copiada.");
    });
  });

  document.querySelectorAll("[data-cloud-send]").forEach((button) => {
    button.addEventListener("click", async () => {
      const message = state.messageHistory.find((item) => item.id === button.dataset.cloudSend);
      if (!message?.clientId) return;
      const response = await apiFetch("/api/whatsapp/send-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: message.clientId, variables: [message.client] }),
      }).catch(() => null);
      if (!response?.ok) {
        const result = response ? await response.json().catch(() => ({})) : {};
        showToast(result.error === "whatsapp_consent_required" ? "Registre o consentimento WhatsApp do cliente antes do envio." : "Envio não realizado. Confirme a configuração da Cloud API.");
        return;
      }
      const result = await response.json();
      message.status = result.simulated ? "Modo teste: pronto" : "Enviada via API";
      if (!result.simulated) {
        const campaign = state.campaigns.find((item) => item.id === message.campaignId);
        if (campaign) {
          campaign.sent = Number(campaign.sent || 0) + 1;
          campaign.status = "Em envio";
          await persistCampaign(campaign);
        }
      }
      saveState(); renderAll();
      showToast(result.simulated ? "Integração pronta; ative as credenciais da Meta para envio real." : "Mensagem enviada pela Cloud API.");
    });
  });

  document.querySelectorAll("[data-message-sent]").forEach((link) => {
    link.addEventListener("click", () => {
      const message = state.messageHistory.find((item) => item.id === link.dataset.messageSent);
      if (!message) return;
      message.status = "Aberta no WhatsApp";
      saveState();
      renderMessageOutbox();
    });
  });

  document.querySelectorAll("[data-invite-response]").forEach((button) => {
    button.addEventListener("click", () => {
      updateInviteStatus(button.dataset.inviteResponse, "Cliente respondeu");
    });
  });

  document.querySelectorAll("[data-invite-book]").forEach((button) => {
    button.addEventListener("click", () => {
      const message = state.messageHistory.find((item) => item.id === button.dataset.inviteBook);
      if (message) bookInvite(message);
    });
  });
}

function bookInvite(message) {
  const slot = state.appointments[Number(message.appointmentIndex)];
  if (!slot || !slot.open) {
    message.status = "Horário indisponível";
    saveState();
    renderAll();
    showToast("Esse horário não está mais disponível.");
    return;
  }
  slot.client = message.client;
  slot.status = "Recuperado";
  slot.open = false;
  slot.recovered = true;
  state.recoveredRevenue += Number(message.value || 0);
  state.openSlots = state.appointments.filter((item) => item.open).length;
  message.status = "Agendado";
  message.bookedAt = new Date().toISOString();
  saveState();
  renderAll();
  showToast("Cliente agendado e receita recuperada registrada.");
}

function updateInviteStatus(id, status) {
  const message = state.messageHistory.find((item) => item.id === id);
  if (!message) return;
  message.status = status;
  message.updatedAt = new Date().toISOString();
  saveState();
  renderAll();
  showToast(status === "Sem resposta"  ?"Convite marcado como sem resposta." : "Status do convite atualizado.");
}

function renderDashboardInviteQueue() {
  if (!dashboardInviteQueue) return;
  const invites = (state.messageHistory || []).filter((message) => message.type === "slot_invite").slice(0, 4);
  dashboardInviteQueue.innerHTML = invites.length
    ?
    invites
        .map((message) => {
          const isFinal = ["Agendado", "Sem resposta", "Horário indisponível"].includes(message.status);
          const canMarkResponse = !isFinal && message.status !== "Cliente respondeu";
          const canBook = !isFinal;
          const canMiss = !isFinal;
          const actions = [
            canMarkResponse  ?`<button class="tiny-button" data-dashboard-invite-response="${esc(message.id)}" type="button">Respondeu</button>` : "",
            canBook  ?`<button class="tiny-button" data-dashboard-invite-book="${esc(message.id)}" type="button">Agendar</button>` : "",
            canMiss  ?`<button class="tiny-button" data-dashboard-invite-miss="${esc(message.id)}" type="button">Sem resposta</button>` : "",
          ].join("");
          const statusClass = message.status === "Agendado"  ?"good" : message.status === "Sem resposta"  ?"warning" : message.status === "Cliente respondeu"  ?"info" : "";
          return `
            <article class="invite-card">
              <div class="invite-card-main">
                <div>
                  <strong>${esc(message.time || "--:--")} · ${esc(message.client)}</strong>
                  <span>${esc([message.barber, message.service].filter(Boolean).join(" · ") || "Encaixe sugerido")}</span>
                </div>
                <span class="status-pill ${statusClass}">${esc(message.status)}</span>
              </div>
              <div class="invite-card-meta">
                <span>Ticket estimado</span>
                <strong>${money.format(Number(message.value || 0))}</strong>
              </div>
              ${actions  ?`<div class="campaign-actions">${actions}</div>` : ""}
            </article>
          `;
        })
        .join("")
    : `<article><span>Nenhum convite enviado ainda. Use a prioridade principal para iniciar.</span></article>`;

  document.querySelectorAll("[data-dashboard-invite-response]").forEach((button) => {
    button.addEventListener("click", () => updateInviteStatus(button.dataset.dashboardInviteResponse, "Cliente respondeu"));
  });
  document.querySelectorAll("[data-dashboard-invite-miss]").forEach((button) => {
    button.addEventListener("click", () => updateInviteStatus(button.dataset.dashboardInviteMiss, "Sem resposta"));
  });
  document.querySelectorAll("[data-dashboard-invite-book]").forEach((button) => {
    button.addEventListener("click", () => {
      const message = state.messageHistory.find((item) => item.id === button.dataset.dashboardInviteBook);
      if (message) bookInvite(message);
    });
  });
}

function renderClubPlans() {
  clubPlans.innerHTML = state.clubPlans
    .map(
      (plan) => `
        <article class="club-plan">
          <strong>${esc(plan.name)}</strong>
          <span>${money.format(plan.price)}/mês</span>
          <p>${esc(plan.perk)}</p>
          <small>${plan.subscribers} assinantes ativos</small>
          <button class="tiny-button" type="button">Enviar oferta</button>
        </article>
      `,
    )
    .join("");

  const total = state.clubPlans.reduce((sum, plan) => sum + plan.price * plan.subscribers, 0);
  document.querySelector("#clubRevenue").textContent = money.format(total);
}

function renderSetup() {
  if (!setupList) return;
  const whatsapp = state.integrations?.whatsapp || {};
  const steps = [
    ["Serviços e duração", state.services.length > 0, state.services.length ? `${state.services.length} serviço${state.services.length > 1 ? "s" : ""} configurado${state.services.length > 1 ? "s" : ""}` : "Cadastre os serviços oferecidos"],
    ["Equipe", state.professionals.length > 0, state.professionals.length ? `${state.professionals.length} profissional${state.professionals.length > 1 ? "is" : ""} ativo${state.professionals.length > 1 ? "s" : ""}` : "Cadastre os profissionais da agenda"],
    ["WhatsApp", Boolean(whatsapp.tokenConfigured && whatsapp.phoneNumberIdConfigured), whatsapp.tokenConfigured && whatsapp.phoneNumberIdConfigured ? "Conexão oficial ativa" : "Conecte o número oficial da barbearia"],
    ["Clientes", state.clients.length > 0, state.clients.length ? `${state.clients.length} cliente${state.clients.length > 1 ? "s" : ""} na base` : "Cadastre ou importe a base de clientes"],
    ["Primeira campanha", state.campaigns.length > 0, state.campaigns.length ? `${state.campaigns.length} campanha${state.campaigns.length > 1 ? "s" : ""} registrada${state.campaigns.length > 1 ? "s" : ""}` : "Crie a primeira campanha de retorno"],
  ];

  setupList.innerHTML = steps
    .map(
      ([title, complete, subtitle]) => `
        <div class="setup-item">
          <div>
            <strong>${esc(title)}</strong>
            <span>${esc(subtitle)}</span>
          </div>
          <span class="setup-check ${complete ? "complete" : "pending"}" aria-label="${complete ? "Concluído" : "Pendente"}">${complete ? "✓" : "•"}</span>
        </div>
      `,
    )
    .join("");
}

function renderOnboarding() {
  if (!onboardingList) return;
  const items = [
    ["Clientes importados", state.clients.length > 0],
    ["Serviços configurados", state.services.length > 0],
    ["Profissionais configurados", state.professionals.length > 0],
    ["Mensagem de retorno pronta", Boolean(document.querySelector("#campaignText").value)],
    ["Campanha registrada", state.campaigns.length > 0],
  ];
  onboardingList.innerHTML = items
    .map(
      ([label, checked]) => `
        <label>
          <input type="checkbox" ${checked  ?"checked" : ""} disabled />
          <span>${label}</span>
        </label>
      `,
    )
    .join("");
}

function renderOperationsSetup() {
  if (servicesList) {
    servicesList.innerHTML = state.services
      .map(
        (service) => `
          <article class="setup-entity-card">
            <div>
              <strong>${esc(service.name)}</strong>
              <span>Preço ${money.format(Number(service.price || 0))} · duração ${Number(service.duration || 0)} min</span>
            </div>
            <button class="tiny-button" data-delete-service="${esc(service.id)}" type="button">Remover</button>
          </article>
        `,
      )
      .join("");
  }

  if (professionalsList) {
    professionalsList.innerHTML = state.professionals
      .map(
        (professional) => `
          <article class="setup-entity-card">
            <div>
              <strong>${esc(professional.name)}</strong>
              <span>${Number(professional.commission || 0)}% comissão · ${professional.active  ?"ativo" : "inativo"}</span>
            </div>
            <button class="tiny-button" data-delete-professional="${esc(professional.id)}" type="button">Remover</button>
          </article>
        `,
      )
      .join("");
  }

  document.querySelectorAll("[data-delete-service]").forEach((button) => {
    button.addEventListener("click", () => {
      state.services = state.services.filter((service) => service.id !== button.dataset.deleteService);
      saveState();
      renderAll();
      showToast("Serviço removido.");
    });
  });

  document.querySelectorAll("[data-delete-professional]").forEach((button) => {
    button.addEventListener("click", () => {
      state.professionals = state.professionals.filter((professional) => professional.id !== button.dataset.deleteProfessional);
      saveState();
      renderAll();
      showToast("Profissional removido.");
    });
  });
}

function renderShopSettings() {
  const form = document.querySelector("#shopSettingsForm");
  if (!form) return;
  const shop = currentShop();
  form.elements.name.value = shop.name || "";
  form.elements.city.value = shop.city || "";
  form.elements.openTime.value = shop.openTime || "09:00";
  form.elements.closeTime.value = shop.closeTime || "19:00";
  form.elements.depositRequired.checked = Boolean(state.publicBooking.depositRequired);
}

function renderIntegrations() {
  if (!integrationStatus) return;
  const whatsapp = state.integrations.whatsapp || defaultState.integrations.whatsapp;
  const pix = state.integrations.pix || defaultState.integrations.pix;
  const publicBooking = state.publicBooking || defaultState.publicBooking;
  const fields = {
    whatsappProvider: whatsapp.provider || "whatsapp_cloud_api",
    whatsappMode: whatsapp.mode || "sandbox",
    whatsappTemplate: whatsapp.defaultTemplate || "retorno_cliente_sumido",
    whatsappTemplateLanguage: whatsapp.templateLanguage || "pt_BR",
    whatsappSlotInviteTemplate: whatsapp.slotInviteTemplate || "encaixe_horario_vago",
    whatsappReminderTemplate: whatsapp.reminderTemplate || "lembrete_agendamento",
    pixProvider: pix.provider || "manual_pix",
    pixMode: pix.mode || "sandbox",
    pixKey: pix.key || "",
    pixDepositAmount: pix.depositAmount || 15,
    publicBookingSlug: publicBooking.slug || "barbearia-alpha",
  };

  Object.entries(fields).forEach(([id, value]) => {
    const input = document.querySelector(`#${id}`);
    if (input) input.value = value;
  });
  ["whatsappBusinessAccountId", "whatsappPhoneNumberId", "whatsappAccessToken", "whatsappAppSecret", "whatsappVerifyToken"].forEach((id) => {
    const input = document.querySelector(`#${id}`);
    if (input) input.value = "";
  });
  const clearCredentials = document.querySelector("#whatsappClearCredentials");
  if (clearCredentials) clearCredentials.checked = false;

  const publicToggle = document.querySelector("#publicBookingEnabled");
  if (publicToggle) publicToggle.checked = Boolean(publicBooking.enabled);

  const publicUrl = `${window.location.origin}/public.html?barbearia=${publicBooking.slug || "barbearia-alpha"}`;
  if (bookingLink) {
    bookingLink.textContent = publicUrl;
    bookingLink.href = publicUrl;
  }
  const whatsappConnection = whatsapp.displayPhoneNumber || whatsapp.phoneNumberIdMasked || "não configurado";
  const whatsappMetaState = whatsapp.embeddedSignupConfigured
    ? `Meta conectada${whatsapp.verifiedName ? ` · ${whatsapp.verifiedName}` : ""}`
    : (whatsapp.embeddedSignupReady ? "Meta pronta para conectar" : "Meta pendente no servidor");
  const whatsappReady = Boolean(whatsapp.tokenConfigured && whatsapp.phoneNumberIdConfigured);
  const whatsappStatusLabel = whatsappReady ? "WhatsApp conectado" : (whatsapp.embeddedSignupReady ? "Pronto para conectar" : "Aguardando configuração");

  integrationStatus.innerHTML = `
    <article class="integration-status-card">
      <strong>WhatsApp</strong>
      <span>${esc(whatsappStatusLabel)}</span>
      <small>${esc(whatsappMetaState)} · número ${esc(whatsappConnection)}</small>
    </article>
    <article class="integration-status-card">
      <strong>Pix</strong>
      <span>${pix.key ? "Pix configurado" : "Pix pendente"}</span>
      <small>sinal ${money.format(Number(pix.depositAmount || 15))} · ${pix.key  ?"chave configurada" : "sem chave"}</small>
    </article>
  `;
}

function renderTenantAndPermissions() {
  if (barbershopList) {
    barbershopList.innerHTML = (state.barbershops || [])
      .map(
        (barbershop) => `
          <article>
            <div>
              <strong>${esc(barbershop.name)}</strong>
              <span>${esc(barbershop.city || "cidade não informada")} · ${esc(barbershop.plan || "Plano")} · ${money.format(Number(barbershop.monthlyPrice || 0))}/mês</span>
            </div>
            <span class="status-pill ${barbershop.active  ?"good" : "warning"}">${barbershop.active  ?"Ativa" : "Pausada"}</span>
          </article>
        `,
      )
      .join("");
  }

  if (userList) {
    const roleLabels = { owner: "Dono", manager: "Gerente", barber: "Barbeiro" };
    userList.innerHTML = (state.users || [])
      .map(
        (user) => `
          <article>
            <div>
              <strong>${esc(user.name)}</strong>
              <span>${esc(user.email)} · ${esc(roleLabels[user.role] || user.role || "Equipe")}</span>
            </div>
            <span class="status-pill ${user.active !== false  ?"good" : "warning"}">${user.active !== false  ?"Ativo" : "Inativo"}</span>
          </article>
        `,
      )
      .join("");
  }
}

function renderBilling() {
  const shop = currentShop() || {};
  const billing = shop.billing || {};
  const status = shop.subscriptionStatus || billing.status || "pending";
  const label = {
    active: "Assinatura ativa",
    trialing: "Período de teste",
    past_due: "Pagamento pendente",
    unpaid: "Pagamento em aberto",
    canceled: "Assinatura cancelada",
    pending: "Aguardando assinatura",
  }[status] || status;
  const statusEl = document.querySelector("#billingStatus");
  if (statusEl) statusEl.textContent = label;
  const message = document.querySelector("#billingMessage");
  if (message) {
    message.textContent = billing.lastEvent
      ? `Último evento Stripe: ${billing.lastEvent}.`
      : "Plano Business Barber: R$ 119,90/mês.";
  }
}

function renderAudit() {
  if (!auditList) return;
  const logs = (state.auditLogs || []).slice(0, 10);
  auditList.innerHTML = logs.length
    ?
    logs
        .map(
          (log) => `
            <article>
              <div>
                <strong>${esc(log.action)}</strong>
                <span>${new Date(log.at).toLocaleString("pt-BR")} · ${esc(log.actor || "sistema")}</span>
              </div>
            </article>
          `,
        )
        .join("")
    : `<article><span>Nenhuma ação registrada ainda.</span></article>`;
}

function renderPilot() {
  if (!pilotSteps || !pilotQuestions) return;
  const steps = [
    ["Mostrar a dor", "Comece pela frase: cadeira vazia não vira faturamento."],
    ["Quantificar perda", "Pergunte quantos horários vagos e faltas aconteceram na última semana."],
    ["Mostrar recuperação", "Use o botão Resolver agora para preencher um horário vago."],
    ["Abrir reativação", "Mostre clientes sumidos e selecione os mais quentes."],
    ["Fechar piloto", "Ofereça R$ 119,90/mês + implantação assistida com meta de recuperar a mensalidade."],
  ];

  const questions = [
    "Quantos profissionais atendem hoje",
    "Como vocês controlam agenda e confirmação",
    "Quantos clientes faltam ou cancelam por semana",
    "O que vocês fazem quando sobra horário vazio",
    "Você pagaria R$ 119,90/mês se recuperasse mais do que isso em atendimentos",
  ];

  pilotSteps.innerHTML = steps
    .map(
      ([title, text], index) => `
        <article class="pilot-step">
          <span class="step-number">${index + 1}</span>
          <div>
            <strong>${title}</strong>
            <p>${text}</p>
          </div>
        </article>
      `,
    )
    .join("");

  pilotQuestions.innerHTML = questions
    .map(
      (question, index) => `
        <article class="question-item">
          <span class="step-number">${index + 1}</span>
          <div>
            <strong>Pergunta ${index + 1}</strong>
            <p>${question}</p>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderPipeline() {
  if (!pipelineBoard) return;
  const statusClass = {
    "Contato inicial": "warning",
    "Demo marcada": "",
    "Piloto proposto": "good",
    "Piloto pago": "good",
  };

  pipelineBoard.innerHTML = state.prospects
    .map(
      (prospect, index) => `
        <article class="pipeline-card">
          <header>
            <div>
              <strong>${esc(prospect.barbershop)}</strong>
              <span>${esc(prospect.owner)} · ${Number(prospect.team || 0)} profissionais</span>
            </div>
            <span class="status-pill ${statusClass[prospect.status] || ""}">${esc(prospect.status)}</span>
          </header>
          <p>${esc(prospect.pain)}</p>
          <span>Próximo passo: ${esc(prospect.next)}</span>
          <div class="pipeline-actions">
            <button class="tiny-button" data-pipeline-action="advance" data-prospect="${index}" type="button">Avançar</button>
            <button class="tiny-button" data-pipeline-action="demo" data-prospect="${index}" type="button">Abrir roteiro</button>
          </div>
        </article>
      `,
    )
    .join("");

  document.querySelectorAll("[data-pipeline-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const prospect = state.prospects[Number(button.dataset.prospect)];
      if (!prospect) return;

      if (button.dataset.pipelineAction === "demo") {
        document.querySelector('[data-view="pilot"]').click();
        showToast(`Use o roteiro de piloto com ${prospect.owner}, da ${prospect.barbershop}.`);
        return;
      }

      advanceProspect(prospect);
      renderAll();
    });
  });
}

function renderClientsAdmin() {
  if (!clientAdminList) return;
  if (!state.clients.length) {
    clientAdminList.innerHTML = `
      <div class="client-admin-card">
        <div>
          <strong>Nenhum cliente cadastrado</strong>
          <span>Importe um CSV ou cadastre manualmente para iniciar campanhas reais.</span>
        </div>
      </div>
    `;
    return;
  }

  clientAdminList.innerHTML = state.clients
    .map(
      (client) => `
        <article class="client-admin-card">
          <div>
            <strong>${esc(client.name)}</strong>
            <span>${esc(client.phone || "sem WhatsApp")} · ${esc(client.favoriteService || "serviço não informado")} · ${client.consentWhatsapp ? "WhatsApp autorizado" : "sem consentimento WhatsApp"}</span>
          </div>
          <span>${money.format(Number(client.ticket || 0))}</span>
          <div class="campaign-actions">
            <button class="tiny-button" data-client-history="${esc(client.id)}" type="button">Histórico</button>
            <button class="tiny-button" data-delete-client="${esc(client.id)}" type="button">Remover</button>
          </div>
        </article>
      `,
    )
    .join("");

  document.querySelectorAll("[data-delete-client]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.deleteClient;
      state.clients = state.clients.filter((client) => client.id !== id);
      saveState();
      if (apiEnabled) {
        await apiFetch(`/api/clients/${id}`, { method: "DELETE" }).catch(() => {});
      }
      renderAll();
      showToast("Cliente removido da base.");
    });
  });
  document.querySelectorAll("[data-client-history]").forEach((button) => {
    button.addEventListener("click", () => renderClientHistory(button.dataset.clientHistory));
  });
}

function renderClientHistory(clientId) {
  const client = state.clients.find((item) => item.id === clientId);
  if (!clientHistoryBox || !client) return;
  clientHistoryBox.hidden = false;
  const appointments = state.appointments.filter((item) => item.client === client.name);
  const campaigns = (state.campaigns || []).filter((campaign) => (campaign.recipients || []).includes(client.name));
  const total = appointments.reduce((sum, item) => {
    const service = state.services.find((svc) => svc.name === item.service);
    return sum + Number(service.price || client.ticket || 0);
  }, 0);
  clientHistoryBox.innerHTML = `
    <span class="eyebrow">Histórico do cliente</span>
    <strong>${esc(client.name)}</strong>
    <p>${appointments.length} atendimentos registrados · ${campaigns.length} campanhas recebidas · ${money.format(total)} em valor estimado.</p>
    <div class="report-list">
      ${appointments.map((item) => `<article><strong>${esc(item.time)} · ${esc(item.service)}</strong><span>${esc(item.barber)} · ${esc(item.status)}</span></article>`).join("") || "<article><span>Nenhum atendimento registrado.</span></article>"}
    </div>
  `;
}

function renderRoi() {
  if (!document.querySelector("#roiRevenue")) return;
  const ticket = Number(document.querySelector("#roiTicket").value || 0);
  const recovered = Number(document.querySelector("#roiRecovered").value || 0);
  const monthly = Number(document.querySelector("#roiMonthly").value || 1);
  const revenue = ticket * recovered;
  const net = revenue - monthly;
  const multiple = monthly > 0  ?revenue / monthly : 0;
  const breakEven = ticket > 0  ?Math.ceil(monthly / ticket) : 0;

  document.querySelector("#roiRevenue").textContent = money.format(revenue);
  document.querySelector("#roiNet").textContent = money.format(net);
  document.querySelector("#roiMultiple").textContent = `${multiple.toFixed(1)}x`;
  document.querySelector("#breakEvenText").textContent = `Com ${breakEven} clientes recuperados, a mensalidade já se paga.`;
  const realRevenue = (state.campaigns || []).reduce((sum, campaign) => sum + Number(campaign.revenue || 0), 0);
  const realBookings = (state.campaigns || []).reduce((sum, campaign) => sum + Number(campaign.bookings || 0), 0);
  document.querySelector("#realRoiRevenue").textContent = money.format(realRevenue);
  document.querySelector("#realRoiSummary").textContent = `${realBookings} agendamentos atribuídos a campanhas registradas.`;
}

function renderReports() {
  if (!reportGrid || !campaignReportList) return;
  const campaigns = state.campaigns || [];
  const appointments = state.appointments || [];
  const slotInvites = (state.messageHistory || []).filter((message) => message.type === "slot_invite");
  const paidPix = (state.pixCharges || []).filter((charge) => String(charge.status || "").toLowerCase().includes("pago"));
  const sent = campaigns.reduce((sum, item) => sum + Number(item.sent || 0), 0);
  const responses = campaigns.reduce((sum, item) => sum + Number(item.responses || 0), 0);
  const bookings = campaigns.reduce((sum, item) => sum + Number(item.bookings || 0), 0);
  const revenue = campaigns.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
  const funnelSent = slotInvites.length;
  const funnelResponses = slotInvites.filter((message) => message.respondedAt || ["Cliente respondeu", "Agendado", "Aguardando Pix", "Recusado"].includes(message.status)).length;
  const funnelBooked = slotInvites.filter((message) => ["Agendado", "Aguardando Pix"].includes(message.status)).length;
  const funnelDeclined = slotInvites.filter((message) => message.status === "Recusado").length;
  const funnelNoResponse = slotInvites.filter((message) => ["Sem resposta", "Convite enviado", "Sandbox: pronto", "Modo teste: pronto", "Pronto para envio", "Aguardando resposta"].includes(message.status)).length;
  const funnelRevenue = slotInvites
    .filter((message) => ["Agendado", "Aguardando Pix"].includes(message.status))
    .reduce((sum, message) => sum + Number(message.value || 0), 0);
  const confirmedRevenue = appointments
    .filter((item) => !item.open)
    .reduce((sum, appointment) => {
      const service = state.services.find((item) => item.name === appointment.service);
      return sum + Number(service?.price || appointment.value || 0);
    }, 0);
  const pixRevenue = paidPix.reduce((sum, charge) => sum + Number(charge.amount || 0), 0);
  const responseRate = sent  ?Math.round((responses / sent) * 100) : 0;
  const bookingRate = sent  ?Math.round((bookings / sent) * 100) : 0;
  const inviteResponseRate = funnelSent ? Math.round((funnelResponses / funnelSent) * 100) : 0;
  const inviteBookingRate = funnelSent ? Math.round((funnelBooked / funnelSent) * 100) : 0;
  const openSlots = appointments.filter((item) => item.open).length;
  const recoveredSlots = appointments.filter((item) => item.recovered).length;
  const roi = revenue  ?(revenue / 119.9).toFixed(1) : "0.0";
  const cards = [
    ["Convites enviados", String(funnelSent), "Total de encaixes disparados"],
    ["Respostas recebidas", `${inviteResponseRate}%`, `${funnelResponses}/${funnelSent} clientes responderam`],
    ["Agendados pelo funil", `${inviteBookingRate}%`, `${funnelBooked}/${funnelSent} viraram horário`],
    ["Sem resposta", String(funnelNoResponse), `${funnelDeclined} recusaram o convite`],
    ["Receita recuperada no funil", money.format(funnelRevenue), "Ticket dos convites agendados"],
    ["Receita recuperada", money.format(revenue), "Baseada em campanhas registradas"],
    ["Receita confirmada", money.format(confirmedRevenue), "Soma dos serviços agendados"],
    ["Sinais Pix pagos", money.format(pixRevenue), `${paidPix.length} pagamentos marcados manualmente`],
    ["Taxa de resposta", `${responseRate}%`, `${responses}/${sent} contatos responderam`],
    ["Taxa de agendamento", `${bookingRate}%`, `${bookings}/${sent} contatos agendaram`],
    ["Horários preenchidos", String(recoveredSlots), `${openSlots} horários ainda vagos`],
    ["ROI sobre mensalidade", `${roi}x`, "Referência: R$ 119,90/mês"],
    ["Sinais confirmados", money.format(pixRevenue), "Valores registrados no sistema"],
  ];
  reportGrid.innerHTML = cards
    .map(([title, value, subtitle]) => `<article class="report-card"><span>${esc(title)}</span><strong>${esc(value)}</strong><span>${esc(subtitle)}</span></article>`)
    .join("");
  campaignReportList.innerHTML = campaigns
    .map((campaign) => {
      const rate = campaign.sent  ?Math.round((Number(campaign.bookings || 0) / Number(campaign.sent || 1)) * 100) : 0;
      return `<article><strong>${esc(campaign.name)}</strong><span>${esc(campaign.status)} · ${Number(campaign.responses || 0)}/${Number(campaign.sent || 0)} respostas · ${Number(campaign.bookings || 0)} agendamentos · ${rate}% conversão · ${money.format(Number(campaign.revenue || 0))}</span></article>`;
    })
    .join("") || `<article><span>Nenhuma campanha registrada ainda.</span></article>`;
}

function advanceProspect(prospect) {
  const flow = ["Contato inicial", "Demo marcada", "Piloto proposto", "Piloto pago"];
  const currentIndex = flow.indexOf(prospect.status);
  const nextStatus = flow[Math.min(currentIndex + 1, flow.length - 1)];
  prospect.status = nextStatus;

  const nextByStatus = {
    "Demo marcada": "Mostrar protótipo",
    "Piloto proposto": "Enviar oferta do piloto",
    "Piloto pago": "Configurar primeira campanha",
  };

  prospect.next = nextByStatus[nextStatus] || prospect.next;
  saveState();
  showToast(`${prospect.barbershop} avanãou para: ${nextStatus}.`);
}

function showView(viewId, triggerButton = null) {
  const target = document.querySelector(`#${viewId}`);
  if (!target) return;
  document.querySelectorAll(".nav-item").forEach((item) => {
    const isDefaultMatch = item.dataset.view === viewId && !item.dataset.scrollTarget;
    item.classList.toggle("active", triggerButton ? item === triggerButton : isDefaultMatch);
  });
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  target.classList.add("active");
  const scrollTarget = triggerButton?.dataset.scrollTarget ? document.querySelector(`#${triggerButton.dataset.scrollTarget}`) : document.querySelector(".main");
  scrollTarget?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function applyRoleExperience() {
  document.body.dataset.role = state.user?.role || "owner";
  const barberMode = isBarberUser();
  document.querySelectorAll(".nav-item").forEach((button) => {
    const employeeNav = button.dataset.view === "employee";
    button.classList.toggle("hidden", barberMode ? !employeeNav : employeeNav);
  });
  const topbarLabel = document.querySelector(".topbar .eyebrow");
  const topbarTitle = document.querySelector(".topbar h1");
  const topbarSubtitle = document.querySelector(".topbar-subtitle");
  const quickCampaignButton = document.querySelector("#quickCampaign");
  const templateButton = document.querySelector("#openTemplates");
  if (barberMode) {
    if (topbarLabel) topbarLabel.textContent = "Painel do profissional";
    if (topbarTitle) topbarTitle.textContent = "Minha agenda";
    if (topbarSubtitle) topbarSubtitle.textContent = "Veja seus horários, confirme presença, marque Pix e finalize atendimentos sem acessar áreas administrativas.";
    quickCampaignButton?.classList.add("hidden");
    templateButton?.classList.add("hidden");
    if (!document.querySelector("#employee")?.classList.contains("active")) showView("employee");
  } else {
    if (topbarLabel) topbarLabel.textContent = "Painel da barbearia";
    if (topbarTitle) topbarTitle.textContent = "Agenda de hoje";
    if (topbarSubtitle) topbarSubtitle.textContent = "Acompanhe horários vagos, confirmações, retornos e oportunidades de encaixe em um só lugar.";
    quickCampaignButton?.classList.remove("hidden");
    templateButton?.classList.remove("hidden");
  }
}

function renderAll() {
  applyRoleExperience();
  populateBarberFilter();
  populateAppointmentSelects();
  renderMetrics();
  renderPriorityBoard();
  renderSchedule();
  renderEmployeePanel();
  renderSuggestions();
  renderInactiveClients();
  renderWaitlist();
  renderCampaignHistory();
  renderMessageOutbox();
  renderDashboardInviteQueue();
  renderClubPlans();
  renderSetup();
  renderOnboarding();
  renderOperationsSetup();
  renderShopSettings();
  renderIntegrations();
  renderTenantAndPermissions();
  renderBilling();
  renderAudit();
  renderPilot();
  renderPipeline();
  renderClientsAdmin();
  renderRoi();
  renderReports();
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    showView(button.dataset.view, button);
    if (window.matchMedia("(max-width: 760px)").matches) setSidebarOpen(false);
  });
});

document.querySelector("#barberFilter").addEventListener("change", renderSchedule);
scheduleDate.addEventListener("change", () => {
  if (appointmentForm.elements.date) {
    appointmentForm.elements.date.value = selectedScheduleDate();
  }
  renderAll();
});
employeeScheduleDate?.addEventListener("change", renderEmployeePanel);

document.querySelector("#fillBestSlot").addEventListener("click", () => {
  const slot = bestOpenSlot();
  if (!slot) {
    document.querySelector('[data-view="waitlist"]').click();
    showToast("Lista de espera aberta para preparar próximos encaixes.");
    return;
  }
  fillSlot(slot.originalIndex);
});

document.querySelector("#autoRunInvites")?.addEventListener("click", async () => {
  if (!apiEnabled) {
    showToast("Automação automática precisa do backend ativo.");
    return;
  }
  const response = await apiFetch("/api/slot-invites/auto-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit: 3 }),
  }).catch(() => null);
  if (!response?.ok) {
    showToast("Não consegui rodar a automação agora.");
    return;
  }
  const result = await response.json();
  await hydrateStateFromApi();
  renderAll();
  showToast(result.sent ? `${result.sent} convite(s) preparado(s) pela automação.` : "Nenhum cliente elegível encontrado para os horários vagos.");
});

document.querySelector("#autoRunReminders")?.addEventListener("click", async () => {
  if (!apiEnabled) {
    showToast("Lembretes automáticos precisam do backend ativo.");
    return;
  }
  const response = await apiFetch("/api/appointments/reminders/auto-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ windowMinutes: 180, limit: 10 }),
  }).catch(() => null);
  if (!response?.ok) {
    showToast("Não consegui enviar os lembretes agora.");
    return;
  }
  const result = await response.json();
  await hydrateStateFromApi();
  renderAll();
  showToast(result.sent ? `${result.sent} lembrete(s) preparado(s) para os próximos horários.` : "Nenhum horário elegível para lembrete agora.");
});

document.querySelector("#closeInviteModal").addEventListener("click", closeInviteModal);
document.querySelector("#sendInviteOnly").addEventListener("click", sendPendingInviteNow);
document.querySelector("#sendInviteAndBook").addEventListener("click", () => addInviteHistory("Agendado", true));
inviteModal.addEventListener("click", (event) => {
  if (event.target === inviteModal) closeInviteModal();
});

document.addEventListener("click", (event) => {
  const fillButton = event.target.closest("[data-fill-priority-slot]");
  if (fillButton) {
    fillSlot(Number(fillButton.dataset.fillPrioritySlot));
    return;
  }

  const button = event.target.closest("[data-priority-view]");
  if (!button) return;
  const view = button.dataset.priorityView;
  document.querySelector(`[data-view="${view}"]`).click();
  if (view === "dashboard") {
    showToast("Agenda aberta para revisar confirmações e horários do dia.");
    return;
  }
  if (view === "reactivation") {
    state.inactiveClients.forEach((client) => {
      client.selected = client.intent === "Alta";
    });
    saveState();
    renderInactiveClients();
    showToast("Clientes com maior chance de retorno selecionados.");
    return;
  }
  showToast("Lista de espera aberta para revisar encaixes.");
});

document.querySelector("#selectHighIntent").addEventListener("click", () => {
  state.inactiveClients.forEach((client) => {
    client.selected = client.intent === "Alta";
  });
  saveState();
  renderInactiveClients();
  showToast("Clientes com maior chance de retorno selecionados.");
});

document.querySelector("#sendCampaign").addEventListener("click", async () => {
  const selected = state.inactiveClients.filter((client) => client.selected);
  if (selected.length === 0) {
    showToast("Selecione pelo menos um cliente antes de enviar.");
    return;
  }

  const total = selected.reduce((sum, client) => sum + client.value, 0);
  const campaign = {
    id: `camp-${Date.now().toString(36)}`,
    name: document.querySelector("#campaignSegment").value,
    segment: document.querySelector("#campaignSegment").value,
    sent: 0,
    responses: 0,
    bookings: 0,
    revenue: 0,
    potentialRevenue: total,
    recipients: selected.map((client) => client.name),
    status: "Preparada",
    createdAt: new Date().toISOString().slice(0, 10),
  };
  const template = document.querySelector("#campaignText").value;
  const historyEntries = selected.map((target) => {
    const client = state.clients.find((item) => item.name === target.name) || target;
    const message = applyTemplate(template, client);
    return {
      id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      campaignId: campaign.id,
      clientId: client.id || "",
      client: target.name,
      phone: client.phone || "",
      message,
      link: buildWhatsAppLink(client.phone, message),
      status: "Pronto para envio",
      createdAt: new Date().toISOString(),
    };
  });
  if (apiEnabled) {
    const response = await apiFetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(campaign),
    }).catch(() => null);
    const savedCampaign = response?.ok  ?await response.json() : campaign;
    state.campaigns.unshift(savedCampaign);
    historyEntries.forEach((entry) => {
      entry.campaignId = savedCampaign.id;
    });
  } else {
    state.campaigns.unshift(campaign);
  }
  state.messageHistory.unshift(...historyEntries);
  state.inactiveClients.forEach((client) => {
    client.selected = false;
  });
  saveState();
  renderAll();
  showToast(`Campanha preparada para ${selected.length} clientes. Potencial mapeado: ${money.format(total)}. Envie somente para contatos autorizados.`);
});

document.querySelector("#saveCampaignDraft").addEventListener("click", () => {
  const draft = {
    id: `camp-${Date.now().toString(36)}`,
    name: document.querySelector("#campaignSegment").value,
    segment: document.querySelector("#campaignSegment").value,
    sent: 0,
    responses: 0,
    bookings: 0,
    revenue: 0,
    recipients: [],
    status: "Rascunho",
    createdAt: new Date().toISOString().slice(0, 10),
  };
  state.campaigns.unshift(draft);
  saveState();
  renderAll();
  showToast("Rascunho de campanha salvo.");
});

document.querySelector("#applySegment").addEventListener("click", () => {
  const minDays = Number(document.querySelector("#segmentDays").value || 0);
  const minTicket = Number(document.querySelector("#segmentTicket").value || 0);
  const service = document.querySelector("#segmentService").value.trim().toLowerCase();
  const professional = document.querySelector("#segmentProfessional").value.trim().toLowerCase();
  const segmented = state.clients
    .filter((client) => daysSince(client.lastVisit) >= minDays)
    .filter((client) => Number(client.ticket || 0) >= minTicket)
    .filter((client) => !service || String(client.favoriteService || "").toLowerCase().includes(service))
    .filter((client) => !professional || String(client.professional || "").toLowerCase().includes(professional))
    .map((client) => {
      const inactiveDays = daysSince(client.lastVisit);
      return {
        name: client.name,
        lastVisit: inactiveDays,
        value: Number(client.ticket || 0),
        intent: inactiveDays > 60 || Number(client.ticket || 0) >= 100  ?"Alta" : "Média",
        selected: false,
      };
    });
  state.inactiveClients = segmented;
  saveState();
  renderAll();
  showToast(`${segmented.length} clientes encontrados na segmentação.`);
});

document.querySelector("#appointmentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const appointment = {
    id: `appt-${Date.now().toString(36)}`,
    date: String(formData.get("date") || selectedScheduleDate()).trim(),
    time: String(formData.get("time") || "").trim(),
    barber: String(formData.get("barber") || "").trim(),
    client: String(formData.get("client") || "").trim(),
    service: String(formData.get("service") || "").trim(),
    status: String(formData.get("status") || "Confirmado"),
    open: String(formData.get("status") || "Confirmado") === "Aberto",
  };
  if (!appointment.date || !appointment.time || !appointment.barber || !appointment.client) {
    showToast("Informe data, horário, barbeiro e cliente.");
    return;
  }
  const editIndex = formData.get("editIndex");
  if (editIndex !== "") {
    const index = Number(editIndex);
    if (hasSlotConflict(appointment, index)) {
      showToast("Esse profissional já tem um horário confirmado nesse dia.");
      return;
    }
    state.appointments[index] = { ...state.appointments[index], ...appointment, id: state.appointments[index].id || appointment.id };
    state.appointments.sort((a, b) => `${appointmentDate(a)} ${a.time}`.localeCompare(`${appointmentDate(b)} ${b.time}`));
    state.openSlots = state.appointments.filter((item) => item.open).length;
    saveState();
    event.currentTarget.reset();
    document.querySelector("#appointmentSubmit").textContent = "Agendar";
    renderAll();
    showToast("Agendamento atualizado.");
    return;
  }

  if (hasSlotConflict(appointment)) {
    showToast("Esse profissional já tem um horário confirmado nesse dia.");
    return;
  }

  if (apiEnabled) {
    const response = await apiFetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(appointment),
    }).catch(() => null);
    if (response.ok) {
      state.appointments.push(await response.json());
    } else if (response.status === 409) {
      showToast("Esse horário acabou de ser ocupado. Escolha outro horário.");
      return;
    } else {
      state.appointments.push(appointment);
    }
  } else {
    state.appointments.push(appointment);
  }
  state.appointments.sort((a, b) => `${appointmentDate(a)} ${a.time}`.localeCompare(`${appointmentDate(b)} ${b.time}`));
  state.openSlots = state.appointments.filter((item) => item.open).length;
  saveState();
  event.currentTarget.reset();
  document.querySelector("#appointmentSubmit").textContent = "Agendar";
  renderAll();
  showToast("Horário agendado.");
});

document.querySelector("#quickCampaign").addEventListener("click", () => {
  document.querySelector('[data-view="reactivation"]').click();
  showToast("Abra a campanha de retorno e selecione os clientes mais quentes.");
});

document.querySelector("#openTemplates").addEventListener("click", () => {
  document.querySelector('[data-view="reactivation"]').click();
});

document.querySelector("#autoWaitlist").addEventListener("change", (event) => {
  showToast(event.target.checked  ?"Lista de espera automática ativada." : "Lista de espera automática pausada.");
});

document.querySelector("#pixDeposit").addEventListener("change", (event) => {
  showToast(event.target.checked  ?"Sinal Pix ativado para clientes novos." : "Sinal Pix desativado.");
});

document.querySelector("#addClubPlan").addEventListener("click", () => {
  state.clubPlans.push({
    name: "Barba semanal",
    price: 119,
    perk: "4 barbas por mês",
    subscribers: 0,
  });
  saveState();
  renderClubPlans();
  showToast("Novo plano de clube adicionado.");
});

// Funções comerciais foram movidas para admin.html.

const clientForm = document.querySelector("#clientForm");
if (clientForm) {
  clientForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const originalButtonText = button?.textContent || "Salvar cliente";
    const formData = new FormData(form);
    const client = {
      name: String(formData.get("name") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      ticket: Number(formData.get("ticket") || 0),
      lastVisit: String(formData.get("lastVisit") || ""),
      favoriteService: String(formData.get("favoriteService") || "Corte"),
      preferredPeriod: "Tarde",
      professional: "",
      status: "Ativo",
      consentWhatsapp: Boolean(formData.get("consentWhatsapp")),
    };

    if (!client.name) {
      showToast("Informe o nome do cliente.");
      return;
    }

    if (!apiEnabled) {
      showToast("O servidor não está sincronizado. Atualize a página e entre novamente.");
      return;
    }

    try {
      if (button) {
        button.disabled = true;
        button.textContent = "Salvando...";
      }

      const response = await apiFetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(client),
      });

      let result = {};
      try {
        result = await response.json();
      } catch (_) {
        result = {};
      }

      if (response.status === 401) {
        localStorage.removeItem(authKey);
        showToast("Sua sessão expirou. Entre novamente para salvar.");
        setTimeout(() => window.location.reload(), 1200);
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || `erro_http_${response.status}`);
      }

      state.clients = [result, ...(state.clients || []).filter((item) => item.id !== result.id)];
      localStorage.setItem(storageKey, JSON.stringify(state));

      form.reset();
      const ticketField = document.querySelector("#clientTicket");
      if (ticketField) ticketField.value = "85";

      // Atualiza a tela sem sobrescrever novamente todo o estado recém-gravado.
      renderClientsAdmin();
      renderMetrics();
      renderReports();
      showToast(`${client.name} salvo com sucesso.`);
    } catch (error) {
      console.error("Falha ao salvar cliente:", error);
      showToast(`Não foi possível salvar o cliente: ${error.message || "erro no servidor"}.`);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalButtonText;
      }
    }
  });
}

document.querySelector("#importClients").addEventListener("click", async () => {
  const csv = document.querySelector("#clientCsv").value.trim();
  if (!csv) {
    showToast("Cole um CSV antes de importar.");
    return;
  }

  if (apiEnabled) {
    const response = await apiFetch("/api/import/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    }).catch(() => null);
    if (response.ok) {
      const result = await response.json();
      state.clients = result.clients;
      saveState();
      renderAll();
      showToast(`${result.imported} clientes importados.`);
      return;
    }
  }

  const [headerLine, ...rows] = csv.split(/\r\n/).filter(Boolean);
  const headers = headerLine.split(",").map((header) => header.trim().toLowerCase());
  const imported = rows.map((row) => {
    const values = row.split(",").map((value) => value.trim());
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    return {
      id: `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: record.nome || record.name || "Cliente sem nome",
      phone: record.whatsapp || record.telefone || record.phone || "",
      lastVisit: record.ultima_visita || record["última_visita"] || record.lastvisit || "",
      favoriteService: record.servico || record.service || "Corte",
      preferredPeriod: record.periodo || record.period || "Tarde",
      ticket: Number(record.ticket || record.valor || 0),
      professional: record.profissional || record.professional || "",
      status: "Importado",
    };
  });
  state.clients.push(...imported);
  saveState();
  renderAll();
  showToast(`${imported.length} clientes importados.`);
});

document.querySelector("#refreshClients").addEventListener("click", async () => {
  await hydrateStateFromApi();
  renderAll();
  showToast(apiEnabled  ?"Clientes atualizados pelo backend." : "Backend indisponível; usando dados locais.");
});

document.querySelector("#refreshReports").addEventListener("click", () => {
  renderReports();
  showToast("Relatórios atualizados.");
});

const shopSettingsForm = document.querySelector("#shopSettingsForm");
if (shopSettingsForm) {
  shopSettingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const shop = currentShop();
    if (!shop) return;
    shop.name = String(formData.get("name") || "").trim();
    shop.city = String(formData.get("city") || "").trim();
    shop.openTime = String(formData.get("openTime") || "09:00");
    shop.closeTime = String(formData.get("closeTime") || "19:00");
    state.publicBooking.depositRequired = Boolean(formData.get("depositRequired"));
    state.publicBooking.headline = `Agende seu horário na ${shop.name}`;
    saveState();
    renderAll();
    showToast("Dados da barbearia atualizados.");
  });
}

const integrationForm = document.querySelector("#integrationForm");
if (integrationForm) {
  integrationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    state.integrations = {
      ...state.integrations,
      whatsapp: {
        ...(state.integrations || {}).whatsapp,
        provider: String(formData.get("whatsappProvider") || "whatsapp_cloud_api"),
        mode: String(formData.get("whatsappMode") || "sandbox"),
        defaultTemplate: String(formData.get("whatsappTemplate") || "retorno_cliente_sumido").trim(),
        templateLanguage: String(formData.get("whatsappTemplateLanguage") || "pt_BR").trim(),
        slotInviteTemplate: String(formData.get("whatsappSlotInviteTemplate") || "encaixe_horario_vago").trim(),
        reminderTemplate: String(formData.get("whatsappReminderTemplate") || "lembrete_agendamento").trim(),
        businessAccountId: String(formData.get("whatsappBusinessAccountId") || "").trim(),
        phoneNumberId: String(formData.get("whatsappPhoneNumberId") || "").trim(),
        accessToken: String(formData.get("whatsappAccessToken") || "").trim(),
        appSecret: String(formData.get("whatsappAppSecret") || "").trim(),
        verifyToken: String(formData.get("whatsappVerifyToken") || "").trim(),
        clearCredentials: Boolean(formData.get("whatsappClearCredentials")),
        tokenConfigured: Boolean((state.integrations.whatsapp || {}).tokenConfigured),
      },
      pix: {
        ...(state.integrations || {}).pix,
        provider: String(formData.get("pixProvider") || "manual_pix"),
        mode: String(formData.get("pixMode") || "sandbox"),
        key: String(formData.get("pixKey") || "").trim(),
        depositAmount: Number(formData.get("pixDepositAmount") || 15),
      },
    };
    state.publicBooking = {
      ...(state.publicBooking || {}),
      enabled: Boolean(formData.get("publicBookingEnabled")),
      slug: String(formData.get("publicBookingSlug") || "barbearia-alpha").trim(),
    };

    if (apiEnabled) {
      const response = await apiFetch("/api/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.integrations),
      }).catch(() => null);
      if (response.ok) {
        state.integrations = await response.json();
      }
    }
    ["businessAccountId", "phoneNumberId", "accessToken", "appSecret", "verifyToken", "clearCredentials"].forEach((key) => {
      if (state.integrations?.whatsapp) delete state.integrations.whatsapp[key];
    });
    saveState();
    renderAll();
    showToast("Integrações salvas.");
  });
}

async function startStripeCheckout() {
  const button = document.querySelector("#startCheckout");
  const original = button?.textContent || "Assinar agora";
  if (button) { button.disabled = true; button.textContent = "Abrindo checkout..."; }
  try {
    const response = await apiFetch("/api/billing/create-checkout-session", { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.url) throw new Error(payload.message || "checkout_indisponivel");
    window.location.href = payload.url;
  } catch (error) {
    showToast("Não consegui abrir o checkout. Confira a Stripe no Render.");
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

async function openStripePortal() {
  const button = document.querySelector("#manageBilling");
  const original = button?.textContent || "Gerenciar assinatura";
  if (button) { button.disabled = true; button.textContent = "Abrindo portal..."; }
  try {
    const response = await apiFetch("/api/billing/create-portal-session", { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.url) throw new Error(payload.error || "portal_indisponivel");
    window.location.href = payload.url;
  } catch (error) {
    showToast("Portal ainda indisponível. Assine primeiro ou confira o webhook Stripe.");
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

document.querySelector("#startCheckout")?.addEventListener("click", startStripeCheckout);
document.querySelector("#manageBilling")?.addEventListener("click", openStripePortal);

const testWhatsApp = document.querySelector("#testWhatsApp");
const connectWhatsAppMeta = document.querySelector("#connectWhatsAppMeta");
let facebookSdkPromise = null;
let lastEmbeddedSignupData = {};

function parseEmbeddedSignupEvent(event) {
  if (!["https://www.facebook.com", "https://web.facebook.com"].includes(event.origin)) return;
  let data = event.data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { return; }
  }
  if (!data || data.type !== "WA_EMBEDDED_SIGNUP") return;
  lastEmbeddedSignupData = {
    ...(lastEmbeddedSignupData || {}),
    ...(data.data || {}),
    event: data.event || "",
  };
}

function loadFacebookSdk(appId, version) {
  if (window.FB) {
    window.FB.init({ appId, autoLogAppEvents: false, xfbml: false, version });
    return Promise.resolve(window.FB);
  }
  if (facebookSdkPromise) return facebookSdkPromise;
  facebookSdkPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB.init({ appId, autoLogAppEvents: false, xfbml: false, version });
      resolve(window.FB);
    };
    const existing = document.querySelector("#facebook-jssdk");
    if (existing) return;
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/pt_BR/sdk.js";
    script.onerror = () => reject(new Error("facebook_sdk_load_failed"));
    document.head.appendChild(script);
  });
  return facebookSdkPromise;
}

if (connectWhatsAppMeta) {
  connectWhatsAppMeta.addEventListener("click", async () => {
    if (!apiEnabled) {
      showToast("Entre pelo servidor local antes de conectar pela Meta.");
      return;
    }
    const configResponse = await apiFetch("/api/integrations/whatsapp/embedded-config").catch(() => null);
    if (!configResponse?.ok) {
      showToast("Não consegui carregar a configuração do Embedded Signup.");
      return;
    }
    const metaConfig = await configResponse.json();
    if (!metaConfig.enabled) {
      showToast(metaConfig.message || "Configure o App da Meta no servidor antes de conectar.");
      return;
    }
    window.addEventListener("message", parseEmbeddedSignupEvent);
    lastEmbeddedSignupData = {};
    let fb;
    try {
      fb = await loadFacebookSdk(metaConfig.appId, metaConfig.graphVersion || "v23.0");
    } catch {
      showToast("Não consegui carregar o SDK da Meta. Verifique a conexão e tente novamente.");
      return;
    }
    fb.login(async (response) => {
      const code = response?.authResponse?.code;
      if (!code) {
        showToast("Conexão cancelada ou não autorizada na Meta.");
        return;
      }
      const completeResponse = await apiFetch("/api/integrations/whatsapp/embedded-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          signup: lastEmbeddedSignupData,
          wabaId: lastEmbeddedSignupData.waba_id || lastEmbeddedSignupData.whatsapp_business_account_id,
          phoneNumberId: lastEmbeddedSignupData.phone_number_id,
          displayPhoneNumber: lastEmbeddedSignupData.display_phone_number,
          verifiedName: lastEmbeddedSignupData.verified_name,
        }),
      }).catch(() => null);
      if (completeResponse?.ok) {
        state.integrations = await completeResponse.json();
        saveState();
        await hydrateStateFromApi();
        renderAll();
        showToast("WhatsApp conectado pela Meta para esta barbearia.");
        return;
      }
      const error = await completeResponse?.json?.().catch(() => ({}));
      showToast(error?.message || "A conexão com a Meta não foi concluída.");
    }, {
      config_id: metaConfig.configId,
      response_type: "code",
      override_default_response_type: true,
      extras: {
        setup: {},
      },
    });
  });
}

if (testWhatsApp) {
  testWhatsApp.addEventListener("click", async () => {
    const client = state.clients[0] || { phone: "559999900000", name: "cliente" };
    const response = await apiFetch("/api/integrations/whatsapp/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: client.phone, name: client.name }),
    }).catch(() => null);
    if (response.ok) {
      const result = await response.json();
      state.integrations.whatsapp.status = "teste_ok";
      state.integrations.whatsapp.lastTestAt = new Date().toISOString();
      await hydrateStateFromApi();
      renderAll();
      showToast(result.message || "Teste de WhatsApp executado.");
      return;
    }
    showToast("Não foi possível testár WhatsApp agora.");
  });
}

const testPix = document.querySelector("#testPix");
if (testPix) {
  testPix.addEventListener("click", async () => {
    const amount = Number(document.querySelector("#pixDepositAmount").value || state.integrations.pix.depositAmount || 15);
    const response = await apiFetch("/api/integrations/pix/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    }).catch(() => null);
    if (response.ok) {
      const result = await response.json();
      state.integrations.pix.status = "teste_ok";
      state.integrations.pix.lastTestAt = new Date().toISOString();
      await hydrateStateFromApi();
      renderAll();
      showToast(`Pix simulado: ${result.chargeId}.`);
      return;
    }
    showToast("Não foi possível testár Pix agora.");
  });
}

const barbershopForm = document.querySelector("#barbershopForm");
if (barbershopForm) {
  barbershopForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const barbershop = {
      id: `shop-${Date.now().toString(36)}`,
      name: String(formData.get("name") || "").trim(),
      city: String(formData.get("city") || "").trim(),
      plan: String(formData.get("plan") || "Profissional"),
      monthlyPrice: Number(formData.get("monthlyPrice") || 119.9),
      setupPrice: Number(formData.get("setupPrice") || 497),
      active: true,
    };
    if (!barbershop.name) {
      showToast("Informe o nome da unidade.");
      return;
    }
    if (apiEnabled) {
      const response = await apiFetch("/api/barbershops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(barbershop),
      }).catch(() => null);
      state.barbershops.unshift(response?.ok  ?await response.json() : barbershop);
    } else {
      state.barbershops.unshift(barbershop);
    }
    saveState();
    event.currentTarget.reset();
    renderAll();
    showToast(`${barbershop.name} adicionada como unidade.`);
  });
}

const userForm = document.querySelector("#userForm");
if (userForm) {
  userForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const user = {
      id: `user-${Date.now().toString(36)}`,
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      role: String(formData.get("role") || "barber"),
      barbershopId: state.currentBarbershopId,
      active: true,
    };
    if (!user.name || !user.email) {
      showToast("Informe nome e email do usuário.");
      return;
    }
    const temporaryPassword = String(formData.get("password") || "");
    if (!isStrongPassword(temporaryPassword)) {
      showToast(passwordPolicyMessage());
      return;
    }
    if (apiEnabled) {
      const response = await apiFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...user, password: temporaryPassword }),
      }).catch(() => null);
      state.users.push(response?.ok  ?await response.json() : user);
    } else {
      state.users.push(user);
    }
    saveState();
    event.currentTarget.reset();
    renderAll();
    showToast(`${user.name} adicionado com permissão ${user.role}.`);
  });
}

const refreshAudit = document.querySelector("#refreshAudit");
if (refreshAudit) {
  refreshAudit.addEventListener("click", async () => {
    const response = apiEnabled  ?await apiFetch("/api/audit-logs").catch(() => null) : null;
    if (response?.ok) {
      state.auditLogs = await response.json();
    }
    renderAudit();
    showToast("Auditoria atualizada.");
  });
}

document.querySelector("#serviceForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const service = {
    id: `svc-${Date.now().toString(36)}`,
    name: String(formData.get("name") || "").trim(),
    price: Number(formData.get("price") || 0),
    duration: Number(formData.get("duration") || 30),
  };
  if (!service.name) return;
  state.services.push(service);
  saveState();
  event.currentTarget.reset();
  renderAll();
  showToast(`${service.name} adicionado aos serviços.`);
});

document.querySelector("#professionalForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const professional = {
    id: `pro-${Date.now().toString(36)}`,
    name: String(formData.get("name") || "").trim(),
    commission: Number(formData.get("commission") || 0),
    active: true,
  };
  if (!professional.name) return;
  state.professionals.push(professional);
  saveState();
  event.currentTarget.reset();
  renderAll();
  showToast(`${professional.name} adicionado a equipe.`);
});

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    showToast("Informe email e senha.");
    return;
  }

  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).catch(() => null);

  if (!response?.ok) {
    showToast("Não foi possível autenticar no backend.");
    return;
  }

  const session = await response.json();
  localStorage.setItem(authKey, JSON.stringify(session));
  if (needsPasswordChange(session.user)) {
    showPasswordChange(session);
    showToast("Troque a senha temporária para acessar o painel.");
    return;
  }

  showAuthenticatedApp();

  try {
    await hydrateStateFromApi();
    renderAll();
  } catch (error) {
    console.warn("Login concluído, mas a atualização visual encontrou um detalhe não bloqueante.", error);
  }
  showToast("Login realizado.");
});

if (passwordChangeForm) {
  passwordChangeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");
    if (!isStrongPassword(password)) {
      showToast(passwordPolicyMessage());
      return;
    }
    if (password !== confirmPassword) {
      showToast("As senhas não conferem.");
      return;
    }
    const response = await apiFetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, forced: true }),
    }).catch(() => null);
    if (!response?.ok) {
      showToast("Não foi possível trocar a senha agora.");
      return;
    }
    const result = await response.json();
    const session = getSession();
    localStorage.setItem(authKey, JSON.stringify({ ...session, user: result.user || session.user }));
    event.currentTarget.reset();
    showAuthenticatedApp();
    await hydrateStateFromApi();
    renderAll();
    showToast("Senha alterada. Painel liberado.");
  });
}

document.querySelector("#showForgotPassword")?.addEventListener("click", () => {
  loginScreen?.classList.add("hidden");
  forgotPasswordScreen?.classList.remove("hidden");
});

document.querySelector("#backToLoginFromForgot")?.addEventListener("click", () => {
  forgotPasswordScreen?.classList.add("hidden");
  loginScreen?.classList.remove("hidden");
});

forgotPasswordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = String(new FormData(event.currentTarget).get("email") || "").trim();
  const message = document.querySelector("#forgotPasswordMessage");
  const response = await fetch("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  }).catch(() => null);
  if (message) message.textContent = response?.ok ? "Se o e-mail estiver cadastrado, enviaremos o link de recuperação em instantes." : "Não foi possível solicitar a recuperação agora.";
});

resetPasswordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const message = document.querySelector("#resetPasswordMessage");
  const token = new URLSearchParams(window.location.search).get("reset_token") || "";
  if (!isStrongPassword(newPassword)) {
    if (message) message.textContent = passwordPolicyMessage();
    return;
  }
  if (newPassword !== confirmPassword) {
    if (message) message.textContent = "As senhas não conferem.";
    return;
  }
  const response = await fetch("/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
  }).catch(() => null);
  if (!response?.ok) {
    if (message) message.textContent = "Link inválido ou expirado. Solicite uma nova recuperação.";
    return;
  }
  localStorage.removeItem(authKey);
  if (message) message.textContent = "Senha alterada. Volte ao login para acessar o painel.";
  window.history.replaceState({}, document.title, "/app.html");
  setTimeout(() => {
    resetPasswordScreen?.classList.add("hidden");
    loginScreen?.classList.remove("hidden");
  }, 1200);
});

function setSidebarOpen(open) {
  const sidebar = document.querySelector(".sidebar");
  sidebar?.classList.toggle("sidebar-open", open);
  document.body.classList.toggle("sidebar-is-open", open);
  mobileMenuToggle?.setAttribute("aria-expanded", String(open));
}

mobileMenuToggle?.addEventListener("click", () => {
  const sidebar = document.querySelector(".sidebar");
  setSidebarOpen(!sidebar?.classList.contains("sidebar-open"));
});

sidebarOverlay?.addEventListener("click", () => setSidebarOpen(false));

async function initApp() {
  const resetToken = new URLSearchParams(window.location.search).get("reset_token");
  if (resetToken) {
    appShell.hidden = true;
    loginScreen?.classList.add("hidden");
    forgotPasswordScreen?.classList.add("hidden");
    passwordChangeScreen?.classList.add("hidden");
    resetPasswordScreen?.classList.remove("hidden");
    return;
  }
  const session = getSession();
  if (!session.token) {
    appShell.hidden = true;
    loginScreen.classList.remove("hidden");
    return;
  }

  const response = await apiFetch("/api/me").catch(() => null);
  if (!response?.ok) {
    localStorage.removeItem(authKey);
    appShell.hidden = true;
    loginScreen.classList.remove("hidden");
    return;
  }

  const me = await response.json();
  if (needsPasswordChange(me.user)) {
    showPasswordChange({ ...session, user: me.user });
    return;
  }

  showAuthenticatedApp();
  await hydrateStateFromApi();
  renderAll();
}

initApp();
