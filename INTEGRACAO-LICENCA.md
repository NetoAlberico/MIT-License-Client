# Sistema de licença/token para os apps MIT

Este pacote adiciona uma tela de login por token a qualquer um dos seus apps
("Cifras", "Repertório", "Vs", e os próximos que você criar), pra controlar
as assinaturas dos clientes — incluindo, agora, um **limite de quantos
dispositivos** cada token pode ativar.

## O que tem aqui

- **`mit-license-admin.html`** — o gerador de tokens. Abra este arquivo no
  navegador (não precisa instalar nada) sempre que for gerar ou gerenciar
  um código de acesso.
- **`mit-license.js`** — o "porteiro" que você cola dentro de cada app. É
  ele quem mostra a tela de login, guarda o token no aparelho do cliente,
  confirma o limite de dispositivos na hora de ativar, e bloqueia o acesso
  quando vence.
- **`license-server/`** — um servidor (Cloudflare Worker) que guarda quantos
  e quais dispositivos já ativaram cada token. **Só é necessário se você for
  usar o limite de dispositivos** — sem ele, tudo o resto (validade, tom,
  app vinculado) continua funcionando normalmente, só sem esse limite.
- Este arquivo de instruções.

Os apps **Cifras**, **Repertório** e **Vs** que te entreguei já vêm com o
`mit-license.js` integrado e funcionando — os passos abaixo são só para
quando você criar um app novo, ou para publicar o `license-server`.

## Como funciona, em resumo

1. Você abre `mit-license-admin.html`, escolhe o cliente, o app, o período
   e **quantos dispositivos** esse token pode usar, e clica em **Gerar token**.
2. Você envia esse token pro cliente (WhatsApp, e-mail, o que for).
3. Na primeira vez que o cliente abre o app naquele aparelho, aparece a
   tela pedindo o token. Ele cola, clica em **Ativar acesso** — nesse
   momento (só nesse momento) o app confirma com o `license-server` se
   ainda há vaga de dispositivo pra esse token. Se tiver vaga, libera e
   fica salvo naquele aparelho (não pede de novo). Se o limite já foi
   atingido em outros aparelhos, recusa.
4. Do segundo acesso em diante, **tudo volta a ser 100% offline** nesse
   aparelho — só a ativação de um token novo precisa de internet.
5. O app confere a validade toda vez que é aberto (e a cada hora, se
   ficar aberto). Faltando 5 dias ou menos para vencer, aparece um aviso
   discreto de renovação, sem travar o uso. Quando vence, bloqueia sozinho
   e volta pra tela de login.

A data de início/fim e o limite de dispositivos ficam dentro do próprio
token, assinados digitalmente — por isso o dia a dia continua offline. Isso
também significa que **excluir um cliente do histórico do gerador não
revoga o acesso dele** (veja "Limitações" abaixo) — quem revoga acesso por
dispositivo é o `license-server` (usando o botão "Resetar dispositivos",
explicado mais abaixo).

## Limite de dispositivos — como publicar o `license-server`

1. **Crie o "banco" (KV namespace) da Cloudflare:**
   ```bash
   cd license-server
   npm install
   npx wrangler login
   npx wrangler kv namespace create ACTIVATIONS
   ```
   O comando devolve um `id` — cole ele em `wrangler.jsonc`, no lugar de
   `COLOQUE_AQUI_O_ID_DO_NAMESPACE`.

2. **Configure as variáveis de ambiente** (painel da Cloudflare, depois do
   primeiro deploy: Worker → **Variables** → **Add**, tipo **Secret** pras
   duas):
   - `SECRET` — a **mesma** chave configurada no `mit-license-admin.html`
     e em cada `mit-license.js`.
   - `ADMIN_KEY` — uma senha só sua, qualquer string, pra proteger as rotas
     de consulta/reset (só você usa essa, o app do cliente não precisa).

3. **Publique:**
   ```bash
   npx wrangler deploy
   ```
   Isso devolve uma URL tipo `https://mit-license-server.SEUNOME.workers.dev`.

4. **Aponte cada app pra esse endereço** — em `mit-license.js` (dentro de
   cada app), preencha:
   ```js
   LICENSE_SERVER_URL: "https://mit-license-server.SEUNOME.workers.dev",
   ```
   Republique cada app depois de preencher.

5. **No gerador** (`mit-license-admin.html`), preencha também o campo
   **"URL do servidor de licenças"** (na seção "Limite de dispositivos"),
   com a mesma URL — é o que permite o botão "Verificar dispositivos" na
   tabela de assinaturas.

Sem os passos 1-4, o campo "Dispositivos permitidos" do gerador continua
existindo, mas **não é aplicado de verdade** — os apps aceitam qualquer
quantidade de aparelhos até você publicar e configurar o `license-server`.

## Monitorando e revogando dispositivos (o "rastreio")

Na tabela **"Assinaturas geradas"** do gerador, cada linha tem um botão
**Dispositivos** que mostra quantos aparelhos já ativaram aquele token
(usa a rota `GET /devices` do `license-server`, protegida pela `ADMIN_KEY`).

Se um cliente trocou de celular, vendeu o antigo, ou você suspeita que o
token foi compartilhado além do combinado, use o botão **Resetar
dispositivos** na mesma linha — isso limpa a lista de aparelhos daquele
token no servidor (ele passa a aceitar até o limite de novo, do zero,
inclusive num aparelho "novo" que já tinha ativado antes).

**Isso não troca o token** — o mesmo código continua funcionando, só a
contagem de dispositivos é zerada.

## Instalando em um app novo

1. Copie `mit-license.js` para dentro da pasta do app (junto de `app.js`,
   `styles.css` etc).
2. No `index.html` do app, adicione a linha destacada, sempre **antes** do
   `app.js` (e depois do `localforage.min.js`, se o app já usar):

   ```html
   <script src="localforage.min.js"></script>
   <script src="mit-license.js"></script>   <!-- linha nova -->
   <script src="app.js"></script>
   ```

3. Abra `mit-license.js` e configure o topo do arquivo:

   ```js
   const CONFIG = {
     SECRET: "TROQUE-ESTA-CHAVE-3f8a1c9d-mit",  // troque por uma chave só sua
     APP_ID: "any",                              // ou um nome só deste app, ex: "mit-agenda"
     LICENSE_SERVER_URL: "",                     // preencha se for usar limite de dispositivos
     WARNING_DAYS: 5,
     ...
   };
   ```

   - **`SECRET`**: precisa ser **idêntica** à chave configurada em
     `mit-license-admin.html` e no `license-server` — troque o valor
     padrão por algo único.
   - **`APP_ID`**: deixe `"any"` se quiser que qualquer token MIT funcione
     neste app, ou coloque um nome específico (ex.: `"mit-agenda"`) se
     quiser vender o acesso a este app separadamente dos outros.
   - **`LICENSE_SERVER_URL`**: deixe vazio se não for usar limite de
     dispositivos.

4. No gerador (`mit-license-admin.html`), abra o campo **"Chave secreta"**
   no topo da página e cole a mesma chave. Se o app novo tiver um `APP_ID`
   próprio, adicione a opção correspondente no `<select id="appSelect">`
   do gerador.

### Deixando os apps já existentes com a mesma chave

Os apps **Cifras**, **Repertório** e **Vs** que te entreguei estão usando a
chave padrão de exemplo (`TROQUE-ESTA-CHAVE-3f8a1c9d-mit`). **Troque essa
chave antes de usar de verdade com clientes**: edite o `mit-license.js` de
cada app, o `license-server` (variável `SECRET`) e o campo "Chave secreta"
do gerador, colocando a mesma chave nova em todos os lugares.

## Usando o gerador (`mit-license-admin.html`)

- **Cliente**: nome ou identificação de quem vai receber o acesso (fica
  só no seu histórico, não aparece pro cliente).
- **App vinculado**: "Qualquer app MIT" libera em todos; ou escolha
  Repertório / Cifras / Vs (o valor precisa bater com o `APP_ID`
  configurado nesse app).
- **Período**: Quinzenal (15 dias), Mensal (30 dias), Anual (365 dias),
  Por dias (você escolhe a quantidade) ou Por período (você escolhe a
  data de início e a data de fim exatas).
- **Dispositivos permitidos**: quantos aparelhos diferentes podem ativar
  esse token (precisa do `license-server` publicado — veja acima).
- Clique em **Gerar token** — o código aparece pronto pra copiar, e fica
  salvo na tabela **"Assinaturas geradas"** logo abaixo, com o status
  atualizado (Ativo / Vence em X dias / Expirado).
- Na tabela você pode **copiar** o token de novo, **verificar quantos
  dispositivos** já ativaram, **resetar dispositivos**, **renovar** (gera
  um token novo para o mesmo cliente) ou **remover** do histórico.
- **Exportar backup / Importar backup**: o histórico fica salvo só no
  navegador onde você usa o gerador. Exporte de vez em quando (ou antes
  de limpar os dados do navegador) para não perder o histórico.

## No app, do lado do cliente

- Na primeira vez, aparece a tela pedindo o token (isso exige internet
  se o token tiver limite de dispositivos configurado — pra confirmar a
  vaga; sem limite, funciona offline desde o início).
- Um ícone 🔑 discreto no canto da tela permite trocar o token manualmente
  a qualquer momento.
- Se você (o próprio dono do app) quiser forçar a saída/reset do token em
  algum teste, abra o console do navegador e rode `MITLicense.logout()`.

## Limitações (importante entender)

- **Revogação por cliente ainda não existe — só por dispositivo.** Não dá
  pra "desligar" um token específico remotamente (ele é assinado, não tem
  como o servidor invalidar sua data de validade). O que dá pra fazer é
  resetar/limitar quantos *aparelhos* usam aquele token.
- **Sem `license-server` publicado, o limite de dispositivos não é
  aplicado.** É opcional — o resto do sistema (validade, app vinculado)
  continua funcionando sem ele.
- **A chave secreta fica dentro do código do app.** Alguém tecnicamente
  muito experiente que analisar o código-fonte do app poderia, em teoria,
  encontrar a chave e gerar tokens falsos. Isso é uma limitação inerente a
  qualquer sistema de licença sem um backend mais robusto (autenticação de
  usuário, banco de dados de clientes etc.) — é o mesmo modelo usado por
  muitos aplicativos pequenos vendidos com "chave de licença", suficiente
  pra controlar assinaturas de clientes comuns, mas não à prova de
  engenharia reversa.
- **Um usuário decidido tecnicamente ainda pode contornar o limite** —
  por exemplo, limpando os dados do navegador (o que troca o "ID do
  dispositivo" salvo, fazendo parecer um aparelho novo) ou usando o modo
  anônimo/privado. O limite de dispositivos dificulta o compartilhamento
  casual (alguém passar o token pra vários amigos sem querer/pensar
  muito), mas não é uma proteção definitiva contra alguém disposto a
  burlar de propósito — nenhum sistema sem conta de usuário + senha
  individual consegue garantir isso 100%.
- **O relógio do aparelho manda** pra validade do token (mas o
  `license-server`, se configurado, também confere a data no servidor
  na hora da ativação — uma camada extra ali).
