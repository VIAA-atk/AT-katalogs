import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const bundlePath = path.join(root, "assets/routes-C_WgTdsH.js");
const outputPath = path.join(root, "data/catalog.json");
const imageRegisterPath = path.join(root, "data/catalog-image-sources.json");

function extractResources(bundle) {
  const start = bundle.indexOf("c=[{id:`alternativas-peles");
  const end = bundle.indexOf("}],l=", start) + 2;
  if (start < 0 || end < 2) throw new Error("Kataloga datu masīvs nav atrasts.");
  return Function(`return ${bundle.slice(start + 2, end)}`)();
}

const bundle = await fs.readFile(bundlePath, "utf8");
const imageRegister = JSON.parse(await fs.readFile(imageRegisterPath, "utf8"));
const imageSources = new Map(imageRegister.map((item) => [item.id, item]));
const resources = extractResources(bundle).map((resource) => ({
  id: resource.id,
  name: resource.name,
  short: resource.short,
  areas: resource.areas,
  needs: resource.needs,
  type: resource.type,
  level: resource.level,
  latvian: resource.latvian,
  whatIs: resource.whatIs ?? resource.description,
  functions: resource.functions ?? resource.features ?? [],
  acquisition: resource.acquisition ?? [],
  image: resource.image ?? "assets/images/catalog/catalog-placeholder.svg",
  imageAlt: resource.imageAlt ?? resource.name,
  imageSource: imageSources.get(resource.id)?.source_page ?? resource.productPage ?? "",
  imageRightsNote: imageSources.get(resource.id)?.rights_note ?? "Attēla izmantošanas tiesības jāpārbauda pirms publicēšanas.",
  productPage: resource.productPage ?? "",
  productLinkType: resource.productLinkType ?? "resource",
}));

await fs.writeFile(outputPath, `${JSON.stringify(resources, null, 2)}\n`, "utf8");
console.log(`Eksportēti ${resources.length} kataloga ieraksti uz data/catalog.json.`);
