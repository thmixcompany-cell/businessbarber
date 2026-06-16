const adminMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function adminEsc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

const adminAuthKey = "businessBarberAdminAuth";
const adminLoginScreen = document.querySelector("#adminLoginScreen");
const adminShell = document.querySelector("#adminShell");
function getAdminSession() { try { return JSON.parse(localStorage.getItem(adminAuthKey)) || {}; } catch (error) { return {}; } }

let adminState = {
  barbershops: [],
  prospects: [],
  campaigns: [],
  clients: [],
  appointments: [],
  auditLogs: [],
  messageHistory: [],
};

const toast = document.querySelector("#toast");

function showAdminToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

async function adminFetch(url, options = {}) {
  const session = getAdminSession();
  return fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

async function loadAdminState() {
  const response = await adminFetch("/api/admin/state");
  if (!response.ok) throw new Error("state_unavailable");
  adminState = await response.json();
}

async function saveAdminState() {
  const response = await adminFetch("/api/admin/state", {
    method: "PUT",
    body: JSON.stringify(adminState),
  });
  if (!response.ok) throw new Error("save_failed");
  adminState = await response.json();
}

function renderAdminMetrics() {
  const activeShops = (adminState.barbershops || []).filter((shop) => shop.active !== false);
  const monthlyRevenue = activeShops.reduce((sum, shop) => sum + Number(shop.monthlyPrice || 0), 0);
  const invites = (adminState.messageHistory || []).filter((message) => message.type === "slot_invite");
  const bookedInvites = invites.filter((message) => message.status === "Agendado").length;
  const conversion = invites.length  ? Math.round((bookedInvites / invites.length) * 100) : 0;
  const recovered = (adminState.campaigns || []).reduce((sum, campaign) => sum + Number(campaign.revenue || 0), 0)
    + invites.filter((message) => message.status === "Agendado").reduce((sum, message) => sum + Number(message.value || 0), 0);

  const cards = [
    ["MRR previsto", adminMoney.format(monthlyRevenue), `${activeShops.length} barbearias ativas`],
    ["Convites gerados", String(invites.length), "Uso real da operação"],
    ["Conversão", `${conversion}%`, `${bookedInvites}/${invites.length || 0} convites agendados`],
    ["Valor recuperado", adminMoney.format(recovered), "Campanhas + encaixes"],
  ];

  document.querySelector("#adminMetrics").innerHTML = cards
    .map(([title, value, subtitle]) => `<article class="metric"><span>${title}</span><strong>${value}</strong><small>${subtitle}</small></article>`)
    .join("");
}

function renderAdminInviteActivity() {
  const container = document.querySelector("#adminInviteActivity");
  if (!container) return;
  const invites = (adminState.messageHistory || []).filter((message) => message.type === "slot_invite");
  const bookedInvites = invites.filter((message) => message.status === "Agendado").length;
  const conversion = invites.length  ? Math.round((bookedInvites / invites.length) * 100) : 0;
  container.innerHTML = invites.length
    ?
    `
        <article>
          <div>
            <strong>${conversion}% de conversão</strong>
            <span>${bookedInvites} agendados em ${invites.length} convites gerados</span>
          </div>
          <span class="status-pill good">${bookedInvites}/${invites.length}</span>
        </article>
        ${invites
        .slice(0, 6)
        .map(
          (message) => `
            <article>
              <div>
                <strong>${message.time || "--:--"} · ${message.client}</strong>
                <span>${message.barber || "Profissional"} · ${message.service || "Serviço"} · ${message.status}</span>
              </div>
              <span class="status-pill ${message.status === "Agendado" ? "good" : "warning"}">${adminMoney.format(Number(message.value || 0))}</span>
            </article>
          `,
        )
        .join("")}
      `
    : `<article><span>Nenhum convite de encaixe registrado ainda.</span></article>`;
}

function renderMarketingFunnel() {
  const container = document.querySelector("#adminMarketingFunnel");
  const metricsContainer = document.querySelector("#adminMarketingMetrics");
  const insightsContainer = document.querySelector("#adminMarketingInsights");
  const actionsContainer = document.querySelector("#adminMarketingActions");
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const events = (adminState.marketingEvents || []).filter((item) => new Date(item.at || 0).getTime() >= since);
  const count = (name) => events.filter((item) => item.event === name).length;
  const pageViews = count("page_view_public");
  const checkoutIntent = count("checkout_intent");
  const whatsappClicks = count("whatsapp_click");
  const signupSubmit = count("signup_submit");
  const checkoutCreated = count("checkout_created") + count("checkout_created_front");
  const purchases = count("purchase_confirmed");
  const rate = (value, base) => (base ? `${Math.round((value / base) * 100)}%` : "0%");
  const recentSource = events.find((item) => item.metadata?.source || item.metadata?.gclid || item.metadata?.fbclid)?.metadata || {};
  const sourceLabel = recentSource.source || (recentSource.gclid ? "Google Ads" : recentSource.fbclid ? "Meta Ads" : "Sem origem");
  const leadSignal = signupSubmit || checkoutIntent;
  const purchaseRate = pageViews ? Math.round((purchases / pageViews) * 100) : 0;

  if (metricsContainer) {
    const cards = [
      ["Visualizações", String(pageViews), "Páginas rastreadas nos últimos 7 dias"],
      ["Cliques no CTA", String(checkoutIntent), `${rate(checkoutIntent, pageViews)} das visualizações`],
      ["Pré-cadastros", String(signupSubmit), `${rate(signupSubmit, checkoutIntent || pageViews)} após clique`],
      ["Pagamentos", String(purchases), `${purchaseRate}% da audiência rastreada`],
    ];
    metricsContainer.innerHTML = cards
      .map(([title, value, subtitle]) => `<article class="metric"><span>${adminEsc(title)}</span><strong>${adminEsc(value)}</strong><small>${adminEsc(subtitle)}</small></article>`)
      .join("");
  }

  if (container) {
    container.innerHTML = `
      <article>
        <div><strong>${pageViews}</strong><span>visualizações rastreadas</span></div>
        <span class="commercial-badge muted">7 dias</span>
      </article>
      <article>
        <div><strong>${checkoutIntent}</strong><span>cliques para cadastro (${rate(checkoutIntent, pageViews)})</span></div>
        <span class="commercial-badge ${checkoutIntent ? "good" : "warning"}">CTA</span>
      </article>
      <article>
        <div><strong>${whatsappClicks}</strong><span>cliques no WhatsApp (${rate(whatsappClicks, pageViews)})</span></div>
        <span class="commercial-badge ${whatsappClicks ? "good" : "warning"}">Conversa</span>
      </article>
      <article>
        <div><strong>${signupSubmit}</strong><span>pré-cadastros enviados (${rate(signupSubmit, pageViews)})</span></div>
        <span class="commercial-badge ${signupSubmit ? "good" : "warning"}">Lead quente</span>
      </article>
      <article>
        <div><strong>${checkoutCreated}</strong><span>checkouts criados (${rate(checkoutCreated, signupSubmit || pageViews)})</span></div>
        <span class="commercial-badge ${checkoutCreated ? "good" : "warning"}">Stripe</span>
      </article>
      <article>
        <div><strong>${purchases}</strong><span>pagamentos confirmados (${rate(purchases, checkoutCreated || pageViews)})</span></div>
        <span class="commercial-badge ${purchases ? "good" : "danger"}">Compra</span>
      </article>
      <article>
        <div><strong>${adminEsc(sourceLabel)}</strong><span>última origem identificada</span></div>
        <span class="commercial-badge muted">${events.length} eventos</span>
      </article>
    `;
  }

  if (insightsContainer) {
    const insights = [
      ["Volume", events.length ? `${events.length} eventos rastreados` : "Sem eventos recentes", events.length ? "A tag está recebendo sinais da landing." : "Confira Google Tag, pixel e eventos de clique."],
      ["Qualidade", pageViews ? `${rate(leadSignal, pageViews)} avançam no funil` : "Sem base suficiente", pageViews ? "Compare essa taxa entre Google e Meta antes de escalar verba." : "Aguarde tráfego real antes de concluir."],
      ["Origem", sourceLabel, "Use UTMs em todos os anúncios para separar campanha, conjunto e criativo."],
    ];
    insightsContainer.innerHTML = insights
      .map(([title, value, text]) => `
        <article>
          <div>
            <strong>${adminEsc(value)}</strong>
            <span>${adminEsc(text)}</span>
          </div>
          <span class="commercial-badge muted">${adminEsc(title)}</span>
        </article>
      `)
      .join("");
  }

  if (actionsContainer) {
    const actions = [
      ["Separar campanha por intenção", "Google para busca ativa; Meta para prova, oferta e remarketing."],
      ["Medir checkout", "Otimizar para pré-cadastro e compra confirmada, não só clique."],
      ["Revisar criativos", "Criativos devem falar de agenda vazia, cliente sumido e receita recuperada."],
      ["Acompanhar diariamente", "Não aumentar verba antes de ver clique, cadastro e checkout no mesmo funil."],
    ];
    actionsContainer.innerHTML = actions
      .map(([title, text]) => `
        <article class="marketing-action-card">
          <strong>${adminEsc(title)}</strong>
          <span>${adminEsc(text)}</span>
        </article>
      `)
      .join("");
  }
}
function billingLabel(status) {
  const map = { active: "Ativa", trialing: "Em teste", pending_payment: "Pagamento pendente", paid: "Pago", past_due: "Pagamento atrasado", unpaid: "Inadimplente", canceled: "Cancelada", incomplete: "Incompleta", lead: "Lead", onboarding_pending: "Onboarding pendente", in_operation: "Em operação" };
  return map[status] || status || "Sem assinatura";
}

function billingClass(status) {
  if (["active", "trialing"].includes(status)) return "good";
  if (["past_due", "unpaid", "canceled"].includes(status)) return "danger";
  return "warning";
}


function onboardingLabel(shop) {
  const billing = shop.billing || {};
  const status = shop.subscriptionStatus || billing.status || shop.lifecycleStatus || "pending_payment";
  if (["past_due", "unpaid"].includes(status)) return "Cobrança precisa de atenção";
  if (status === "canceled") return "Assinatura cancelada";
  if (["active", "trialing", "paid"].includes(status) && shop.lifecycleStatus !== "in_operation") return "Onboarding pendente";
  if (shop.lifecycleStatus === "in_operation") return "Em operação";
  return "Aguardando pagamento";
}

function onboardingClass(shop) {
  const label = onboardingLabel(shop);
  if (label === "Em operação") return "good";
  if (label.includes("atenção") || label.includes("cancelada")) return "danger";
  return "warning";
}

function shortStripe(id) { return id ? `${String(id).slice(0, 10)}...` : "não vinculado"; }

function onboardingEmailStatus(shop = {}) {
  if (shop.onboarding_email_status) return shop.onboarding_email_status;
  if (shop.onboarding_email_sent_at) return "sent";
  return "pending";
}

function onboardingEmailLabel(shop = {}) {
  const status = onboardingEmailStatus(shop);
  if (status === "sent") return "E-mail onboarding: Enviado";
  if (status === "failed") return "E-mail onboarding: Falhou";
  return "E-mail onboarding: Pendente";
}

function onboardingEmailClass(shop = {}) {
  const status = onboardingEmailStatus(shop);
  if (status === "sent") return "good";
  if (status === "failed") return "danger";
  return "warning";
}

function onboardingEmailDetail(shop = {}) {
  if (shop.onboarding_email_sent_at) return `Enviado em ${new Date(shop.onboarding_email_sent_at).toLocaleString("pt-BR")}`;
  if (shop.onboarding_email_error) return `Erro: ${shop.onboarding_email_error}`;
  if (shop.onboarding_email_last_attempt_at) return `Tentativa em ${new Date(shop.onboarding_email_last_attempt_at).toLocaleString("pt-BR")}`;
  return "Aguardando pagamento aprovado";
}

function stripeEventLabel(type) {
  const map = {
    "checkout.session.completed": "Checkout concluído",
    "customer.subscription.created": "Assinatura criada",
    "customer.subscription.updated": "Assinatura atualizada",
    "customer.subscription.deleted": "Assinatura cancelada",
    "invoice.payment_succeeded": "Pagamento aprovado",
    "invoice.payment_failed": "Pagamento falhou",
  };
  return map[type] || type || "Aguardando evento";
}

function stripeLinkedLabel(billing = {}) {
  if (billing.subscriptionId) return "Assinatura vinculada";
  if (billing.customerId) return "Cliente Stripe vinculado";
  if (billing.lastEvent) return "Evento recebido";
  return "Aguardando checkout";
}

function nextStepLabel(shop) {
  const billing = shop.billing || {};
  const status = shop.subscriptionStatus || billing.status || shop.lifecycleStatus || "pending_payment";
  if (["past_due", "unpaid"].includes(status)) return "Regularizar cobrança";
  if (status === "canceled") return "Reativar assinatura";
  if (["active", "trialing", "paid"].includes(status) && shop.lifecycleStatus !== "in_operation") return "Concluir onboarding";
  if (shop.lifecycleStatus === "in_operation") return "Acompanhar operação";
  return "Aguardar pagamento";
}

function renewalLabel(billing = {}) {
  if (!billing.currentPeriodEnd) return "Renovação a confirmar";
  return `Renova em ${new Date(billing.currentPeriodEnd).toLocaleDateString("pt-BR")}`;
}

function safeText(value, fallback = "Não informado") {
  return value ? String(value) : fallback;
}

function whatsappLinkForShop(shop) {
  const phone = String(shop.ownerWhatsapp || "556631992916").replace(/\D/g, "") || "556631992916";
  const text = `Olá, ${shop.ownerName || "tudo bem"}! Pagamento recebido no Business Barber. Vamos concluir o onboarding da ${shop.name || "barbearia"}?`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function renderAdminBarbershops() {
  const shops = [...(adminState.barbershops || [])].sort((a, b) => String(b.billing?.lastEventAt || b.createdAt || "").localeCompare(String(a.billing?.lastEventAt || a.createdAt || "")));
  document.querySelector("#adminBarbershops").innerHTML =
    shops.map((shop) => {
      const billing = shop.billing || {};
      const status = shop.subscriptionStatus || billing.status || (shop.active !== false ? "active" : "pending_payment");
      const publicHref = shop.slug ? `/public.html?barbearia=${encodeURIComponent(shop.slug)}` : "/public.html?barbearia=barbearia-alpha";
      const next = nextStepLabel(shop);
      const lastEvent = stripeEventLabel(billing.lastEvent);
      const hasStripe = Boolean(billing.subscriptionId || billing.customerId || billing.lastEvent);
      return `
        <article class="barbershop-admin-card commercial-admin-card polished-shop-card">
          <div class="shop-card-main">
            <div class="shop-card-title-row">
              <div>
                <strong>${shop.name || "Barbearia sem nome"}</strong>
                <span>${safeText(shop.city, "Cidade não informada")} · ${safeText(shop.ownerName, "Responsável não informado")} · ${adminMoney.format(Number(shop.monthlyPrice || 197))}/mês</span>
              </div>
              <span class="status-pill ${billingClass(status)}">${billingLabel(status)}</span>
            </div>
            <div class="shop-contact-line">
              <span>${safeText(shop.ownerEmail, "sem email")}</span>
              ${shop.ownerWhatsapp ? `<span>${shop.ownerWhatsapp}</span>` : ""}
              ${shop.instagram ? `<span>${shop.instagram}</span>` : ""}
            </div>
            <div class="shop-badge-row">
              <span class="commercial-badge ${hasStripe ? "good" : "warning"}">${stripeLinkedLabel(billing)}</span>
              <span class="commercial-badge ${billing.lastEvent ? "good" : "warning"}">${lastEvent}</span>
              <span class="commercial-badge ${onboardingClass(shop)}">${next}</span>
              <span class="commercial-badge ${onboardingEmailClass(shop)}">${onboardingEmailLabel(shop)}</span>
            </div>
            <details class="technical-details">
              <summary>Detalhes técnicos</summary>
              <span>Cliente Stripe: ${shortStripe(billing.customerId)}</span>
              <span>Assinatura: ${shortStripe(billing.subscriptionId)}</span>
              <span>E-mail onboarding: ${onboardingEmailDetail(shop)}</span>
              <span>Última atualização: ${billing.lastEventAt ? new Date(billing.lastEventAt).toLocaleString("pt-BR") : "não informada"}</span>
            </details>
          </div>
          <div class="card-side-actions polished-actions">
            <a class="tiny-button primary-action" href="${whatsappLinkForShop(shop)}" target="_blank" rel="noreferrer">Onboarding</a>
            <a class="tiny-button" href="${publicHref}" target="_blank" rel="noreferrer">Página pública</a>
          </div>
        </article>
      `;
    }).join("") || `<article><span>Nenhuma barbearia cadastrada.</span></article>`;
}

function renderAdminBilling() {
  const container = document.querySelector("#adminBillingList");
  if (!container) return;
  const shops = [...(adminState.barbershops || [])].sort((a, b) => String(b.billing?.lastEventAt || b.createdAt || "").localeCompare(String(a.billing?.lastEventAt || a.createdAt || "")));
  const recentEvents = (adminState.stripeEvents || []).slice(0, 6);
  const pending = shops.filter((shop) => ["pending_payment", "incomplete", "lead"].includes(String(shop.subscriptionStatus || shop.billing?.status || ""))).length;
  const active = shops.filter((shop) => ["active", "trialing"].includes(String(shop.subscriptionStatus || shop.billing?.status || ""))).length;
  const attention = shops.filter((shop) => ["past_due", "unpaid", "canceled"].includes(String(shop.subscriptionStatus || shop.billing?.status || ""))).length;
  container.innerHTML = `
    <article class="billing-summary-row commercial-admin-card polished-summary-card">
      <div>
        <strong>Resumo de cobrança e onboarding</strong>
        <span>${active} ativas · ${pending} pendentes · ${attention} com atenção · ${recentEvents.length} eventos recentes do Stripe</span>
      </div>
      <a class="tiny-button" href="/cadastro.html">Cadastrar novo cliente</a>
    </article>
    ${shops.map((shop) => {
      const billing = shop.billing || {};
      const status = shop.subscriptionStatus || billing.status || "pending_payment";
      return `
        <article class="billing-admin-card commercial-admin-card polished-shop-card">
          <div class="shop-card-main">
            <div class="shop-card-title-row">
              <div>
                <strong>${shop.name || "Barbearia"}</strong>
                <span>${safeText(shop.ownerName, "Responsável não informado")} · ${safeText(shop.ownerEmail, "sem email")} · ${safeText(shop.ownerWhatsapp, "sem WhatsApp")}</span>
              </div>
              <span class="status-pill ${billingClass(status)}">${billingLabel(status)}</span>
            </div>
            <div class="shop-badge-row">
              <span class="commercial-badge ${billing.subscriptionId || billing.customerId ? "good" : "warning"}">${stripeLinkedLabel(billing)}</span>
              <span class="commercial-badge ${billing.lastEvent ? "good" : "warning"}">${stripeEventLabel(billing.lastEvent)}</span>
              <span class="commercial-badge ${onboardingClass(shop)}">${nextStepLabel(shop)}</span>
              <span class="commercial-badge ${onboardingEmailClass(shop)}">${onboardingEmailLabel(shop)}</span>
            </div>
            <p class="admin-card-note">${billing.lastEventAt ? `Atualizado em ${new Date(billing.lastEventAt).toLocaleString("pt-BR")}` : "Aguardando o primeiro retorno do Stripe."}</p>
            <details class="technical-details">
              <summary>Detalhes técnicos</summary>
              <span>Cliente Stripe: ${shortStripe(billing.customerId)}</span>
              <span>Assinatura: ${shortStripe(billing.subscriptionId)}</span>
              <span>E-mail onboarding: ${onboardingEmailDetail(shop)}</span>
              <span>Evento bruto: ${billing.lastEvent || "aguardando"}</span>
            </details>
          </div>
          <div class="card-side-actions polished-actions">
            <a class="tiny-button primary-action" href="${whatsappLinkForShop(shop)}" target="_blank" rel="noreferrer">Onboarding</a>
            <a class="tiny-button" href="/onboarding.html" target="_blank" rel="noreferrer">Checklist</a>
          </div>
        </article>`;
    }).join("")}
    <article class="stripe-events-card commercial-admin-card polished-summary-card">
      <div>
        <strong>Eventos Stripe recentes</strong>
        <span>${recentEvents.length ? recentEvents.map((event) => `${stripeEventLabel(event.type)}${event.matched ? " ✓" : ""}`).join(" · ") : "Endpoint configurado. Aguardando eventos."}</span>
      </div>
      <span class="status-pill good">Webhook pronto</span>
    </article>
  `;
}

function renderReadiness() {
  const publicBooking = adminState.publicBooking || {};
  const checks = [
    ["Clientes", (adminState.clients || []).length > 0],
    ["Serviços", (adminState.services || []).length > 0],
    ["Profissionais", (adminState.professionals || []).length > 0],
    ["Campanhas", (adminState.campaigns || []).length > 0],
    ["Página pública", Boolean(publicBooking.enabled)],
    ["Stripe", (adminState.barbershops || []).some((shop) => shop.billing?.customerId || shop.billing?.lastEvent)],
    ["Onboarding", (adminState.barbershops || []).some((shop) => shop.lifecycleStatus === "active" || shop.subscriptionStatus === "active")],
    ["Auditoria", (adminState.auditLogs || []).length > 0],
  ];

  document.querySelector("#adminReadiness").innerHTML = checks
    .map(
      ([label, done]) => `
        <label>
          <input type="checkbox" ${done  ? "checked" : ""} disabled />
          ${label}
        </label>
      `,
    )
    .join("");
}

function renderAdminPipeline() {
  const statusClass = {
    "Contato inicial": "warning",
    "Demo marcada": "",
    "Piloto proposto": "good",
    "Piloto pago": "good",
  };

  document.querySelector("#adminPipeline").innerHTML =
    (adminState.prospects || [])
      .map(
        (prospect, index) => `
          <article class="pipeline-card">
            <header>
              <div>
                <strong>${prospect.barbershop}</strong>
                <span>${prospect.owner} · ${prospect.team} profissionais</span>
              </div>
              <span class="status-pill ${statusClass[prospect.status] || ""}">${prospect.status}</span>
            </header>
            <p>${prospect.pain}</p>
            <span>Próximo passo: ${prospect.next}</span>
            <div class="pipeline-actions">
              <button class="tiny-button" data-admin-advance="${index}" type="button">Avançar</button>
              <button class="tiny-button" data-admin-proposal="${index}" type="button">Usar proposta</button>
            </div>
          </article>
        `,
      )
      .join("") || `<article class="empty-state"><strong>Nenhum prospect</strong><span>Cadastre uma barbearia para iniciar o pipeline.</span></article>`;

  document.querySelectorAll("[data-admin-advance]").forEach((button) => {
    button.addEventListener("click", async () => {
      const flow = ["Contato inicial", "Demo marcada", "Piloto proposto", "Piloto pago"];
      const prospect = adminState.prospects[Number(button.dataset.adminAdvance)];
      const current = flow.indexOf(prospect.status);
      prospect.status = flow[Math.min(current + 1, flow.length - 1)];
      prospect.next =
        {
          "Demo marcada": "Mostrar demonstração",
          "Piloto proposto": "Enviar proposta",
          "Piloto pago": "Configurar primeira campanha",
        }[prospect.status] || prospect.next;
      await saveAdminState();
      renderAdminAll();
      showAdminToast(`${prospect.barbershop} avançou para ${prospect.status}.`);
    });
  });

  document.querySelectorAll("[data-admin-proposal]").forEach((button) => {
    button.addEventListener("click", () => {
      const prospect = adminState.prospects[Number(button.dataset.adminProposal)];
      document.querySelector('[data-admin-view="proposal"]').click();
      document.querySelector("#adminProposalText").value = `Olá, ${prospect.owner}. Pelo que você comentou sobre ${prospect.pain}, a maior oportunidade está em recuperar clientes e preencher horários vagos. Minha sugestão é um piloto de 30 dias do Business Barber por R$ 197/mês + implantação assistida.`;
    });
  });
}

function renderPilotAdmin() {
  const steps = [
    ["Abrir com dor", "Mostre horários vagos e pergunte quanto isso custa por semana."],
    ["Mostrar recuperação", "Preencha um horário aberto com cliente sumido ou lista de espera."],
    ["Mostrar relatório", "Conecte campanha, agendamento e receita recuperada."],
    ["Mostrar página pública", "Abra o link público e simule o agendamento do cliente."],
    ["Fechar próximo passo", "Ofereça piloto pago com meta de recuperar a mensalidade."],
  ];
  const questions = [
    "Quantos horários vagos vocês têm por semana",
    "Quantos clientes somem depois do primeiro ou segundo corte",
    "Como vocês chamam clientes quando há cancelamento",
    "Vocês cobrariam sinal Pix para reduzir faltas",
    "Se recuperasse mais que a mensalidade, você pagaria R$ 197/mês",
  ];

  document.querySelector("#adminPilotSteps").innerHTML = steps
    .map(
      ([title, text], index) => `
        <article class="pilot-step">
          <span class="step-number">${index + 1}</span>
          <div><strong>${title}</strong><p>${text}</p></div>
        </article>
      `,
    )
    .join("");

  document.querySelector("#adminQuestions").innerHTML = questions
    .map(
      (question, index) => `
        <article class="question-item">
          <span class="step-number">${index + 1}</span>
          <div><strong>Pergunta ${index + 1}</strong><p>${question}</p></div>
        </article>
      `,
    )
    .join("");
}

function renderAdminProposal() {
  const ticket = Number(document.querySelector("#adminTicket").value || 0);
  const recovered = Number(document.querySelector("#adminRecovered").value || 0);
  const monthly = Number(document.querySelector("#adminMonthly").value || 1);
  const revenue = ticket * recovered;
  const net = revenue - monthly;
  const roi = monthly  ? revenue / monthly : 0;
  document.querySelector("#adminRevenue").textContent = adminMoney.format(revenue);
  document.querySelector("#adminNet").textContent = adminMoney.format(net);
  document.querySelector("#adminRoi").textContent = `${roi.toFixed(1)}x`;
}

function renderAdminAll() {
  renderAdminMetrics();
  renderAdminBarbershops();
  renderAdminBilling();
  renderReadiness();
  renderAdminInviteActivity();
  renderMarketingFunnel();
  renderAdminPipeline();
  renderPilotAdmin();
  renderAdminProposal();
}

document.querySelectorAll("[data-admin-view]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-admin-view]").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".admin-view").forEach((view) => view.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#admin-${button.dataset.adminView}`).classList.add("active");
    document.querySelector(".admin-main")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

["#adminTicket", "#adminRecovered", "#adminMonthly"].forEach((selector) => {
  document.querySelector(selector).addEventListener("input", renderAdminProposal);
});

document.querySelector("#copyAdminProposal").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector("#adminProposalText").value);
    showAdminToast("Proposta copiada.");
  } catch (error) {
    showAdminToast("Texto pronto para copiar manualmente.");
  }
});

document.querySelector("#adminProspectForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  adminState.prospects = [
    ...(adminState.prospects || []),
    {
      barbershop: String(formData.get("barbershop") || "").trim(),
      owner: String(formData.get("owner") || "").trim(),
      team: Number(formData.get("team") || 1),
      pain: String(formData.get("pain") || "").trim(),
      status: "Contato inicial",
      next: "Enviar mensagem curta",
    },
  ];
  await saveAdminState();
  event.currentTarget.reset();
  renderAdminAll();
  showAdminToast("Prospect salvo.");
});

document.querySelector("#adminExportProspects").addEventListener("click", () => {
  const headers = ["barbearia", "dono", "profissionais", "dor_principal", "status", "proximo_passo"];
  const rows = (adminState.prospects || []).map((prospect) => [prospect.barbershop, prospect.owner, prospect.team, prospect.pain, prospect.status, prospect.next]);
  const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pipeline-businessbarber.csv";
  link.click();
  URL.revokeObjectURL(url);
  showAdminToast("Pipeline exportado.");
});

document.querySelector("#adminLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const response = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: String(formData.get("email") || "").trim(), password: String(formData.get("password") || "") }) }).catch(() => null);
  if (!response?.ok) { showAdminToast("Login administrativo inválido."); return; }
  const session = await response.json();
  if (session.user?.role !== "platform_admin") { showAdminToast("Este usuário não tem acesso ao painel do fundador."); return; }
  localStorage.setItem(adminAuthKey, JSON.stringify(session));
  adminLoginScreen.classList.add("hidden"); adminShell.hidden = false;
  await loadAdminState(); renderAdminAll(); showAdminToast("Admin autenticado.");
});

async function initAdmin() {
  const session = getAdminSession();
  if (!session.token || session.user?.role !== "platform_admin") { adminShell.hidden = true; adminLoginScreen.classList.remove("hidden"); return; }
  try {
    const check = await adminFetch("/api/me"); if (!check.ok) throw new Error("unauthorized");
    adminLoginScreen.classList.add("hidden"); adminShell.hidden = false; await loadAdminState(); renderAdminAll();
  } catch (error) {
    localStorage.removeItem(adminAuthKey); adminShell.hidden = true; adminLoginScreen.classList.remove("hidden"); showAdminToast("Faça login novamente para acessar o admin.");
  }
}

initAdmin();
