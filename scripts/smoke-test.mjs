import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative) => fs.readFile(path.join(root, relative), "utf8");
const [catalog, publicHtml, publicJs, adminHtml, adminJs] = await Promise.all([
  read("data/catalog.json").then(JSON.parse), read("index.html"), read("assets/catalog-app.js"), read("admin/index.html"), read("admin/admin.js"),
]);

function ids(html) {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
}

const publicIds = ids(publicHtml);
for (const id of [...publicJs.matchAll(/querySelector\("#([^"]+)"\)/g)].map((match) => match[1])) {
  if (!publicIds.has(id)) throw new Error(`Publiskajā HTML nav JavaScript izmantotā #${id}.`);
}

const adminIds = ids(adminHtml);
const adminReferences = new Set([
  ...[...adminJs.matchAll(/ui\["([^"]+)"\]/g)].map((match) => match[1]),
  ...[...adminJs.matchAll(/ui\.([a-zA-Z][a-zA-Z0-9]*)/g)].map((match) => match[1]),
]);
for (const id of adminReferences) if (!adminIds.has(id)) throw new Error(`Administratora HTML nav JavaScript izmantotā #${id}.`);

if (publicHtml.includes("routes-C_WgTdsH.js") || publicHtml.includes("catalog-fallback.js")) throw new Error("Publiskā lapa joprojām izmanto vēsturisko datu pakotni.");
if (!publicHtml.includes("./data/catalog.json") && !publicJs.includes("./data/catalog.json")) throw new Error("Publiskā lapa nelasa autoritatīvo kataloga datni.");
if (catalog.some((item) => "situations" in item || "features" in item || "description" in item)) throw new Error("Katalogā saglabāti novecojušie lauki.");
if (/localStorage|sessionStorage|document\.cookie/.test(adminJs)) throw new Error("Administratora panelis mēģina pastāvīgi saglabāt autentifikācijas datus.");
if (!adminHtml.includes("./admin-v8.js")) throw new Error("Administratora paneļa unikālā ielādes versija nav piesaistīta.");
if (!adminHtml.includes('<form id="record-form" novalidate>') || /id="field-id"[^>]*pattern=/.test(adminHtml)) {
  throw new Error("Firefox konfliktējošā identifikatora lauka HTML validācija nav noņemta.");
}
if (!adminHtml.includes('id="save-draft" type="button"') || !adminJs.includes('ui["save-draft"].addEventListener("click", saveDraft)')) {
  throw new Error("Melnraksta saglabāšanas pogai nav drošas darbības bez lapas pārlādes.");
}
if (adminJs.includes("fileToWebp") || !adminJs.includes("await file.arrayBuffer()") || !adminJs.includes("upload.content")) {
  throw new Error("Attēla saglabāšanas plūsma joprojām izmanto pārlūkā nestabilo pārveidošanu.");
}
if (!adminJs.includes("window.setInterval") || !adminJs.includes("editorSnapshot()")) throw new Error("Administratora automātiskā melnraksta saglabāšana nav piesaistīta.");
for (const endpoint of ["/git/blobs", "/git/trees", "/git/commits", "/git/refs/heads/"]) {
  if (!adminJs.includes(endpoint)) throw new Error(`Administratora publicēšanas plūsmā trūkst ${endpoint}.`);
}

const reading = catalog.filter((item) => item.areas.includes("lasisana"));
const highLevel = catalog.filter((item) => item.level === "augsts");
const query = catalog.filter((item) => `${item.name} ${item.short}`.toLocaleLowerCase("lv").includes("braila"));
if (!reading.length || !highLevel.length || !query.length) throw new Error("Kataloga filtru datus neizdevās pārbaudīt.");

console.log(`Dūmu tests sekmīgs: ${catalog.length} kartītes; filtri, DOM piesaistes un drošā GitHub plūsma pārbaudīta.`);
