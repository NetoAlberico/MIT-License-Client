import { createRequire } from "module"; const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs");
let ok = 0, total = 0; const check = (c, m) => { total++; if (c) ok++; console.log((c ? "OK   " : "FALHOU ") + m); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const base = "/home/claude/web/MIT-Music-main/public/tools/letras/";
let armazenamento = {};
const copiarPara = (w) => { for (const [k, v] of Object.entries(armazenamento)) w.localStorage.setItem(k, v); };
const copiarDe = (w) => { for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); armazenamento[k] = w.localStorage.getItem(k); } };
// ---------- operador ----------
const erros = []; const vc = new VirtualConsole(); vc.on("jsdomError", (e) => erros.push(String(e.message).slice(0, 100)));
const html = fs.readFileSync(base + "index.html", "utf8").replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, "");
const abertas = [];
const op = new JSDOM(html, { url: "https://suite.mit.test/tools/letras/index.html", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc });
const W = op.window; W.BroadcastChannel = globalThis.BroadcastChannel; W.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); W.scrollTo = () => {};
W.getScreenDetails = async () => ({ screens: [{ label: "Notebook", width: 1366, height: 768, availLeft: 0, availTop: 0, availWidth: 1366, availHeight: 728, isPrimary: true },
                                              { label: "Datashow EPSON", width: 1920, height: 1080, availLeft: 1366, availTop: 0, availWidth: 1920, availHeight: 1080, isPrimary: false },
                                              { label: "TV retorno", width: 1280, height: 720, availLeft: 3286, availTop: 0, availWidth: 1280, availHeight: 720, isPrimary: false }] });
W.open = (url, nome, recursos) => { abertas.push({ url, nome, recursos }); return { closed: false, close() { this.closed = true; } }; };
for (const src of ["localforage.min.js", "app.js"]) { const el = W.document.createElement("script"); el.textContent = fs.readFileSync(base + src, "utf8"); W.document.body.appendChild(el); }
await espera(500);
// ---------- duas telas de saída ----------
async function abrirSaida(id) {
  const d = new JSDOM(fs.readFileSync(base + "saida.html", "utf8"), { url: `https://suite.mit.test/tools/letras/saida.html?saida=${id}`, runScripts: "dangerously", pretendToBeVisual: true,
    beforeParse(w) { w.BroadcastChannel = globalThis.BroadcastChannel; copiarPara(w); } });
  await espera(150); return d.window;
}
const ds = await abrirSaida("datashow"), r1 = await abrirSaida("retorno1");
const letra = (w) => w.document.getElementById("letra").textContent, apagada = (w) => w.__saidaTeste.estadoApagado();
// ---------- música e apresentação ----------
W.eval(`SONGS.push({ id: "s1", name: "Teu é o Reino", artist: "Teste", tone: "C", lyrics: "[Verso 1]\\nQuando tudo vai mal\\nTudo numa pior\\n[Refrão]\\nTeu é o reino\\nO poder e a glória" }); openPerformance("s1");`);
await espera(100);
const perf = W.document.querySelector(".performance");
check(perf && perf.querySelector('[data-role="saidas"]') && perf.querySelector('[data-role="tela-preta"]'), "apresentação: botões 📺 (saídas) e ⬛ (tela preta)" + (erros.length ? " — " + erros[0] : ""));
perf.querySelector('[data-role="toggle-slide"]').click(); await espera(150);
check(letra(ds) === "Quando tudo vai mal\nTudo numa pior" && !apagada(ds), "modo slide: o verso aparece no DATASHOW (sem a linha [Verso 1])");
check(ds.document.getElementById("titulo").textContent === "", "datashow: sem o nome da parte (público vê só a letra)");
check(letra(r1).startsWith("Quando tudo vai mal") && /Refrão: Teu é o reino/.test(r1.document.getElementById("proximoTexto").textContent) && /Teu é o Reino/.test(r1.document.getElementById("musica").textContent),
      "RETORNO: verso atual + PRÓXIMO (\"Refrão: Teu é o reino…\") + nome da música");
check(r1.document.getElementById("titulo").textContent === "Verso 1", "retorno: mostra o nome da parte (Verso 1)");
perf.querySelector('[data-role="slide-next"]').click(); await espera(120);
check(letra(ds).startsWith("Teu é o reino") && /fim da música/.test(r1.document.getElementById("proximoTexto").textContent), "próximo slide: as duas telas acompanham; no retorno o 'próximo' vira '(fim da música)'");
// ---------- enviar para ----------
perf.querySelector('[data-role="saidas"]').click();
perf.querySelector('[data-destinos="retorno"]').click(); await espera(120);
check(apagada(ds) && !apagada(r1), "Enviar para RETORNOS: datashow fica preto, retorno continua");
perf.querySelector('[data-destinos="datashow"]').click(); await espera(120);
check(!apagada(ds) && apagada(r1), "Enviar para DATASHOW: só o datashow");
perf.querySelector('[data-destinos="datashow,retorno"]').click(); await espera(120);
check(!apagada(ds) && !apagada(r1), "Enviar para AMBOS: as duas");
perf.querySelector('[data-destinos=""]').click(); await espera(120);
check(apagada(ds) && apagada(r1), "Enviar para NENHUM: as duas pretas");
perf.querySelector('[data-destinos="datashow,retorno"]').click(); await espera(80);
// ---------- tela preta ----------
perf.querySelector('[data-role="tela-preta"]').click(); await espera(120);
check(apagada(ds) && apagada(r1), "⬛ tela preta: apaga tudo");
W.document.dispatchEvent(new W.KeyboardEvent("keydown", { key: "b" })); await espera(120);
check(!apagada(ds) && !apagada(r1), "tecla B: volta a mostrar");
// ---------- tela aberta DEPOIS recebe o slide atual ----------
const r2 = await abrirSaida("retorno2"); await espera(150);
check(letra(r2).startsWith("Teu é o reino"), "uma tela de saída aberta no meio da música já mostra o slide atual");
// ---------- abrir no monitor certo ----------
copiarDe(W);
const cfg = JSON.parse(armazenamento["letras_saidas_config"] || JSON.stringify(W.eval("saidasPadrao()")));
cfg.saidas[0].tela = "1"; cfg.saidas[1].tela = "2"; W.localStorage.setItem("letras_saidas_config", JSON.stringify(cfg));
await W.eval("abrirTelasDeSaida()"); await espera(50);
const dsJan = abertas.find((a) => /saida=datashow/.test(a.url)), r1Jan = abertas.find((a) => /saida=retorno1/.test(a.url));
check(dsJan && /left=1366,top=0,width=1920,height=1080/.test(dsJan.recursos) && r1Jan && /left=3286/.test(r1Jan.recursos),
      "Abrir telas: o datashow abre no monitor 'Datashow EPSON' e o retorno na 'TV retorno' (posição/tamanho de cada um)");
check(!abertas.some((a) => /saida=retorno2/.test(a.url)), "saída desativada (Retorno 2) não abre");
// ---------- configurador ----------
await W.eval("abrirConfiguradorDeSaidas()"); await espera(80);
const modal = W.document.querySelector(".modal");
check(modal && modal.querySelectorAll(".saida-cfg").length === 3 && /Datashow EPSON/.test(modal.innerHTML), "configurador: 3 saídas, com a lista dos monitores do computador");
const fonte = modal.querySelector('.saida-cfg[data-i="0"] [data-k="fonte"]'); fonte.value = "96"; fonte.dispatchEvent(new W.Event("change", { bubbles: true }));
copiarDe(W); copiarPara(ds); await espera(150);
check(JSON.parse(W.localStorage.getItem("letras_saidas_config")).saidas[0].fonte === 96 && ds.__saidaTeste.config().fonte === 96, "mudar o tamanho da letra no configurador: salva e a tela do datashow aplica na hora");
console.log(`\n${ok}/${total} verificações passaram`); process.exit(ok === total ? 0 : 1);
