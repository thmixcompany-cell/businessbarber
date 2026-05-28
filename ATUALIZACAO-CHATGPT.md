# Atualização: separação e proteção inicial

## Corrigido nesta versão
- Painel da barbearia sem telas internas de prospecção, proposta e piloto.
- Painel do fundador em `/admin.html`, agora com login exclusivo.
- Painel da barbearia só abre após autenticação.
- API interna exige sessão autenticada.
- Página pública usa endpoints próprios e limitados.
- `data/db.json`, logs, CSV, SQL e documentos internos deixaram de ser expostos pelo servidor.

## Logins para teste
Painel da barbearia (`/`): `demo@businessbarber.local` / `demo123`

Painel fundador (`/admin.html`): `admin@businessbarber.local` / `TrocarAgora#BB2026`

**Troque a senha administrativa antes de utilizar com clientes reais.**

## Publicar
Substitua os arquivos no seu projeto e execute:
```bash
git add .
git commit -m "separa painel cliente e protege API"
git push
```

## Testes após deploy
1. `/` abre somente o login e libera o painel após autenticar.
2. `/admin.html` exige login administrativo.
3. `/public.html?barbearia=barbearia-alpha` abre o agendamento.
4. `/data/db.json` retorna `Not found`.

## Limite ainda existente
O banco continua sendo `db.json`; isso serve para demonstração/piloto controlado, mas não para armazenar dados reais em escala. O próximo passo é Supabase/PostgreSQL.
