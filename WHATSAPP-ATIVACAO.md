# Ativacao do WhatsApp Cloud API - Business Barber V2

## O que ja esta preparado

- Endpoint de teste protegido: `POST /api/integrations/whatsapp/test`.
- Endpoint de envio para cliente com consentimento: `POST /api/whatsapp/send-template`.
- Webhook publico: `/api/webhooks/whatsapp`.
- Bloqueio de envio quando o cliente nao possui consentimento registrado.
- Registro de auditoria e historico de mensagens.
- Credenciais WhatsApp separadas por barbearia em `integrationsByShop`.
- O painel nao recebe de volta `accessToken`, `appSecret` ou `verifyToken`; recebe apenas status e IDs mascarados.
- Botao `Conectar com Meta` para iniciar o Embedded Signup no painel da barbearia.

## Fluxo automatico por barbearia

1. Configure no servidor:
   - `META_APP_ID`;
   - `META_APP_SECRET`;
   - `META_EMBEDDED_SIGNUP_CONFIG_ID`;
   - `META_BUSINESS_ID` opcional;
   - `META_SYSTEM_USER_ACCESS_TOKEN` opcional para localizar WABAs compartilhadas.
2. No app da Meta, cadastre o webhook:

```text
https://businessbarber.com/api/webhooks/whatsapp
```

3. No painel da barbearia, acesse Ajustes > Integracoes e clique em `Conectar com Meta`.
4. O dono entra com a conta Meta, escolhe a conta WhatsApp Business e o numero.
5. O backend troca o codigo da Meta por token, salva o `Phone Number ID`, a WABA e o numero conectado somente no servidor.
6. Depois da conexao, use `Testar WhatsApp` para validar o envio do template aprovado.

O fluxo manual continua disponivel como fallback para apresentacao, suporte ou contas que ainda nao passaram pelo Embedded Signup.

## Fluxo manual por barbearia

1. A barbearia cria ou seleciona a conta WhatsApp Business na Meta.
2. Associa um numero e obtem o `Phone Number ID`.
3. Cria/aprova o template `retorno_cliente_sumido` em `pt_BR`.
4. Gera token permanente, `App Secret` e `Verify Token`.
5. No painel da barbearia, em Ajustes > Integracoes, cola:
   - `WhatsApp Business Account ID` opcional;
   - `Phone Number ID`;
   - `Access Token permanente`;
   - `App Secret`;
   - `Verify Token`;
   - template e idioma.
6. Clica em Salvar e depois em Testar WhatsApp.
7. No painel da Meta, configura o callback para:

```text
https://businessbarber.com/api/webhooks/whatsapp
```

Use o mesmo `Verify Token` cadastrado na barbearia.

## Variaveis globais

As variaveis `WHATSAPP_*` do `.env` continuam existindo como fallback da plataforma. Para multi-barbearia real, prefira salvar as credenciais por barbearia no painel.

## Observacao importante

Para enviar mensagem real, a conta precisa ter template aprovado na Meta e permissao para usar a WhatsApp Cloud API. Sem isso, o sistema permanece em sandbox/simulacao.
