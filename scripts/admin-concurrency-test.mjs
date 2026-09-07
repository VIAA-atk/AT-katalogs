import assert from "node:assert/strict";
import {
  CatalogConflictError,
  createUpdateChange,
  mergeCatalogChanges,
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

console.log("Divu admin paneļa cilņu tests sekmīgs: neatkarīgi ieraksti apvienoti, viena lauka konflikts apturēts un 409 atkārtots vienu reizi.");
