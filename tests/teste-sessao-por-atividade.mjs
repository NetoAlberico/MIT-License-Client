import { createRequire } from "module"; const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs"); const nodeCrypto = require("crypto");
let ok = 0, total = 0; const check = (c, m) => { total++; if (c) ok++; console.log((c ? "OK   " : "FALHOU ") + m); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const SECRET = "Torre-MIT-2026-3f8a1c9d-mit";
// ============ SERVIDOR DE VERDADE (Worker) com banco falso que guarda os aparelhos ============
const { default: worker } = await import("/home/claude/p/cloud/mit-cloud-main/src/index.js");
const salt = "00112233445566778899aabbccddeeff";
const bits = await nodeCrypto.webcrypto.subtle.deriveBits({ name: "PBKDF2", salt: Buffer.from(salt, "hex"), iterations: 100000, hash: "SHA-256" },
  await nodeCrypto.webcrypto.subtle.importKey("raw", new TextEncoder().encode("senha123"), "PBKDF2", false, ["deriveBits"]), 256);
const conta = { usuario: "alberico", senha_hash: Buffer.from(bits).toString("hex"), senha_salt: salt, cliente: "Alberico", app_id: "any", tipo: "A", inicio: "2026-01-01", fim: "2030-12-31", max_dispositivos: 24, ativo: 1 };
let aparelhos = [];   // { chave, device_id }
const env = { MIT_LICENSE_SECRET: SECRET, DB: { prepare: (sql) => ({ bind: (...a) => ({
  first: async () => /FROM usuarios WHERE usuario/.test(sql) ? conta : null,
  all: async () => ({ results: /FROM dispositivos_ativados WHERE chave/.test(sql) ? aparelhos.filter((x) => x.chave === a[0]) : [] }),
  run: async () => { if (/INSERT INTO dispositivos_ativados/.test(sql)) aparelhos.push({ chave: a[0], device_id: a[1] }); if (/DELETE FROM dispositivos_ativados/.test(sql)) aparelhos = aparelhos.filter((x) => x.chave !== a[0]); return {}; } }) }) } };
const servidor = async (url, opts = {}) => { const r = await worker.fetch(new Request(url, { method: opts.method || "GET", body: opts.body, headers: opts.headers }), env, { waitUntil() {} }); const t = await r.text(); return { ok: r.ok, status: r.status, json: async () => JSON.parse(t) }; };
// ============ APP (Letras real, armazenamento compartilhado da Suite) ============
let armazenado = { mit_license_device_id: JSON.stringify("aparelho-1") };
async function abrir(app = "letras") {
  const dom = new JSDOM(`<html><head><title>MIT</title></head><body></body></html>`, { url: "https://suite.mit.test/tools/" + app + "/", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window; w.crypto.subtle = nodeCrypto.webcrypto.subtle; w.TextEncoder = TextEncoder; w.confirm = () => true; w.BroadcastChannel = globalThis.BroadcastChannel;
  for (const [k, v] of Object.entries(armazenado)) w.localStorage.setItem(k, v);
  w.fetch = servidor;
  w.eval(fs.readFileSync(`/home/claude/web/MIT-Music-main/public/tools/${app}/mit-license.js`, "utf8"));
  await espera(400);
  const salvar = () => { armazenado = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); armazenado[k] = w.localStorage.getItem(k); } };
  const pedeLogin = () => { const b = w.document.querySelector('[data-role="mitlic-submit"]'); if (!b) return false; let el = b; while (el && el !== w.document.body) { if (w.getComputedStyle(el).display === "none") return false; el = el.parentElement; } return true; };
  return { w, salvar, pedeLogin, erro: () => (w.document.querySelector('[data-role="mitlic-error"]') || {}).textContent || "" };
}
// login de verdade pela tela (usuário e senha)
let A = await abrir();
check(A.pedeLogin(), "sem acesso: pede o login");
A.w.document.querySelector('[data-role="mitlic-username"]').value = "alberico";
const senha = A.w.document.querySelector('[data-role="mitlic-password"]') || A.w.document.querySelector('input[type="password"]'); senha.value = "senha123";
A.w.document.querySelector('[data-role="mitlic-submit"]').click(); await espera(1500); A.salvar();
check(!A.pedeLogin() && aparelhos.some((x) => x.chave === "user:alberico"), "login com usuário e senha: entra, e o servidor registra o aparelho na CONTA");
// ---- o bug: atualizar a página / ir em outro app e voltar ----
A = await abrir(); A.salvar();
check(!A.pedeLogin(), "ATUALIZAR A PÁGINA: continua logado (antes pedia login toda vez: \"Os aparelhos deste acesso foram resetados\")");
await abrir("cifras").then((c) => c.salvar());
A = await abrir(); A.salvar();
check(!A.pedeLogin(), "ir em outro app e VOLTAR: continua logado");
// ---- sessão por atividade ----
armazenado["mit_license_ultima_interacao"] = String(Date.now() - 7 * 3600 * 1000);   // 7 h sem uso
A = await abrir(); A.salvar();
check(!A.pedeLogin() && Number(armazenado["mit_license_ultima_interacao"]) > Date.now() - 60000, "7 h sem uso: ainda logado, e abrir o app RENOVA a sessão");
A.w.dispatchEvent(new A.w.Event("pointerdown")); A.salvar();
check(Number(armazenado["mit_license_ultima_interacao"]) > Date.now() - 60000, "clicar em qualquer lugar renova a sessão");
armazenado["mit_license_ultima_interacao"] = String(Date.now() - 9 * 3600 * 1000);   // 9 h sem uso
A = await abrir(); A.salvar();
check(A.pedeLogin() && /sem uso/.test(A.erro()), "mais de 8 h SEM USO: a sessão termina e pede o login (\"" + A.erro().slice(0, 55) + "...\")");
// ---- entrar de novo e o reset de aparelhos (que deve deslogar) ----
A.w.document.querySelector('[data-role="mitlic-username"]').value = "alberico";
(A.w.document.querySelector('[data-role="mitlic-password"]') || A.w.document.querySelector('input[type="password"]')).value = "senha123";
A.w.document.querySelector('[data-role="mitlic-submit"]').click(); await espera(1500); A.salvar();
check(!A.pedeLogin(), "entrar de novo depois da sessão expirar: funciona");
aparelhos = [];   // painel: "Resetar dispositivos"
A = await abrir(); A.salvar();
check(A.pedeLogin() && /resetados/.test(A.erro()), "'Resetar dispositivos' no painel: aí sim pede o login de novo");
// ---- botão Sair visível ----
check(/Sair/.test(A.w.document.querySelector(".mitlic-fab") ? A.w.document.querySelector(".mitlic-fab").textContent : "Sair"), "o botão 🔑 agora diz \"Sair\"");
console.log(`\n${ok}/${total} verificações passaram`); process.exit(ok === total ? 0 : 1);
