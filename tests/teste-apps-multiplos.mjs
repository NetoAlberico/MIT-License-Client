// Teste ponta a ponta (painel → token → apps; servidor /login). Rodar com Node 22 + jsdom:
//   npm i jsdom@24 && node tests/teste-apps-multiplos.mjs   (ajuste os caminhos no topo se precisar)
import { createRequire } from "module"; const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs"); const nodeCrypto = require("crypto");
let ok = 0, total = 0; const check = (c, m) => { total++; if (c) ok++; console.log((c ? "OK   " : "FALHOU ") + m); };
const SECRET = "Torre-MIT-2026-3f8a1c9d-mit";
async function leitorDoApp(app) {
  const dom = new JSDOM(`<html><head><title>MIT ${app}</title></head><body></body></html>`, { runScripts: "outside-only", virtualConsole: new VirtualConsole() });
  dom.window.__MITLIC_TESTE__ = true; dom.window.crypto.subtle = nodeCrypto.webcrypto.subtle; dom.window.TextEncoder = TextEncoder;
  try { dom.window.eval(fs.readFileSync(`/home/claude/web/MIT-Music-main/public/tools/${app}/mit-license.js`, "utf8")); } catch (e) {}
  return dom.window.__mitLicTeste;
}
// ============ 1. PAINEL (caixinhas) ============
const vc = new VirtualConsole(); const erros = []; vc.on("jsdomError", (e) => erros.push(String(e.message).slice(0, 140)));
const painel = new JSDOM(fs.readFileSync("/home/claude/p/lic/MIT-License-Client-main/public/index.html", "utf8"), { url: "https://painel.mit.test/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) { w.crypto.subtle = nodeCrypto.webcrypto.subtle; w.TextEncoder = TextEncoder; w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); w.scrollTo = () => {}; w.fetch = async () => ({ ok: false, json: async () => ({}) }); } });
await new Promise((r) => setTimeout(r, 400));
const d = painel.window.document, w = painel.window;
const grupo = d.getElementById("appSelect"); const caixa = (v) => grupo.querySelector(`input[value="${v}"]`);
check(grupo && grupo.querySelectorAll("input[type=checkbox]").length === 7 && grupo.value === "any", "painel: 7 caixinhas, começa em 'Qualquer app MIT'");
const marcar = (v, on) => { const c = caixa(v); c.checked = on; c.dispatchEvent(new w.Event("change", { bubbles: true })); };
marcar("cifras", true);
check(!caixa("any").checked && grupo.value === "cifras", "marcar Cifras desmarca 'Qualquer app' sozinho");
marcar("vs", true);
check(grupo.value === "cifras,vs", "marcar Cifras + MIT VS → valor 'cifras,vs'");
marcar("any", true);
check(grupo.value === "any" && !caixa("cifras").checked && !caixa("vs").checked, "marcar 'Qualquer app' desmarca os outros");
marcar("any", false);
check(grupo.value === "", "nenhuma marcada → vazio (o painel não deixa gerar)");
let toast = ""; const toastEl = () => (d.getElementById("toast") || {}).textContent || "";
d.getElementById("clientInput").value = "Igreja Teste";
const maxDev = d.getElementById("maxDevicesInput"); if (maxDev) maxDev.value = "2";
d.getElementById("generateBtn").click(); await new Promise((r) => setTimeout(r, 200));
check(/pelo menos um app/i.test(d.body.textContent), "tentar gerar sem app marcado: aviso 'Marque pelo menos um app'");
marcar("cifras", true); marcar("vs", true);
d.getElementById("generateBtn").click(); await new Promise((r) => setTimeout(r, 600));
const m = d.body.innerHTML.match(/MIT-[A-Za-z0-9_-]+\.[0-9a-f]{24}/);
check(!!m, "gerar com Cifras + MIT VS: token criado" + (m ? "" : " — erros: " + erros.slice(0, 2).join(" | ")));
check(/Cifras \+ MIT VS/.test(d.body.textContent), "a confirmação mostra 'Cifras + MIT VS' (não o código interno)");
// ============ 2. o token do PAINEL nos APPS ============
if (m) {
  const tokPainel = m[0];
  const cifras = await leitorDoApp("cifras"), escala = await leitorDoApp("escala");
  check((await cifras.parseToken(tokPainel)).ok, "app Cifras ACEITA o token do painel (Cifras + MIT VS)");
  check(!(await escala.parseToken(tokPainel)).ok, "app Escala RECUSA (não está na lista)");
  fs.writeFileSync("/tmp/jt/token_painel.txt", tokPainel);
}
// ============ 3. SERVIDOR /login ============
const { default: worker } = await import("/home/claude/p/cloud/mit-cloud-main/src/index.js");
const salt = "00112233445566778899aabbccddeeff";
const bits = await nodeCrypto.webcrypto.subtle.deriveBits({ name: "PBKDF2", salt: Buffer.from(salt, "hex"), iterations: 100000, hash: "SHA-256" },
  await nodeCrypto.webcrypto.subtle.importKey("raw", new TextEncoder().encode("senha123"), "PBKDF2", false, ["deriveBits"]), 256);
const registro = { usuario: "igreja", senha_hash: Buffer.from(bits).toString("hex"), senha_salt: salt, cliente: "Igreja Teste", app_id: "cifras, VS ,vs|escala", tipo: "A", inicio: "2026-01-01", fim: "2030-12-31", max_dispositivos: 0, ativo: 1 };
const env = { MIT_LICENSE_SECRET: SECRET, DB: { prepare: (sql) => ({ bind: () => ({ first: async () => (/FROM usuarios WHERE usuario/.test(sql) ? registro : null), run: async () => ({}), all: async () => ({ results: [] }) }), first: async () => null, all: async () => ({ results: [] }) }) },
  ACTIVATIONS: { get: async () => null, put: async () => {} } };
const resp = await worker.fetch(new Request("https://x/login", { method: "POST", body: JSON.stringify({ username: "igreja", password: "senha123", deviceId: "pc1" }) }), env, { waitUntil() {} });
const j = await resp.json().catch(() => ({}));
check(j.ok && /^MIT-/.test(j.token || ""), "servidor /login com conta de vários apps: devolve token" + (j.ok ? "" : " — " + JSON.stringify(j)));
if (j.ok) {
  const corpo = j.token.replace(/^MIT-/, "").split(".")[0];
  const payload = Buffer.from(corpo.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
  check(payload.split("|")[2] === "cifras,vs", "o servidor NORMALIZA a lista ('cifras, VS ,vs|escala' → 'cifras,vs'; o '|' não entra no token)");
  const cifras = await leitorDoApp("cifras");
  check((await cifras.parseToken(j.token)).ok, "o token do servidor abre o app Cifras");
  fs.writeFileSync("/tmp/jt/token_servidor.txt", j.token);
}
console.log(`\n${ok}/${total} verificações passaram`); process.exit(ok === total ? 0 : 1);
