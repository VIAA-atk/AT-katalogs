import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { createHash } from "node:crypto";
import * as sync from "../admin/catalog-sync.js";

// Exercise the actual admin controller with in-memory DOM, storage and GitHub test doubles.
// No real token, browser storage or remote catalog is used or changed by these tests.
const source = (await fs.readFile(new URL("../admin/admin.js", import.meta.url), "utf8"))
  .replace(/^import\s*\{[\s\S]*?\}\s*from\s*"[^"]+";\s*/, "");
const html = await fs.readFile(new URL("../admin/index.html", import.meta.url), "utf8");
const copy = (value) => JSON.parse(JSON.stringify(value));
const draftKey = "viaa-atk-admin-draft-v16";
const fixture = (id, name) => ({
  id, name, short: "Sākotnējais īsais teksts", areas: ["lasisana"], needs: ["tts"],
  type: "programmatura", level: "augsts", latvian: "Pieejams latviešu valodā",
  whatIs: "Sākotnējais apraksts", functions: ["Funkcija"], acquisition: ["Informācija"],
  image: "assets/images/catalog/catalog-placeholder.svg", imageAlt: "Attēls",
  imageSource: "", imageRightsNote: "Tiesību piezīme", productPage: "", productLinkType: "resource",
});
const arasaac = fixture("arasaac", "ARASAAC");
const other = fixture("cits", "Cits ieraksts");
const hugo = fixture("hugo-gov-lv", "Hugo.gov.lv");
const oldDraft = { ...sync.createUpdateChange(arasaac, {
  ...arasaac, short: "Mans vecais ARASAAC teksts", areas: ["komunikacija"], whatIs: "Mans apraksts",
}), baseCommitSha: "original" };
const latestArasaac = { ...arasaac, short: "GitHub ARASAAC teksts", areas: ["rakstisana"], whatIs: "GitHub apraksts" };
const oldBackup = () => ({ version: 1, repository: "VIAA-atk/AT-katalogs", changes: [copy(oldDraft)],
  orderDraft: null, selectedId: "arasaac", pendingImagePaths: [], form: null });

class Element {
  constructor(tag = "div", id = "") {
    this.tagName = tag.toUpperCase(); this.id = id; this.children = []; this.dataset = {};
    this.value = ""; this.defaultValue = ""; this.files = []; this.checked = false;
    this.hidden = false; this.disabled = false; this.listeners = new Map();
    this.classList = { toggle() {}, add() {}, remove() {} };
  }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, listener) { (this.listeners.get(name) ?? this.listeners.set(name, []).get(name)).push(listener); }
  async fire(name) { for (const fn of this.listeners.get(name) ?? []) await fn({ target: this, preventDefault() {} }); }
  focus() {}
  closest(selector) { return this.id === selector.slice(1) ? this : this.parent?.closest(selector); }
  all() { return this.children.flatMap((child) => [child, ...(child.all?.() ?? [])]); }
  querySelectorAll(selector) {
    if (selector.includes("checkbox")) return this.all().filter((node) => node.type === "checkbox" && (!selector.includes(":checked") || node.checked));
    if (selector === "input, select, textarea") return this.all().filter((node) => ["INPUT", "SELECT", "TEXTAREA"].includes(node.tagName));
    return [];
  }
  querySelector(selector) { return this.all().find((node) => node.tagName === selector.toUpperCase()); }
}

function harness({ backup = oldBackup(), initial = [latestArasaac, other] } = {}) {
  const elements = Object.fromEntries([...html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/g)]
    .map((match) => [match[2], new Element(match[1], match[2])]));
  for (const [id, element] of Object.entries(elements)) if (id.startsWith("field-")) elements["record-form"].append(element);
  elements["auth-form"].append(new Element("button"));
  elements["save-draft"].textContent = "Saglabāt melnrakstā";
  elements["field-image-file"].type = "file";
  const storage = new Map([["unrelated-key", "keep"]]);
  if (backup) storage.set(draftKey, JSON.stringify(backup));
  const commits = new Map();
  const trees = new Map();
  const blobs = new Map();
  const requests = [];
  let head = "initial", writes = 0, serial = 0, race = null, failLoad = false, failAfterPublish = false;
  function commitData(records) {
    const id = `remote-${++serial}`;
    const blob = `catalog-${serial}`;
    blobs.set(blob, Buffer.from(JSON.stringify(records)));
    trees.set(`tree-${serial}`, { "data/catalog.json": blob });
    commits.set(id, { sha: id, tree: { sha: `tree-${serial}` }, resources: copy(records) });
    head = id;
  }
  commitData(initial);
  const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
  async function fetch(url, init = {}) {
    const u = new URL(url), endpoint = u.pathname.replace("/repos/VIAA-atk/AT-katalogs", "");
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ endpoint, method, body });
    if (method === "GET" && failLoad) throw new Error("Simulēta tīkla kļūda");
    if (endpoint === "/user") return json({ login: "test-editor" });
    if (endpoint === "") return json({ permissions: { push: true } });
    if (endpoint === "/git/ref/heads/main") return json({ object: { sha: head } });
    if (endpoint.startsWith("/contents/")) {
      const commit = commits.get(u.searchParams.get("ref"));
      const path = endpoint.slice("/contents/".length);
      const sha = trees.get(commit?.tree.sha)?.[path];
      return sha ? json({ sha, content: blobs.get(sha).toString("base64") }) : json({ message: "Not found" }, 404);
    }
    if (endpoint.startsWith("/git/commits/")) return json(commits.get(endpoint.split("/").pop()));
    if (endpoint === "/git/blobs" && method === "POST") {
      const bytes = Buffer.from(body.content, body.encoding === "base64" ? "base64" : "utf8");
      const sha = createHash("sha1").update(bytes).digest("hex");
      blobs.set(sha, bytes); return json({ sha });
    }
    if (endpoint === "/git/trees" && method === "POST") {
      const sha = `new-tree-${++serial}`;
      trees.set(sha, { ...trees.get(body.base_tree), ...Object.fromEntries(body.tree.map((entry) => [entry.path, entry.sha])) });
      return json({ sha });
    }
    if (endpoint === "/git/commits" && method === "POST") {
      const sha = `new-commit-${++serial}`;
      const resources = JSON.parse(blobs.get(trees.get(body.tree)["data/catalog.json"]).toString());
      commits.set(sha, { sha, parents: body.parents, tree: { sha: body.tree }, resources });
      return json({ sha });
    }
    if (endpoint === "/git/refs/heads/main" && method === "PATCH") {
      assert.equal(body.force, false);
      if (race) { const effect = race; race = null; effect(); return json({ message: "Reference update conflict" }, 409); }
      assert.equal(commits.get(body.sha).parents[0], head, "Publication must use the fresh parent SHA.");
      head = body.sha; writes++;
      if (failAfterPublish) failLoad = true;
      return json({ object: { sha: head } });
    }
    throw new Error(`Unexpected GitHub request: ${method} ${endpoint}`);
  }
  const context = vm.createContext({ ...sync, console, TextEncoder, TextDecoder, URL, Uint8Array,
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    atob: (value) => Buffer.from(value, "base64").toString("binary"), fetch,
    setTimeout: () => 1, clearTimeout() {},
    sessionStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    document: { querySelectorAll: (selector) => selector === "[id]" ? Object.values(elements)
      : [...elements["field-areas"].querySelectorAll("input[type=checkbox]"), ...elements["field-needs"].querySelectorAll("input[type=checkbox]")],
      createElement: (tag) => new Element(tag), createTextNode: (textContent) => ({ textContent }) },
    window: { confirm: () => true, addEventListener() {} },
  });
  vm.runInContext(source, context);
  const run = (script) => vm.runInContext(script, context);
  return { elements, storage, requests, run,
    async connect() { elements["github-token"].value = "test-only"; await run("connect({preventDefault(){}})"); assert.equal(run("connectedLogin"), "test-editor", elements["auth-status"].textContent); },
    async createHugo() { await run("startNewRecord()"); run(`setFormValues(${JSON.stringify(hugo)}); formDirty = true;`); },
    records: () => copy(commits.get(head).resources), writes: () => writes,
    updateRemote: commitData, setRace: (effect) => { race = effect; },
    failLoading: (value) => { failLoad = value; }, failRefreshAfterPublishing: () => { failAfterPublish = true; },
    backup: () => JSON.parse(storage.get(draftKey) ?? "null"),
  };
}

// Regression: restore a v16 ARASAAC draft, create Hugo, publish safe records and retain only ARASAAC.
{
  const h = harness(); await h.connect();
  assert.deepEqual(JSON.parse(h.run("JSON.stringify(recordConflicts.get('arasaac').fields)")), ["short", "areas", "whatIs"]);
  await h.createHugo(); assert.equal(await h.run("saveDraft()"), true);
  assert.equal(h.elements["editor-title"].textContent, "Labot: Hugo.gov.lv");
  await h.run("publish()");
  assert.deepEqual(h.records(), [latestArasaac, other, hugo], "ARASAAC content must remain byte-for-byte equivalent while Hugo publishes.");
  assert.equal(h.writes(), 1);
  assert.deepEqual(h.backup().changes.map((change) => change.id), ["arasaac"]);
  assert.equal(h.backup().form, null);
  assert.equal(h.storage.get("unrelated-key"), "keep");
  const reopened = harness({ backup: h.backup(), initial: h.records() }); await reopened.connect();
  assert.equal(reopened.run("recordChanges.has('hugo-gov-lv')"), false);
}

// Discard through the real button while an unrelated new form contains unsaved text.
{
  const h = harness(); await h.connect(); await h.createHugo();
  const discard = h.elements["conflict-list"].all().find((node) => node.textContent === "Atmest manu melnrakstu un ielādēt GitHub versiju");
  await discard.fire("click");
  assert.equal(h.run("recordChanges.has('arasaac')"), false);
  assert.equal(h.elements["field-name"].value, "Hugo.gov.lv");
  assert.equal(h.run("formDirty && newRecord"), true);
  assert.equal(h.backup().form.resource.name, "Hugo.gov.lv");
  assert.deepEqual(JSON.parse(h.run("JSON.stringify(resources.find(r => r.id === 'arasaac'))")), latestArasaac);
  assert.equal(h.writes(), 0, "Discard must not write to GitHub.");
  assert.equal(h.storage.get("unrelated-key"), "keep");
}

// Failed reload cannot delete the conflicting draft.
{
  const h = harness(); await h.connect(); const before = h.backup(); h.failLoading(true);
  await h.run("discardRecordDraft('arasaac')");
  assert.deepEqual(h.backup(), before); assert.equal(h.run("recordChanges.has('arasaac')"), true);
}

// Field choices are explicit, preserve non-conflicting remote fields, and survive later races.
{
  const h = harness(); await h.connect();
  const card = h.elements["conflict-list"].children[0];
  const apply = card.all().find((node) => node.textContent === "Saglabāt izvēlētās versijas melnrakstā");
  assert.equal(apply.disabled, true);
  for (const [field, choice] of [["short", "mine"], ["areas", "github"], ["whatIs", "mine"]]) {
    await card.all().find((node) => node.name === `conflict-arasaac-${field}` && node.value === choice).fire("change");
  }
  assert.equal(apply.disabled, false); await apply.fire("click");
  assert.equal(h.run("recordConflicts.size"), 0);
  h.updateRemote([{ ...latestArasaac, latvian: "GitHub jaunā valodas piezīme" }, other]);
  await h.run("publish(true)");
  assert.deepEqual(h.records()[0], { ...latestArasaac, short: oldDraft.value.short, whatIs: oldDraft.value.whatIs, latvian: "GitHub jaunā valodas piezīme" });
  assert.equal(h.backup(), null);
}

// A conflicting local edit can still be saved and navigation to a new record remains available.
{
  const h = harness({ backup: null, initial: [arasaac, other] }); await h.connect(); await h.run("openRecord('arasaac')");
  h.elements["field-short"].value = "Jauns mans teksts";
  h.run("handleFormChange({target: ui['field-short']})");
  h.updateRemote([latestArasaac, other]); await h.run("startNewRecord()");
  assert.equal(h.run("newRecord"), true); assert.equal(h.run("recordConflicts.has('arasaac')"), true);
  assert.equal(h.backup().changes[0].patch.short, "Jauns mans teksts");
}

// One GitHub 409 retries against the new SHA and preserves other users' changes.
{
  const h = harness(); await h.connect(); await h.createHugo();
  h.setRace(() => h.updateRemote([latestArasaac, { ...other, name: "Mainīts citā cilnē" }]));
  await h.run("publish(true)");
  assert.equal(h.writes(), 1);
  assert.equal(h.requests.filter((request) => request.method === "PATCH").length, 2);
  assert.equal(h.records()[1].name, "Mainīts citā cilnē");
  assert.equal(h.records()[2].id, hugo.id);
  assert.deepEqual(h.backup().changes.map((change) => change.id), ["arasaac"]);
}

// Cleanup is immediate after an acknowledged publication, even when the next read fails.
{
  const h = harness(); await h.connect(); await h.createHugo(); h.failRefreshAfterPublishing();
  await h.run("publish(true)");
  assert.equal(h.writes(), 1); assert.deepEqual(h.backup().changes.map((change) => change.id), ["arasaac"]);
}

// An unavailable image on a restored draft cannot block another record's publication.
{
  const backup = oldBackup();
  backup.changes[0] = { ...sync.createUpdateChange(arasaac, { ...arasaac, short: "Mans teksts", image: "assets/images/catalog/arasaac.png" }), baseCommitSha: "original" };
  backup.pendingImagePaths = ["assets/images/catalog/arasaac.png"];
  const h = harness({ backup, initial: [arasaac, other] }); await h.connect(); await h.createHugo(); await h.run("publish()");
  assert.deepEqual(h.records(), [arasaac, other, hugo]);
  assert.equal(h.run("recordConflicts.get('arasaac').type"), "imageMissing");
  assert.deepEqual(h.backup().pendingImagePaths, backup.pendingImagePaths);
}

// A form snapshot keeps its original baseline across reloads and remote refreshes.
{
  const first = harness({ backup: null, initial: [arasaac, other] }); await first.connect(); await first.run("openRecord('arasaac')");
  first.elements["field-short"].value = "Vēl nesaglabāts teksts";
  first.run("handleFormChange({target: ui['field-short']}); persistBrowserDraft(true)");
  const h = harness({ backup: first.backup() }); await h.connect(); await h.run("saveDraft()");
  assert.deepEqual(JSON.parse(h.run("JSON.stringify(recordConflicts.get('arasaac').fields)")), ["short"]);
  assert.equal(h.backup().changes[0].patch.short, "Vēl nesaglabāts teksts");
}

// An old v16 unsaved form without a baseline requires review instead of silently overwriting GitHub.
{
  const backup = oldBackup(); backup.changes = [];
  backup.form = { selectedId: "arasaac", newRecord: false, touchedFields: ["short"], resource: { ...arasaac, short: "Vecais formas teksts" } };
  const h = harness({ backup }); await h.connect(); await h.run("publish()");
  assert.equal(h.writes(), 0); assert.equal(h.run("recordConflicts.get('arasaac').type"), "unverified");
  assert.equal(h.backup().changes[0].patch.short, "Vecais formas teksts");
}

// Choosing from a stale conflict panel cannot approve a newer remote value unseen by the editor.
{
  const h = harness(); await h.connect();
  h.run("globalThis.oldConflict = recordConflicts.get('arasaac'); globalThis.oldChange = clone(recordChanges.get('arasaac'));");
  h.updateRemote([{ ...latestArasaac, short: "Vēl jaunāks GitHub teksts" }, other]);
  await h.run("resolveRecordConflict(oldConflict, oldChange, {short:'mine',areas:'github',whatIs:'mine'})");
  assert.equal(h.run("recordConflicts.get('arasaac').remote.short"), "Vēl jaunāks GitHub teksts");
  assert.equal(h.backup().changes[0].base.short, arasaac.short);
  assert.equal(h.writes(), 0);
}

// Replacing only image bytes (the path stays the same) remains a publishable record draft.
{
  const record = { ...arasaac, image: "assets/images/catalog/arasaac.png" };
  const h = harness({ backup: null, initial: [record, other] }); await h.connect(); await h.run("openRecord('arasaac')");
  h.elements["field-image-file"].files = [{ name: "arasaac.png", type: "image/png", size: 4, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }];
  h.run("handleFormChange({target: ui['field-image-file']})"); await h.run("publish(true)");
  assert.equal(h.writes(), 1); assert.equal(h.run("pendingImages.size"), 0); assert.equal(h.backup(), null);
  assert.deepEqual(h.records(), [record, other]);
  assert.equal(h.requests.some((request) => request.endpoint === "/git/trees" && request.body.tree.some((entry) => entry.path === record.image)), true);
}

// Editing one field must not normalize or replace any untouched content.
{
  const record = { ...arasaac, short: "  atstāt atstarpes  ", functions: ["atkārtojums", "atkārtojums"], extra: { untouched: true } };
  const h = harness({ backup: null, initial: [record, other] }); await h.connect(); await h.run("openRecord('arasaac')");
  h.elements["field-name"].value = "Labots nosaukums"; h.run("handleFormChange({target: ui['field-name']})");
  await h.run("publish(true)"); assert.deepEqual(h.records()[0], { ...record, name: "Labots nosaukums" });
}

console.log("Melnrakstu regresijas pārbaudes sekmīgas: ARASAAC/Hugo, individuāla atmešana, lauku izvēles, pārlāde, 409, saglabāšana un attēlu izolācija.");
