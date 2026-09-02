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
  ["Pārvietojams mobilās indukcijas cilpas rsinājums", "Pārvietojams mobilās indukcijas cilpas risinājums"],
  ["Tehniskais palīdzlīdzeklis", "Tehniskais palīglīdzeklis"],
  ["Genio - Nyxoah (Beļģija), Goodnotes - Goodnotes Ltd (Honkonga)", "Genio Notes, Goodnotes - Goodnotes Ltd (Honkonga)"],
  ["Ražotāji ārpus Latvijas: Genio - Nyxoah (Beļģija), Goodnotes - Goodnotes Ltd (Honkonga)", "Pieejamie risinājumi: Genio Notes, Goodnotes"],
  ["'IRIScan Desk 6 Pro Dyslexic (IRIS) - SIA \"Exceed\" (SIA \"Exceed\" plāno testēt Freewrite)", "Freewrite (SIA \"Exceed\" plāno testēt)"],
  ["Ražotāji ārpus Latvijas: IRIS / Canon Group (Beļģija); Freewrite - Astrohaus (ASV)", "Ražotājs ārpus Latvijas: Freewrite - Astrohaus (ASV)"],
]);

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

bundle = bundle.replaceAll(
  "Konkrētu produktu un piegādātāju norādīšana ir informatīva un nav uzskatāma par VIAA ieteikumu vai priekšrocības piešķiršanu konkrētam ražotājam vai izplatītājam.",
  "Konkrētu produktu un piegādātāju norādīšana ir informatīva un nav uzskatāma par VIAA ieteikumu vai priekšrocības piešķiršanu konkrētam ražotājam vai izplatītājam.",
);

const disclaimer = "Konkrētu produktu un piegādātāju norādīšana ir informatīva un nav uzskatāma par VIAA ieteikumu vai priekšrocības piešķiršanu konkrētam ražotājam vai izplatītājam.";
const existingNotice = "Katalogā sniegtā informācija ir orientējoša. Katalogs nav individuālo vajadzību izvērtēšanas, diagnostikas vai tehnoloģiju piešķiršanas rīks — risinājuma piemērotība jāizvērtē atbilstoši konkrētā izglītojamā vajadzībām un mācību videi.";
if (!bundle.includes(disclaimer)) bundle = bundle.replace(existingNotice, `${existingNotice} ${disclaimer}`);
await fs.writeFile(bundlePath, bundle);

const fallbackPath = path.join(root, "assets/catalog-fallback.js");
let fallback = await fs.readFile(fallbackPath, "utf8");
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
html = html.replaceAll(
  "&#x27;IRIScan Desk 6 Pro Dyslexic (IRIS) - SIA &quot;Exceed&quot; (SIA &quot;Exceed&quot; plāno testēt Freewrite)",
  "Freewrite (SIA &quot;Exceed&quot; plāno testēt)",
);
if (!html.includes(disclaimer)) html = html.replace(existingNotice, `${existingNotice} ${disclaimer}`);
html = html.replaceAll("Programmatūra vai lietotne</dd>", "Programmatūra vai lietotne</dd>");

for (const [id, type] of Object.entries(typeById)) {
  const label = type === "ierice" ? "Ierīce vai tehniskais aprīkojums" : type === "materials" ? "Mācību materiāls" : "Pielāgots piederums";
  const cardPattern = new RegExp(`(<li data-resource-id="${id}"[\\s\\S]*?<dt[^>]*>Veids:</dt><dd[^>]*>)(.*?)(</dd>)`);
  html = html.replace(cardPattern, `$1${label}$3`);
}
await fs.writeFile(htmlPath, html);

console.log("Redakcionālie labojumi piemēroti.");
