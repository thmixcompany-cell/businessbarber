# Opera??o do MVP - Business Barber

## Rodar localmente

```bash
npm start
```

Abrir:

```text
http://localhost:4187/
```

## Login demo

- Email: demo@businessbarber.local
- Senha: demo123

## Backend

O servidor está em `server.mjs` e usa apenas Node.js nativo, sem dependencias externas.

Endpoints principais:

- `GET /api/health`
- `POST /api/login`
- `GET /api/state`
- `PUT /api/state`
- `GET /api/clients`
- `POST /api/clients`
- `PUT /api/clients/:id`
- `DELETE /api/clients/:id`
- `POST /api/import/clients`
- `POST /api/integrations/whatsapp/test`
- `POST /api/integrations/pix/test`

## Persist?ncia

Os dados ficam em:

```text
data/db.json
```

O frontend tambem usa `localStorage` como fallback casó a API não esteja disponivel.

## O que ja e operacional

- Login demo.
- API local.
- Persist?ncia em arquivo JSON.
- Cadastro de clientes.
- Importacao de clientes por CSV.
- Remocao de clientes.
- Cadastro/remocao de servicos.
- Cadastro/remocao de profissionais.
- Criacao de agendamentos pelo painel.
- Cancelamento/reabertura de horários.
- Registro de campanhas de reativacao.
- Historico de campanhas na tela de Reativacao.
- ROI real baseado em campanhas registradas.
- Onboarding visual da primeira campanha.
- Pipeline de prospects.
- Proposta com simulador de ROI.
- Endpoints simulados para WhatsApp e Pix.

## Proximos blocos tecnicos

- Edicao completa de agendamentos.
- Segmentacao avancada de campanhas.
- Integracao WhatsApp oficial.
- Integracao Pix oficial.
- Deploy em ambiente online.

