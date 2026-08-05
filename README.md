# mit-license-client (painel admin publicado)

Isto é só o `mit-license-admin.html` (renomeado pra `public/index.html`, do
jeito que Workers/Pages esperam) publicado como um site próprio, separado
do `license-server` — pra você conseguir abrir o painel por uma URL fixa,
de qualquer computador, em vez de precisar abrir o arquivo local.

## Por que separar do `license-server`

São coisas diferentes: este aqui é só a **interface** que você usa (sem
nenhum código de servidor, sem segredo nenhum dentro dos arquivos); o
`license-server` é o **backend** que valida senhas e guarda quem ativou o
quê. Publicar os dois juntos (como aconteceu antes) não vaza segredo
nenhum, mas deixa código do servidor "pendurado" à toa como arquivo
estático, sem necessidade.

## Publicando

```bash
npm install
npx wrangler login
npx wrangler deploy
```
ou conectando este repositório num Worker novo (Workers & Pages → Create →
Worker → Connect to Git), igual os outros projetos.

**Importante:** os arquivos aqui (`wrangler.jsonc`, `package.json`) precisam
ficar na **raiz** do repositório — não dentro de uma subpasta.

## Isso é seguro de deixar público?

Sim, com uma ressalva: qualquer pessoa com a URL consegue **ver a tela**
do gerador, mas não consegue **gerar tokens/contas válidos de verdade**
sem saber a `SECRET` e a `ADMIN_KEY` (que ficam só no seu navegador, digitadas
por você, nunca nos arquivos). Ainda assim, se preferir deixar isso
totalmente fora do alcance de estranhos, duas opções simples:

- **Cloudflare Access** (grátis pra poucos usuários): protege a URL inteira
  atrás de um login (seu e-mail, por exemplo) antes mesmo de carregar a
  página. Configurável em *Zero Trust → Access → Applications* no painel
  da Cloudflare, apontando pro domínio deste Worker.
- Ou simplesmente **não compartilhar a URL** e continuar usando o arquivo
  local também — as duas formas funcionam ao mesmo tempo, sem conflito.
