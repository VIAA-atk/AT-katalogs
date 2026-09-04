const labels = {
  areas: {
    lasisana: "Lasīšana", rakstisana: "Rakstīšana", matematika: "Matemātika", komunikacija: "Komunikācija",
    organizesana: "Uzmanība, atmiņa un organizēšana", vide: "Piekļuve videi un tehnoloģijām",
  },
  types: {
    ierice: "Ierīce", programmatura: "Programmatūra vai lietotne", iebuveta: "Iebūvēta piekļūstamības funkcija",
    bezmaksas: "Bezmaksas digitālais rīks", metodiskais: "Metodiskais materiāls vai pamācība",
    materials: "Mācību materiāls", piederums: "Pielāgots piederums",
    atFonds: "AT Fonds (Projekta numurs 4.2.1.2/1/25/I/001, sadarbības partneriem)",
  },
  levels: { augsts: "Augsts līmenis", videjs: "Vidējs līmenis", zems: "Zems līmenis" },
  links: { product: "Ražotāja informācija", category: "Skatīt risinājumu kategoriju", resource: "Papildu informācija", reference: "Papildu informācija" },
};

const elements = {
  area: document.querySelector("#f-area"), need: document.querySelector("#f-need"), type: document.querySelector("#f-type"),
  level: document.querySelector("#f-level"), query: document.querySelector("#f-query"), clear: document.querySelector("#clear-filters"),
  count: document.querySelector("#result-count"), status: document.querySelector("#catalog-status"), grid: document.querySelector("#catalog-grid"),
  modal: document.querySelector("#resource-modal"), panel: document.querySelector("#resource-panel"),
};

let resources = [];
let lastTrigger = null;

function node(tag, options = {}, children = []) {
  const item = document.createElement(tag);
  if (options.className) item.className = options.className;
  if (options.text !== undefined) item.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    if (value !== undefined && value !== null) item.setAttribute(name, String(value));
  }
  for (const child of Array.isArray(children) ? children : [children]) if (child) item.append(child);
  return item;
}

function catalogueImage(resource, modal = false) {
  const image = node("img", {
    className: "h-full w-full bg-secondary",
    attrs: { src: `./${resource.image}`, alt: resource.imageAlt || resource.name, loading: modal ? "eager" : "lazy", decoding: "async" },
  });
  image.style.objectFit = "contain";
  image.addEventListener("error", () => {
    image.src = "./assets/images/catalog/catalog-placeholder.svg";
  }, { once: true });
  return image;
}

function definition(term, value) {
  return node("div", { className: "flex gap-2" }, [
    node("dt", { className: "shrink-0 text-muted-foreground", text: `${term}:` }),
    node("dd", { className: "min-w-0 text-foreground", text: value }),
  ]);
}

function createCard(resource) {
  const openButton = node("button", {
    className: "overflow-hidden border-b border-border bg-secondary",
    attrs: { type: "button", "aria-label": `Atvērt informāciju par ${resource.name}` },
  }, catalogueImage(resource));
  openButton.style.height = "10rem";
  openButton.style.width = "100%";
  openButton.addEventListener("click", () => openModal(resource, openButton));

  const details = node("dl", { className: "mt-auto space-y-1 text-sm" }, [
    definition("Joma", resource.areas.map((area) => labels.areas[area] ?? area).join(", ")),
    definition("Veids", labels.types[resource.type] ?? resource.type),
    definition("Līmenis", labels.levels[resource.level] ?? resource.level),
    definition("Latviešu val.", resource.latvian),
  ]);
  const more = node("button", {
    className: "mt-1 inline-flex min-h-11 items-center justify-center rounded-md border border-primary px-4 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    text: "Uzzināt vairāk", attrs: { type: "button", "aria-label": `Uzzināt vairāk par ${resource.name}` },
  });
  more.addEventListener("click", () => openModal(resource, more));
  return node("li", { className: "flex flex-col overflow-hidden rounded-md border border-border bg-card", attrs: { "data-resource-id": resource.id } }, [
    openButton,
    node("div", { className: "flex flex-1 flex-col gap-3 p-4" }, [
      node("h3", { className: "text-base font-semibold leading-snug text-foreground", text: resource.name }),
      node("p", { className: "text-sm text-muted-foreground", text: resource.short }), details, more,
    ]),
  ]);
}

function section(title, content, list = false) {
  const wrapper = node("div");
  wrapper.append(node("h3", { className: "text-sm font-semibold text-foreground", text: title }));
  if (list) {
    const items = node("ul", { className: "mt-2 list-disc space-y-1 pl-5 text-sm text-foreground" });
    for (const value of content) items.append(node("li", { text: value }));
    wrapper.append(items);
  } else {
    wrapper.append(node("p", { className: "mt-2 text-sm leading-relaxed text-foreground", text: content }));
  }
  return wrapper;
}

function closeModal() {
  elements.modal.hidden = true;
  elements.panel.replaceChildren();
  document.body.style.overflow = "";
  document.removeEventListener("keydown", modalKeydown);
  lastTrigger?.focus();
}

function modalKeydown(event) {
  if (event.key === "Escape") return closeModal();
  if (event.key !== "Tab") return;
  const focusable = [...elements.panel.querySelectorAll("a[href],button:not([disabled])")];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function openModal(resource, trigger) {
  lastTrigger = trigger;
  const close = node("button", {
    className: "inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    text: "Aizvērt", attrs: { type: "button" },
  });
  close.addEventListener("click", closeModal);
  const actions = node("div", { className: "flex flex-wrap items-center gap-3 border-t border-border pt-4" });
  if (resource.productPage) {
    actions.append(node("a", {
      className: "inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      text: labels.links[resource.productLinkType] ?? "Papildu informācija",
      attrs: { href: resource.productPage, target: "_blank", rel: "noopener noreferrer" },
    }));
  }
  actions.append(close);
  const heading = node("div", {}, [
    node("h2", { className: "text-xl font-semibold text-foreground", text: resource.name, attrs: { id: "resource-dialog-title" } }),
    node("p", { className: "mt-1 text-sm text-muted-foreground", text: `${resource.areas.map((area) => labels.areas[area] ?? area).join(", ")} · ${labels.types[resource.type] ?? resource.type} · ${resource.latvian}` }),
  ]);
  const media = node("div", { className: "overflow-hidden rounded-t-md border-b border-border bg-secondary" }, catalogueImage(resource, true));
  media.style.height = "16rem";
  elements.panel.replaceChildren(media, node("div", { className: "space-y-5 p-6" }, [
    heading, section("Kas tas ir?", resource.whatIs), section("Funkcijas", resource.functions, true),
    section("Kur to var iegūt?", resource.acquisition, true), actions,
  ]));
  elements.modal.hidden = false;
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", modalKeydown);
  close.focus();
}

function render() {
  const query = elements.query.value.trim().toLocaleLowerCase("lv");
  const filtered = resources.filter((resource) =>
    (elements.area.value === "all" || resource.areas.includes(elements.area.value)) &&
    (elements.need.value === "all" || resource.needs.includes(elements.need.value)) &&
    (elements.type.value === "all" || resource.type === elements.type.value) &&
    (elements.level.value === "all" || resource.level === elements.level.value) &&
    (!query || resource.name.toLocaleLowerCase("lv").includes(query) || resource.short.toLocaleLowerCase("lv").includes(query))
  );
  elements.count.textContent = `Atrasti ${filtered.length} no ${resources.length} risinājumiem`;
  elements.grid.replaceChildren(...filtered.map(createCard));
  elements.grid.hidden = filtered.length === 0;
  elements.status.hidden = filtered.length !== 0;
  elements.status.textContent = "Pēc izvēlētajiem filtriem nekas netika atrasts. Mēģini notīrīt filtrus.";
}

for (const filter of [elements.area, elements.need, elements.type, elements.level]) filter.addEventListener("change", render);
elements.query.addEventListener("input", render);
elements.clear.addEventListener("click", () => {
  for (const filter of [elements.area, elements.need, elements.type, elements.level]) filter.value = "all";
  elements.query.value = "";
  render();
});
elements.modal.addEventListener("click", (event) => { if (event.target === elements.modal) closeModal(); });

try {
  const response = await fetch("./data/catalog.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  resources = await response.json();
  if (!Array.isArray(resources)) throw new Error("Kataloga datu formāts nav derīgs.");
  render();
} catch (error) {
  elements.count.textContent = "Katalogu neizdevās ielādēt";
  elements.status.hidden = false;
  elements.status.textContent = "Radās kļūda, ielādējot kataloga datus. Lūdzu, mēģiniet vēlreiz vēlāk.";
  console.error("Kataloga ielādes kļūda:", error);
}
