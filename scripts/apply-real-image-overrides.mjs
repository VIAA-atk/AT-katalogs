import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const registryPath = path.join(root, "data/catalog-image-sources.json");
const outputDir = path.join(root, "assets/images/catalog");

// Curated real-product photos and software screenshots for catalogue entries
// whose reference pages do not expose a usable social image.
const sources = {
  "smagie-zimuli-weighted-pencils": ["https://i5.walmartimages.com/asr/8aba06ac-24d8-43f3-896e-9076c5edb4c6.9fe03847762b63bbeb85c2085559dab5.jpeg?odnBg=FFFFFF&odnHeight=768&odnWidth=768", "https://www.walmart.com/ip/37015721"],
  "slipie-deli-rakstisanai": ["https://www.schoolhealth.com/media/catalog/product/cache/f1041ad214c45afa3a7abede4d21a693/1/0/1002185_01_w.jpg", "https://www.schoolhealth.com/slantscript-slant-boards"],
  "papirs-ar-reljefam-linijam": ["https://media.aph.org/app/uploads/2019/03/1-04560-00_Embossed_Writing_Paper_G-600x657.jpg", "https://www.aph.org/product/embossed-pencil-writing-paper/"],
  "vardu-sienas": ["https://1.bp.blogspot.com/-PxbGQCEpjxo/U97lzlRV2kI/AAAAAAAABAw/K1w5m-4CjR0/s1600/the%2Bgilded%2Bpear%2B-%2Bscotch%2Bmake%2Bamazing%2Bcontest%2Bentry.jpg", "https://the-gilded-pear.blogspot.com/"],
  "vardu-burtu-kartites": ["https://ecdn.teacherspayteachers.com/cdn-cgi/image/format=jpg,quality=80,width=800/thumbitem/Alphabet-Flashcards-with-Real-Photos-4675067-1688657066/750f-4675067-3.jpg", "https://www.teacherspayteachers.com/Product/Alphabet-Picture-Flash-Cards-with-Real-Photos-4675067"],
  "magnetiskie-burti": ["https://www.thedyslexiashop.co.uk/cdn/shop/products/Show-me-Magnetic-Uppercase-Letters-Tub-of-286-N-A-_The-Dyslexia-Shop-31338230.jpg?v=1743329714", "https://www.thedyslexiashop.co.uk/products/show-me-magnetic-uppercase-letters-tub-of-286"],
  "burtu-un-ciparu-trafareti": ["https://147498847.cdn6.editmysite.com/uploads/1/4/7/4/147498847/s216647850549380395_p437_i1_w2880.jpeg?width=2560", "https://www.learningresources.com/"],
  "mehaniskie-uzlimju-printeri-ar-reljefu": ["https://www.123tinta.es/image/Dymo_Omega_lettertag_2174601_S0717930_833393_m2_big.jpg", "https://www.123tinta.es/Dymo-Omega-lettertag-2174601-S0717930-i43269-t1351709.html"],
  "ekranlasitaji": ["https://www.accessibility-developer-guide.com/setup/screen-readers/jaws/_media/jaws-application-window-large.png", "https://www.accessibility-developer-guide.com/setup/screen-readers/jaws/"],
  "kontrasta-mainas-riki": ["https://support.respondus.com/hc/article_attachments/8095711790491", "https://support.respondus.com/hc/en-us/articles/8096077675163-LockDown-Browser-and-High-Contrast"],
  "slipie-paliktni": ["https://www.schoolhealth.com/media/catalog/product/cache/f1041ad214c45afa3a7abede4d21a693/1/0/1002185_01_w.jpg", "https://www.schoolhealth.com/slantscript-slant-boards"],
  "digitalie-grafiku-veidotaji": ["https://www.eastersealstech.com/wp-content/uploads/2020/08/GeoGebra-online-software.png", "https://www.geogebra.org/graphing"],
  "matematikas-uzdevumu-atrisinasanas-riki": ["https://dulcarnon.com/wp-content/uploads/2025/03/Screenshot-2025-03-02-at-13.25.14-768x501.png", "https://constructor.tech/products/calcularis"],
  "matematikas-satura-lasitaji-piem-mathplayer-parl": ["https://img.informer.com/screenshots/3507/3507095_2.jpg", "https://www.wirismath.com/en/mathplayer/"],
  "taktils-datora-displejs-braila-matematikas-displ": ["https://www.bhvd.de/bilder/dotpad05.webp", "https://www.dotincorp.com/dot-pad-x"],
  "kalkulatori-ar-lieliem-taustiniem-vai-vienkarsot": ["https://mytoolsforliving.com/cdn/shop/products/Big-Button-Talking-Calculator.jpg?v=1664995748", "https://mytoolsforliving.com/products/big-button-talking-calculator"],
  "runajosie-kalkulatori-kalkulatori-ar-runas-funkc": ["https://thelowvisionstore.com/cdn/shop/files/241007__69163.jpg?v=1746543055", "https://thelowvisionstore.com/products/jumbo-talking-calculator"],
  "digitalais-rutinu-papirs": ["https://www.eastersealstech.com/wp-content/uploads/2020/08/GeoGebra-online-software.png", "https://www.geogebra.org/graphing"],
  "komunikacijas-atslegu-piekarini": ["https://static.arasaac.org/materials/1998/screenshots/Llavero_comunicacion_planificacion_secuenciacion_pictogramas_aac_symbols_ARASAAC_0.jpg", "https://arasaac.org/materials/en/1998"],
  "digitalas-atminas-kartes-palidz-iegaumet-informa": ["https://wonderwall.sg/images/default-source/content/dam/wonderwall/images/2020/06/student-hacks--get-these-apps-get-those-grades/image12.jpg.jpg?sfvrsn=fc50742c_0", "https://quizlet.com/"],
  "troksnu-slapejosas-austinas": ["https://purosound.com/cdn/shop/products/22GRNS_idweb.jpg?v=1680643972&width=1080", "https://purosound.com/products/bt2200-plus-volume-limited-bluetooth-headphones"],
  "kontrolsaraksti": ["https://static.wixstatic.com/media/430c68_52b2685fff6a42c2be27213cb4728f16~mv2.png/v1/fill/w_900,h_900,al_c,q_90/430c68_52b2685fff6a42c2be27213cb4728f16~mv2.png", "https://www.developmentaltexts.com/post/taking-breaks-for-self-regulation"],
  "papira-planotaji-vizualie-saraksti": ["https://theautismhelper.com/wp-content/uploads/2022/03/IMG_6533.jpg", "https://theautismhelper.com/using-a-traveling-schedule/"],
  "acu-skatiena-vadiba": ["https://tecnologiaassistiva.civiam.com.br/wp-content/uploads/2024/03/iseries-1.jpg", "https://www.tobiidynavox.com/products/td-i-16"],
  "braila-displeji-rindas": ["https://emeraldcoastvisionaids.com/wp-content/uploads/Focus-14-1.jpg", "https://www.freedomscientific.com/products/blindness/focus-blue-family/"],
  "alternativas-lielpogu-tastaturas-peles": ["https://i5.walmartimages.com/seo/BigKeys-LX-QWERTY-Wired-Keyboard-Multicolored-1-in-2-5-cm-Large-Keys_ec948c8d-73c7-49cb-93b0-b2e52a389d87.d38d289d95e1c93deb91f63b7d752ab4.jpeg", "https://www.bigkeys.com/product/bigkeys-lx"],
  "runajosi-prieksmeti-svari-merlentes-markieri": ["https://shopattheshop.org/cdn/shop/files/talkingtapemeasure.jpg?v=1687369256", "https://shopattheshop.org/products/talking-tape-measure"],
  "tastaturas-maskas-keyguards": ["https://keyguardat.com/cdn/shop/files/Clevy_Keyguard_WithKeyboard__09076.1683677333.1280.1280.jpg?v=1721945999&width=1700", "https://keyguardat.com/collections/oversized-keyboard-keyguards"],
};

async function main() {
  const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
  await fs.mkdir(outputDir, { recursive: true });
  const remaining = registry.filter((item) => item.source_type === "original");
  const failures = [];
  for (const item of remaining) {
    const source = sources[item.id];
    if (!source) {
      failures.push(`${item.id}: nav manuāli atlasīta attēla`);
      console.warn(`failed ${item.id}: nav manuāli atlasīta attēla`);
      continue;
    }
    const [imageUrl, sourcePage] = source;
    try {
      const response = await fetch(imageUrl, {
        redirect: "follow",
        headers: { "user-agent": "Mozilla/5.0", referer: sourcePage },
      });
      if (!response.ok) throw new Error(`attēla HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) throw new Error(`saņemts ${contentType}`);
      const inputPath = path.join(outputDir, `${item.id}.source`);
      const outputPath = path.join(outputDir, `${item.id}.webp`);
      await fs.writeFile(inputPath, Buffer.from(await response.arrayBuffer()));
      execFileSync("convert", [inputPath, "-auto-orient", "-resize", "680x400>", "-background", "#f7f5f9", "-gravity", "center", "-extent", "720x480", "-strip", "-quality", "82", outputPath]);
      await fs.unlink(inputPath);
      Object.assign(item, {
        alt: `${item.name} — reāls ierīces vai programmas attēls`,
        file: `assets/images/catalog/${item.id}.webp`,
        source_type: "external_reference",
        source_page: sourcePage,
        source_image: imageUrl,
        rights_note: "Attēls iegūts no norādītās produkta vai autoritatīvās resursa lapas; pirms gala publicēšanas jāpārbauda pārpublicēšanas tiesības.",
      });
      delete item.fallback_reason;
      console.log(`real-image ${item.id}`);
    } catch (error) {
      failures.push(`${item.id}: ${error.message}`);
      console.warn(`failed ${item.id}: ${error.message}`);
    }
  }
  await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  console.log(`Aizstāti ${remaining.length - failures.length} no ${remaining.length} standartizētajiem attēliem.`);
  if (failures.length) console.log(`Neizdevās:\n${failures.join("\n")}`);
}

await main();
