# license-server

Cloudflare Worker que guarda quantos e quais dispositivos já ativaram cada
token gerado pelo `mit-license-admin.html`. Só é necessário se você for usar
o limite de "Dispositivos permitidos" ao gerar tokens — veja o passo a
passo completo em `../INTEGRACAO-LICENCA.md` (seção "Limite de
dispositivos").

## Resumo rápido

```bash
npm install
npx wrangler login
npx wrangler kv namespace create ACTIVATIONS
# cole o "id" devolvido em wrangler.jsonc
npx wrangler deploy
```

Depois do primeiro deploy, configure no painel da Cloudflare (Worker →
Variables → Add, tipo **Secret**):
- `SECRET` — igual à do `mit-license-admin.html` e de cada `mit-license.js`.
- `ADMIN_KEY` — uma senha só sua, pra proteger as rotas `/devices` e `/reset`.

## Rotas

- `POST /activate` `{ token, deviceId }` — chamada pelos apps na hora de
  ativar um token novo. Pública (sem `ADMIN_KEY`) — a segurança vem da
  assinatura do próprio token.
- `GET /devices?nonce=...` — mostra quantos dispositivos ativaram um token.
  Exige o header `x-admin-key`.
- `POST /reset` `{ nonce }` — zera a lista de dispositivos de um token.
  Exige o header `x-admin-key`.
- `GET /health` — só pra testar se o Worker está no ar.
