import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

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
const expectedSkills = [
  ["lasisana", "Lasīšana"], ["rakstisana", "Rakstīšana"], ["matematika", "Matemātika"],
  ["komunikacija", "Komunikācija"],
  ["organizesana", "Uzmanība, atmiņa un organizēšana"], ["vide", "Piekļuve videi un tehnoloģijām"],
];
const skillSelect = publicHtml.match(/<select id="f-skill"[^>]*>([\s\S]*?)<\/select>/)?.[1];
const skillOptions = [...(skillSelect ?? "").matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)]
  .map(([, value, label]) => [value, label]);
if (JSON.stringify(skillOptions) !== JSON.stringify([["all", "Visas prasmes"], ...expectedSkills]) ||
    publicHtml.includes('id="f-area"') || publicHtml.includes('id="skill-filter-wrap"') ||
    publicJs.includes("resource.areas") || !publicJs.includes("resource.skills.includes(elements.skill.value)")) {
  throw new Error("Publiskajam filtram jāizmanto tikai sešas AT atbalstāmās prasmes.");
}
for (const [value] of expectedSkills) {
  if (!catalog.some((resource) => resource.skills.includes(value))) throw new Error(`Prasmei ${value} nav neviena risinājuma.`);
}
if (catalog.some((resource) => "areas" in resource)) throw new Error("Datu kopā joprojām ir vecās jomas.");
// Run the catalogue's actual render() with a small DOM double and compare every result ID to the admin selections.
const controls = Object.fromEntries(["f-skill", "f-need", "f-type", "f-level", "f-acquisition-options", "f-query",
  "clear-filters", "result-count", "catalog-status", "catalog-grid", "resource-modal", "resource-panel"]
  .map((id) => [id, { value: id === "f-query" ? "" : "all", addEventListener() {}, replaceChildren(...items) { this.items = items; } }]));
const context = vm.createContext({ document: { querySelector: (selector) => controls[selector.slice(1)] }, console });
const prefix = publicJs.slice(0, publicJs.indexOf("for (const filter of [elements.skill"));
context.testResources = catalog;
vm.runInContext(prefix + "\nresources = testResources; createCard = (resource) => ({ id: resource.id });", context);
for (const [value] of [["all"], ...expectedSkills]) {
  controls["f-skill"].value = value;
  vm.runInContext("render()", context);
  const actual = controls["catalog-grid"].items.map((item) => item.id);
  const expected = catalog.filter((resource) => value === "all" || resource.skills.includes(value)).map((resource) => resource.id);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Prasmes ${value} filtrs atgrieza nepareizus ierakstus.`);
}

// A record assigned to both AT Fonds and devices belongs to either selection exactly once.
const dualType = { ...catalog[0], id: "two-types", name: "Divu veidu ieraksts", type: "atFonds", secondaryType: "ierice", skills: ["lasisana"] };
const singleType = { ...catalog[0], id: "one-type", name: "Viena veida ieraksts", type: "ierice", skills: ["rakstisana"] };
delete singleType.secondaryType;
context.testResources = [dualType, singleType];
vm.runInContext("resources = testResources", context);
controls["f-skill"].value = "all";
for (const [value, expected] of [["atFonds", ["two-types"]], ["ierice", ["two-types", "one-type"]], ["programmatura", []], ["all", ["two-types", "one-type"]]]) {
  controls["f-type"].value = value;
  vm.runInContext("render()", context);
  const actual = controls["catalog-grid"].items.map((item) => item.id);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Resursa veida ${value} filtrs neatlasa abus veidus pareizi.`);
}
controls["f-type"].value = "ierice";
controls["f-skill"].value = "lasisana";
vm.runInContext("render()", context);
if (JSON.stringify(controls["catalog-grid"].items.map((item) => item.id)) !== JSON.stringify(["two-types"])) {
  throw new Error("Papildu resursa veids nav pareizi apvienots ar prasmes filtru.");
}
controls["f-skill"].value = "all";
controls["f-query"].value = "Divu veidu";
vm.runInContext("render()", context);
if (JSON.stringify(controls["catalog-grid"].items.map((item) => item.id)) !== JSON.stringify(["two-types"])) {
  throw new Error("Papildu resursa veids nav pareizi apvienots ar meklēšanu.");
}

const adminIds = ids(adminHtml);
const selectOptions = (id) => [...(adminHtml.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`))?.[1] ?? "")
  .matchAll(/<option value="([^"]*)">([^<]+)<\/option>/g)].map(([, value, label]) => [value, label]);
const primaryTypes = selectOptions("field-type");
const secondaryTypes = selectOptions("field-secondary-type");
if (JSON.stringify(secondaryTypes) !== JSON.stringify([["", "Nav papildu veida"], ...primaryTypes.filter(([value]) => value !== "atFonds")])) {
  throw new Error("Papildu resursa veidam jāizmanto tās pašas izvēles bez AT Fonda un jābūt noņemamam.");
}
const adminReferences = new Set([
  ...[...adminJs.matchAll(/ui\["([^"]+)"\]/g)].map((match) => match[1]),
  ...[...adminJs.matchAll(/ui\.([a-zA-Z][a-zA-Z0-9]*)/g)].map((match) => match[1]),
]);
for (const id of adminReferences) if (!adminIds.has(id)) throw new Error(`Administratora HTML nav JavaScript izmantotā #${id}.`);
if (!adminIds.has("field-skills") || adminIds.has("field-areas") || !adminJs.includes('buildChoices(ui["field-skills"], options.skills)')) {
  throw new Error("AT atbalstāmās prasmes nevar rediģēt administratora panelī.");
}
const adminChoices = [...(adminJs.match(/  skills: \{([\s\S]*?)\n  \},/)?.[1] ?? "")
  .matchAll(/([a-zA-Z]+): "([^"]+)"/g)].map(([, value, label]) => [value, label]);
if (JSON.stringify(adminChoices) !== JSON.stringify(expectedSkills)) {
  throw new Error("Administratora prasmes nesakrīt ar publiskā filtra sešām vērtībām.");
}

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

const reading = catalog.filter((item) => item.skills.includes("lasisana"));
const highLevel = catalog.filter((item) => item.level === "augsts");
const query = catalog.filter((item) => `${item.name} ${item.short}`.toLocaleLowerCase("lv").includes("braila"));
if (!reading.length || !highLevel.length || !query.length) throw new Error("Kataloga filtru datus neizdevās pārbaudīt.");

console.log(`Dūmu tests sekmīgs: ${catalog.length} kartītes; filtri, DOM piesaistes un drošā GitHub plūsma pārbaudīta.`);
