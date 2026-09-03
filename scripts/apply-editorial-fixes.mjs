import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const files = [
  "assets/routes-C_WgTdsH.js",
  "assets/catalog-fallback.js",
  "index.html",
  "data/catalog-image-sources.json",
];

const literalFixes = new Map([
  ["e.currentTarget.src:`", "e.currentTarget.src=`"],
  ["Pārvietojams mobilās indukcijas cilpas rsinājums", "Pārvietojams mobilās indukcijas cilpas risinājums"],
  ["Tehniskais palīdzlīdzeklis", "Tehniskais palīglīdzeklis"],
  ["Genio - Nyxoah (Beļģija), Goodnotes - Goodnotes Ltd (Honkonga)", "Genio Notes, Goodnotes - Goodnotes Ltd (Honkonga)"],
  ["Ražotāji ārpus Latvijas: Genio - Nyxoah (Beļģija), Goodnotes - Goodnotes Ltd (Honkonga)", "Pieejamie risinājumi: Genio Notes, Goodnotes"],
  ["'IRIScan Desk 6 Pro Dyslexic (IRIS) - SIA \"Exceed\" (SIA \"Exceed\" plāno testēt Freewrite)", "Freewrite (SIA \"Exceed\" plāno testēt)"],
  ["Ražotāji ārpus Latvijas: IRIS / Canon Group (Beļģija); Freewrite - Astrohaus (ASV)", "Ražotājs ārpus Latvijas: Freewrite - Astrohaus (ASV)"],
]);

function escapeTemplate(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${");
}

function extractResources(bundle) {
  const start = bundle.indexOf("c=[{id:`alternativas-peles");
  const end = bundle.indexOf("}],l=", start) + 2;
  if (start < 0 || end < 2) throw new Error("Kataloga datu masīvs nav atrasts.");
  return Function(`return ${bundle.slice(start + 2, end)}`)();
}

const needExplanations = {
  "ierices Vadiba": "kuriem kustību vai koordinācijas ierobežojumu dēļ ir grūti izmantot parasto peli, tastatūru vai skārienekrānu",
  tts: "kuriem ir grūti patstāvīgi izlasīt vai uztvert rakstītu tekstu",
  vizualaPielagosana: "kuriem teksta vai vizuālās informācijas uztveršanai nepieciešams palielinājums, kontrasts vai cits pielāgojums",
  ocr: "kuriem nepieciešams drukātu tekstu pārvērst pieejamā digitālā formā",
  stt: "kuriem ir grūti rakstīt ar tastatūru un kuriem noder iespēja tekstu ievadīt ar balsi",
  rakstisanaAtbalsts: "kuriem ir grūtības rakstīt, veidot tekstu vai pārbaudīt uzrakstīto",
  organizesanaAtbalsts: "kuriem nepieciešams atbalsts uzmanības noturēšanai, darbību plānošanai vai informācijas organizēšanai",
  simboli: "kuriem informāciju ir vieglāk saprast ar attēliem, simboliem vai citām vizuālām norādēm",
  aac: "kuriem ir grūti sazināties ar runu un nepieciešams alternatīvs saziņas veids",
  matematikaAtbalsts: "kuriem nepieciešams vizuāls, taktils vai digitāls atbalsts matemātikas uzdevumu veikšanai",
};

const typeDescriptions = {
  ierice: "ierīce vai tehniskais aprīkojums",
  programmatura: "programmatūra vai digitāls rīks",
  iebuveta: "ierīcē vai operētājsistēmā iebūvēta piekļūstamības funkcija",
  bezmaksas: "bezmaksas digitāls rīks",
  metodiskais: "metodiskais materiāls vai pamācība",
  materials: "mācību materiāls",
  piederums: "pielāgots piederums",
};

function buildWhatIs(resource) {
  if (resource.id === "alternativas-peles-vada-ar-acu-skatienu") {
    return "Acu skatiena vadības ierīce ļauj vadīt datoru ar acu kustībām. Tā var palīdzēt izglītojamajiem, kuri nevar precīzi izmantot parasto peli, tastatūru vai skārienekrānu.";
  }
  const kind = typeDescriptions[resource.type] ?? "asistīvās tehnoloģijas risinājums";
  const explanations = [...new Set((resource.needs ?? []).map((need) => needExplanations[need]).filter(Boolean))];
  const audience = explanations.length
    ? explanations.slice(0, 2).join(" un ")
    : "kuriem nepieciešams papildu atbalsts līdzdalībai mācību procesā";
  return `${resource.name} ir ${kind}, ko var izmantot mācību procesā. Tas var palīdzēt izglītojamajiem, ${audience}.`;
}

const functionsByNeed = {
  "ierices Vadiba": ["ierīces vai kursora vadīšana ar lietotājam piemērotu ievades veidu", "objektu izvēle un komandu aktivizēšana", "digitālo mācību materiālu un programmu izmantošana"],
  tts: ["rakstīta teksta nolasīšana balsī", "mācību satura uztveršana klausoties", "uzrakstītā teksta pārbaude ar audio atgriezenisko saiti"],
  vizualaPielagosana: ["teksta un attēlu palielināšana vai vizuāla pielāgošana", "kontrasta un salasāmības uzlabošana", "drukāta vai digitāla mācību satura apskatīšana pielāgotā veidā"],
  ocr: ["drukāta teksta digitalizēšana", "atpazītā teksta sagatavošana lasīšanai vai rediģēšanai", "drukātu mācību materiālu pārveidošana pieejamā digitālā formā"],
  stt: ["runas pārvēršana rakstītā tekstā", "atbilžu un mācību darbu veidošana diktējot", "teksta ievade, neizmantojot parasto tastatūru"],
  rakstisanaAtbalsts: ["teksta ievade un rediģēšana", "atbalsts vārdu, teikumu vai garāka teksta veidošanai", "uzrakstītā pārbaude un pilnveidošana"],
  organizesanaAtbalsts: ["uzdevumu un darbību secības organizēšana", "atgādinājumu, piezīmju vai plānu veidošana", "uzmanības noturēšana un paveiktā pārbaude"],
  simboli: ["informācijas attēlošana ar simboliem vai vizuālām norādēm", "uzdevumu, izvēļu un darbību secības skaidrošana", "vizuāli saprotama mācību satura veidošana"],
  aac: ["vajadzību, atbilžu un izvēļu izteikšana alternatīvā veidā", "saziņa ar simboliem, attēliem, tekstu vai balsi", "līdzdalība sarunās un mācību aktivitātēs"],
  matematikaAtbalsts: ["skaitļu, darbību un matemātisku sakarību attēlošana", "matemātikas uzdevumu veikšana ar vizuālu, taktilu vai digitālu atbalstu", "rezultātu ievade un pārbaude"],
};

function buildFunctions(resource) {
  if (resource.id === "alternativas-peles-vada-ar-acu-skatienu") {
    return [
      "kursora vadīšana ar acu skatienu",
      "objektu izvēle un komandu aktivizēšana",
      "rakstīšana ekrāna tastatūrā",
      "datora programmu un digitālo mācību materiālu izmantošana",
      "iespējama izmantošana alternatīvajai komunikācijai",
    ];
  }
  const functions = (resource.needs ?? []).flatMap((need) => functionsByNeed[need] ?? []);
  return [...new Set(functions)].slice(0, 5).length
    ? [...new Set(functions)].slice(0, 5)
    : ["mācību darbību veikšana lietotājam pieejamākā veidā", "līdzdalības veicināšana mācību procesā"];
}

function buildAcquisition(resource) {
  const acquisition = (resource.features ?? []).filter((item) =>
    /^(Produkti Latvijā|Ražotāj|Tehniskais palīglīdzeklis|Pieejamie risinājumi)/i.test(item),
  );
  if (acquisition.length) return acquisition;
  if (resource.productPage) return ["Informāciju par risinājumu un tā pieejamību skatīt norādītajā ārējā avotā."];
  return ["Informācija par iegūšanas iespējām tiks precizēta."];
}

for (const relative of files) {
  const file = path.join(root, relative);
  let content = await fs.readFile(file, "utf8");
  for (const [from, to] of literalFixes) content = content.replaceAll(from, to);
  await fs.writeFile(file, content);
}

const bundlePath = path.join(root, "assets/routes-C_WgTdsH.js");
let bundle = await fs.readFile(bundlePath, "utf8");

// Paplašina resursu veidu klasifikatoru, lai fiziski mācību līdzekļi netiktu
// rādīti kā programmatūra.
bundle = bundle.replace(
  "{id:`metodiskais`,label:`Metodiskais materiāls vai pamācība`}],s=",
  "{id:`metodiskais`,label:`Metodiskais materiāls vai pamācība`},{id:`materials`,label:`Mācību materiāls`},{id:`piederums`,label:`Pielāgots piederums`}],s=",
);

const typeById = {
  "ergonomiski-zimuli-piem-trisstura-formas": "piederums",
  "smagie-zimuli-weighted-pencils": "piederums",
  "gumijas-satvereji-uzmavas-zimuliem": "piederums",
  "slipie-deli-rakstisanai": "piederums",
  "papirs-ar-reljefam-linijam": "materials",
  "magnetiskie-burti-un-vardi": "materials",
  "skaitlu-linijas-un-skaitlu-tabulas": "materials",
  "braila-raksta-tafeles-ar-irbuli": "piederums",
  "taktilas-kartes-un-gridas-markejumi": "materials",
  "attelu-norades-un-piktogrammas": "materials",
  "rakstiski-zinojumi-tafeles": "materials",
  "statiskie-vizualie-signali": "materials",
  "lielas-drukas-materiali": "materials",
  "krasu-uzlimes-uz-taustiniem": "piederums",
  "runajosi-prieksmeti-svari-merlentes-markieri": "ierice",
  "personigie-skanas-pastiprinataji": "ierice",
  "fm-un-indukcijas-cilpu-sistemas": "ierice",
};

for (const [id, type] of Object.entries(typeById)) {
  const pattern = new RegExp('(id:[`"]' + id + '[`"][' + '\\s\\S' + ']{0,1600}?type:)[`"]programmatura[`"]');
  bundle = bundle.replace(pattern, `$1\`${type}\``);
}

for (const resource of extractResources(bundle)) {
  const whatIs = escapeTemplate(buildWhatIs(resource));
  const id = resource.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const existing = new RegExp('(id:[`"]' + id + '[` "][\\s\\S]{0,1800}?)whatIs:`[^`]*`,description:');
  const description = new RegExp('(id:[`"]' + id + '[` "][\\s\\S]{0,1800}?)description:');
  if (existing.test(bundle)) bundle = bundle.replace(existing, `$1whatIs:\`${whatIs}\`,description:`);
  else if (description.test(bundle)) bundle = bundle.replace(description, `$1whatIs:\`${whatIs}\`,description:`);
  else throw new Error(`Ierakstam ${resource.id} nav atrasts apraksts.`);
}

for (const resource of extractResources(bundle)) {
  const id = resource.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const functions = JSON.stringify(buildFunctions(resource)).replaceAll("<", "\\u003c");
  const acquisition = JSON.stringify(buildAcquisition(resource)).replaceAll("<", "\\u003c");
  const functionsExisting = new RegExp('(id:[`"]' + id + '[` "][\\s\\S]{0,2400}?)functions:\[[\\s\\S]*?\],acquisition:\[[\\s\\S]*?\],features:');
  const features = new RegExp('(id:[`"]' + id + '[` "][\\s\\S]{0,2400}?)features:');
  if (functionsExisting.test(bundle)) bundle = bundle.replace(functionsExisting, `$1functions:${functions},acquisition:${acquisition},features:`);
  else if (features.test(bundle)) bundle = bundle.replace(features, `$1functions:${functions},acquisition:${acquisition},features:`);
  else throw new Error(`Ierakstam ${resource.id} nav atrasts funkciju lauks.`);
}

const modalDescription = "(0,C.jsx)(`p`,{className:`text-sm leading-relaxed text-foreground`,children:e.description})";
const modalWhatIs = "(0,C.jsxs)(`div`,{children:[(0,C.jsx)(`h3`,{className:`text-sm font-semibold text-foreground`,children:`Kas tas ir?`}),(0,C.jsx)(`p`,{className:`mt-2 text-sm leading-relaxed text-foreground`,children:e.whatIs??e.description})]})";
if (bundle.includes(modalDescription)) bundle = bundle.replace(modalDescription, modalWhatIs);
else if (!bundle.includes(modalWhatIs)) throw new Error("Modālā loga apraksta komponente nav atrasta.");

bundle = bundle.replace("children:`Galvenās funkcijas`", "children:`Funkcijas`");
bundle = bundle.replace("children:e.features.map(e=>(0,C.jsx)(`li`,{children:e},e))", "children:(e.functions??e.features).map(e=>(0,C.jsx)(`li`,{children:e},e))");
const situationsBlock = "(0,C.jsxs)(`div`,{children:[(0,C.jsx)(`h3`,{className:`text-sm font-semibold text-foreground`,children:`Kādās mācību situācijās var palīdzēt`}),(0,C.jsx)(`ul`,{className:`mt-2 list-disc space-y-1 pl-5 text-sm text-foreground`,children:e.situations.map(e=>(0,C.jsx)(`li`,{children:e},e))})]})";
const acquisitionBlock = "(0,C.jsxs)(`div`,{children:[(0,C.jsx)(`h3`,{className:`text-sm font-semibold text-foreground`,children:`Kur to var iegūt?`}),(0,C.jsx)(`ul`,{className:`mt-2 list-disc space-y-1 pl-5 text-sm text-foreground`,children:e.acquisition.map(e=>(0,C.jsx)(`li`,{children:e},e))})]}),";
if (!bundle.includes("children:`Kur to var iegūt?`")) {
  if (!bundle.includes(situationsBlock)) throw new Error("Mācību situāciju sadaļa nav atrasta.");
  bundle = bundle.replace(situationsBlock, acquisitionBlock + situationsBlock);
}
bundle = bundle.replaceAll(`${situationsBlock},`, "");
bundle = bundle.replaceAll(situationsBlock, "");
bundle = bundle.replaceAll(
  "]}),,(0,C.jsxs)(`div`,{className:`flex flex-wrap items-center gap-3 border-t border-border pt-4`",
  "]}),(0,C.jsxs)(`div`,{className:`flex flex-wrap items-center gap-3 border-t border-border pt-4`",
);

bundle = bundle.replaceAll(
  "Konkrētu produktu un piegādātāju norādīšana ir informatīva un nav uzskatāma par VIAA ieteikumu vai priekšrocības piešķiršanu konkrētam ražotājam vai izplatītājam.",
  "Konkrētu produktu un piegādātāju norādīšana ir informatīva un nav uzskatāma par VIAA ieteikumu vai priekšrocības piešķiršanu konkrētam ražotājam vai izplatītājam.",
);

const disclaimer = "Konkrētu produktu un piegādātāju norādīšana ir informatīva un nav uzskatāma par VIAA ieteikumu vai priekšrocības piešķiršanu konkrētam ražotājam vai izplatītājam.";
const existingNotice = "Katalogā sniegtā informācija ir orientējoša. Katalogs nav individuālo vajadzību izvērtēšanas, diagnostikas vai tehnoloģiju piešķiršanas rīks — risinājuma piemērotība jāizvērtē atbilstoši konkrētā izglītojamā vajadzībām un mācību videi.";
if (!bundle.includes(disclaimer)) bundle = bundle.replace(existingNotice, `${existingNotice} ${disclaimer}`);
bundle = bundle.replace(
  "(0,C.jsxs)(`div`,{className:`flex min-w-0 items-center gap-3`,children:",
  "(0,C.jsxs)(`a`,{href:`https://www.viaa.gov.lv/lv`,target:`_blank`,rel:`noopener noreferrer`,\"aria-label\":`Atvērt Valsts izglītības attīstības aģentūras mājaslapu jaunā cilnē`,className:`flex min-w-0 items-center gap-3 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-foreground`,children:",
);
bundle = bundle.replace(
  "href:`https://www.viaa.gov.lv/lv`,\"aria-label\":`Atvērt Valsts izglītības attīstības aģentūras mājaslapu`",
  "href:`https://www.viaa.gov.lv/lv`,target:`_blank`,rel:`noopener noreferrer`,\"aria-label\":`Atvērt Valsts izglītības attīstības aģentūras mājaslapu jaunā cilnē`",
);
await fs.writeFile(bundlePath, bundle);

const fallbackPath = path.join(root, "assets/catalog-fallback.js");
let fallback = await fs.readFile(fallbackPath, "utf8");
const resources = extractResources(bundle);
const fallbackStart = fallback.indexOf("const resources = ");
const fallbackEnd = fallback.indexOf(";\n  const byId", fallbackStart);
if (fallbackStart < 0 || fallbackEnd < 0) throw new Error("Rezerves kataloga dati nav atrasti.");
fallback = `${fallback.slice(0, fallbackStart)}const resources = ${JSON.stringify(resources).replaceAll("<", "\\u003c")}${fallback.slice(fallbackEnd)}`;
fallback = fallback.replace(
  '    metodiskais: "Metodiskais materiāls vai pamācība",',
  '    metodiskais: "Metodiskais materiāls vai pamācība",\n    materials: "Mācību materiāls",\n    piederums: "Pielāgots piederums",',
);
for (const [id, type] of Object.entries(typeById)) {
  const pattern = new RegExp('("id":"' + id + '"[\\s\\S]{0,1600}?"type":)"programmatura"');
  fallback = fallback.replace(pattern, `$1"${type}"`);
}
await fs.writeFile(fallbackPath, fallback);

const htmlPath = path.join(root, "index.html");
let html = await fs.readFile(htmlPath, "utf8");
html = html.replaceAll("\u0000", "");
html = html.replace(
  '<link rel="icon" href="./favicon.svg?v=2" type="image/svg+xml"/><link rel="alternate icon" href="./favicon.ico?v=2" type="image/x-icon"/>',
  '<link rel="icon" href="./favicon.svg?v=3" type="image/svg+xml"/>',
);
html = html.replaceAll(
  "&#x27;IRIScan Desk 6 Pro Dyslexic (IRIS) - SIA &quot;Exceed&quot; (SIA &quot;Exceed&quot; plāno testēt Freewrite)",
  "Freewrite (SIA &quot;Exceed&quot; plāno testēt)",
);
if (!html.includes(disclaimer)) html = html.replace(existingNotice, `${existingNotice} ${disclaimer}`);
html = html.replace(
  '<div class="flex min-w-0 items-center gap-3">',
  '<a href="https://www.viaa.gov.lv/lv" target="_blank" rel="noopener noreferrer" aria-label="Atvērt Valsts izglītības attīstības aģentūras mājaslapu jaunā cilnē" class="flex min-w-0 items-center gap-3 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-foreground">',
);
html = html.replace(
  '<a href="https://www.viaa.gov.lv/lv" aria-label="Atvērt Valsts izglītības attīstības aģentūras mājaslapu"',
  '<a href="https://www.viaa.gov.lv/lv" target="_blank" rel="noopener noreferrer" aria-label="Atvērt Valsts izglītības attīstības aģentūras mājaslapu jaunā cilnē"',
);
html = html.replace(
  '</span></div><nav aria-label="Galvenā navigācija"',
  '</span></a><nav aria-label="Galvenā navigācija"',
);
html = html.replaceAll("Programmatūra vai lietotne</dd>", "Programmatūra vai lietotne</dd>");

for (const [id, type] of Object.entries(typeById)) {
  const label = type === "ierice" ? "Ierīce vai tehniskais aprīkojums" : type === "materials" ? "Mācību materiāls" : "Pielāgots piederums";
  const cardPattern = new RegExp(`(<li data-resource-id="${id}"[\\s\\S]*?<dt[^>]*>Veids:</dt><dd[^>]*>)(.*?)(</dd>)`);
  html = html.replace(cardPattern, `$1${label}$3`);
}
await fs.writeFile(htmlPath, html);

console.log("Redakcionālie labojumi piemēroti.");
