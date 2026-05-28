# Deploy do Business Barber

## Caminho rapido para apresentacao

1. Suba o projeto em um servidor Node 22 ou container Docker.
2. Copie `.env.example` para `.env` e ajuste `APP_URL`, WhatsApp e Pix.
3. Rode `npm run check` e `npm test`.
4. Inicie com `npm start`.
5. Abra `/public.html?barbearia=barbearia-alpha` para testar o link publico.

## Atencao sobre Cloudflare

Cloudflare Pages puro nao executa este servidor Node com API e JSON local.

Para apresentar rapido em vendas, use uma destas opcoes:

- Cloudflare Tunnel apontando para uma maquina onde o Node esteja rodando o projeto.
- Render, Railway, Fly.io ou VPS com Node/Docker, usando Cloudflare apenas para DNS/proxy.
- Migracao futura para Cloudflare Workers + banco externo, se quiser ficar 100% na Cloudflare.

## Render ou Railway

- Build command: `npm run check`.
- Start command: `npm start`.
- Variavel obrigatoria: `PORT`, normalmente definida pela plataforma.
- Persistencia: para piloto, monte um volume persistente em `/app/data`. Sem volume, o JSON pode resetar em redeploy.

## Docker

```bash
docker build -t businessbarber .
docker run --env-file .env -p 4187:4187 businessbarber
```

## Checklist antes de vender piloto

- Login demo funcionando.
- Clientes importados.
- Servicos e profissionais configurados.
- WhatsApp em modo sandbox testado.
- Pix em modo sandbox testado.
- Primeira campanha registrada.
- Relatorio mostrando receita recuperada.
- Pagina publica abrindo e criando agendamento.
- Backup local criado com `npm run backup`.

## Backup local

Enquanto o MVP usa JSON, rode:

```bash
npm run backup
```

Isso cria uma copia em `data/backups/`. Para testes manuais, rode o backup antes de importar muitos clientes ou simular campanhas grandes.

## Quando migrar para banco real

Use `schema.sql` como base para Postgres quando houver mais de uma barbearia pagante, muitos usuarios, ou necessidade de backup/auditoria formal. O JSON atual e suficiente para demo e piloto acompanhado.

## Ordem sugerida para migracao

1. Criar banco Postgres.
2. Rodar `schema.sql`.
3. Migrar `barbershops`, `users`, `clients`, `services`, `professionals`, `appointments`, `campaigns`, `integrations` e `audit_logs`.
4. Trocar os acessos de `data/db.json` por consultas SQL.
5. Manter `npm test` como teste de fumaca obrigatorio antes de deploy.
