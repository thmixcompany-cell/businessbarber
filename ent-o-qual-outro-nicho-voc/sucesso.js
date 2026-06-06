const params = new URLSearchParams(window.location.search);
const session = params.get("session_id");
const el = document.querySelector("#successSession");
if (session && el) el.textContent = `Sessão Stripe: ${session.slice(0, 18)}...`;
