const adminMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

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
  return fetch(url, {
    ...options,
    headers: {
      ...(options.body  ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
}

async function loadAdminState() {
  const response = await adminFetch("/api/state");
  if (!response.ok) throw new Error("state_unavailable");
  adminState = await response.json();
}

async function saveAdminState() {
  const response = await adminFetch("/api/state", {
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

function renderAdminBarbershops() {
  document.querySelector("#adminBarbershops").innerHTML =
    (adminState.barbershops || [])
      .map(
        (shop) => `
          <article>
            <div>
              <strong>${shop.name}</strong>
              <span>${shop.city || "Cidade não informada"} · ${shop.plan || "Plano"} · ${adminMoney.format(Number(shop.monthlyPrice || 0))}/mês</span>
            </div>
            <span class="status-pill ${shop.active !== false  ? "good" : "warning"}">${shop.active !== false  ? "Ativa" : "Pausada"}</span>
          </article>
        `,
      )
      .join("") || `<article><span>Nenhuma barbearia cadastrada.</span></article>`;
}

function renderReadiness() {
  const checks = [
    ["Clientes", (adminState.clients || []).length > 0],
    ["Serviços", (adminState.services || []).length > 0],
    ["Profissionais", (adminState.professionals || []).length > 0],
    ["Campanhas", (adminState.campaigns || []).length > 0],
    ["Página pública", Boolean(adminState.publicBooking.enabled)],
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
  renderReadiness();
  renderAdminInviteActivity();
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
    window.scrollTo(0, 0);
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

async function initAdmin() {
  try {
    await loadAdminState();
    renderAdminAll();
  } catch (error) {
    showAdminToast("Não foi possível carregar os dados do SaaS.");
  }
}

initAdmin();
