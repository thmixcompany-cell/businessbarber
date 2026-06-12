const params = new URLSearchParams(window.location.search);
const session = params.get("session_id");
const el = document.querySelector("#successSession");
const whatsapp = document.querySelector("#successWhatsapp");
if (session && window.trackGoogleAdsPurchase) {
  const conversionKey = `businessBarberGoogleAdsPurchase:${session}`;
  if (localStorage.getItem(conversionKey) !== "sent") {
    window.trackGoogleAdsPurchase(session);
    localStorage.setItem(conversionKey, "sent");
  }
}
if (session && el) el.textContent = `Sessão Stripe: ${session.slice(0, 18)}...`;
if (session && whatsapp) {
  const text = `Pagamento confirmado no Business Barber. Quero concluir meu onboarding. Sessão Stripe: ${session}`;
  whatsapp.href = `https://wa.me/5566992589032?text=${encodeURIComponent(text)}`;
}


try {
  const signup = JSON.parse(localStorage.getItem("businessBarberLastSignup") || "{}");
  const title = document.querySelector("#successTitle");
  const copy = document.querySelector("#successCopy");
  const shopName = signup.barbershopName || signup.barbershop || "sua barbearia";
  if (title && shopName) title.textContent = `Pagamento confirmado. Agora vamos ativar ${shopName}.`;
  if (copy && shopName) copy.textContent = `Recebemos a assinatura do Business Barber para ${shopName}. O próximo passo é concluir o onboarding manual para configurar serviços, horários, WhatsApp, página pública e primeira campanha.`;
  if (whatsapp) {
    const text = `Pagamento confirmado no Business Barber. Quero concluir o onboarding da ${shopName}.${session ? ` Sessão Stripe: ${session}` : ""}`;
    whatsapp.href = `https://wa.me/5566992589032?text=${encodeURIComponent(text)}`;
  }
} catch (error) {}
