import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const bundlePath = path.join(root, "assets/routes-C_WgTdsH.js");
const indexPath = path.join(root, "index.html");
const registerPath = path.join(root, "data/catalog-image-sources.json");
const fallbackPath = path.join(root, "assets/catalog-fallback.js");

function escapeTemplate(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractResources(bundle) {
  const start = bundle.indexOf("c=[{id:`alternativas-peles");
  const end = bundle.indexOf("}],l=", start) + 2;
  if (start < 0 || end < 2) throw new Error("Kataloga datu masīvs komplektā nav atrasts.");
  return Function(`return ${bundle.slice(start + 2, end)}`)();
}

function patchBundle(bundle, records) {
  for (const record of records) {
    const id = escapeTemplate(record.id);
    const image = escapeTemplate(record.file);
    const alt = escapeTemplate(record.alt);
    const productPage = escapeTemplate(record.product_page);
    const linkType = escapeTemplate(record.link_type);
    const pattern = new RegExp("id:`" + escapeRegex(id) + "`,(?:image:`[^`]*`,imageAlt:`[^`]*`,)?(?:productPage:`[^`]*`,productLinkType:`[^`]*`,)?name:");
    const replacement = "id:`" + id + "`,image:`" + image + "`,imageAlt:`" + alt + "`,productPage:`" + productPage + "`,productLinkType:`" + linkType + "`,name:";
    if (!pattern.test(bundle)) throw new Error(`Komplektā nav atrasts ieraksts ${record.id}`);
    bundle = bundle.replace(pattern, replacement);
  }

  const cardNeedle = "(0,C.jsx)(`div`,{className:`flex h-32 items-center justify-center border-b border-border bg-secondary`,children:(0,C.jsx)(T,{type:e.type})})";
  const legacyCardImage = "(0,C.jsx)(`div`,{className:`h-40 overflow-hidden border-b border-border bg-secondary`,children:e.image?(0,C.jsx)(`img`,{src:`./${e.image}`,alt:e.imageAlt??e.name,className:`h-full w-full bg-secondary object-contain`,loading:`lazy`,decoding:`async`}):(0,C.jsx)(T,{type:e.type})})";
  const legacyCardImageWithStyle = "(0,C.jsx)(`div`,{className:`overflow-hidden border-b border-border bg-secondary`,style:{height:`10rem`},children:e.image?(0,C.jsx)(`img`,{src:`./${e.image}`,alt:e.imageAlt??e.name,className:`h-full w-full bg-secondary`,style:{objectFit:`contain`},loading:`lazy`,decoding:`async`}):(0,C.jsx)(T,{type:e.type})})";
  const legacyClickableCardImage = "(0,C.jsx)(`button`,{type:`button`,\"data-catalog-open\":e.id,onClick:()=>t(e),\"aria-label\":`Atvērt informāciju par ${e.name}`,className:`overflow-hidden border-b border-border bg-secondary`,style:{height:`10rem`,width:`100%`,padding:0,cursor:`pointer`},children:e.image?(0,C.jsx)(`img`,{src:`./${e.image}`,alt:e.imageAlt??e.name,className:`h-full w-full bg-secondary`,style:{objectFit:`contain`},loading:`lazy`,decoding:`async`}):(0,C.jsx)(T,{type:e.type})})";
  const legacyProductCardImage = "(0,C.jsx)(`a`,{href:e.productPage,target:`_blank`,rel:`noopener noreferrer`,\"aria-label\":`Atvērt produkta vai risinājuma lapu: ${e.name}`,className:`block overflow-hidden border-b border-border bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`,style:{height:`10rem`,width:`100%`,cursor:`pointer`},children:e.image?(0,C.jsx)(`img`,{src:`./${e.image}`,alt:e.imageAlt??e.name,className:`h-full w-full bg-secondary`,style:{objectFit:`contain`},loading:`lazy`,decoding:`async`}):(0,C.jsx)(T,{type:e.type})})";
  const currentProductCardImage = "(0,C.jsx)(`a`,{href:e.productPage,target:`_blank`,rel:`noopener noreferrer`,\"aria-label\":`Atvērt produkta vai risinājuma lapu jaunā cilnē: ${e.name}`,className:`block overflow-hidden border-b border-border bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`,style:{height:`10rem`,width:`100%`,cursor:`pointer`},children:e.image?(0,C.jsx)(`img`,{src:`./${e.image}`,alt:e.imageAlt??e.name,className:`h-full w-full bg-secondary`,style:{objectFit:`contain`},loading:`lazy`,decoding:`async`}):(0,C.jsx)(T,{type:e.type})})";
  const cardImage = legacyClickableCardImage;
  if (bundle.includes(cardNeedle)) bundle = bundle.replace(cardNeedle, cardImage);
  else if (bundle.includes(legacyCardImage)) bundle = bundle.replace(legacyCardImage, cardImage);
  else if (bundle.includes(legacyCardImageWithStyle)) bundle = bundle.replace(legacyCardImageWithStyle, cardImage);
  else if (bundle.includes(legacyClickableCardImage)) bundle = bundle.replace(legacyClickableCardImage, cardImage);
  else if (bundle.includes(legacyProductCardImage)) bundle = bundle.replace(legacyProductCardImage, cardImage);
  else if (bundle.includes(currentProductCardImage)) bundle = bundle.replace(currentProductCardImage, cardImage);
  else if (!bundle.includes(cardImage)) throw new Error("Kartītes attēla komponente komplektā nav atrasta.");

  const detailsButton = "type:`button`,onClick:()=>t(e),className:`mt-1 inline-flex";
  const detailsButtonWithFallback = "type:`button`,\"data-catalog-open\":e.id,onClick:()=>t(e),className:`mt-1 inline-flex";
  if (bundle.includes(detailsButton)) bundle = bundle.replace(detailsButton, detailsButtonWithFallback);
  else if (!bundle.includes(detailsButtonWithFallback)) throw new Error("Poga “Uzzināt vairāk” komplektā nav atrasta.");

  const cardListItem = "(0,C.jsxs)(`li`,{className:`flex flex-col overflow-hidden rounded-md border border-border bg-card`";
  const cardListItemWithId = "(0,C.jsxs)(`li`,{\"data-resource-id\":e.id,className:`flex flex-col overflow-hidden rounded-md border border-border bg-card`";
  if (bundle.includes(cardListItem)) bundle = bundle.replace(cardListItem, cardListItemWithId);
  else if (!bundle.includes(cardListItemWithId)) throw new Error("Kartītes saraksta elements komplektā nav atrasts.");

  const modalNeedle = "(0,C.jsx)(`div`,{className:`flex h-48 items-center justify-center rounded-t-md border-b border-border bg-secondary`,children:(0,C.jsx)(T,{type:e.type,size:`lg`})})";
  const legacyModalImage = "(0,C.jsx)(`div`,{className:`h-64 overflow-hidden rounded-t-md border-b border-border bg-secondary`,children:e.image?(0,C.jsx)(`img`,{src:`./${e.image}`,alt:e.imageAlt??e.name,className:`h-full w-full bg-secondary object-contain`}):(0,C.jsx)(T,{type:e.type,size:`lg`})})";
  const legacyModalImageWithStyle = "(0,C.jsx)(`div`,{className:`overflow-hidden rounded-t-md border-b border-border bg-secondary`,style:{height:`16rem`},children:e.image?(0,C.jsx)(`img`,{src:`./${e.image}`,alt:e.imageAlt??e.name,className:`h-full w-full bg-secondary`,style:{objectFit:`contain`}}):(0,C.jsx)(T,{type:e.type,size:`lg`})})";
  const currentModalImage = "(0,C.jsx)(`a`,{href:e.productPage,target:`_blank`,rel:`noopener noreferrer`,\"aria-label\":`Atvērt produkta vai risinājuma lapu jaunā cilnē: ${e.name}`,className:`block overflow-hidden rounded-t-md border-b border-border bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`,style:{height:`16rem`},children:e.image?(0,C.jsx)(`img`,{src:`./${e.image}`,alt:e.imageAlt??e.name,className:`h-full w-full bg-secondary`,style:{objectFit:`contain`}}):(0,C.jsx)(T,{type:e.type,size:`lg`})})";
  const modalImage = legacyModalImageWithStyle;
  if (bundle.includes(modalNeedle)) bundle = bundle.replace(modalNeedle, modalImage);
  else if (bundle.includes(legacyModalImage)) bundle = bundle.replace(legacyModalImage, modalImage);
  else if (bundle.includes(legacyModalImageWithStyle)) bundle = bundle.replace(legacyModalImageWithStyle, modalImage);
  else if (bundle.includes(currentModalImage)) bundle = bundle.replace(currentModalImage, modalImage);
  else if (!bundle.includes(modalImage)) throw new Error("Modālā loga attēla komponente komplektā nav atrasta.");

  const modalExternalLink = "e.link?(0,C.jsxs)(`a`,{href:e.link,target:`_blank`,rel:`noopener noreferrer`,className:`inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`,children:[`Atvērt ārējo resursu (`,e.linkLabel,`)`]}):(0,C.jsx)(`p`,{className:`text-sm text-muted-foreground`,children:`Saite: Informācija tiks papildināta`})";
  const modalProductLink = "(0,C.jsx)(`a`,{href:e.productPage,target:`_blank`,rel:`noopener noreferrer`,className:`inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`,children:{product:`Ražotāja informācija`,category:`Skatīt risinājumu kategoriju`,resource:`Papildu informācija`}[e.productLinkType]??`Papildu informācija`})";
  const legacyModalProductLink = "(0,C.jsx)(`a`,{href:e.productPage,target:`_blank`,rel:`noopener noreferrer`,className:`inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`,children:`Atvērt produkta vai risinājuma lapu`})";
  if (bundle.includes(modalExternalLink)) bundle = bundle.replace(modalExternalLink, modalProductLink);
  else if (bundle.includes(legacyModalProductLink)) bundle = bundle.replace(legacyModalProductLink, modalProductLink);
  else if (!bundle.includes(modalProductLink)) throw new Error("Modālā loga ārējā saite nav atrasta.");

  return bundle;
}

function patchStaticHtml(html, records) {
  const cardPattern = /<li(?: data-resource-id="[^"]+")? class="flex flex-col overflow-hidden rounded-md border border-border bg-card">.*?<\/li>/g;
  const cards = html.match(cardPattern) ?? [];
  if (cards.length !== records.length) throw new Error(`index.html atrastas ${cards.length}, nevis ${records.length} kartītes.`);

  let index = 0;
  html = html.replace(cardPattern, (card) => {
    const record = records[index++];
    const title = decodeHtml(card.match(/<h3[^>]*>(.*?)<\/h3>/)?.[1] ?? "");
    if (title !== record.name) throw new Error(`Kartīšu secība nesakrīt: “${title}” / “${record.name}”.`);

    card = card.replace(/^<li(?: data-resource-id="[^"]+")? /, `<li data-resource-id="${escapeHtml(record.id)}" `);
    const imageBlock = `<button type="button" data-catalog-open="${escapeHtml(record.id)}" aria-label="Atvērt informāciju par ${escapeHtml(record.name)}" class="overflow-hidden border-b border-border bg-secondary" style="height:10rem;width:100%;padding:0;cursor:pointer"><img src="./${escapeHtml(record.file)}" alt="${escapeHtml(record.alt)}" class="h-full w-full bg-secondary" style="object-fit:contain" loading="lazy" decoding="async"/></button>`;
    const placeholderPattern = /<div class="flex h-32 items-center justify-center border-b border-border bg-secondary">.*?<\/svg><\/div><\/div>/;
    const existingImagePattern = /<div class="(?:h-40 )?overflow-hidden border-b border-border bg-secondary"(?: style="height:10rem")?><img .*?<\/div>/;
    const existingImageButtonPattern = /<button type="button" data-catalog-open="[^"]+" aria-label="[^"]+" class="overflow-hidden border-b border-border bg-secondary" style="height:10rem;width:100%;padding:0;cursor:pointer"><img .*?<\/button>/;
    const existingImageLinkPattern = /<a href="[^"]+" target="_blank" rel="noopener noreferrer" aria-label="[^"]+" class="block overflow-hidden border-b border-border bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" style="height:10rem;width:100%;cursor:pointer"><img .*?<\/a>/;
    if (placeholderPattern.test(card)) card = card.replace(placeholderPattern, imageBlock);
    else if (existingImagePattern.test(card)) card = card.replace(existingImagePattern, imageBlock);
    else if (existingImageButtonPattern.test(card)) card = card.replace(existingImageButtonPattern, imageBlock);
    else if (existingImageLinkPattern.test(card)) card = card.replace(existingImageLinkPattern, imageBlock);
    else throw new Error(`Kartītē “${record.name}” nav atrasta attēla vieta.`);

    const detailsButtonPattern = /<button type="button"(?: data-catalog-open="[^"]+")? class="([^"]+)">Uzzināt vairāk/;
    if (!detailsButtonPattern.test(card)) throw new Error(`Kartītē “${record.name}” nav atrasta poga “Uzzināt vairāk”.`);
    return card.replace(detailsButtonPattern, `<button type="button" data-catalog-open="${escapeHtml(record.id)}" class="$1">Uzzināt vairāk`);
  });

  return html;
}

function ensureFallbackScript(html) {
  const tag = `<script src="./assets/catalog-fallback.js"></script>`;
  if (html.includes(tag)) return html;
  if (!html.includes("</body>")) throw new Error("index.html nav atrasts noslēdzošais body tags.");
  return html.replace("</body>", `${tag}</body>`);
}

function buildFallbackScript(resources) {
  const data = JSON.stringify(resources).replaceAll("<", "\\u003c");
  return `(() => {
  "use strict";
  const resources = ${data};
  const byId = Object.fromEntries(resources.map((resource) => [resource.id, resource]));
  const areaLabels = {
    lasisana: "Lasīšana",
    rakstisana: "Rakstīšana",
    matematika: "Matemātika",
    komunikacija: "Komunikācija",
    organizesana: "Uzmanība, atmiņa un organizēšana",
    vide: "Piekļuve videi un tehnoloģijām",
  };
  const typeLabels = {
    ierice: "Ierīce",
    programmatura: "Programmatūra vai lietotne",
    iebuveta: "Iebūvēta piekļūstamības funkcija",
    bezmaksas: "Bezmaksas digitālais rīks",
    metodiskais: "Metodiskais materiāls vai pamācība",
  };
  let lastTrigger = null;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function appendList(parent, items) {
    const list = element("ul", "mt-2 list-disc space-y-1 pl-5 text-sm text-foreground");
    for (const item of items || []) list.append(element("li", "", item));
    parent.append(list);
  }

  function openFallback(resource, trigger) {
    if (!resource || document.querySelector('[role="dialog"]')) return;
    lastTrigger = trigger;

    const overlay = element("div", "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/50 p-4 sm:items-center");
    overlay.setAttribute("data-catalog-fallback-dialog", "");
    const panel = element("div", "my-8 w-full max-w-2xl rounded-md border border-border bg-card");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "fallback-resource-dialog-title");

    const media = element("div", "overflow-hidden rounded-t-md border-b border-border bg-secondary");
    media.style.height = "16rem";
    if (resource.image) {
      const image = element("img", "h-full w-full bg-secondary");
      image.src = "./" + resource.image;
      image.alt = resource.imageAlt || resource.name;
      image.style.objectFit = "contain";
      media.append(image);
    }
    panel.append(media);

    const content = element("div", "space-y-5 p-6");
    const intro = element("div");
    const title = element("h2", "text-xl font-semibold text-foreground", resource.name);
    title.id = "fallback-resource-dialog-title";
    intro.append(title);
    const areas = (resource.areas || []).map((area) => areaLabels[area] || area).join(", ");
    intro.append(element("p", "mt-1 text-sm text-muted-foreground", areas + " · " + (typeLabels[resource.type] || resource.type) + " · " + resource.latvian));
    content.append(intro);
    const whatIs = element("div");
    whatIs.append(element("h3", "text-sm font-semibold text-foreground", "Kas tas ir?"));
    whatIs.append(element("p", "mt-2 text-sm leading-relaxed text-foreground", resource.whatIs || resource.description));
    content.append(whatIs);

    const features = element("div");
    features.append(element("h3", "text-sm font-semibold text-foreground", "Galvenās funkcijas"));
    appendList(features, resource.features);
    content.append(features);

    const situations = element("div");
    situations.append(element("h3", "text-sm font-semibold text-foreground", "Kādās mācību situācijās var palīdzēt"));
    appendList(situations, resource.situations);
    content.append(situations);

    const actions = element("div", "flex flex-wrap items-center gap-3 border-t border-border pt-4");
    if (resource.productPage) {
      const linkLabels = { product: "Ražotāja informācija", category: "Skatīt risinājumu kategoriju", resource: "Papildu informācija" };
      const link = element("a", "inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90", linkLabels[resource.productLinkType] || "Papildu informācija");
      link.href = resource.productPage;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      actions.append(link);
    } else {
      actions.append(element("p", "text-sm text-muted-foreground", "Saite: Informācija tiks papildināta"));
    }
    const closeButton = element("button", "inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-secondary", "Aizvērt");
    closeButton.type = "button";
    actions.append(closeButton);
    content.append(actions);
    panel.append(content);
    overlay.append(panel);

    const close = () => {
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      if (lastTrigger && typeof lastTrigger.focus === "function") lastTrigger.focus();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };
    closeButton.addEventListener("click", close);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    document.addEventListener("keydown", onKeyDown);
    document.body.append(overlay);
    closeButton.focus();
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-catalog-open]") : null;
    if (!target) return;
    const resource = byId[target.getAttribute("data-catalog-open")];
    window.setTimeout(() => {
      if (!document.querySelector('[role="dialog"]')) openFallback(resource, target);
    }, 0);
  });
})();
`;
}

async function main() {
  const records = JSON.parse(await fs.readFile(registerPath, "utf8"));
  if (records.length !== 106) throw new Error(`Attēlu reģistrā ir ${records.length}, nevis 106 ieraksti.`);
  for (const record of records) {
    if (!record.product_page?.startsWith("https://")) throw new Error(`Nederīga produkta saite ierakstam ${record.id}`);
    if (!record.link_type) throw new Error(`Nav saites tipa ierakstam ${record.id}`);
  }

  const [bundle, html] = await Promise.all([
    fs.readFile(bundlePath, "utf8"),
    fs.readFile(indexPath, "utf8"),
  ]);
  const patchedBundle = patchBundle(bundle, records);
  const resources = extractResources(patchedBundle);
  const patchedHtml = ensureFallbackScript(patchStaticHtml(html, records));
  await Promise.all([
    fs.writeFile(bundlePath, patchedBundle, "utf8"),
    fs.writeFile(indexPath, patchedHtml, "utf8"),
    fs.writeFile(fallbackPath, buildFallbackScript(resources), "utf8"),
  ]);
  console.log("Produktu saites, attēli un pogas pievienotas 106 kartītēm; lokālā faila rezerves darbība atjaunota.");
}

await main();
