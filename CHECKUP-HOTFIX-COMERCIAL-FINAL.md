# Business Barber — Hotfix Comercial Final

## O que foi ajustado

- Landing page com copy mais forte para venda do piloto.
- Página de cadastro com linguagem menos burocrática e mais comercial.
- Página de sucesso personalizada com dados do pré-cadastro salvos no navegador.
- Botão de WhatsApp pós-pagamento com mensagem personalizada por barbearia.
- Onboarding manual transformado em checklist de ação visual.
- Admin com cards de barbearia mais completos:
  - status da assinatura;
  - próximo passo de onboarding;
  - cliente/assinatura Stripe;
  - último evento Stripe;
  - renovação quando disponível;
  - atalhos para onboarding e página pública.
- Área de cobrança no admin renomeada para Assinaturas e onboarding.
- Correções visuais adicionais para eliminar fundos brancos em cards, checklist, inputs e simulador.

## Teste recomendado após publicar

1. Acessar `/` e validar CTA principal para `/cadastro.html`.
2. Preencher `/cadastro.html` com dados de teste.
3. Finalizar pagamento teste na Stripe.
4. Confirmar retorno para `/sucesso.html` com nome da barbearia personalizado.
5. Abrir `/admin.html` e conferir se a barbearia aparece com status e próximo passo.
6. Abrir `/onboarding.html` e validar checklist visual.

## Observação

Antes de vender em produção, trocar variáveis Stripe de teste para live no Render:

- STRIPE_SECRET_KEY
- STRIPE_PRICE_ID
- STRIPE_WEBHOOK_SECRET

Manter:

- STRIPE_SUCCESS_URL=https://businessbarber.com.br/sucesso.html?session_id={CHECKOUT_SESSION_ID}
- STRIPE_CANCEL_URL=https://businessbarber.com.br/cadastro.html?billing=cancel
