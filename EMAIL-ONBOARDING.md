# E-mail de onboarding pos-pagamento

O Business Barber envia o e-mail de boas-vindas somente depois que a Stripe confirma o pagamento pelo webhook `checkout.session.completed`.

## Variaveis no Render

Configure no servico do Render:

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
EMAIL_FROM=Business Barber <onboarding@businessbarber.com.br>
EMAIL_REPLY_TO=thmixcompany@gmail.com
ONBOARDING_WHATSAPP=556631992916
```

Depois de salvar, faca redeploy do servico.

## Dominio no Resend

1. Entre no Resend.
2. Adicione e verifique o dominio `businessbarber.com.br`.
3. Configure os registros DNS solicitados pelo Resend.
4. Use o remetente `onboarding@businessbarber.com.br` quando o dominio estiver verificado.

## Como funciona

1. Cliente preenche o cadastro.
2. O sistema cria a barbearia como pagamento pendente.
3. Cliente paga no Checkout Stripe.
4. A Stripe chama `/api/stripe/webhook`.
5. O evento `checkout.session.completed` ativa a assinatura.
6. O sistema envia o e-mail de onboarding pelo Resend.
7. O registro da barbearia recebe:
   - `onboarding_email_status`
   - `onboarding_email_sent_at`
   - `onboarding_email_error`

Se a Stripe reenviar o mesmo webhook, o sistema nao envia outro e-mail quando `onboarding_email_status` ja estiver como `sent`.

## Verificacao

Abra:

```txt
https://businessbarber.com.br/api/health
```

Confirme:

```json
"emailConfigured": true
```

No painel admin, cada barbearia mostra:

```txt
E-mail onboarding: Enviado / Pendente / Falhou
```

Falhas de envio nao quebram o webhook da Stripe. O erro fica salvo em `onboarding_email_error` e aparece nos detalhes tecnicos do admin.
