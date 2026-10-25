import fs from "fs";
let ok = 0, total = 0; const check = (c, m) => { total++; if (c) ok++; console.log((c ? "OK   " : "FALHOU ") + m); };
for (const app of ["cifras", "letras"]) {
  const handlers = {}; const guardado = new Map();
  const cacheObj = { put: async (r, res) => guardado.set(r.url, res), match: async (r) => guardado.get(r.url), addAll: async () => {} };
  const self = { addEventListener: (t, f) => (handlers[t] = f), location: { origin: "https://suite.mit.test" }, skipWaiting() {}, clients: { claim() {} } };
  let modo = "online";
  const fetchFalso = async (req) => { if (modo === "offline") throw new Error("sem rede"); if (modo === "lento") await new Promise((r) => setTimeout(r, 5000)); return { status: 200, type: "basic", clone() { return { versao: "NOVA" }; }, versao: "NOVA" }; };
  new Function("self", "caches", "fetch", "URL", fs.readFileSync(`/home/claude/web/MIT-Music-main/public/tools/${app}/service-worker.js`, "utf8"))(self, { open: async () => cacheObj, match: async (r) => guardado.get(r.url), keys: async () => [], delete: async () => true }, fetchFalso, URL);
  const pedir = async () => { let p; handlers.fetch({ request: { method: "GET", url: "https://suite.mit.test/tools/" + app + "/app.js" }, respondWith: (x) => (p = x) }); return p; };
  guardado.set("https://suite.mit.test/tools/" + app + "/app.js", { versao: "ANTIGA" });
  let r = await pedir();
  check(r && r.versao === "NOVA", `${app}: com internet, abre a versão NOVA na hora (antes: a antiga na 1ª abertura)`);
  await new Promise((r) => setTimeout(r, 20));
  modo = "offline"; r = await pedir();
  check(r && (r.versao === "NOVA" || r.versao === "ANTIGA"), `${app}: SEM internet, abre a cópia salva (funciona offline no palco)`);
  modo = "lento"; const t0 = Date.now(); r = await pedir();
  check(r && Date.now() - t0 < 4500, `${app}: internet LENTA: depois de 3,5 s usa a cópia salva (não fica esperando)`);
}
console.log(`\n${ok}/${total} verificações passaram`); process.exit(ok === total ? 0 : 1);
