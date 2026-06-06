# Ativação do Supabase — Business Barber V2

## Objetivo
Trocar o armazenamento temporário `data/db.json` por persistência real no Supabase, mantendo a API do Render como única camada que acessa os dados.

## Passos
1. Crie o projeto `businessbarber` no Supabase.
2. No SQL Editor, execute `supabase/migrations/001_bb_app_state.sql`.
3. Em **Project Settings → API Keys**, copie a chave secreta do servidor. Nunca coloque essa chave no navegador ou no GitHub.
4. No Render, em **Environment**, cadastre:
   - `STORAGE_PROVIDER=supabase`
   - `SUPABASE_URL=https://SEU-PROJETO.supabase.co`
   - `SUPABASE_SECRET_KEY=...`
   - `SUPABASE_STATE_ID=businessbarber-production`
5. Cadastre também `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `OWNER_EMAIL` e `OWNER_PASSWORD`.
6. Faça novo deploy e acesse `/api/health`. O campo `storage` deve mostrar `supabase`.

## Segurança
A tabela `bb_app_state` fica com RLS ativo e sem permissão para usuários anônimos/autenticados. Somente a API hospedada no Render utiliza a chave secreta. Quando o produto crescer, migre para as tabelas normalizadas indicadas no arquivo `002_modelo_normalizado_futuro.sql`.
