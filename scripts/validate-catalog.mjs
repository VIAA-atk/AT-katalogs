import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dataPath = path.join(root, "data/catalog.json");
const resources = JSON.parse(await fs.readFile(dataPath, "utf8"));
const allowed = {
  areas: new Set(["lasisana", "rakstisana", "matematika", "komunikacija", "organizesana", "vide"]),
  needs: new Set(["tts", "vizualaPielagosana", "ocr", "stt", "rakstisanaAtbalsts", "organizesanaAtbalsts", "simboli", "aac", "ierices Vadiba", "matematikaAtbalsts"]),
  type: new Set(["ierice", "programmatura", "iebuveta", "bezmaksas", "metodiskais", "materials", "piederums", "atFonds", "citsValstsAtbalsts"]),
  level: new Set(["augsts", "videjs", "zems"]),
  productLinkType: new Set(["product", "category", "resource", "reference"]),
};

if (!Array.isArray(resources) || !resources.length) throw new Error("Katalogam jābūt netukšam masīvam.");
const ids = new Set();
for (const [index, resource] of resources.entries()) {
  const where = `Ieraksts ${index + 1}`;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(resource.id ?? "")) throw new Error(`${where}: nederīgs id.`);
  if (ids.has(resource.id)) throw new Error(`${where}: id ${resource.id} atkārtojas.`);
  ids.add(resource.id);
  for (const field of ["name", "short", "latvian", "whatIs", "image", "imageAlt", "imageRightsNote"]) {
    if (typeof resource[field] !== "string" || !resource[field].trim()) throw new Error(`${where}: nav aizpildīts ${field}.`);
  }
  for (const field of ["areas", "needs", "functions", "acquisition"]) {
    if (!Array.isArray(resource[field]) || !resource[field].length) throw new Error(`${where}: ${field} jābūt netukšam sarakstam.`);
  }
  for (const value of resource.areas) if (!allowed.areas.has(value)) throw new Error(`${where}: neatļauta joma ${value}.`);
  for (const value of resource.needs) if (!allowed.needs.has(value)) throw new Error(`${where}: neatļauta vajadzība ${value}.`);
  for (const field of ["type", "level", "productLinkType"]) {
    if (!allowed[field].has(resource[field])) throw new Error(`${where}: neatļauta ${field} vērtība.`);
  }
  if (resource.productPage && !/^https:\/\//.test(resource.productPage)) throw new Error(`${where}: ārējai saitei jāizmanto HTTPS.`);
  if (resource.imageSource && !/^https:\/\//.test(resource.imageSource)) throw new Error(`${where}: attēla avotam jāizmanto HTTPS.`);
  if (!/^assets\/images\/catalog\/[a-z0-9.-]+$/.test(resource.image)) throw new Error(`${where}: nederīgs attēla ceļš.`);
  try {
    await fs.access(path.join(root, resource.image));
  } catch {
    throw new Error(`${where}: attēla fails ${resource.image} neeksistē.`);
  }
}

console.log(`Kataloga validācija sekmīga: ${resources.length} ieraksti, ${ids.size} unikāli ID.`);
