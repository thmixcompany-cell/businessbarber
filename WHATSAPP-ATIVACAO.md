# Ativação do WhatsApp Cloud API — Business Barber V2

## O que já está preparado
- endpoint de teste protegido: `POST /api/integrations/whatsapp/test`;
- endpoint de envio para cliente com consentimento: `POST /api/whatsapp/send-template`;
- webhook público: `/api/webhooks/whatsapp`;
- bloqueio de envio quando o cliente não possui consentimento registrado;
- registro de auditoria e histórico de mensagens.

## O que depende da Meta
1. Criar/selecionar a conta WhatsApp Business na Meta.
2. Associar um número e obter o `Phone Number ID`.
3. Criar/aprovar o template `retorno_cliente_sumido` em português.
4. Gerar token permanente e obter o App Secret.
5. No Render, configurar:
   - `WHATSAPP_MODE=production`
   - `WHATSAPP_GRAPH_VERSION=v23.0` (ajuste se a Meta indicar versão mais recente)
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_ACCESS_TOKEN`
   - `WHATSAPP_VERIFY_TOKEN`
   - `WHATSAPP_APP_SECRET`
   - `WHATSAPP_DEFAULT_TEMPLATE=retorno_cliente_sumido`
   - `WHATSAPP_TEMPLATE_LANGUAGE=pt_BR`
6. No painel da Meta, configurar callback para `https://businessbarber.com.br/api/webhooks/whatsapp` usando o mesmo verify token.

## Transparência comercial
Enquanto essas credenciais e o template não estiverem aprovados, o painel informa que a estrutura está pronta, mas não afirma que mensagens reais foram enviadas.
