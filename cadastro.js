const form = document.querySelector("#signupCheckoutForm");
const message = document.querySelector("#signupCheckoutMessage");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form).entries());
  localStorage.setItem("businessBarberLastSignup", JSON.stringify(data));
  button.disabled = true;
  button.textContent = "Criando checkout...";
  message.textContent = "Aguarde. Estamos preparando o pagamento seguro da sua assinatura.";
  try {
    const response = await fetch("/api/billing/signup-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.url) throw new Error(payload.message || payload.error || "checkout_indisponivel");
    window.location.href = payload.url;
  } catch (error) {
    message.textContent = "Não foi possível abrir o checkout agora. Confira os dados ou fale conosco pelo WhatsApp.";
    button.disabled = false;
    button.textContent = "Continuar para pagamento";
  }
});
