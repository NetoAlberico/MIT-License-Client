import { createRequire } from "module"; const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs");
let ok = 0, total = 0; const check = (c, m) => { total++; if (c) ok++; console.log((c ? "OK   " : "FALHOU ") + m); };
const base = "/home/claude/web/MIT-Music-main/public/tools/cifras/";
const erros = []; const vc = new VirtualConsole(); vc.on("jsdomError", (e) => erros.push(String(e.message).slice(0, 100)));
const html = fs.readFileSync(base + "index.html", "utf8").replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, "");
const dom = new JSDOM(html, { url: "https://suite.mit.test/tools/cifras/index.html", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) { w.__CIFRAS_TESTE__ = true; w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); w.scrollTo = () => {}; w.BroadcastChannel = globalThis.BroadcastChannel; } });
const W = dom.window, d = W.document;
for (const src of ["localforage.min.js", "mit-cloud-sync.js", "mit-cloud-bridge.js", "app.js"]) { const el = d.createElement("script"); el.textContent = fs.readFileSync(base + src, "utf8"); d.body.appendChild(el); }
await new Promise((r) => setTimeout(r, 500)); if (erros.length) console.log("ERROS NA CARGA:", erros.slice(0,4));
// música salva do jeito ANTIGO: as linhas de acorde marcadas como letra ("L")
W.eval(`var T = window.__cifrasTeste, songs = T.songs, state = T.state; songs = T.songs, el = T.el, renderSongsheet = T.renderSongsheet; songs.length = 0; songs.push({ id: "s1", title: "Sonde-me", artist: "Teste", key: "A", lines: [
  { t: "C", text: "[Intro] A  E/G#  D9  E" },
  { t: "L", text: "  D9         E" }, { t: "L", text: "E enche-me até que em mim" },
  { t: "L", text: "   C#m7        F#m7/E" }, { t: "L", text: "Se ache só a Ti" },
  { t: "L", text: "       ( Cm  Cm7(9) )" }, { t: "L", text: "Pelo Senhor marchamos sim" }, { t: "L", text: "[Primeira Parte]" } ] });
  state.songIndex = 0; state.semitoneShift = 0; renderSongsheet();`);
try { W.eval("renderSongsheet()"); } catch (e) { console.log("ERRO NO RENDER:", String(e).slice(0, 300)); }
console.log("filhos:", d.querySelectorAll("#cifraBody > *").length, "erros:", erros.slice(1, 4));
const linhas = () => [...d.querySelectorAll("#cifraBody .cifra-line")].map((x) => ({ classe: x.className, texto: x.textContent }));
const acordes = (i) => linhas()[i].texto;
let L = linhas();
check(L[1].classe.includes("chord-line") && L[3].classe.includes("chord-line") && L[5].classe.includes("chord-line"), "linhas de acorde salvas como letra (dado antigo) viram ACORDES ao abrir (coloridas)" + (erros.length ? " — " + erros[0] : ""));
check(L[2].classe.includes("lyric-line") && L[4].classe.includes("lyric-line"), "as linhas de letra continuam letra");
check(W.eval("window.__cifrasTeste.songs[0].lines[7].t") === "S" && W.eval("window.__cifrasTeste.songs[0].lines[7].text") === "Primeira Parte", "\"[Primeira Parte]\" sozinho na linha vira TÍTULO de seção");
check(W.eval("window.__cifrasTeste.songs[0].lines[1].t") === "C", "a correção fica SALVA na música (não precisa colar de novo)");
W.eval("state.semitoneShift = 2; renderSongsheet();");
check(acordes(0).includes("B") && acordes(1).includes("E9") && acordes(1).includes("F#") && acordes(3).includes("D#m7") && acordes(5).includes("Dm"), "mudar o tom (+2): TODAS as linhas mudam, não só a primeira (" + acordes(1).trim() + " | " + acordes(3).trim() + ")");
W.eval("state.semitoneShift = 0; renderSongsheet();");
// ---- contrabaixo ----
const sel = d.getElementById("instrumentSelect"); sel.value = "contrabaixo"; sel.dispatchEvent(new W.Event("change", { bubbles: true }));
L = linhas();
check(/A\s+G#\s+D\s+E/.test(L[0].texto) && !L[0].texto.includes("E/G#"), "Contrabaixo: E/G# vira G#, D9 vira D (\"" + L[0].texto.trim() + "\")");
check(/C#\s+E/.test(L[3].texto) && !L[3].texto.includes("F#m7"), "Contrabaixo: C#m7 → C#, F#m7/E → E (\"" + L[3].texto.trim() + "\")");
check(/\(\s*C\s+C\s*\)/.test(L[5].texto), "Contrabaixo: dentro de parênteses também ( Cm Cm7(9) ) → ( C C ) (\"" + L[5].texto.trim() + "\")");
const original = "[Intro] A  E/G#  D9  E", noBaixo = L[0].texto;
check(noBaixo.length === original.length, "as notas ficam na MESMA posição (em cima da sílaba certa): largura da linha igual");
W.eval("state.semitoneShift = 2; renderSongsheet();");
check(/B\s+A#\s+E\s+F#/.test(linhas()[0].texto), "Contrabaixo + mudar o tom (+2): E/G# → A# (\"" + linhas()[0].texto.trim() + "\")");
// clique no acorde: diagrama do baixo pra nota certa
const span = [...d.querySelectorAll("#cifraBody .chord")].find((x) => x.dataset.chord === "F#/A#");
span.dispatchEvent(new W.MouseEvent("click", { bubbles: true }));
check(/baixo: A#/.test(d.getElementById("popupChordName") ? d.getElementById("popupChordName").textContent : (W.eval("el.popupChordName.textContent"))), "clicar na nota: o diagrama mostra a nota do baixo (\"F#/A# → baixo: A#\")");
sel.value = "violao"; sel.dispatchEvent(new W.Event("change", { bubbles: true }));
check(linhas()[0].texto.includes("F#/A#"), "voltar pro Violão: a cifra volta a mostrar o acorde completo");
console.log(`\n${ok}/${total} verificações passaram`); process.exit(ok === total ? 0 : 1);
