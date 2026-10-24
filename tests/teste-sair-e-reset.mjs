import { createRequire } from "module"; const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs"); const nodeCrypto = require("crypto");
let ok = 0, total = 0; const check = (c, m) => { total++; if (c) ok++; console.log((c ? "OK   " : "FALHOU ") + m); };
const SECRET = "Torre-MIT-2026-3f8a1c9d-mit"; const espera = (ms) => new Promise((r) => setTimeout(r, ms));
function token(appId, max = 2) {
  const payload = ["2", encodeURIComponent("Igreja"), appId, "A", "2026-01-01", "2030-12-31", "u-alberico", String(max)].join("|");
  return "MIT-" + Buffer.from(payload).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") + "." + nodeCrypto.createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 24);
}
// ============ SERVIDOR ============
const { default: worker } = await import("/home/claude/p/cloud/mit-cloud-main/src/index.js");
let dispositivos = ["pc-1"]; let maxConta = 24;
const env = { MIT_LICENSE_SECRET: SECRET, DB: { prepare: (sql) => ({ bind: () => ({
  first: async () => (/FROM usuarios WHERE usuario/.test(sql) ? { ativo: 1, fim: "2030-12-31", max_dispositivos: maxConta } : /tokens_revogados/.test(sql) ? null : null),
  all: async () => ({ results: /dispositivos_ativados/.test(sql) ? dispositivos.map((d) => ({ device_id: d })) : [] }), run: async () => ({}) }) }) } };
const status = async (q) => (await (await worker.fetch(new Request("https://x" + q), env, {})).json());
let r = await status("/account-status?username=alberico&deviceId=pc-1");
check(r.active === true && !r.deviceRemoved, "servidor: aparelho na lista → conta ativa");
dispositivos = [];   // "Resetar dispositivos" no painel
r = await status("/account-status?username=alberico&deviceId=pc-1");
check(r.active === false && r.deviceRemoved === true, "servidor: depois de 'Resetar dispositivos' → 'aparelho removido'");
r = await status("/account-status?username=alberico");
check(r.active === true, "servidor: app ANTIGO (sem mandar o aparelho) continua funcionando como antes");
maxConta = 0; r = await status("/account-status?username=alberico&deviceId=pc-1");
check(r.active === true, "servidor: conta SEM limite de dispositivos não é afetada");
r = await status("/token-status?nonce=abc&deviceId=pc-1&maxDevices=2");
check(r.deviceRemoved === true, "servidor: token com limite cujo aparelho foi resetado → 'aparelho removido'");
// ============ APPS (mesmo armazenamento, como na Suite) ============
let armazenado = {};   // localStorage do site inteiro
let respostaConta = { ok: true, active: true };
async function abrir(app, confirmar = true) {
  const dom = new JSDOM(`<html><head><title>MIT ${app}</title></head><body></body></html>`, { url: "https://suite.mit.test/tools/" + app + "/", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window; w.crypto.subtle = nodeCrypto.webcrypto.subtle; w.TextEncoder = TextEncoder; w.confirm = () => confirmar;
  for (const [k, v] of Object.entries(armazenado)) w.localStorage.setItem(k, v);
  w.fetch = async (url) => ({ ok: true, json: async () => (String(url).includes("/account-status") ? respostaConta : { ok: true, revoked: false }) });
  w.eval(fs.readFileSync(`/home/claude/web/MIT-Music-main/public/tools/${app}/mit-license.js`, "utf8"));
  await espera(300);
  const salvar = () => { armazenado = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); armazenado[k] = w.localStorage.getItem(k); } };
  const pedeLogin = () => !!w.document.querySelector('[data-role="mitlic-submit"]') && getComputedStyle2(w);
  return { w, salvar, pedeLogin, erro: () => (w.document.querySelector('[data-role="mitlic-error"]') || {}).textContent || "" };
}
function getComputedStyle2(w) { const o = w.document.querySelector('[data-role="mitlic-submit"]').closest("div[class]"); let el = o; while (el && el !== w.document.body) { if (w.getComputedStyle(el).display === "none") return false; el = el.parentElement; } return true; }
const KEY = (app) => "mit_license_v1_" + app, USER = (app) => "mit_license_username_" + app;
// logado no Letras e no Cifras (como o Alberico)
armazenado[KEY("letras")] = JSON.stringify(token("any")); armazenado[USER("letras")] = JSON.stringify("alberico");
armazenado[KEY("cifras")] = JSON.stringify(token("any")); armazenado[USER("cifras")] = JSON.stringify("alberico");
let L = await abrir("letras");
check(!L.pedeLogin(), "Letras logado: entra direto");
// ---- 1. "Resetar dispositivos" no painel ----
respostaConta = { ok: true, active: false, deviceRemoved: true };
L = await abrir("letras");
check(L.pedeLogin() && /resetados/.test(L.erro()), "depois de 'Resetar dispositivos': o Letras PEDE O LOGIN de novo (\"" + L.erro().slice(0, 60) + "...\")");
L.salvar();
check(!armazenado[KEY("letras")], "o acesso salvo do Letras foi apagado");
respostaConta = { ok: true, active: true };
// ---- 2. "Sair" (a chave) vale pra todos e não volta sozinho ----
armazenado[KEY("letras")] = JSON.stringify(token("any")); armazenado[USER("letras")] = JSON.stringify("alberico");
armazenado["mit_license_login_em_" + KEY("letras")] = String(Date.now());
L = await abrir("letras");
check(!L.pedeLogin(), "logado de novo no Letras");
L.w.document.querySelector(".mitlic-fab").click(); await espera(200); L.salvar();
check(L.pedeLogin() && !armazenado[KEY("letras")], "clicar na chave e confirmar: SAI (apaga o acesso e mostra o login)");
L = await abrir("letras");
check(L.pedeLogin(), "reabrir o Letras (ir em outro app e voltar): CONTINUA pedindo login — não volta logado sozinho");
const C = await abrir("cifras");
check(C.pedeLogin() && /saiu/.test(C.erro()), "o Cifras (que tinha acesso salvo) também pede login: o 'sair' vale pra Suite toda");
// ---- 3. entrar de novo depois de sair ----
armazenado[KEY("letras")] = JSON.stringify(token("any")); armazenado["mit_license_login_em_" + KEY("letras")] = String(Date.now() + 5000);
L = await abrir("letras");
check(!L.pedeLogin(), "fazer login de novo no Letras: entra (o 'sair' antigo não atrapalha)");
// ---- 4. cancelar o 'sair' ----
const L2 = await abrir("letras", false); L2.w.document.querySelector(".mitlic-fab").click(); await espera(100);
check(!L2.pedeLogin(), "clicar na chave e CANCELAR: continua logado");
// ---- 5. quem já estava logado antes desta versão não é deslogado à toa ----
armazenado = { [KEY("escala")]: JSON.stringify(token("any")) };
const E = await abrir("escala");
check(!E.pedeLogin(), "quem estava logado ANTES desta atualização continua logado (ninguém é deslogado à toa)");
console.log(`\n${ok}/${total} verificações passaram`); process.exit(ok === total ? 0 : 1);
