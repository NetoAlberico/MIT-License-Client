import { createRequire } from "module"; const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs");
let ok = 0, total = 0; const check = (c, m) => { total++; if (c) ok++; console.log((c ? "OK   " : "FALHOU ") + m); };
const base = "/home/claude/web/MIT-Music-main/public/tools/letras/";
let guardado = {};
async function abrir() {
  const vc = new VirtualConsole(); const erros = []; vc.on("jsdomError", (e) => erros.push(String(e.message).slice(0, 120)));
  const html = fs.readFileSync(base + "index.html", "utf8").replace(/<script[^>]*src="mit-license.js"[^>]*><\/script>/, "");
  const dom = new JSDOM(html, { url: "https://suite.mit.test/tools/letras/index.html", runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { for (const [k, v] of Object.entries(guardado)) w.localStorage.setItem(k, v); w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); w.scrollTo = () => {}; } });
  // os scripts relativos (app.js, localforage) precisam do arquivo local
  await new Promise((r) => setTimeout(r, 200));
  for (const src of ["localforage.min.js", "app.js"]) { try { dom.window.eval(fs.readFileSync(base + src, "utf8")); } catch (e) { erros.push(String(e).slice(0, 120)); } }
  await new Promise((r) => setTimeout(r, 500));
  const salvar = () => { guardado = {}; for (let i = 0; i < dom.window.localStorage.length; i++) { const k = dom.window.localStorage.key(i); guardado[k] = dom.window.localStorage.getItem(k); } };
  return { d: dom.window.document, w: dom.window, salvar, erros };
}
let A = await abrir(); const d = A.d;
const lista = d.getElementById("song-database-list"), botao = d.getElementById("btn-recolher-banco");
check(botao && !lista.hidden && botao.textContent === "▾", "Banco Geral: botão ▾ ao lado do título, lista aberta" + (A.erros.length ? " (avisos: " + A.erros[0] + ")" : ""));
botao.click();
check(lista.hidden && botao.textContent === "▸" && !d.getElementById("banco-recolhido").hidden, "clicar no ▾: FECHA a lista e mostra 'Lista fechada — clique em ▸...'");
const busca = d.getElementById("database-search"); busca.value = "reino"; busca.dispatchEvent(new A.w.Event("input", { bubbles: true }));
check(!lista.hidden, "digitar na busca com a lista fechada: ela ABRE sozinha");
botao.click(); A.salvar();
A = await abrir();
check(A.d.getElementById("song-database-list").hidden && A.d.getElementById("btn-recolher-banco").textContent === "▸", "fechar e reabrir o app: a lista CONTINUA fechada (lembra a escolha)");
A.d.getElementById("banco-recolhido").click();
check(!A.d.getElementById("song-database-list").hidden, "clicar no aviso 'Lista fechada' também abre");
const bl = A.d.getElementById("btn-recolher-listas"), cl = A.d.getElementById("listas-conteudo");
bl.click();
check(cl.hidden && bl.textContent === "▸", "Minhas listas: também fecha/abre pelo ▾");
check(/Usar esta lista no repertório/.test(A.d.querySelector(".playlists-section__ajuda").textContent), "Minhas listas: explicação de pra que serve aparece");
console.log(`\n${ok}/${total} verificações passaram`); process.exit(ok === total ? 0 : 1);
