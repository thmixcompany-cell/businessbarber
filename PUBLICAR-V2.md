# Publicar a V2 no Render

## Antes do deploy
A V2 remove credenciais fixas do código. Antes de testar o login, cadastre as variáveis de ambiente no Render.

### Para apresentar como demonstração
```
DEMO_MODE=true
DEMO_EMAIL=demo@businessbarber.local
DEMO_PASSWORD=CrieUmaSenhaForteAqui
ADMIN_EMAIL=seu-email-administrativo@dominio.com
ADMIN_PASSWORD=CrieOutraSenhaForteAqui
APP_URL=https://businessbarber.com.br
STORAGE_PROVIDER=json
```

### Para operação real
Execute primeiro `supabase/migrations/001_bb_app_state.sql` e configure:
```
STORAGE_PROVIDER=supabase
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SECRET_KEY=SUA_CHAVE_SECRETA_DO_SERVIDOR
SUPABASE_STATE_ID=businessbarber-production
ADMIN_EMAIL=SEU_EMAIL_ADMINISTRATIVO
ADMIN_PASSWORD=SENHA_ADMINISTRATIVA_FORTE
OWNER_EMAIL=EMAIL_DA_BARBEARIA
OWNER_PASSWORD=SENHA_INICIAL_FORTE
OWNER_NAME=NOME_DO_DONO
OWNER_BARBERSHOP_ID=shop-alpha
DEMO_MODE=false
APP_URL=https://businessbarber.com.br
```

## WhatsApp
A estrutura está pronta, mas o envio real só começa após cadastrar as variáveis descritas em `WHATSAPP-ATIVACAO.md` e aprovar o template na Meta.

## Deploy
Copie os arquivos da V2 sobre sua pasta do projeto e execute:
```
git add .
git commit -m "publica v2 operacao real"
git push
```

## Verificações depois do deploy
- `/` deve abrir a landing page comercial.
- `/app.html` deve abrir o login vazio.
- `/admin.html` deve abrir o login do fundador vazio.
- `/public.html?barbearia=barbearia-alpha` deve abrir a página de agendamento.
- `/data/db.json` deve retornar Not found.
- `/api/health` deve mostrar `storage: supabase` antes de receber clientes reais.
