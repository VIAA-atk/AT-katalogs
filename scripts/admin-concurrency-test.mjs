import assert from "node:assert/strict";
import {
  CatalogConflictError,
  createUpdateChange,
  applyDraftForDisplay,
  mergeCatalogChanges,
  partitionCatalogChanges,
  resolveCatalogChange,
  withOneConflictRetry,
} from "../admin/catalog-sync.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const initial = [
  { id: "a", name: "A", short: "A apraksts", areas: ["lasisana"] },
  { id: "b", name: "B", short: "B apraksts", areas: ["rakstisana"] },
  { id: "c", name: "C", short: "C apraksts", areas: ["matematika"] },
];

const tabAChange = createUpdateChange(initial[0], { ...initial[0], name: "A — cilne A" }, ["name"]);
const tabBChange = createUpdateChange(initial[1], { ...initial[1], short: "B — cilne B" }, ["short"]);
const afterTabA = mergeCatalogChanges(initial, [tabAChange]);
const afterBothTabs = mergeCatalogChanges(afterTabA, [tabBChange]);
assert.equal(afterBothTabs[0].name, "A — cilne A", "Otrā cilne nedrīkst pārrakstīt pirmās cilnes ierakstu.");
assert.equal(afterBothTabs[1].short, "B — cilne B", "Otrās cilnes konkrētā ieraksta labojumam jāsaglabājas.");

const sameRecordOtherField = createUpdateChange(initial[0], { ...initial[0], short: "A — otra cilne" }, ["short"]);
const fieldMerged = mergeCatalogChanges(afterTabA, [sameRecordOtherField]);
assert.equal(fieldMerged[0].name, "A — cilne A", "Drošā lauku apvienošanā jāsaglabā attālais lauks.");
assert.equal(fieldMerged[0].short, "A — otra cilne", "Drošā lauku apvienošanā jāpielieto lokālais lauks.");

const sameFieldChange = createUpdateChange(initial[0], { ...initial[0], name: "A — cilne B" }, ["name"]);
assert.throws(
  () => mergeCatalogChanges(afterTabA, [sameFieldChange]),
  CatalogConflictError,
  "Viena un tā paša lauka paralēlas izmaiņas nedrīkst automātiski pārrakstīt.",
);

let mockRepository = { sha: 1, resources: clone(initial) };
let loads = 0;
const retryResult = await withOneConflictRetry(async (attempt) => {
  loads += 1;
  const loaded = { sha: mockRepository.sha, resources: clone(mockRepository.resources) };
  const merged = mergeCatalogChanges(loaded.resources, [tabBChange]);
  if (attempt === 0) {
    mockRepository = { sha: 2, resources: mergeCatalogChanges(mockRepository.resources, [tabAChange]) };
    const conflict = new Error("GitHub HTTP 409: SHA neatbilst");
    conflict.status = 409;
    throw conflict;
  }
  assert.equal(loaded.sha, 2, "Atkārtotajam mēģinājumam jāielādē jaunākais SHA.");
  mockRepository = { sha: 3, resources: merged };
  return mockRepository;
});
assert.equal(loads, 2, "Pēc 409 jāveic tieši viens atkārtots mēģinājums.");
assert.equal(retryResult.resources[0].name, "A — cilne A", "409 atkārtojumā jāsaglabā otras cilnes publicētais labojums.");
assert.equal(retryResult.resources[1].short, "B — cilne B", "409 atkārtojumā jāpielieto šīs cilnes konkrētais labojums.");

let failedAttempts = 0;
await assert.rejects(
  withOneConflictRetry(async () => {
    failedAttempts += 1;
    const conflict = new Error("GitHub HTTP 409: SHA neatbilst");
    conflict.status = 409;
    throw conflict;
  }),
  /409/,
);
assert.equal(failedAttempts, 2, "Konflikta gadījumā nedrīkst mēģināt vairāk par vienu papildu reizi.");

const localOrder = {
  baseOrder: initial.map((resource) => resource.id),
  operations: [{ sourceId: "a", targetId: "b", placeAfter: true }],
};
const remoteReordered = [initial[1], initial[0], initial[2]];
assert.throws(
  () => mergeCatalogChanges(remoteReordered, [], localOrder),
  CatalogConflictError,
  "Divas neatkarīgas secības maiņas konservatīvi jāaptur kā konflikts.",
);

const identical = mergeCatalogChanges(afterTabA, [tabAChange]);
assert.deepEqual(identical, afterTabA, "Identical local and remote edits must not conflict.");
const staleNoOp = { ...tabAChange, patch: { name: initial[0].name }, value: initial[0] };
assert.deepEqual(mergeCatalogChanges(afterTabA, [staleNoOp]), afterTabA, "A stale no-op patch must not overwrite GitHub or conflict.");
const selectionBase = { ...initial[0], areas: ["lasisana", "rakstisana"] };
const reorderedSelection = createUpdateChange(selectionBase, { ...selectionBase, areas: ["rakstisana", "lasisana"] });
assert.deepEqual(reorderedSelection.patch, {}, "Checkbox order is not a field edit.");
assert.deepEqual(mergeCatalogChanges([{ ...selectionBase, areas: ["komunikacija"] }], [reorderedSelection])[0].areas, ["komunikacija"]);

const partial = partitionCatalogChanges(afterTabA, [sameFieldChange, tabBChange], localOrder);
assert.deepEqual(partial.acceptedChanges.map((change) => change.id), ["b"]);
assert.equal(partial.conflicts[0].id, "a");
assert.equal(partial.resources.find((record) => record.id === "a").name, afterTabA[0].name);
assert.equal(partial.resources.find((record) => record.id === "b").short, tabBChange.value.short);
assert.equal(partial.orderApplied, true);
const orderBlocked = partitionCatalogChanges(remoteReordered, [tabBChange], localOrder);
assert.equal(orderBlocked.orderApplied, false);
assert.equal(orderBlocked.resources.find((record) => record.id === "b").short, tabBChange.value.short);

const remoteWithExtra = { ...afterTabA[0], extra: { keep: "remote-only field" } };
const displayed = applyDraftForDisplay([remoteWithExtra], [sameRecordOtherField])[0];
assert.deepEqual(displayed.extra, remoteWithExtra.extra);
assert.equal(displayed.name, remoteWithExtra.name, "A draft must overlay only edited fields in the editor too.");
const chosenLocal = resolveCatalogChange(sameFieldChange, remoteWithExtra, { name: "mine" });
assert.deepEqual(mergeCatalogChanges([remoteWithExtra], [chosenLocal])[0], { ...remoteWithExtra, name: sameFieldChange.value.name });
assert.equal(resolveCatalogChange(sameFieldChange, remoteWithExtra, { name: "github" }), null);
assert.throws(() => resolveCatalogChange(sameFieldChange, remoteWithExtra, {}), /katram/);
assert.throws(() => mergeCatalogChanges([{ ...remoteWithExtra, name: "Vēlāks labojums" }], [chosenLocal]), CatalogConflictError);

const deleted = partitionCatalogChanges([], [tabAChange, { kind: "create", id: "b", value: initial[1] }]);
assert.equal(deleted.conflicts[0].type, "deleted");
assert.equal(deleted.resources[0].id, "b");
assert.equal(resolveCatalogChange(tabAChange, undefined, { record: "mine" }).kind, "create");
assert.equal(resolveCatalogChange(tabAChange, undefined, { record: "github" }), null);
const deletion = { kind: "delete", id: "a", base: initial[0] };
assert.equal(resolveCatalogChange(deletion, afterTabA[0], { record: "github" }), null);
assert.deepEqual(mergeCatalogChanges(afterTabA, [resolveCatalogChange(deletion, afterTabA[0], { record: "mine" })]), afterTabA.slice(1));
const collision = { kind: "create", id: "a", value: initial[0] };
assert.equal(partitionCatalogChanges(afterTabA, [collision]).conflicts[0].type, "created");
assert.equal(resolveCatalogChange(collision, afterTabA[0], { name: "github" }), null);

const withOptional = { ...initial[0], optional: "remove me" };
const removal = JSON.parse(JSON.stringify(createUpdateChange(withOptional, initial[0])));
assert.equal("optional" in mergeCatalogChanges([withOptional], [removal])[0], false, "Field removals must survive draft serialization.");

console.log("Divu admin paneļa cilņu tests sekmīgs: neatkarīgi ieraksti apvienoti, viena lauka konflikts apturēts un 409 atkārtots vienu reizi.");
