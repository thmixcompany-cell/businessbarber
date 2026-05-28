# LGPD para o piloto

## Dados coletados

- Nome do cliente.
- WhatsApp.
- Histrico de visita.
- Serviço favorito.
- Ticket medio.
- Profissional preferido.
- Respostas e agendamentos gerados por campanha.

## Base operacional

No piloto, use os dados apenas para relacionamento da propria barbearia com seus clientes: lembretes, reativação, lista de espera e confirmação de horário. Evite comprar listas ou enviar campanhá para pessoas que nunca deram contato para a barbearia.

## Direitos do cliente

O backend ja tem duas rotas para cumprir pedidos basicos:

- Exportar dados: `GET /api/clients/:id/export`
- Excluir dados: `DELETE /api/clients/:id`

## Consentimento recomendado

Texto curto para a barbearia usar no cadastro:

> Autorizo receber lembretes, confirmacoes e ofertas da barbearia pelo WhatsApp. Posso pedir a remocao dos meus dados a qualquer momento.

## Regras praticas

- Toda mensagem deve deixar claro que vem da barbearia.
- Não mande campanhá em massa fora do contexto de atendimento.
- Registre pedido de descadastro como cliente removido ou status "Não contatar".
- Ao usar WhatsApp Cloud API, mantenhá templates aprovados e opt-out facil.
- Chaves Pix e tokens de integração devem ficar em variaveis de ambiente no deploy real.
