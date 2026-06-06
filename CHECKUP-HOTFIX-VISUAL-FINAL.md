# Business Barber — Hotfix Visual Final

## Objetivo
Acabamento final antes da edição visual do Checkout Stripe e início da venda piloto.

## Alterações aplicadas
- Admin: cards de barbearias e assinaturas reorganizados para reduzir textos quebrados.
- Admin: IDs técnicos da Stripe agora ficam recolhidos em "Detalhes técnicos".
- Admin: status comercial exibido por badges: assinatura, evento Stripe, renovação e próximo passo.
- Admin: eventos Stripe convertidos para nomes humanos, como "Checkout concluído" e "Pagamento aprovado".
- Cadastro: copy ajustada para ficar mais comercial e menos burocrática.
- Sucesso: texto pós-pagamento mais claro e direcionado ao onboarding.
- Onboarding: espaçamento inferior e botões melhorados para não ficarem cortados.
- CSS: ajustes de responsividade, espaçamento e acabamento visual geral.

## Testes realizados
- `npm run check`: passou.
- `npm test`: apresentou erro de massa de dados no agendamento público (`slot_unavailable`) porque o banco local já continha um horário ocupado. O erro não está relacionado às alterações visuais deste hotfix.

## Teste recomendado após publicar
1. Abrir `/admin.html` e verificar os cards das barbearias.
2. Abrir `/cadastro.html` e conferir topo/espaçamento.
3. Abrir `/sucesso.html` e conferir card central.
4. Abrir `/onboarding.html` e conferir botões ao final da página.
5. Testar novamente um checkout de teste se desejar validar o fluxo completo.
