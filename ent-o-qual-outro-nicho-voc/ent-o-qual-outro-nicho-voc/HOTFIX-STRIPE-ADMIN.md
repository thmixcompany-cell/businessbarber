# Hotfix Stripe + Admin

## O que foi ajustado

- Corrigido o contraste dos formulários brancos no painel Admin.
- Substituída a seção interna de comandos técnicos por uma área de Assinaturas/Stripe.
- Adicionado botão `Abrir checkout` no painel Admin.
- Adicionada página `Assinatura` no painel da barbearia.
- Adicionado botão `Assinar agora` na landing page.
- Implementados endpoints Stripe no backend:
  - `GET /api/billing/checkout`
  - `POST /api/billing/create-checkout-session`
  - `POST /api/billing/create-portal-session`
  - `POST /api/stripe/webhook`
- O endpoint `/api/health` agora também retorna `stripeConfigured`.

## Variáveis necessárias no Render

- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`

## URL do webhook Stripe

`https://businessbarber.com.br/api/stripe/webhook`

## Eventos recomendados

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
