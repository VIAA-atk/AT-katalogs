const repository = { owner: "VIAA-atk", name: "AT-katalogs", branch: "main", catalogPath: "data/catalog.json" };
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
  },
};

const ui = Object.fromEntries([...document.querySelectorAll("[id]")].map((element) => [element.id, element]));
let token = "";
let resources = [];
let baseCommitSha = "";
let baseTreeSha = "";
let selectedId = null;
let newRecord = false;
let idTouched = false;
let dirty = false;
let busy = false;
let previewUrl = null;
const pendingImages = new Map();

function setStatus(message, type = "", target = ui["app-status"]) {
  target.textContent = message;
  target.classList.toggle("error", type === "error");
  target.classList.toggle("success", type === "success");
  target.hidden = !message;
}

function setBusy(value) {
  busy = value;
  ui.publish.disabled = value || !dirty;
  ui.disconnect.disabled = value;
  ui["new-record"].disabled = value;
  ui["editor-fields"].disabled = value || (!selectedId && !newRecord);
}

function markDirty() {
  dirty = true;
  ui["draft-status"].textContent = "Ir nepublicētas izmaiņas";
  ui["draft-status"].classList.add("error");
  ui.publish.disabled = busy;
}

function markClean() {
  dirty = false;
  ui["draft-status"].textContent = "Nav nepublicētu izmaiņu";
  ui["draft-status"].classList.remove("error");
  ui.publish.disabled = true;
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
    let detail = "";
    try { detail = (await response.json()).message ?? ""; } catch { detail = await response.text(); }
    throw new Error(`GitHub HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
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

function showRecord(resource) {
  clearPreviewUrl();
  setStatus("", "", ui["editor-status"]);
  newRecord = false;
  idTouched = true;
  selectedId = resource.id;
  ui["editor-title"].textContent = `Labot: ${resource.name}`;
  ui["delete-record"].hidden = false;
  ui["editor-fields"].disabled = false;
  ui["field-id"].disabled = true;
  ui["field-name"].value = resource.name;
  ui["field-id"].value = resource.id;
  ui["field-level"].value = resource.level;
  ui["field-type"].value = resource.type;
  ui["field-latvian"].value = resource.latvian;
  ui["field-short"].value = resource.short;
  setChoiceValues(ui["field-areas"], resource.areas);
  setChoiceValues(ui["field-needs"], resource.needs);
  ui["field-what-is"].value = resource.whatIs;
  ui["field-functions"].value = resource.functions.join("\n");
  ui["field-acquisition"].value = resource.acquisition.join("\n");
  ui["field-product-page"].value = resource.productPage;
  ui["field-link-type"].value = resource.productLinkType;
  ui["field-image-alt"].value = resource.imageAlt;
  ui["field-image-source"].value = resource.imageSource ?? "";
  ui["field-image-rights"].value = resource.imageRightsNote;
  ui["field-image-file"].value = "";
  const pendingImage = pendingImages.get(resource.image);
  ui["image-preview"].src = pendingImage ? `data:image/webp;base64,${pendingImage}` : `../${resource.image}`;
  renderList();
  ui["field-name"].focus();
}

function blankRecord() {
  clearPreviewUrl();
  setStatus("", "", ui["editor-status"]);
  newRecord = true;
  idTouched = false;
  selectedId = null;
  ui["record-form"].reset();
  ui["editor-title"].textContent = "Pievienot jaunu ierakstu";
  ui["delete-record"].hidden = true;
  ui["editor-fields"].disabled = false;
  ui["field-id"].disabled = false;
  ui["field-level"].value = "videjs";
  ui["field-type"].value = "programmatura";
  ui["field-link-type"].value = "resource";
  ui["field-latvian"].value = "Informācija tiks papildināta";
  ui["field-image-rights"].value = "Attēla izmantošanas tiesības jāpārbauda pirms publicēšanas.";
  ui["image-preview"].src = "../assets/images/catalog/catalog-placeholder.svg";
  for (const input of document.querySelectorAll('#field-areas input, #field-needs input')) input.checked = false;
  renderList();
  ui["field-name"].focus();
}

function renderList() {
  const query = ui["record-search"].value.trim().toLocaleLowerCase("lv");
  const filtered = resources.filter((item) => !query || item.name.toLocaleLowerCase("lv").includes(query) || item.short.toLocaleLowerCase("lv").includes(query));
  ui["record-count"].textContent = `Rādīti ${filtered.length} no ${resources.length} ierakstiem`;
  ui["record-list"].replaceChildren(...filtered.map((resource) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `record-button${selectedId === resource.id ? " active" : ""}`;
    const title = document.createElement("strong");
    title.textContent = resource.name;
    const detail = document.createElement("small");
    detail.textContent = `${options.types[resource.type] ?? resource.type} · ${resource.id}`;
    button.append(title, detail);
    button.addEventListener("click", () => showRecord(resource));
    const item = document.createElement("li");
    item.append(button);
    return item;
  }));
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

async function fileToWebp(file) {
  if (!file.type.startsWith("image/")) throw new Error("Izvēlētais fails nav attēls.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Attēls ir lielāks par 8 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 480;
    const context = canvas.getContext("2d");
    context.fillStyle = "#f7f5f9";
    context.fillRect(0, 0, 720, 480);
    const scale = Math.min(680 / image.naturalWidth, 400 / image.naturalHeight, 1);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (720 - width) / 2, (480 - height) / 2, width, height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Attēlu neizdevās pārveidot.")), "image/webp", 0.82));
    return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function connect(event) {
  event.preventDefault();
  const candidate = ui["github-token"].value.trim();
  if (!candidate) return;
  token = candidate;
  ui["github-token"].value = "";
  ui["auth-form"].querySelector("button").disabled = true;
  setStatus("Pārbauda GitHub piekļuvi…", "", ui["auth-status"]);
  try {
    const repoPath = `/repos/${repository.owner}/${repository.name}`;
    const [profile, repoInfo, ref, contents] = await Promise.all([
      github("/user"), github(repoPath), github(`${repoPath}/git/ref/heads/${repository.branch}`),
      github(`${repoPath}/contents/${repository.catalogPath}?ref=${repository.branch}`),
    ]);
    if (!repoInfo.permissions?.push) throw new Error("Šim GitHub lietotājam nav rakstīšanas tiesību repozitorijā.");
    resources = JSON.parse(base64ToText(contents.content));
    baseCommitSha = ref.object.sha;
    const commit = await github(`${repoPath}/git/commits/${baseCommitSha}`);
    baseTreeSha = commit.tree.sha;
    ui["connection-info"].textContent = `Savienots kā ${profile.login}; ${resources.length} ieraksti; zars ${repository.branch}.`;
    ui["auth-panel"].hidden = true;
    ui["admin-app"].hidden = false;
    markClean();
    renderList();
    setStatus("");
  } catch (error) {
    token = "";
    setStatus(`Savienojums neizdevās. ${error.message}`, "error", ui["auth-status"]);
  } finally {
    ui["auth-form"].querySelector("button").disabled = false;
  }
}

function disconnect() {
  if (dirty && !window.confirm("Ir nepublicētas izmaiņas. Vai tiešām tās atmest un atvienoties?")) return;
  token = "";
  resources = [];
  baseCommitSha = "";
  baseTreeSha = "";
  selectedId = null;
  pendingImages.clear();
  markClean();
  ui["admin-app"].hidden = true;
  ui["auth-panel"].hidden = false;
  setStatus("Atvienots. Tokens no cilnes atmiņas ir noņemts.", "success", ui["auth-status"]);
}

async function saveDraft() {
  ui["save-draft"].disabled = true;
  setStatus("Saglabā melnrakstu…", "", ui["editor-status"]);
  const original = newRecord ? null : resources.find((item) => item.id === selectedId);
  const id = ui["field-id"].value.trim();
  const file = ui["field-image-file"].files[0];
  let image = original?.image ?? "assets/images/catalog/catalog-placeholder.svg";
  try {
    if (file) {
      image = `assets/images/catalog/${id}.webp`;
      pendingImages.set(image, await fileToWebp(file));
    }
    const resource = {
      id,
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
    validateRecord(resource, original?.id ?? null);
    if (newRecord) resources.push(resource);
    else resources[resources.findIndex((item) => item.id === selectedId)] = resource;
    selectedId = resource.id;
    newRecord = false;
    markDirty();
    showRecord(resource);
    setStatus("Ieraksts saglabāts melnrakstā. Tagad lapas augšā nospied “Publicēt izmaiņas”.", "success", ui["editor-status"]);
  } catch (error) {
    setStatus(`Melnrakstu neizdevās saglabāt. ${error.message}`, "error", ui["editor-status"]);
  } finally {
    ui["save-draft"].disabled = false;
  }
}

function deleteRecord() {
  const record = resources.find((item) => item.id === selectedId);
  if (!record || !window.confirm(`Vai tiešām dzēst ierakstu “${record.name}”? Dzēšanu varēs atjaunot no GitHub commit vēstures.`)) return;
  resources = resources.filter((item) => item.id !== selectedId);
  pendingImages.delete(record.image);
  selectedId = null;
  ui["record-form"].reset();
  ui["editor-title"].textContent = "Izvēlies ierakstu";
  ui["delete-record"].hidden = true;
  ui["editor-fields"].disabled = true;
  markDirty();
  renderList();
  setStatus(`Ieraksts “${record.name}” dzēsts melnrakstā. Dzēšana vēl nav publicēta.`, "success");
}

async function publish() {
  if (!dirty || busy) return;
  if (!window.confirm(`Publicēt ${resources.length} ierakstu kataloga pašreizējo melnrakstu GitHub zarā “${repository.branch}”?`)) return;
  setBusy(true);
  setStatus("Pārbauda attālo versiju un gatavo vienu atomāru GitHub commitu…");
  const repoPath = `/repos/${repository.owner}/${repository.name}`;
  try {
    const latestRef = await github(`${repoPath}/git/ref/heads/${repository.branch}`);
    if (latestRef.object.sha !== baseCommitSha) throw new Error("GitHub repozitorijs ir mainījies kopš paneļa atvēršanas. Atvienojies, savienojies no jauna un atkārto labojumu, lai nepārrakstītu citas izmaiņas.");
    const catalogText = `${JSON.stringify(resources, null, 2)}\n`;
    const catalogBlob = await github(`${repoPath}/git/blobs`, { method: "POST", body: JSON.stringify({ content: textToBase64(catalogText), encoding: "base64" }) });
    const tree = [{ path: repository.catalogPath, mode: "100644", type: "blob", sha: catalogBlob.sha }];
    for (const [path, content] of pendingImages) {
      const imageBlob = await github(`${repoPath}/git/blobs`, { method: "POST", body: JSON.stringify({ content, encoding: "base64" }) });
      tree.push({ path, mode: "100644", type: "blob", sha: imageBlob.sha });
    }
    const newTree = await github(`${repoPath}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: baseTreeSha, tree }) });
    const commit = await github(`${repoPath}/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message: "Atjaunināti kataloga ieraksti administratora panelī", tree: newTree.sha, parents: [baseCommitSha] }),
    });
    await github(`${repoPath}/git/refs/heads/${repository.branch}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
    baseCommitSha = commit.sha;
    baseTreeSha = newTree.sha;
    pendingImages.clear();
    markClean();
    setStatus(`Izmaiņas publicētas GitHub commitā ${commit.sha.slice(0, 7)}. GitHub Pages atjaunošana parasti aizņem dažas minūtes.`, "success");
  } catch (error) {
    setStatus(`Publicēšana neizdevās. ${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

buildChoices(ui["field-areas"], options.areas);
buildChoices(ui["field-needs"], options.needs);
ui["auth-form"].addEventListener("submit", connect);
ui.disconnect.addEventListener("click", disconnect);
ui.publish.addEventListener("click", publish);
ui["record-search"].addEventListener("input", renderList);
ui["new-record"].addEventListener("click", blankRecord);
ui["record-form"].addEventListener("submit", (event) => {
  event.preventDefault();
  saveDraft();
});
ui["save-draft"].addEventListener("click", saveDraft);
ui["delete-record"].addEventListener("click", deleteRecord);
ui["cancel-edit"].addEventListener("click", () => {
  const current = resources.find((item) => item.id === selectedId);
  if (current) showRecord(current);
  else {
    newRecord = false;
    ui["record-form"].reset();
    ui["editor-fields"].disabled = true;
    ui["editor-title"].textContent = "Izvēlies ierakstu";
  }
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
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
});
