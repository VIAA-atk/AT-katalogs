import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative) => fs.readFile(path.join(root, relative), "utf8");
const [catalog, publicHtml, publicJs, adminHtml, adminJs, activeAdminJs] = await Promise.all([
  read("data/catalog.json").then(JSON.parse), read("index.html"), read("assets/catalog-app.js"), read("admin/index.html"), read("admin/admin.js"), read("admin/admin-v17.js"),
]);

if (activeAdminJs !== adminJs) throw new Error("Aktīvais administratora v17 kods neatbilst kanoniskajam admin.js.");

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
if (/localStorage|document\.cookie/.test(adminJs) || /sessionStorage[^\n]*(?:token|github-token)|(?:token|github-token)[^\n]*sessionStorage/i.test(adminJs)) {
  throw new Error("Administratora panelis mēģina pastāvīgi saglabāt autentifikācijas datus.");
}
if (!adminHtml.includes("./admin-v17.js")) throw new Error("Administratora paneļa unikālā ielādes versija nav piesaistīta.");
if (!adminHtml.includes('<div id="record-form">') || adminHtml.includes('<form id="record-form"') || /id="field-id"[^>]*pattern=/.test(adminHtml)) {
  throw new Error("Firefox konfliktējošā identifikatora lauka HTML validācija nav noņemta.");
}
if (!adminHtml.includes('id="save-draft" type="button"') || !adminJs.includes('ui["save-draft"].addEventListener("click"')) {
  throw new Error("Melnraksta saglabāšanas pogai nav tiešas darbības bez formas iesniegšanas.");
}
for (const id of ["move-up", "move-down", "order-help"]) {
  if (!adminIds.has(id)) throw new Error(`Administratora secības vadībā trūkst #${id}.`);
}
for (const fragment of ["function reorderResource(", 'handle.draggable = canDrag', 'markDirty();', 'partitionCatalogChanges(remote.resources']) {
  if (!adminJs.includes(fragment)) throw new Error(`Administratora secības saglabāšanas plūsmā trūkst: ${fragment}`);
}
if (/\b(?:resources|filtered)\.sort\s*\(/.test(publicJs)) {
  throw new Error("Publiskais katalogs nedrīkst pārkārtot catalog.json ierakstu secību.");
}
if (catalog.some((item) => "order" in item)) throw new Error("Secībai jāizmanto catalog.json masīva secība, nevis papildu order lauks.");
const atFondsLabel = "AT Fonds (Projekta numurs 4.2.1.2/1/25/I/001, sadarbības partneriem)";
if (!publicHtml.includes(`<option value="atFonds">${atFondsLabel}</option>`) || !publicJs.includes(`atFonds: "${atFondsLabel}"`) ||
    !adminHtml.includes(`<option value="atFonds">${atFondsLabel}</option>`) || !adminJs.includes(`atFonds: "${atFondsLabel}"`)) {
  throw new Error("AT Fonds resursa veids nav konsekventi pieejams publiskajā katalogā un administratora panelī.");
}
const stateSupportLabel = "Citu valsts atbalsta sistēmu resurss (VTPC, LNB, LNS)";
if (!publicHtml.includes(`<option value="citsValstsAtbalsts">${stateSupportLabel}</option>`) || !publicJs.includes(`citsValstsAtbalsts: "${stateSupportLabel}"`) ||
    !adminHtml.includes(`<option value="citsValstsAtbalsts">${stateSupportLabel}</option>`) || !adminJs.includes(`citsValstsAtbalsts: "${stateSupportLabel}"`)) {
  throw new Error("Citu valsts atbalsta sistēmu resursa veids nav konsekventi pieejams publiskajā katalogā un administratora panelī.");
}
if (adminJs.includes("fileToWebp") || !adminJs.includes("await file.arrayBuffer()") || !adminJs.includes("upload.content")) {
  throw new Error("Attēla saglabāšanas plūsma joprojām izmanto pārlūkā nestabilo pārveidošanu.");
}
if (!adminJs.includes('ui["record-form"].addEventListener("input", handleFormChange)') || !adminJs.includes('ui["record-form"].addEventListener("change", handleFormChange)')) {
  throw new Error("Administratora pārlūka rezerves kopija nav piesaistīta rakstīšanas un izvēles notikumiem.");
}
const inputHandler = adminJs.match(/function handleFormChange\(event\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
if (/\b(?:github|saveDraft|publish)\s*\(/.test(inputHandler)) {
  throw new Error("Rakstīšanas notikums nedrīkst fonā saglabāt vai publicēt datus GitHub.");
}
for (const fragment of ["async function loadRemoteCatalog(", "const remote = await loadRemoteCatalog();", "withOneConflictRetry", "currentRef.object.sha !== remote.headSha", "setRemoteState(refreshed)"]) {
  if (!adminJs.includes(fragment)) throw new Error(`Drošajā GitHub sinhronizācijas plūsmā trūkst: ${fragment}`);
}
if (!adminJs.includes("sessionStorage.setItem(browserDraftKey") || !adminJs.includes("CatalogConflictError")) {
  throw new Error("Konflikta gadījumam nav pārlūka melnraksta vai drošas apvienošanas kontroles.");
}
for (const endpoint of ["/git/blobs", "/git/trees", "/git/commits", "/git/refs/heads/"]) {
  if (!adminJs.includes(endpoint)) throw new Error(`Administratora publicēšanas plūsmā trūkst ${endpoint}.`);
}

const reading = catalog.filter((item) => item.areas.includes("lasisana"));
const highLevel = catalog.filter((item) => item.level === "augsts");
const query = catalog.filter((item) => `${item.name} ${item.short}`.toLocaleLowerCase("lv").includes("braila"));
if (!reading.length || !highLevel.length || !query.length) throw new Error("Kataloga filtru datus neizdevās pārbaudīt.");

console.log(`Dūmu tests sekmīgs: ${catalog.length} kartītes; filtri, DOM piesaistes un drošā GitHub plūsma pārbaudīta.`);
