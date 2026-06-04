# Business Barber V2 — Operação Real

## Produto e conversão
- Landing page comercial adicionada em `/`.
- Login movido para `/app.html`, sem credenciais preenchidas.
- Página pública redesenhada com serviços, confiança, consentimento e fluxo de confirmação.
- Nomes do menu orientados à dor comercial: clientes para recuperar, preencher horários, clube e resultados.

## Segurança e dados
- Credenciais fixas removidas do banco inicial e das telas.
- Hash de senhas novo com `scrypt` e suporte temporário a legado apenas mediante variável explícita.
- Isolamento de dados por `barbershopId` em clientes, agenda, campanhas, equipe, histórico e auditoria.
- Conta comum bloqueada de áreas e usuários administrativos.
- Arquivos internos/banco continuam bloqueados no acesso público.
- Exclusão de cliente elimina a base pessoal e anonimiza referência histórica do agendamento.

## Supabase
- Adaptador de persistência pronto: ativado por variáveis de ambiente no Render.
- Migration segura `bb_app_state` com RLS ativo e sem acesso do navegador.
- Documento de ativação incluído.

## WhatsApp Cloud API
- Envio real de template implementado no backend.
- Teste de integração implementado.
- Webhook de verificação/recebimento implementado, com validação de assinatura quando App Secret for configurado.
- Envio bloqueado sem consentimento do cliente.
- Painel não armazena token; segredo fica somente no Render.

## LGPD e integridade de métricas
- Política de Privacidade e Termos adicionados.
- Consentimento obrigatório na página pública.
- Campanhas deixam de contabilizar receita/respostas fictícias ao serem criadas.
- Receita só deve crescer quando confirmada/atribuída em operação.
