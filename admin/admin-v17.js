import {
  CatalogConflictError,
  applyDraftForDisplay,
  catalogSyncInternals,
  createUpdateChange,
  partitionCatalogChanges,
  resolveCatalogChange,
  withOneConflictRetry,
} from "./catalog-sync.js?v=17";

const { clone, same } = catalogSyncInternals;
const repository = { owner: "VIAA-atk", name: "AT-katalogs", branch: "main", catalogPath: "data/catalog.json" };
const browserDraftKey = "viaa-atk-admin-draft-v16";
// Keep the storage key and payload version so existing v16 drafts can be recovered.
const options = {
  areas: {
    lasisana: "Lasīšana", rakstisana: "Rakstīšana", matematika: "Matemātika", komunikacija: "Komunikācija",
    organizesana: "Uzmanība, atmiņa un organizēšana", vide: "Piekļuve videi un tehnoloģijām",
  },
  needs: {
    tts: "Teksta priekšā lasīšana", vizualaPielagosana: "Teksta vizuāla pielāgošana", ocr: "Drukāta teksta digitalizēšana",
    stt: "Runas pārvēršana tekstā", rakstisanaAtbalsts: "Rakstīšanas un pareizrakstības atbalsts",
    organizesanaAtbalsts: "Darba organizēšanas atbalsts", simboli: "Simboli un vizuālais atbalsts",
    aac: "Alternatīvs saziņas veids", "ierices Vadiba": "Pielāgota ierīces vadība", matematikaAtbalsts: "Matemātikas uzdevumu atbalsts",
  },
  types: {
    ierice: "Ierīce", programmatura: "Programmatūra vai lietotne", iebuveta: "Iebūvēta piekļūstamības funkcija",
    bezmaksas: "Bezmaksas digitālais rīks", metodiskais: "Metodiskais materiāls vai pamācība",
    materials: "Mācību materiāls", piederums: "Pielāgots piederums",
    atFonds: "AT Fonds (Projekta numurs 4.2.1.2/1/25/I/001, sadarbības partneriem)",
    citsValstsAtbalsts: "Citu valsts atbalsta sistēmu resurss (VTPC, LNB, LNS)",
  },
};

const ui = Object.fromEntries([...document.querySelectorAll("[id]")].map((element) => [element.id, element]));
let token = "";
let resources = [];
let syncedResources = [];
let baseCommitSha = "";
let catalogBlobSha = "";
let connectedLogin = "";
let selectedId = null;
let newRecord = false;
let idTouched = false;
let dirty = false;
let formDirty = false;
let busy = false;
let savingDraft = false;
let draggedId = null;
let previewUrl = null;
let orderDraft = null;
let browserDraftTimer = null;
let formBase = null;
let formBaseUnverified = false;
const touchedFields = new Set();
const recordChanges = new Map();
const recordConflicts = new Map();
const pendingImages = new Map();
const missingPendingImages = new Set();

class GitHubRequestError extends Error {
  constructor(status, detail = "") {
    super(`GitHub HTTP ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "GitHubRequestError";
    this.status = status;
  }
}

function setStatus(message, type = "", target = ui["app-status"]) {
  target.textContent = message;
  target.classList.toggle("error", type === "error");
  target.classList.toggle("success", type === "success");
  target.hidden = !message;
}

function setBusy(value) {
  busy = value;
  ui.publish.disabled = value || (!dirty && !formDirty);
  ui.disconnect.disabled = value;
  ui["new-record"].disabled = value;
  ui["editor-fields"].disabled = value || (!selectedId && !newRecord);
  ui["delete-record"].disabled = value;
  updateDraftState();
  renderConflicts();
  updateOrderControls();
}

function hasDraftChanges() {
  return recordChanges.size > 0 || Boolean(orderDraft?.operations.length) || pendingImages.size > 0;
}

function updateDraftState() {
  dirty = hasDraftChanges();
  if (formDirty) ui["draft-status"].textContent = "Ir nesaglabātas izmaiņas ierakstā";
  else if (dirty) ui["draft-status"].textContent = "Ir nepublicētas izmaiņas";
  else ui["draft-status"].textContent = "Nav nepublicētu izmaiņu";
  ui["draft-status"].classList.toggle("error", dirty || formDirty);
  ui.publish.disabled = busy || (!dirty && !formDirty);
  ui["publish-record"].disabled = busy || (!formDirty && !recordChanges.has(selectedId));
  updateOrderControls();
}

function markDirty() {
  updateDraftState();
  persistBrowserDraft();
}

function markClean() {
  formDirty = false;
  touchedFields.clear();
  updateDraftState();
}

async function github(path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const responseText = await response.text();
    let detail = responseText;
    try { detail = JSON.parse(responseText).message ?? responseText; } catch { /* Atbilde nav JSON. */ }
    throw new GitHubRequestError(response.status, detail);
  }
  return response.status === 204 ? null : response.json();
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function textToBase64(value) {
  return bytesToBase64(new TextEncoder().encode(value));
}

function base64ToText(value) {
  const compact = value.replaceAll(/\s/g, "");
  const binary = atob(compact);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function validateRemoteCatalog(value) {
  if (!Array.isArray(value)) throw new Error("GitHub kataloga datne nav ierakstu masīvs.");
  const ids = new Set();
  for (const resource of value) {
    if (!resource?.id || ids.has(resource.id)) throw new Error("GitHub kataloga datnē ir tukšs vai atkārtots identifikators.");
    ids.add(resource.id);
  }
  return value;
}

async function loadRemoteCatalog() {
  const repoPath = `/repos/${repository.owner}/${repository.name}`;
  const ref = await github(`${repoPath}/git/ref/heads/${repository.branch}`);
  const headSha = ref.object.sha;
  const [contents, commit] = await Promise.all([
    github(`${repoPath}/contents/${repository.catalogPath}?ref=${encodeURIComponent(headSha)}`),
    github(`${repoPath}/git/commits/${headSha}`),
  ]);
  const latestResources = validateRemoteCatalog(JSON.parse(base64ToText(contents.content)));
  return {
    resources: latestResources,
    headSha,
    treeSha: commit.tree.sha,
    catalogSha: contents.sha,
  };
}

async function fetchContentSha(path, ref) {
  const repoPath = `/repos/${repository.owner}/${repository.name}`;
  try {
    const contents = await github(`${repoPath}/contents/${path}?ref=${encodeURIComponent(ref)}`);
    return contents.sha;
  } catch (error) {
    if (error instanceof GitHubRequestError && error.status === 404) return null;
    throw error;
  }
}

function setRemoteState(remote) {
  syncedResources = clone(remote.resources);
  baseCommitSha = remote.headSha;
  catalogBlobSha = remote.catalogSha;
  if (connectedLogin) {
    ui["connection-info"].textContent = `Savienots kā ${connectedLogin}; ${remote.resources.length} ieraksti; zars ${repository.branch}; datu SHA ${catalogBlobSha.slice(0, 7)}; paneļa versija 17.`;
  }
}

function slug(value) {
  return value.normalize("NFD").replaceAll(/[\u0300-\u036f]/g, "").toLocaleLowerCase("lv")
    .replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-+|-+$/g, "").slice(0, 160) || "jauns-ieraksts";
}

function lines(value) {
  return [...new Set(value.split("\n").map((item) => item.trim()).filter(Boolean))];
}

function selectedValues(container) {
  return [...container.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
}

const inputFields = {
  "field-name": "name",
  "field-id": "id",
  "field-level": "level",
  "field-type": "type",
  "field-latvian": "latvian",
  "field-short": "short",
  "field-what-is": "whatIs",
  "field-functions": "functions",
  "field-acquisition": "acquisition",
  "field-product-page": "productPage",
  "field-link-type": "productLinkType",
  "field-image-file": "image",
  "field-image-alt": "imageAlt",
  "field-image-source": "imageSource",
  "field-image-rights": "imageRightsNote",
};

function fieldForInput(target) {
  if (inputFields[target.id]) return inputFields[target.id];
  if (target.closest?.("#field-areas")) return "areas";
  if (target.closest?.("#field-needs")) return "needs";
  return null;
}

function currentResource() {
  return newRecord ? null : resources.find((resource) => resource.id === selectedId) ?? null;
}

function resourceFromForm(original = currentResource(), image = original?.image ?? "assets/images/catalog/catalog-placeholder.svg") {
  return {
    ...(original ?? {}),
    id: ui["field-id"].value.trim(),
    name: ui["field-name"].value.trim(),
    short: ui["field-short"].value.trim(),
    areas: selectedValues(ui["field-areas"]),
    needs: selectedValues(ui["field-needs"]),
    type: ui["field-type"].value,
    level: ui["field-level"].value,
    latvian: ui["field-latvian"].value.trim(),
    whatIs: ui["field-what-is"].value.trim(),
    functions: lines(ui["field-functions"].value),
    acquisition: lines(ui["field-acquisition"].value),
    image,
    imageAlt: ui["field-image-alt"].value.trim(),
    imageSource: ui["field-image-source"].value.trim(),
    imageRightsNote: ui["field-image-rights"].value.trim(),
    productPage: ui["field-product-page"].value.trim(),
    productLinkType: ui["field-link-type"].value,
  };
}

function imageFileMetadata(file) {
  const byMime = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const nameExtension = file.name.split(".").pop()?.toLocaleLowerCase("en-US");
  const extension = byMime[file.type] ?? (nameExtension === "jpeg" ? "jpg" : nameExtension);
  if (!new Set(["jpg", "png", "webp"]).has(extension)) throw new Error("Atļauti tikai JPG, PNG vai WebP attēli.");
  return { extension, mime: extension === "jpg" ? "image/jpeg" : `image/${extension}` };
}

function captureFormSnapshot() {
  if (!formDirty || (!selectedId && !newRecord)) return null;
  const file = ui["field-image-file"].files[0];
  let resource = resourceFromForm();
  if (file) {
    try {
      const { extension } = imageFileMetadata(file);
      resource = { ...resource, image: `assets/images/catalog/${resource.id}.${extension}` };
    } catch {
      resource = { ...resource, image: `assets/images/catalog/${resource.id}.pending` };
    }
  }
  return {
    selectedId,
    newRecord,
    idTouched,
    touchedFields: [...touchedFields],
    base: clone(formBase),
    baseUnverified: formBaseUnverified,
    resource,
    imageMustBeSelectedAgain: Boolean(file),
  };
}

function writeBrowserDraft() {
  if (browserDraftTimer) clearTimeout(browserDraftTimer);
  browserDraftTimer = null;
  try {
    if (!dirty && !formDirty) {
      sessionStorage.removeItem(browserDraftKey);
      return true;
    }
    const payload = {
      version: 1,
      repository: `${repository.owner}/${repository.name}`,
      savedAt: new Date().toISOString(),
      changes: [...recordChanges.values()],
      orderDraft,
      selectedId,
      pendingImagePaths: [...new Set([...pendingImages.keys(), ...missingPendingImages])],
      form: captureFormSnapshot(),
    };
    sessionStorage.setItem(browserDraftKey, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function persistBrowserDraft(immediate = false) {
  if (immediate) return writeBrowserDraft();
  if (browserDraftTimer) clearTimeout(browserDraftTimer);
  browserDraftTimer = setTimeout(writeBrowserDraft, 250);
  return true;
}

function clearBrowserDraft() {
  if (browserDraftTimer) clearTimeout(browserDraftTimer);
  browserDraftTimer = null;
  try { sessionStorage.removeItem(browserDraftKey); } catch { /* Pārlūka krātuve var būt bloķēta. */ }
}

function readBrowserDraft() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(browserDraftKey) || "null");
    if (parsed?.version !== 1 || parsed.repository !== `${repository.owner}/${repository.name}`) return null;
    return parsed;
  } catch {
    return null;
  }
}

function buildChoices(container, values) {
  container.replaceChildren(...Object.entries(values).map(([value, label]) => {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = value;
    input.name = container.id;
    const wrapper = document.createElement("label");
    wrapper.className = "choice-label";
    wrapper.append(input, document.createTextNode(label));
    return wrapper;
  }));
}

function setChoiceValues(container, values) {
  for (const input of container.querySelectorAll('input[type="checkbox"]')) input.checked = values.includes(input.value);
}

function clearPreviewUrl() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
}

function resetRecordFields() {
  for (const element of ui["record-form"].querySelectorAll("input, select, textarea")) {
    if (element.type === "checkbox" || element.type === "radio") element.checked = element.defaultChecked;
    else if (element.tagName === "SELECT") element.selectedIndex = 0;
    else element.value = element.defaultValue;
  }
}

function setFormValues(resource) {
  ui["field-name"].value = resource.name ?? "";
  ui["field-id"].value = resource.id ?? "";
  ui["field-level"].value = resource.level ?? "videjs";
  ui["field-type"].value = resource.type ?? "programmatura";
  ui["field-latvian"].value = resource.latvian ?? "";
  ui["field-short"].value = resource.short ?? "";
  setChoiceValues(ui["field-areas"], resource.areas ?? []);
  setChoiceValues(ui["field-needs"], resource.needs ?? []);
  ui["field-what-is"].value = resource.whatIs ?? "";
  ui["field-functions"].value = (resource.functions ?? []).join("\n");
  ui["field-acquisition"].value = (resource.acquisition ?? []).join("\n");
  ui["field-product-page"].value = resource.productPage ?? "";
  ui["field-link-type"].value = resource.productLinkType ?? "resource";
  ui["field-image-alt"].value = resource.imageAlt ?? "";
  ui["field-image-source"].value = resource.imageSource ?? "";
  ui["field-image-rights"].value = resource.imageRightsNote ?? "";
}

function showRecord(resource) {
  clearPreviewUrl();
  setStatus("", "", ui["editor-status"]);
  formDirty = false;
  touchedFields.clear();
  newRecord = false;
  idTouched = true;
  selectedId = resource.id;
  formBase = clone(resource);
  formBaseUnverified = false;
  ui["editor-title"].textContent = `Labot: ${resource.name}`;
  ui["delete-record"].hidden = false;
  ui["editor-fields"].disabled = busy;
  ui["field-id"].disabled = true;
  setFormValues(resource);
  ui["field-image-file"].value = "";
  const pendingImage = pendingImages.get(resource.image);
  ui["image-preview"].src = pendingImage ? `data:${pendingImage.mime};base64,${pendingImage.content}` : `../${resource.image}`;
  renderList();
  updateDraftState();
  renderConflicts();
  ui["field-name"].focus();
}

function blankRecord() {
  clearPreviewUrl();
  setStatus("", "", ui["editor-status"]);
  formDirty = false;
  touchedFields.clear();
  newRecord = true;
  idTouched = false;
  selectedId = null;
  formBase = null;
  formBaseUnverified = false;
  resetRecordFields();
  ui["editor-title"].textContent = "Pievienot jaunu ierakstu";
  ui["delete-record"].hidden = true;
  ui["editor-fields"].disabled = busy;
  ui["field-id"].disabled = false;
  ui["field-level"].value = "videjs";
  ui["field-type"].value = "programmatura";
  ui["field-link-type"].value = "resource";
  ui["field-latvian"].value = "Informācija tiks papildināta";
  ui["field-image-rights"].value = "Attēla izmantošanas tiesības jāpārbauda pirms publicēšanas.";
  ui["image-preview"].src = "../assets/images/catalog/catalog-placeholder.svg";
  for (const input of document.querySelectorAll('#field-areas input, #field-needs input')) input.checked = false;
  renderList();
  updateDraftState();
  renderConflicts();
  ui["field-name"].focus();
}

function clearDropIndicators() {
  for (const item of ui["record-list"].querySelectorAll(".drop-before, .drop-after, .dragging")) {
    item.classList.remove("drop-before", "drop-after", "dragging");
  }
}

function updateOrderControls() {
  const selectedIndex = resources.findIndex((item) => item.id === selectedId);
  const searchActive = Boolean(ui["record-search"].value.trim());
  const unavailable = busy || formDirty || newRecord || selectedIndex < 0 || searchActive;
  ui["move-up"].disabled = unavailable || selectedIndex === 0;
  ui["move-down"].disabled = unavailable || selectedIndex === resources.length - 1;
  ui["order-help"].textContent = formDirty
    ? "Pirms secības maiņas saglabā pašreizējā ieraksta melnrakstu."
    : searchActive
      ? "Notīri meklēšanas lauku, lai mainītu visu ierakstu secību."
      : "Izvēlies ierakstu un pārvieto to ar pogām vai satver aiz ikonas ☰.";
}

function reorderResource(sourceId, targetId, placeAfter) {
  if (sourceId === targetId) return false;
  const sourceIndex = resources.findIndex((item) => item.id === sourceId);
  const targetIndex = resources.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return false;

  const previousOrder = resources.map((item) => item.id).join("\n");
  const [moved] = resources.splice(sourceIndex, 1);
  const updatedTargetIndex = resources.findIndex((item) => item.id === targetId);
  resources.splice(updatedTargetIndex + (placeAfter ? 1 : 0), 0, moved);
  if (resources.map((item) => item.id).join("\n") === previousOrder) return false;

  if (!orderDraft) orderDraft = { baseOrder: syncedResources.map((item) => item.id), operations: [] };
  orderDraft.operations.push({ sourceId, targetId, placeAfter });
  const baseIds = new Set(orderDraft.baseOrder);
  const currentBaseOrder = resources.map((item) => item.id).filter((id) => baseIds.has(id));
  const expectedBaseOrder = orderDraft.baseOrder.filter((id) => currentBaseOrder.includes(id));
  if (same(currentBaseOrder, expectedBaseOrder)) orderDraft = null;

  markDirty();
  renderList();
  const newIndex = resources.findIndex((item) => item.id === sourceId);
  setStatus(`Ieraksts “${moved.name}” pārvietots uz ${newIndex + 1}. vietu un saglabāts melnrakstā. Lai secību saglabātu catalog.json, nospied “Publicēt izmaiņas”.`, "success");
  return true;
}

function moveSelected(direction) {
  if (busy || formDirty || newRecord || ui["record-search"].value.trim()) return;
  const sourceIndex = resources.findIndex((item) => item.id === selectedId);
  const target = resources[sourceIndex + direction];
  if (!target) return;
  reorderResource(selectedId, target.id, direction > 0);
}

function renderList() {
  const query = ui["record-search"].value.trim().toLocaleLowerCase("lv");
  const filtered = resources.filter((item) => !query || item.name.toLocaleLowerCase("lv").includes(query) || item.short.toLocaleLowerCase("lv").includes(query));
  const canDrag = !query && !busy && !formDirty;
  ui["record-count"].textContent = `Rādīti ${filtered.length} no ${resources.length} ierakstiem`;
  ui["record-list"].replaceChildren(...filtered.map((resource) => {
    const item = document.createElement("li");
    item.className = `record-item${selectedId === resource.id ? " active" : ""}`;
    item.dataset.recordId = resource.id;

    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "☰";
    handle.draggable = canDrag;
    handle.setAttribute("aria-hidden", "true");
    handle.title = canDrag ? `Pārvilkt ierakstu “${resource.name}”` : "Secības maiņai notīri meklēšanas lauku";

    handle.addEventListener("dragstart", (event) => {
      if (!canDrag) {
        event.preventDefault();
        return;
      }
      draggedId = resource.id;
      item.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", resource.id);
    });
    handle.addEventListener("dragend", () => {
      draggedId = null;
      clearDropIndicators();
    });

    item.addEventListener("dragover", (event) => {
      if (!canDrag || !draggedId || draggedId === resource.id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const placeAfter = event.clientY > item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2;
      item.classList.toggle("drop-before", !placeAfter);
      item.classList.toggle("drop-after", placeAfter);
    });
    item.addEventListener("dragleave", (event) => {
      if (!item.contains(event.relatedTarget)) item.classList.remove("drop-before", "drop-after");
    });
    item.addEventListener("drop", (event) => {
      if (!canDrag) return;
      event.preventDefault();
      const sourceId = event.dataTransfer.getData("text/plain") || draggedId;
      const placeAfter = event.clientY > item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2;
      clearDropIndicators();
      draggedId = null;
      reorderResource(sourceId, resource.id, placeAfter);
    });

    const button = document.createElement("button");
    button.type = "button";
    button.className = "record-button";
    const title = document.createElement("strong");
    title.textContent = resource.name;
    const detail = document.createElement("small");
    detail.textContent = `${options.types[resource.type] ?? resource.type} · ${resource.id}`;
    button.append(title, detail);
    if (recordChanges.has(resource.id)) {
      const status = document.createElement("small");
      status.className = recordConflicts.has(resource.id) ? "record-conflict" : "record-draft";
      status.textContent = recordConflicts.has(resource.id) ? "Jāpārskata melnraksts" : "Melnraksts";
      button.append(status);
    }
    button.addEventListener("click", () => openRecord(resource.id));
    item.append(handle, button);
    return item;
  }));
  updateOrderControls();
}

function validateRecord(resource, originalId = null) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(resource.id)) throw new Error("Identifikatorā drīkst būt tikai mazie latīņu burti, cipari un defises.");
  if (!resource.name || !resource.short || !resource.whatIs || !resource.latvian || !resource.imageAlt || !resource.imageRightsNote) throw new Error("Aizpildi visus obligātos teksta laukus.");
  if (!resource.areas.length) throw new Error("Izvēlies vismaz vienu mācību atbalsta jomu.");
  if (!resource.needs.length) throw new Error("Izvēlies vismaz vienu vajadzību/filtru.");
  if (!resource.functions.length || !resource.acquisition.length) throw new Error("Funkciju un iegūšanas sadaļā jābūt vismaz vienai rindai.");
  if (resource.productPage && !resource.productPage.startsWith("https://")) throw new Error("Produkta saitei jāizmanto HTTPS.");
  if (resource.imageSource && !resource.imageSource.startsWith("https://")) throw new Error("Attēla avota saitei jāizmanto HTTPS.");
  if (resources.some((item) => item.id === resource.id && item.id !== originalId)) throw new Error("Šāds identifikators jau tiek izmantots.");
}

async function fileToUpload(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error("Attēls ir lielāks par 8 MB.");
  const { extension, mime } = imageFileMetadata(file);
  return { content: bytesToBase64(new Uint8Array(await file.arrayBuffer())), extension, mime };
}

function changeList() {
  return [...recordChanges.values()];
}

function refreshChangeValues(mergedResources) {
  for (const [id, change] of recordChanges) {
    if (change.kind === "delete") continue;
    const merged = mergedResources.find((resource) => resource.id === id);
    if (merged) recordChanges.set(id, { ...change, value: clone(merged) });
  }
}

const fieldLabels = {
  name: "Nosaukums", short: "Īsais teksts kartītē", areas: "Mācību atbalsta jomas",
  needs: "Vajadzības / filtri", type: "Resursa veids", level: "Tehnoloģiju līmenis",
  latvian: "Latviešu valodas pieejamība", whatIs: "Kas tas ir?", functions: "Funkcijas",
  acquisition: "Kur to var iegūt?", productPage: "Produkta vai informācijas saite",
  productLinkType: "Saites veids", image: "Attēls", imageFile: "Attēla datne",
  imageAlt: "Alternatīvais teksts", imageSource: "Attēla avota saite",
  imageRightsNote: "Attēla izmantošanas tiesību piezīme", record: "Ieraksts",
};

function rememberConflicts(conflicts, checkedIds = [], checkedOrder = false) {
  for (const id of checkedIds) recordConflicts.delete(id);
  if (checkedOrder) recordConflicts.delete("__order__");
  for (const conflict of conflicts) recordConflicts.set(conflict.type === "order" ? "__order__" : conflict.id, conflict);
  renderConflicts();
}

function formatConflictValue(value, field) {
  if (value === undefined || value === null || value === "") return "Nav vērtības";
  if (Array.isArray(value)) return value.map((item) => options[field]?.[item] ?? item).join("\n");
  if (field === "type") return options.types[value] ?? value;
  if (field === "level") return { augsts: "Augsts līmenis", videjs: "Vidējs līmenis", zems: "Zems līmenis" }[value] ?? value;
  return typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
}

function renderConflicts() {
  ui["conflicts-panel"].hidden = !recordConflicts.size;
  ui["conflict-list"].replaceChildren(...[...recordConflicts.values()].map((conflict) => {
    const card = document.createElement("article");
    card.className = "conflict-card";
    card.dataset.recordId = conflict.id ?? "__order__";
    const title = document.createElement("h3");
    title.textContent = conflict.type === "order" ? "Kataloga secība" : conflict.label;
    const message = document.createElement("p");
    message.textContent = conflict.type === "order" ? "Kataloga secība GitHub ir mainīta. Ierakstu saturu var publicēt atsevišķi."
      : conflict.type === "imageMissing" ? "Pēc pārlādes šī ieraksta attēla datne jāizvēlas vēlreiz."
      : conflict.type === "deleted" ? "Šis ieraksts GitHub ir dzēsts. Izvēlies, vai to atjaunot."
      : conflict.type === "delete" ? "GitHub ieraksts ir mainīts kopš dzēšanas melnraksta izveides."
      : conflict.type === "created" ? "GitHub jau ir ieraksts ar šo identifikatoru. Izvēlies atšķirīgo lauku versijas."
      : conflict.type === "unverified" ? "Vecajā formas rezerves kopijā nav sākotnējās versijas. Pārskati norādītos laukus pirms publicēšanas."
      : "Šie lauki melnrakstā un GitHub ir mainīti atšķirīgi. Izvēlies katra lauka versiju.";
    card.append(title, message);

    const change = recordChanges.get(conflict.id);
    if (!["order", "imageMissing"].includes(conflict.type) && change) {
      const details = document.createElement("details");
      details.open = selectedId === conflict.id || !selectedId;
      const summary = document.createElement("summary");
      summary.textContent = "Izvēlēties lauku versijas";
      details.append(summary);
      const fields = conflict.fields ?? ["record"];
      const choices = {};
      const apply = document.createElement("button");
      apply.type = "button";
      apply.className = "button primary";
      apply.textContent = "Saglabāt izvēlētās versijas melnrakstā";
      apply.disabled = true;
      const blocked = busy || savingDraft || (selectedId === conflict.id && formDirty);
      for (const field of fields) {
        const group = document.createElement("fieldset");
        group.className = "conflict-field";
        group.disabled = blocked;
        const legend = document.createElement("legend");
        legend.textContent = fieldLabels[field] ?? field;
        group.append(legend);
        const versions = document.createElement("div");
        versions.className = "conflict-versions";
        for (const [choice, label] of [["mine", "Mana versija"], ["github", "GitHub versija"]]) {
          const wrapper = document.createElement("label");
          const radio = document.createElement("input");
          radio.type = "radio";
          radio.name = `conflict-${conflict.id}-${field}`;
          radio.value = choice;
          radio.addEventListener("change", () => {
            choices[field] = choice;
            apply.disabled = blocked || fields.some((name) => !choices[name]);
          });
          const heading = document.createElement("span");
          heading.textContent = label;
          const value = document.createElement("pre");
          value.textContent = field === "record"
            ? (choice === "mine" ? (change.kind === "delete" ? "Dzēst ierakstu" : "Atjaunot manu ierakstu")
              : (conflict.remote ? "Saglabāt GitHub ierakstu" : "Ieraksts ir dzēsts"))
            : field === "imageFile" ? (choice === "mine" ? "Manis izvēlētā attēla datne" : "GitHub saglabātā attēla datne")
            : formatConflictValue(choice === "mine" ? change.value?.[field] : conflict.remote?.[field], field);
          wrapper.append(radio, heading, value);
          versions.append(wrapper);
        }
        group.append(versions);
        details.append(group);
      }
      apply.addEventListener("click", () => resolveRecordConflict(conflict, clone(change), { ...choices }));
      details.append(apply);
      if (selectedId === conflict.id && formDirty) {
        const help = document.createElement("p");
        help.textContent = "Pirms versiju izvēles saglabā pašreizējā ieraksta labojumus melnrakstā.";
        details.append(help);
      }
      card.append(details);
    }
    const discard = document.createElement("button");
    discard.type = "button";
    discard.className = "button secondary discard-draft";
    discard.textContent = conflict.type === "order" ? "Atmest secības melnrakstu un ielādēt GitHub secību"
      : "Atmest manu melnrakstu un ielādēt GitHub versiju";
    discard.disabled = busy || savingDraft;
    discard.addEventListener("click", () => discardRecordDraft(conflict.type === "order" ? null : conflict.id));
    card.append(discard);
    return card;
  }));
}

function imagePathsForRecord(id) {
  const change = recordChanges.get(id);
  return [...new Set([...pendingImages.keys(), ...missingPendingImages])].filter((path) =>
    pendingImages.get(path)?.recordId === id || change?.value?.image === path || path.startsWith(`assets/images/catalog/${id}.`));
}

function removeRecordDraft(id) {
  for (const path of imagePathsForRecord(id)) {
    pendingImages.delete(path);
    missingPendingImages.delete(path);
  }
  recordChanges.delete(id);
  recordConflicts.delete(id);
}

function refreshDraftDisplay(remote, resetId = null) {
  setRemoteState(remote);
  resources = applyDraftForDisplay(remote.resources, changeList(), orderDraft);
  refreshChangeValues(resources);
  // Refreshing another record must not replace text currently being typed in this form.
  if (selectedId === resetId || (!formDirty && !newRecord)) {
    const selected = resources.find((item) => item.id === selectedId);
    if (selected) showRecord(selected);
    else if (selectedId === resetId && resetId !== null) {
      selectedId = null;
      formDirty = false;
      formBase = null;
      touchedFields.clear();
      resetRecordFields();
      ui["editor-title"].textContent = "Izvēlies ierakstu";
      ui["delete-record"].hidden = true;
      ui["editor-fields"].disabled = true;
    }
  }
  updateDraftState();
  renderList();
  renderConflicts();
}

async function discardRecordDraft(id) {
  if (busy || savingDraft) return;
  setBusy(true);
  try {
    // Do not remove the local backup unless loading the authoritative version succeeds.
    const remote = await loadRemoteCatalog();
    if (id === null) {
      orderDraft = null;
      recordConflicts.delete("__order__");
    } else {
      removeRecordDraft(id);
      if (orderDraft) {
        orderDraft.operations = orderDraft.operations.filter((operation) => operation.sourceId !== id);
        if (!orderDraft.operations.length) orderDraft = null;
      }
    }
    refreshDraftDisplay(remote, id);
    const saved = persistBrowserDraft(true);
    setStatus(saved ? "Izvēlētais melnraksts atmests un ielādēta jaunākā GitHub versija."
      : "Melnraksts atmests panelī, bet pārlūka krātuvi neizdevās atjaunot. Nepārlādē cilni.", saved ? "success" : "error");
  } catch (error) {
    setStatus(`GitHub versiju neizdevās ielādēt. Melnraksts saglabāts. ${error.message}`, "error");
  } finally { setBusy(false); }
}

async function resolveRecordConflict(conflict, expectedChange, choices) {
  if (busy || savingDraft || (selectedId === conflict.id && formDirty)) return;
  setBusy(true);
  try {
    if (!same(recordChanges.get(conflict.id), expectedChange)) throw new Error("Melnraksts ir mainīts. Izvēlies versijas vēlreiz.");
    const remote = await loadRemoteCatalog();
    const latest = remote.resources.find((item) => item.id === conflict.id);
    const checked = partitionCatalogChanges(remote.resources, [expectedChange]);
    const current = checked.conflicts[0];
    const reviewChanged = conflict.type === "image"
      ? await fetchContentSha(conflict.path, remote.headSha) !== conflict.remoteSha
      : current && (current.type !== conflict.type || !same(current.fields, conflict.fields) ||
        (current.fields ?? ["record"]).some((field) => field === "record"
          ? !same(latest, conflict.remote) : !same(latest?.[field], conflict.remote?.[field], field)));
    if (reviewChanged) {
      rememberConflicts(checked.conflicts, [conflict.id]);
      if (conflict.type === "image") recordConflicts.set(conflict.id, { ...conflict, remoteSha: await fetchContentSha(conflict.path, remote.headSha) });
      refreshDraftDisplay(remote);
      setStatus("GitHub versija pa šo laiku mainījusies. Pārskati jaunās vērtības un izvēlies vēlreiz.", "error");
      return;
    }
    let resolved;
    if (conflict.type === "image") {
      if (!["mine", "github"].includes(choices.imageFile)) throw new Error("Izvēlies attēla datnes versiju.");
      if (choices.imageFile === "github") pendingImages.delete(conflict.path);
      else pendingImages.get(conflict.path).baseCommitSha = remote.headSha;
      resolved = expectedChange;
    } else {
      resolved = resolveCatalogChange(expectedChange, latest, choices);
      if (choices.image === "github" || choices.record === "github") {
        for (const path of imagePathsForRecord(conflict.id)) {
          pendingImages.delete(path);
          missingPendingImages.delete(path);
        }
      }
    }
    if (resolved) recordChanges.set(conflict.id, { ...resolved, baseCommitSha: remote.headSha });
    else if (imagePathsForRecord(conflict.id).length && latest) recordChanges.set(conflict.id, { ...createUpdateChange(latest, latest), baseCommitSha: remote.headSha });
    else recordChanges.delete(conflict.id);
    recordConflicts.delete(conflict.id);
    refreshDraftDisplay(remote, conflict.id);
    persistBrowserDraft(true);
    setStatus("Izvēlētās versijas saglabātas melnrakstā. Ierakstu vari publicēt.", "success");
  } catch (error) {
    setStatus(`Versiju izvēli neizdevās saglabāt. ${error.message}`, "error");
  } finally { setBusy(false); }
}

function restoreBrowserDraft(remote) {
  const backup = readBrowserDraft();
  if (!backup || (!backup.changes?.length && !backup.form && !backup.orderDraft?.operations?.length)) return false;
  if (!window.confirm("Atrasts šajā pārlūka cilnē saglabāts nepublicēts melnraksts. Vai to atjaunot?")) {
    clearBrowserDraft();
    return false;
  }

  recordChanges.clear();
  for (const change of backup.changes ?? []) {
    if (change?.id && ["create", "update", "delete"].includes(change.kind)) recordChanges.set(change.id, change);
  }
  orderDraft = backup.orderDraft?.operations?.length ? backup.orderDraft : null;
  missingPendingImages.clear();
  for (const path of backup.pendingImagePaths ?? []) missingPendingImages.add(path);
  resources = applyDraftForDisplay(remote.resources, changeList(), orderDraft);
  selectedId = backup.selectedId ?? null;

  const snapshot = backup.form;
  if (snapshot?.resource) {
    if (snapshot.newRecord) blankRecord();
    else {
      const selected = resources.find((resource) => resource.id === snapshot.selectedId);
      if (selected) showRecord(selected);
      else {
        newRecord = false;
        selectedId = snapshot.selectedId;
        ui["editor-title"].textContent = `Atjaunots melnraksts: ${snapshot.resource.name || snapshot.selectedId}`;
        ui["delete-record"].hidden = true;
        ui["editor-fields"].disabled = false;
      }
    }
    setFormValues(snapshot.resource);
    ui["image-preview"].src = snapshot.resource.image ? `../${snapshot.resource.image}` : "../assets/images/catalog/catalog-placeholder.svg";
    selectedId = snapshot.selectedId;
    newRecord = Boolean(snapshot.newRecord);
    idTouched = Boolean(snapshot.idTouched);
    formBaseUnverified = Boolean(snapshot.baseUnverified || (!snapshot.newRecord && !snapshot.base && !recordChanges.has(snapshot.selectedId)));
    formBase = clone(snapshot.base ?? recordChanges.get(snapshot.selectedId)?.value ?? formBase ?? snapshot.resource);
    ui["field-id"].disabled = !newRecord;
    formDirty = true;
    touchedFields.clear();
    for (const field of snapshot.touchedFields ?? []) touchedFields.add(field);
    if (snapshot.imageMustBeSelectedAgain) missingPendingImages.add(snapshot.resource.image);
  } else {
    const selected = resources.find((resource) => resource.id === selectedId);
    if (selected) showRecord(selected);
    else renderList();
  }
  updateDraftState();
  rememberConflicts(partitionCatalogChanges(remote.resources, changeList(), orderDraft).conflicts, [...recordChanges.keys()], true);
  persistBrowserDraft();
  return true;
}

async function connect(event) {
  event.preventDefault();
  const candidate = ui["github-token"].value.trim();
  if (!candidate) return;
  token = candidate;
  ui["github-token"].value = "";
  ui["auth-form"].querySelector("button").disabled = true;
  setStatus("Pārbauda GitHub piekļuvi un ielādē jaunāko kataloga versiju…", "", ui["auth-status"]);
  try {
    const repoPath = `/repos/${repository.owner}/${repository.name}`;
    const [profile, repoInfo, remote] = await Promise.all([github("/user"), github(repoPath), loadRemoteCatalog()]);
    if (!repoInfo.permissions?.push) throw new Error("Šim GitHub lietotājam nav rakstīšanas tiesību repozitorijā.");
    connectedLogin = profile.login;
    recordChanges.clear();
    recordConflicts.clear();
    renderConflicts();
    pendingImages.clear();
    missingPendingImages.clear();
    orderDraft = null;
    resources = clone(remote.resources);
    setRemoteState(remote);
    ui["auth-panel"].hidden = true;
    ui["admin-app"].hidden = false;
    markClean();
    renderList();
    const restored = restoreBrowserDraft(remote);
    setStatus(restored ? "Nepublicētais melnraksts atjaunots no šīs pārlūka cilnes. Pirms publicēšanas tas tiks droši apvienots ar GitHub jaunāko versiju." : "", restored ? "success" : "");
  } catch (error) {
    token = "";
    connectedLogin = "";
    setStatus(`Savienojums neizdevās. ${error.message}`, "error", ui["auth-status"]);
  } finally {
    ui["auth-form"].querySelector("button").disabled = false;
  }
}

function disconnect() {
  if ((dirty || formDirty) && !window.confirm("Ir nepublicētas izmaiņas. Vai tiešām tās atmest un atvienoties?")) return;
  token = "";
  connectedLogin = "";
  resources = [];
  syncedResources = [];
  baseCommitSha = "";
  catalogBlobSha = "";
  selectedId = null;
  newRecord = false;
  recordChanges.clear();
  recordConflicts.clear();
  renderConflicts();
  formBase = null;
  orderDraft = null;
  pendingImages.clear();
  missingPendingImages.clear();
  clearBrowserDraft();
  markClean();
  ui["admin-app"].hidden = true;
  ui["auth-panel"].hidden = false;
  setStatus("Atvienots. Tokens no cilnes atmiņas ir noņemts.", "success", ui["auth-status"]);
}

function updateRecordChange(original, resource, wasNew, originalId) {
  const existing = recordChanges.get(originalId || resource.id);
  if (wasNew || existing?.kind === "create") {
    recordChanges.delete(originalId);
    recordChanges.set(resource.id, {
      kind: "create",
      id: resource.id,
      value: clone(resource),
      baseCommitSha: existing?.baseCommitSha ?? baseCommitSha,
    });
    return;
  }

  const base = existing?.base ?? formBase ?? original;
  const patch = clone(existing?.patch ?? {});
  const fields = touchedFields;
  for (const field of fields) {
    if (!formBaseUnverified && same(base?.[field], resource[field], field)) delete patch[field];
    else patch[field] = clone(resource[field]);
  }
  if (!Object.keys(patch).length && !pendingImages.has(resource.image) && !missingPendingImages.has(resource.image)) {
    recordChanges.delete(originalId);
  } else {
    recordChanges.set(originalId, {
      kind: "update",
      id: originalId,
      base: clone(base),
      patch,
      unverifiedFields: [...new Set([...(existing?.unverifiedFields ?? []), ...(formBaseUnverified ? touchedFields : [])])]
        .filter((field) => Object.hasOwn(patch, field)),
      value: clone(resource),
      baseCommitSha: existing?.baseCommitSha ?? baseCommitSha,
    });
  }
}

async function saveDraft() {
  if (savingDraft || busy || (!selectedId && !newRecord)) return false;
  savingDraft = true;
  setBusy(true);
  const saveLabel = ui["save-draft"].textContent;
  ui["save-draft"].disabled = true;
  ui["save-draft"].textContent = "Saglabā…";
  ui["editor-fields"].disabled = true;
  setStatus("Ielādē jaunāko GitHub versiju un saglabā tikai šī ieraksta izmaiņas melnrakstā…", "", ui["editor-status"]);
  const wasNew = newRecord;
  const originalId = wasNew ? null : selectedId;
  const original = wasNew ? null : resources.find((item) => item.id === originalId);
  const id = ui["field-id"].value.trim();
  const file = ui["field-image-file"].files[0];
  let image = original?.image ?? "assets/images/catalog/catalog-placeholder.svg";
  let preparedImage = null;
  let storedLocally = false;
  try {
    if (file) {
      const upload = await fileToUpload(file);
      image = `assets/images/catalog/${id}.${upload.extension}`;
      const existing = recordChanges.get(originalId || id);
      preparedImage = {
        path: image,
        ...upload,
        baseCommitSha: existing?.baseCommitSha ?? baseCommitSha,
        recordName: ui["field-name"].value.trim() || id,
        recordId: id,
      };
    }

    const resource = resourceFromForm(original, image);
    validateRecord(resource, originalId);
    if (preparedImage) {
      for (const path of [...pendingImages.keys(), ...missingPendingImages]) {
        if (path.startsWith(`assets/images/catalog/${id}.`)) {
          pendingImages.delete(path);
          missingPendingImages.delete(path);
        }
      }
      const { path, ...upload } = preparedImage;
      pendingImages.set(path, upload);
    }
    updateRecordChange(original, resource, wasNew, originalId);
    if (wasNew) resources.push(resource);
    else resources[resources.findIndex((item) => item.id === originalId)] = resource;
    selectedId = resource.id;
    newRecord = false;
    formDirty = false;
    touchedFields.clear();
    storedLocally = true;
    markDirty();
    persistBrowserDraft(true);

    const remote = await loadRemoteCatalog();
    const change = recordChanges.get(resource.id);
    const checked = partitionCatalogChanges(remote.resources, change ? [change] : []);
    setRemoteState(remote);
    resources = applyDraftForDisplay(remote.resources, changeList(), orderDraft);
    refreshChangeValues(resources);
    rememberConflicts(checked.conflicts, [resource.id]);
    const selected = resources.find((item) => item.id === resource.id);
    if (selected) showRecord(selected);
    ui["field-image-file"].value = "";
    setStatus(checked.conflicts.length
      ? "Melnraksts saglabāts. Izvēlies lauku versijas pārskatīšanas sadaļā. Vari turpināt darbu ar citiem ierakstiem."
      : "Ieraksts saglabāts melnrakstā. Vari publicēt šo ierakstu vai visas droši apvienojamās izmaiņas.", checked.conflicts.length ? "error" : "success", ui["editor-status"]);
    persistBrowserDraft(true);
    return true;
  } catch (error) {
    if (storedLocally) {
      formDirty = false;
      touchedFields.clear();
      updateDraftState();
      const backedUp = persistBrowserDraft(true);
      const backupText = backedUp ? "Ievadītais teksts ir saglabāts šīs pārlūka cilnes melnrakstā." : "Ievadītais teksts joprojām ir redzams formā; nepārlādē cilni.";
      const prefix = error instanceof CatalogConflictError ? "Konflikts ar GitHub datiem." : "GitHub jaunāko versiju neizdevās pārbaudīt.";
      setStatus(`${prefix} ${error.message} Citu lietotāju izmaiņas nav pārrakstītas. ${backupText}`, "error", ui["editor-status"]);
    } else {
      formDirty = true;
      updateDraftState();
      persistBrowserDraft(true);
      setStatus(`Melnrakstu neizdevās saglabāt. ${error.message}`, "error", ui["editor-status"]);
    }
    return storedLocally;
  } finally {
    savingDraft = false;
    setBusy(false);
    ui["save-draft"].disabled = false;
    ui["save-draft"].textContent = saveLabel;
    ui["editor-fields"].disabled = busy || (!selectedId && !newRecord);
  }
}

function deleteRecord() {
  if (busy || savingDraft) return;
  const record = resources.find((item) => item.id === selectedId);
  if (!record || !window.confirm(`Vai tiešām dzēst ierakstu “${record.name}”? Dzēšanu varēs atjaunot no GitHub commit vēstures.`)) return;
  const existing = recordChanges.get(record.id);
  recordConflicts.delete(record.id);
  if (existing?.kind === "create") recordChanges.delete(record.id);
  else {
    recordChanges.set(record.id, {
      kind: "delete",
      id: record.id,
      base: clone(existing?.base ?? syncedResources.find((item) => item.id === record.id) ?? record),
      baseCommitSha: existing?.baseCommitSha ?? baseCommitSha,
    });
  }
  resources = resources.filter((item) => item.id !== selectedId);
  pendingImages.delete(record.image);
  missingPendingImages.delete(record.image);
  if (orderDraft) {
    orderDraft.operations = orderDraft.operations.filter((operation) => operation.sourceId !== record.id && operation.targetId !== record.id);
    if (!orderDraft.operations.length) orderDraft = null;
  }
  selectedId = null;
  formDirty = false;
  touchedFields.clear();
  resetRecordFields();
  ui["editor-title"].textContent = "Izvēlies ierakstu";
  ui["delete-record"].hidden = true;
  ui["editor-fields"].disabled = true;
  markDirty();
  renderList();
  setStatus(`Ieraksts “${record.name}” dzēsts melnrakstā. Dzēšana vēl nav publicēta.`, "success");
}

async function createImageTreeEntries(remote, uploads) {
  const repoPath = `/repos/${repository.owner}/${repository.name}`;
  const entries = [];
  for (const [path, upload] of uploads) {
    const imageBlob = await github(`${repoPath}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: upload.content, encoding: "base64" }),
    });
    const [baseSha, latestSha] = await Promise.all([
      fetchContentSha(path, upload.baseCommitSha),
      fetchContentSha(path, remote.headSha),
    ]);
    if (latestSha !== baseSha && latestSha !== imageBlob.sha) {
      throw new CatalogConflictError([{
        type: "image",
        id: upload.recordId,
        label: upload.recordName || path,
        fields: ["imageFile"],
        path,
        remoteSha: latestSha,
      }]);
    }
    entries.push({ path, mode: "100644", type: "blob", sha: imageBlob.sha });
  }
  return entries;
}

async function preparePublication(remote, changes, publishOrderDraft, uploads) {
  const checked = partitionCatalogChanges(remote.resources, changes);
  const conflicts = [...checked.conflicts];
  const ready = [];
  const imageEntries = [];
  for (const change of checked.acceptedChanges) {
    const paths = imagePathsForRecord(change.id);
    if (paths.some((path) => missingPendingImages.has(path))) {
      conflicts.push({ type: "imageMissing", id: change.id, label: change.value?.name ?? change.base?.name ?? change.id });
      continue;
    }
    try {
      const entries = await createImageTreeEntries(remote, uploads.filter(([path]) => paths.includes(path)));
      imageEntries.push(...entries);
      ready.push(change);
    } catch (error) {
      if (!(error instanceof CatalogConflictError)) throw error;
      conflicts.push(...error.conflicts);
    }
  }
  const merged = partitionCatalogChanges(remote.resources, ready, publishOrderDraft);
  return { ...merged, conflicts: [...conflicts, ...merged.conflicts], imageEntries };
}

async function publish(onlySelected = false) {
  if (busy || savingDraft || (!dirty && !formDirty)) return;
  if (formDirty && !(await saveDraft())) return;
  if (!dirty) return;
  const changes = changeList().filter((change) => !onlySelected || change.id === selectedId).map(clone);
  const publishOrderDraft = onlySelected ? null : clone(orderDraft);
  if (!changes.length && !publishOrderDraft) return;
  if (!window.confirm(onlySelected ? "Publicēt šī ieraksta melnrakstu GitHub?"
    : "Publicēt droši apvienojamos melnrakstus GitHub? Ieraksti ar neatrisinātu konfliktu paliks melnrakstā.")) return;

  setBusy(true);
  const repoPath = `/repos/${repository.owner}/${repository.name}`;
  const uploads = [...pendingImages.entries()].map(([path, upload]) => [path, { ...upload }]);
  try {
    const result = await withOneConflictRetry(async (attempt) => {
      setStatus(attempt
        ? "GitHub versija pa šo laiku mainījās. Vēlreiz ielādē jaunāko datni, atkārtoti apvieno tikai šīs cilnes izmaiņas un mēģina publicēt otro reizi…"
        : "Ielādē jaunāko GitHub datni un SHA, apvieno tikai šīs cilnes izmaiņas un gatavo atomāru commitu…");
      const remote = await loadRemoteCatalog();
      const prepared = await preparePublication(remote, changes, publishOrderDraft, uploads);
      const merged = prepared.resources;
      if ((!prepared.acceptedChanges.length && !prepared.orderApplied) ||
          (same(merged, remote.resources) && !prepared.imageEntries.length)) {
        return { ...prepared, remote, merged, commit: null };
      }
      const catalogText = `${JSON.stringify(merged, null, 2)}\n`;
      const catalogBlob = await github(`${repoPath}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: textToBase64(catalogText), encoding: "base64" }),
      });
      const tree = [{ path: repository.catalogPath, mode: "100644", type: "blob", sha: catalogBlob.sha }, ...prepared.imageEntries];
      const newTree = await github(`${repoPath}/git/trees`, {
        method: "POST",
        body: JSON.stringify({ base_tree: remote.treeSha, tree }),
      });
      const commit = await github(`${repoPath}/git/commits`, {
        method: "POST",
        body: JSON.stringify({
          message: "Atjaunināti kataloga ieraksti administratora panelī",
          tree: newTree.sha,
          parents: [remote.headSha],
        }),
      });
      const currentRef = await github(`${repoPath}/git/ref/heads/${repository.branch}`);
      if (currentRef.object.sha !== remote.headSha) {
        throw new GitHubRequestError(409, "Zara SHA vairs neatbilst tikko ielādētajai versijai");
      }
      await github(`${repoPath}/git/refs/heads/${repository.branch}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
      return { ...prepared, remote, merged, catalogBlob, newTree, commit };
    });

    for (const change of result.acceptedChanges) removeRecordDraft(change.id);
    if (result.orderApplied) orderDraft = null;
    rememberConflicts(result.conflicts, changes.map((change) => change.id), Boolean(publishOrderDraft));
    const publishedRemote = result.commit ? {
      resources: result.merged, headSha: result.commit.sha, treeSha: result.newTree.sha, catalogSha: result.catalogBlob.sha,
    } : result.remote;
    refreshDraftDisplay(publishedRemote);
    // Remove acknowledged drafts before the follow-up network request, even if that request fails.
    const persisted = persistBrowserDraft(true);
    try {
      const refreshed = await loadRemoteCatalog();
      setRemoteState(refreshed);
      refreshDraftDisplay(refreshed);
    } catch {
      // The confirmed commit above remains the valid baseline if a refresh is unavailable.
    }
    persistBrowserDraft(true);
    const published = result.acceptedChanges.length || result.orderApplied;
    const message = result.commit ? `Izmaiņas publicētas GitHub commitā ${result.commit.sha.slice(0, 7)}. Publicētie melnraksti izdzēsti.`
      : published ? "Izvēlētās izmaiņas jau ir GitHub. Atbilstošie melnraksti izdzēsti."
      : "Šiem melnrakstiem nepieciešama versiju izvēle vai attēla atkārtota pievienošana.";
    setStatus(`${message}${result.conflicts.length ? " Pārējie melnraksti saglabāti; tos vari atrisināt zemāk." : ""}${!persisted ? " Pārlūka krātuvi neizdevās atjaunot; nepārlādē cilni." : ""}`, published ? "success" : "error");
  } catch (error) {
    const backedUp = persistBrowserDraft(true);
    const conflict = error instanceof CatalogConflictError || error instanceof GitHubRequestError && [409, 422].includes(error.status);
    const backupText = backedUp ? "Ievadītais teksts ir saglabāts šīs pārlūka cilnes melnrakstā." : "Ievadītais teksts paliek formā; nepārlādē cilni.";
    setStatus(`${conflict ? "Publicēšanas konflikts." : "Publicēšana neizdevās."} ${error.message} Citu lietotāju izmaiņas nav pārrakstītas. ${backupText}`, "error");
  } finally {
    setBusy(false);
  }
}

async function openRecord(id) {
  if (busy || savingDraft) return;
  if (formDirty && !(await saveDraft())) return;
  const resource = resources.find((item) => item.id === id);
  if (resource) showRecord(resource);
}

async function startNewRecord() {
  if (busy || savingDraft) return;
  if (formDirty && !(await saveDraft())) return;
  blankRecord();
}

function handleFormChange(event) {
  if (busy || savingDraft || (!selectedId && !newRecord)) return;
  const field = fieldForInput(event.target);
  if (!field) return;
  touchedFields.add(field);
  formDirty = true;
  updateDraftState();
  renderConflicts();
  persistBrowserDraft();
  if (event.target.id !== "field-image-file") {
    setStatus("Ir nesaglabātas izmaiņas šajā ierakstā. Nospied “Saglabāt melnrakstā” vai “Publicēt izmaiņas”.", "", ui["editor-status"]);
  }
}

buildChoices(ui["field-areas"], options.areas);
buildChoices(ui["field-needs"], options.needs);
ui["auth-form"].addEventListener("submit", connect);
ui.disconnect.addEventListener("click", disconnect);
ui.publish.addEventListener("click", () => publish());
ui["publish-record"].addEventListener("click", () => publish(true));
ui["record-search"].addEventListener("input", renderList);
ui["new-record"].addEventListener("click", startNewRecord);
ui["move-up"].addEventListener("click", () => moveSelected(-1));
ui["move-down"].addEventListener("click", () => moveSelected(1));
ui["record-form"].addEventListener("input", handleFormChange);
ui["record-form"].addEventListener("change", handleFormChange);
ui["save-draft"].addEventListener("click", (event) => {
  event.preventDefault();
  saveDraft();
});
ui["delete-record"].addEventListener("click", deleteRecord);
ui["cancel-edit"].addEventListener("click", () => {
  const current = resources.find((item) => item.id === selectedId);
  if (current) showRecord(current);
  else {
    newRecord = false;
    formDirty = false;
    touchedFields.clear();
    resetRecordFields();
    ui["editor-fields"].disabled = true;
    ui["editor-title"].textContent = "Izvēlies ierakstu";
  }
  updateDraftState();
  persistBrowserDraft();
});
ui["field-name"].addEventListener("input", () => {
  if (newRecord && !idTouched) ui["field-id"].value = slug(ui["field-name"].value);
});
ui["field-id"].addEventListener("input", () => { idTouched = true; });
ui["field-image-file"].addEventListener("change", () => {
  clearPreviewUrl();
  const file = ui["field-image-file"].files[0];
  if (file) {
    previewUrl = URL.createObjectURL(file);
    ui["image-preview"].src = previewUrl;
    setStatus(`Izvēlēts attēls “${file.name}”. Nospied “Saglabāt melnrakstā”.`, "success", ui["editor-status"]);
  }
});
ui["image-preview"].addEventListener("error", () => { ui["image-preview"].src = "../assets/images/catalog/catalog-placeholder.svg"; }, { once: true });
window.addEventListener("beforeunload", (event) => {
  if (!dirty && !formDirty) return;
  writeBrowserDraft();
  event.preventDefault();
  event.returnValue = "";
});
