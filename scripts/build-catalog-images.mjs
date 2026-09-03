import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { referencePages } from "./catalog-reference-pages.mjs";

const root = path.resolve(import.meta.dirname, "..");
const bundlePath = path.join(root, "assets/routes-C_WgTdsH.js");
const outputDir = path.join(root, "assets/images/catalog");
const sourceRegisterPath = path.join(root, "data/catalog-image-sources.json");

// Where a catalogue entry names a concrete product, prefer the manufacturer's
// own product page. Entries not listed here receive a neutral, locally created
// illustration instead of an arbitrary shop photo.
const officialPages = {
  "alternativas-peles-vada-ar-acu-skatienu": "https://www.tobiidynavox.com/products/pceye",
  "runas-teksta-speech-to-text-riki": "https://www.readspeaker.com/solutions/text-to-speech-online/readspeaker-textaid/",
  "vardu-prognozesanas-programmatura": "https://www.readspeaker.com/solutions/text-to-speech-online/readspeaker-textaid/",
  "pareizrakstibas-riki-ar-audio-atgriezenisko-sait": "https://www.readspeaker.com/solutions/text-to-speech-online/readspeaker-textaid/",
  "programmatura-digitalo-stastu-veidosanai-digital": "https://bookcreator.com/",
  "viedpildspalvas-audiosinhronizacijai": "https://us.livescribe.com/products/echo-2%E2%84%A2-smartpen",
  "digitalas-piezimju-klades-ar-audio": "https://www.goodnotes.com/",
  "portativie-diktofoni": "https://www.plaud.ai/products/plaud-note",
  "portativie-teksta-procesori-bez-interneta": "https://getfreewrite.com/products/freewrite-smart-typewriter-3rd-gen",
  "mehaniska-braila-rakstammasina": "https://brailler.perkins.org/products/perkins-brailler/",
  "ekranlasitaji": "https://www.freedomscientific.com/products/software/jaws/",
  "teksta-runas-text-to-speech-programmas": "https://www.readspeaker.com/solutions/text-to-speech-online/readspeaker-textaid/",
  "viedpildspalvas-skenesanai": "https://cpen.com/products/c-pen-reader-2",
  "digitalie-palielinataji": "https://www.optelec.com/products/compact-10-hd-speech/",
  "teksta-segmentesanas-un-vienkarsosanas-riki": "https://web.diffit.me/",
  "simbolu-programmatura": "https://www.widgit.com/products/symwriter/index.htm",
  "pecs-attelu-apmainas-komunikacijas-sistema-digit": "https://pecs.com/PECSIV/",
  "digitalie-lasitaji-daisy-atskanotaji": "https://store.humanware.com/heu/victor-reader-stream-handheld-media-player.html",
  "kontrasta-mainas-riki": "https://www.freedomscientific.com/products/software/zoomtext/",
  "specialas-matematikas-pieraksta-apzimejumu-progr": "https://www.texthelp.com/products/equatio/",
  "digitalie-grafiku-veidotaji": "https://www.geogebra.org/graphing",
  "matematikas-uzdevumu-atrisinasanas-riki": "https://constructor.tech/products/calcularis",
  "matematikas-satura-lasitaji-piem-mathplayer-parl": "https://www.wirismath.com/en/mathplayer/",
  "taktils-datora-displejs-braila-matematikas-displ": "https://www.dotincorp.com/dot-pad-x",
  "digitalais-rutinu-papirs": "https://www.geogebra.org/graphing",
  "alternativas-augmentativas-komunikacijas-aak-lie": "https://www.tobiidynavox.com/products/td-snap",
  "teksta-runas-text-to-speech-lietotnes": "https://www.readspeaker.com/solutions/text-to-speech-online/readspeaker-textaid/",
  "komunikacijas-deli-ar-runas-sintezi-ar-piktogram": "https://www.tobiidynavox.com/products/boardmaker-7",
  "specializeti-komunikacijas-datori-runu-generejos": "https://www.tobiidynavox.com/products/td-i-110",
  "vienkarsas-runas-ierices-ar-ierakstitu-zinu": "https://www.attainmentcompany.com/gotalk-9",
  "uzdevumu-strukturesanas-lietotnes": "https://todoist.com/",
  "digitalas-atminas-kartes-palidz-iegaumet-informa": "https://quizlet.com/",
  "digitalas-jedzienu-kartes": "https://www.mindmeister.com/",
  "uzmanibas-koncentresanas-lietotnes": "https://www.forestapp.cc/",
  "fiziskie-mehaniskie-vizualie-taimeri-pielagoti-p": "https://www.timetimer.com/products/time-timer-8-magnet",
  "troksnu-slapejosas-austinas": "https://purosound.com/products/bt2200-plus-volume-limited-bluetooth-headphones",
  "acu-skatiena-vadiba": "https://www.tobiidynavox.com/products/td-i-16",
  "braila-displeji-rindas": "https://www.freedomscientific.com/products/blindness/focus-blue-family/",
  "braila-printeri": "https://indexbraille.com/product/everest-d-v5/",
  "ekrana-palielinasanas-sistema-digitalas-tafeles-": "https://www.optelec.com/products/clearview-c/",
  "viedbrilles-ar-ai-vides-atpazisanu": "https://www.letsenvision.com/glasses",
  "reallaika-automatisko-subtitru-sistemas": "https://livevoice.io/",
  "balss-teksta-speech-to-text-parveidosanas-progra": "https://www.readspeaker.com/solutions/text-to-speech-online/readspeaker-textaid/",
  "vairaku-kanalu-bezvadu-audio-straumesanas-sistem": "https://www.listentech.com/listenwifi/",
  "parvietojams-mobilas-indukcijas-cilpas-rsinajums": "https://www.listentech.com/listentalk/",
  "alternativas-lielpogu-tastaturas-peles": "https://www.bigkeys.com/product/bigkeys-lx",
  "kursorsviras-joysticks": "https://www.kensington.com/p/products/electronic-control-solutions/trackball-products/expert-mouse-wired-trackball/",
  "vienkarsie-mehaniskie-sledzi-switches": "https://www.ablenetinc.com/jelly-bean-twist/",
  "elektroniskie-rokas-palielinataji": "https://www.optelec.com/products/compact-10-hd-speech/",
  "video-palielinataji-cctv-sistemas": "https://www.optelec.com/products/clearview-c/",
};

const palette = {
  rakstisana: ["#5b2a86", "#ede3f5", "#b48ad0"],
  lasisana: ["#263b80", "#e5eafb", "#8da1dc"],
  matematika: ["#075f66", "#dcf2f1", "#75bbb9"],
  komunikacija: ["#8b3d53", "#f7e4e9", "#d897aa"],
  organizesana: ["#8a5b09", "#fbefd6", "#ddb96f"],
  vide: ["#315b43", "#e1f0e7", "#8bbb9d"],
};

function extractResources(bundle) {
  const start = bundle.indexOf("c=[{id:`alternativas-peles");
  const end = bundle.indexOf("}],l=", start) + 2;
  if (start < 0 || end < 2) throw new Error("Kataloga datu masīvs komplektā nav atrasts.");
  return Function(`return ${bundle.slice(start + 2, end)}`)();
}

function attrs(tag) {
  const found = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)) {
    found[match[1].toLowerCase()] = match[3];
  }
  return found;
}

function htmlEntityDecode(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function findSocialImage(html, pageUrl) {
  const candidates = [];
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const a = attrs(tag);
    const key = (a.property ?? a.name ?? "").toLowerCase();
    if (["og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"].includes(key) && a.content) {
      candidates.push(htmlEntityDecode(a.content));
    }
  }
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const a = attrs(tag);
    if ((a.rel ?? "").toLowerCase() === "image_src" && a.href) candidates.push(htmlEntityDecode(a.href));
  }
  for (const match of html.matchAll(/"image"\s*:\s*(?:\[\s*)?"([^"]+)"/gi)) {
    candidates.push(htmlEntityDecode(match[1].replaceAll("\\/", "/")));
  }
  if (!candidates.length) {
    const scored = [];
    for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
      const a = attrs(tag);
      const srcset = a.srcset?.split(",").at(-1)?.trim().split(/\s+/)[0];
      const src = a["data-src"] ?? a["data-lazy-src"] ?? srcset ?? a.src;
      if (!src || src.startsWith("data:")) continue;
      const text = `${src} ${a.alt ?? ""} ${a.class ?? ""}`.toLowerCase();
      if (/logo|icon|avatar|spinner|pixel|badge|payment/.test(text)) continue;
      let score = 0;
      if (/product|hero|featured|gallery|main|screenshot/.test(text)) score += 5;
      const width = Number.parseInt(a.width ?? "0", 10);
      const height = Number.parseInt(a.height ?? "0", 10);
      if (width >= 500 || height >= 350) score += 3;
      if (/\.svg(?:\?|$)/i.test(src)) score -= 1;
      scored.push({ src, score });
    }
    scored.sort((a, b) => b.score - a.score);
    if (scored[0]) candidates.push(scored[0].src);
  }
  if (!candidates.length) return null;
  return new URL(candidates[0], pageUrl).href;
}

function extensionFromContentType(contentType) {
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  if (contentType.includes("svg")) return ".svg";
  return ".jpg";
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapTitle(value, max = 22) {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= 3) return lines;
  return [...lines.slice(0, 2), `${lines.slice(2).join(" ").slice(0, max - 1)}…`];
}

function pictogram(area) {
  if (area === "lasisana") return `<path d="M115 126c38-17 70-16 97 1v166c-30-17-62-18-97 0zm97 1c27-17 59-18 97-1v167c-35-18-67-17-97 0z"/><path d="M145 168h39M145 204h39M240 168h39M240 204h39"/>`;
  if (area === "rakstisana") return `<path d="M127 285l17-72 122-122 55 55-122 122z"/><path d="M144 213l55 55M272 98l42 42M127 285l57-11"/>`;
  if (area === "matematika") return `<rect x="120" y="84" width="192" height="222" rx="22"/><path d="M151 126h130v48H151zM156 215h28M170 201v28M221 201v28M207 215h28M263 204l27 22M290 204l-27 22"/>`;
  if (area === "komunikacija") return `<path d="M104 112h185a30 30 0 0130 30v76a30 30 0 01-30 30h-89l-54 49 14-49h-56a30 30 0 01-30-30v-76a30 30 0 0130-30z"/><path d="M124 174h145M124 211h98"/>`;
  if (area === "organizesana") return `<rect x="102" y="105" width="220" height="190" rx="18"/><path d="M102 155h220M151 82v48M273 82v48M146 208l23 23 48-55M245 210h43M245 249h43"/>`;
  return `<rect x="104" y="98" width="216" height="155" rx="16"/><path d="M151 295h122M183 253l-9 42M241 253l9 42M175 154h74M175 193h105"/>`;
}

function illustrationSvg(resource, index) {
  const area = resource.areas[0] ?? "vide";
  const [primary, pale, accent] = palette[area] ?? palette.vide;
  const titleLines = wrapTitle(resource.name);
  const tspans = titleLines.map((line, i) => `<tspan x="405" dy="${i === 0 ? 0 : 39}">${escapeXml(line)}</tspan>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480" viewBox="0 0 720 480" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(resource.name)}</title>
  <desc id="desc">Neitrāla VIAA kataloga ilustrācija risinājumam “${escapeXml(resource.name)}”.</desc>
  <rect width="720" height="480" rx="28" fill="${pale}"/>
  <circle cx="212" cy="196" r="146" fill="${accent}" opacity=".34"/>
  <g fill="none" stroke="${primary}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round">${pictogram(area)}</g>
  <rect x="350" y="72" width="330" height="336" rx="24" fill="#fff" opacity=".94"/>
  <text x="370" y="118" fill="${primary}" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="1.5">AT–${String(index + 1).padStart(3, "0")}</text>
  <text x="370" y="182" fill="#25202a" font-family="Arial, sans-serif" font-size="23" font-weight="700">${tspans}</text>
  <text x="370" y="368" fill="${primary}" font-family="Arial, sans-serif" font-size="17" font-weight="600">Asistīvo tehnoloģiju katalogs</text>
</svg>`;
}

async function fetchWithTimeout(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; VIAA-catalog-image-research/1.0)" },
    });
  } finally {
    clearTimeout(timer);
  }
}

const pageImageCache = new Map();
const imageBufferCache = new Map();

function resolveSocialImage(pageUrl) {
  if (!pageImageCache.has(pageUrl)) {
    pageImageCache.set(pageUrl, (async () => {
      const pageResponse = await fetchWithTimeout(pageUrl);
      if (!pageResponse.ok) throw new Error(`Produkta lapas HTTP ${pageResponse.status}`);
      const html = await pageResponse.text();
      const imageUrl = findSocialImage(html, pageResponse.url);
      if (!imageUrl) throw new Error("Produkta lapā nav atrasts og:image vai twitter:image");
      return { pageUrl: pageResponse.url, imageUrl };
    })());
  }
  return pageImageCache.get(pageUrl);
}

function loadImage(imageUrl) {
  if (!imageBufferCache.has(imageUrl)) {
    imageBufferCache.set(imageUrl, (async () => {
      const imageResponse = await fetchWithTimeout(imageUrl);
      if (!imageResponse.ok) throw new Error(`Attēla HTTP ${imageResponse.status}`);
      const contentType = (imageResponse.headers.get("content-type") ?? "").toLowerCase();
      if (!contentType.startsWith("image/")) throw new Error(`Saņemts ${contentType || "nezināms datu tips"}`);
      return { contentType, buffer: Buffer.from(await imageResponse.arrayBuffer()) };
    })());
  }
  return imageBufferCache.get(imageUrl);
}

async function buildOfficialImage(resource, pageUrl) {
  const resolved = await resolveSocialImage(pageUrl);
  const image = await loadImage(resolved.imageUrl);

  const extension = extensionFromContentType(image.contentType);
  if (extension === ".svg") {
    const outputPath = path.join(outputDir, `${resource.id}.svg`);
    await fs.writeFile(outputPath, image.buffer);
    return {
      file: `assets/images/catalog/${resource.id}.svg`,
      source_type: "manufacturer",
      source_page: resolved.pageUrl,
      source_image: resolved.imageUrl,
      rights_note: "Pirms gala publicēšanas saņemt vai pārbaudīt attēla pārpublicēšanas atļauju.",
    };
  }
  const inputPath = path.join(outputDir, `${resource.id}.source${extension}`);
  const outputPath = path.join(outputDir, `${resource.id}.webp`);
  await fs.writeFile(inputPath, image.buffer);
  execFileSync("convert", [
    inputPath,
    "-auto-orient",
    "-resize", "680x400>",
    "-background", "#f7f5f9",
    "-gravity", "center",
    "-extent", "720x480",
    "-strip",
    "-quality", "82",
    outputPath,
  ]);
  await fs.unlink(inputPath);
  return {
    file: `assets/images/catalog/${resource.id}.webp`,
    source_type: "manufacturer",
    source_page: resolved.pageUrl,
    source_image: resolved.imageUrl,
    rights_note: "Pirms gala publicēšanas saņemt vai pārbaudīt ražotāja atļauju attēla pārpublicēšanai.",
  };
}

async function buildNeutralImage(resource, index, reason = null) {
  const file = `assets/images/catalog/${resource.id}.svg`;
  await fs.writeFile(path.join(root, file), illustrationSvg(resource, index), "utf8");
  return {
    file,
    source_type: "original",
    source_page: null,
    source_image: null,
    rights_note: "Neitrāla ilustrācija, kas izveidota šim VIAA kataloga prototipam.",
    ...(reason ? { fallback_reason: reason } : {}),
  };
}

async function main() {
  const bundle = await fs.readFile(bundlePath, "utf8");
  const resources = extractResources(bundle);
  const productLinkIds = new Set([...Object.keys(officialPages), ...Object.keys(referencePages)]);
  if (productLinkIds.size !== resources.length) {
    throw new Error(`Produktu saišu kartē ir ${productLinkIds.size}, nevis ${resources.length} unikāli ieraksti.`);
  }
  if (process.argv.includes("--replace-originals-with-page-images")) {
    const existing = JSON.parse(await fs.readFile(sourceRegisterPath, "utf8"));
    const results = [...existing];
    const pending = resources
      .map((resource, index) => ({ resource, index, current: existing[index] }))
      .filter(({ current }) => current?.source_type === "original");
    let cursor = 0;

    async function worker() {
      while (cursor < pending.length) {
        const { resource, index, current } = pending[cursor++];
        try {
          const image = await buildOfficialImage(resource, current.product_page);
          results[index] = {
            id: resource.id,
            name: resource.name,
            alt: `${resource.name} — reāls produkta vai risinājuma attēls`,
            product_page: current.product_page,
            link_type: current.link_type,
            ...image,
            source_type: current.link_type === "product" ? "manufacturer" : "external_reference",
            rights_note: "Attēls iegūts no norādītās produkta vai autoritatīvās resursa lapas; pirms gala publicēšanas jāpārbauda pārpublicēšanas tiesības.",
          };
          console.log(`real-image ${index + 1}/${resources.length} ${resource.id}`);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          results[index] = { ...current, fallback_reason: reason };
          console.warn(`kept-placeholder ${index + 1}/${resources.length} ${resource.id}: ${reason}`);
        }
      }
    }

    await Promise.all(Array.from({ length: 6 }, () => worker()));
    await fs.writeFile(sourceRegisterPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
    console.log(`Pārbaudīti ${pending.length} standartizētie attēli.`);
    return;
  }
  if (process.argv.includes("--originals-only")) {
    const existing = JSON.parse(await fs.readFile(sourceRegisterPath, "utf8"));
    await fs.mkdir(outputDir, { recursive: true });
    for (let index = 0; index < resources.length; index += 1) {
      if (existing[index]?.source_type === "original") {
        await buildNeutralImage(resources[index], index, existing[index].fallback_reason ?? null);
      }
    }
    console.log("Neitrālās ilustrācijas atjaunotas, ražotāju attēlus nemainot.");
    return;
  }

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  const results = new Array(resources.length);
  let cursor = 0;

  async function worker() {
    while (cursor < resources.length) {
      const index = cursor++;
      const resource = resources[index];
      const pageUrl = officialPages[resource.id];
      const reference = referencePages[resource.id];
      const productPage = pageUrl ?? reference?.url;
      const linkType = pageUrl ? "product" : reference?.link_type;
      if (!productPage || !linkType) throw new Error(`Nav produkta saites ierakstam ${resource.id}`);
      if (!pageUrl) {
        results[index] = {
          id: resource.id,
          name: resource.name,
          alt: resource.name,
          product_page: productPage,
          link_type: linkType,
          ...(await buildNeutralImage(resource, index)),
        };
        console.log(`illustration ${index + 1}/${resources.length} ${resource.id}`);
        continue;
      }
      try {
        const record = await buildOfficialImage(resource, pageUrl);
        results[index] = {
          id: resource.id,
          name: resource.name,
          alt: `${resource.name} — ražotāja ilustratīvs attēls`,
          product_page: productPage,
          link_type: linkType,
          ...record,
        };
        console.log(`manufacturer ${index + 1}/${resources.length} ${resource.id}`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        results[index] = {
          id: resource.id,
          name: resource.name,
          alt: resource.name,
          product_page: productPage,
          link_type: linkType,
          ...(await buildNeutralImage(resource, index, reason)),
        };
        console.warn(`fallback ${index + 1}/${resources.length} ${resource.id}: ${reason}`);
      }
    }
  }

  await Promise.all(Array.from({ length: 6 }, () => worker()));
  await fs.writeFile(sourceRegisterPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  console.log(`Saglabāti ${results.length} attēli un avotu reģistrs.`);
}

await main();
