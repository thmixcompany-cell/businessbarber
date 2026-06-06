# Business Barber — Check-up Release Comercial

## Objetivo desta versão
Preparar o Business Barber para venda piloto com fluxo comercial mais profissional:

1. Landing page mais persuasiva.
2. Pré-cadastro antes do pagamento.
3. Checkout Stripe vinculado à barbearia correta.
4. Página de sucesso pós-pagamento.
5. Onboarding manual documentado.
6. Painel admin melhorado para acompanhar assinaturas e implantação.
7. Correção visual dos blocos brancos/inputs claros.

## Arquivos principais alterados
- `index.html`: landing page reposicionada para venda do piloto.
- `cadastro.html` e `cadastro.js`: fluxo de pré-cadastro + checkout.
- `sucesso.html` e `sucesso.js`: confirmação pós-pagamento e botão de onboarding.
- `onboarding.html`: checklist manual para ativar a barbearia.
- `admin.html` e `admin.js`: painel com melhor visualização de barbearias, assinaturas, eventos e onboarding.
- `server.mjs`: melhoria no cadastro/metadata Stripe, remoção de duplicidade de prospect e gravação de dados de onboarding.
- `styles.css`: correções visuais e padronização dark/premium.
- `Dockerfile`: inclui novas páginas no deploy.

## Variáveis que devem permanecer no Render
- `STRIPE_SUCCESS_URL=https://businessbarber.com.br/sucesso.html?session_id={CHECKOUT_SESSION_ID}`
- `STRIPE_CANCEL_URL=https://businessbarber.com.br/cadastro.html?billing=cancel`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `STORAGE_PROVIDER=supabase`

## Testes locais executados
- `npm run check`: passou.
- `npm test`: passou.

## Testes em produção recomendados
1. Abrir `/cadastro.html`.
2. Preencher nova barbearia de teste.
3. Ir para checkout Stripe teste.
4. Concluir pagamento teste.
5. Confirmar retorno para `/sucesso.html`.
6. Verificar no admin se a barbearia aparece como ativa.
7. Abrir `/onboarding.html`.
8. Conferir `/api/health`.

## Depois de validar
- Limpar cadastros de teste manualmente ou por edição segura do banco.
- Voltar Stripe para credenciais live quando for vender de verdade.
- Personalizar o checkout no painel da Stripe com logo, cor e descrição do Business Barber.
