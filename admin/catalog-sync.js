function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function same(left, right, field) {
  // Checkbox selections are sets; changing their display order is not an edit.
  if (["areas", "needs"].includes(field) && Array.isArray(left) && Array.isArray(right)) {
    return same([...new Set(left)].sort(), [...new Set(right)].sort());
  }
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) =>
    Object.hasOwn(right, key) && same(left[key], right[key], key));
}

function setField(target, field, value) {
  if (value === undefined) delete target[field];
  else target[field] = clone(value);
}

function recordLabel(change) {
  return change.value?.name || change.base?.name || change.id;
}

export class CatalogConflictError extends Error {
  constructor(conflicts) {
    const details = conflicts.map((conflict) => {
      if (conflict.type === "order") return "kataloga secība";
      if (conflict.type === "deleted") return `ieraksts “${conflict.label}” ir dzēsts citā cilnē`;
      if (conflict.type === "created") return `identifikators “${conflict.id}” jau ir izveidots citā cilnē`;
      if (conflict.type === "delete") return `ieraksts “${conflict.label}” pirms dzēšanas ir mainīts citā cilnē`;
      return `ieraksta “${conflict.label}” lauki: ${conflict.fields.join(", ")}`;
    });
    super(`Automātiska apvienošana nav droša (${details.join("; ")}).`);
    this.name = "CatalogConflictError";
    this.conflicts = conflicts;
  }
}

export function changedFields(base, value) {
  const fields = new Set([...Object.keys(base ?? {}), ...Object.keys(value ?? {})]);
  return [...fields].filter((field) => !same(base?.[field], value?.[field], field));
}

export function createUpdateChange(base, value, fields = changedFields(base, value)) {
  const patch = {};
  const removedFields = [];
  for (const field of fields) {
    if (same(base?.[field], value?.[field], field)) continue;
    if (value?.[field] === undefined) removedFields.push(field);
    else patch[field] = clone(value[field]);
  }
  return { kind: "update", id: base.id, base: clone(base), patch, removedFields, value: clone(value) };
}

function patchEntries(change) {
  return [...Object.entries(change.patch ?? {}), ...(change.removedFields ?? []).map((field) => [field, undefined])];
}

export function mergeCatalogChanges(latestResources, changes, orderDraft = null) {
  const merged = clone(latestResources);
  const conflicts = [];

  for (const change of changes) {
    const index = merged.findIndex((resource) => resource.id === change.id);

    if (change.kind === "create") {
      if (index < 0) merged.push(clone(change.value));
      else if (!same(merged[index], change.value)) {
        conflicts.push({ type: "created", id: change.id, label: recordLabel(change),
          fields: changedFields(merged[index], change.value), remote: clone(merged[index]) });
      }
      continue;
    }

    if (change.kind === "delete") {
      if (index < 0) continue;
      if (!same(merged[index], change.base)) {
        conflicts.push({ type: "delete", id: change.id, label: recordLabel(change), remote: clone(merged[index]) });
      } else {
        merged.splice(index, 1);
      }
      continue;
    }

    if (index < 0) {
      conflicts.push({ type: "deleted", id: change.id, label: recordLabel(change) });
      continue;
    }

    const remote = merged[index];
    const next = clone(remote);
    const fieldConflicts = [];
    for (const [field, localValue] of patchEntries(change)) {
      const baseValue = change.base?.[field];
      const remoteValue = remote?.[field];
      if (change.unverifiedFields?.includes(field) && !same(remoteValue, localValue, field)) {
        fieldConflicts.push(field);
        continue;
      }
      if (same(localValue, baseValue, field)) continue;
      if (same(remoteValue, baseValue, field) || same(remoteValue, localValue, field)) {
        setField(next, field, localValue);
      } else {
        fieldConflicts.push(field);
      }
    }
    if (fieldConflicts.length) {
      conflicts.push({ type: fieldConflicts.some((field) => change.unverifiedFields?.includes(field)) ? "unverified" : "fields",
        id: change.id, label: recordLabel(change), fields: fieldConflicts, remote: clone(remote) });
    } else {
      merged[index] = next;
    }
  }

  if (orderDraft?.operations?.length) {
    const baseIds = new Set(orderDraft.baseOrder);
    const currentBaseOrder = merged.map((resource) => resource.id).filter((id) => baseIds.has(id));
    const expectedBaseOrder = orderDraft.baseOrder.filter((id) => currentBaseOrder.includes(id));
    if (!same(currentBaseOrder, expectedBaseOrder)) {
      conflicts.push({ type: "order" });
    } else {
      for (const operation of orderDraft.operations) {
        const sourceIndex = merged.findIndex((resource) => resource.id === operation.sourceId);
        const targetIndex = merged.findIndex((resource) => resource.id === operation.targetId);
        if (sourceIndex < 0 || targetIndex < 0) {
          conflicts.push({ type: "order" });
          break;
        }
        const [moved] = merged.splice(sourceIndex, 1);
        const updatedTargetIndex = merged.findIndex((resource) => resource.id === operation.targetId);
        merged.splice(updatedTargetIndex + (operation.placeAfter ? 1 : 0), 0, moved);
      }
    }
  }

  if (conflicts.length) throw new CatalogConflictError(conflicts);
  return merged;
}

export function applyDraftForDisplay(latestResources, changes, orderDraft = null) {
  const draft = clone(latestResources);
  for (const change of changes) {
    const index = draft.findIndex((resource) => resource.id === change.id);
    if (change.kind === "delete") {
      if (index >= 0) draft.splice(index, 1);
    } else if (index >= 0) {
      if (change.kind === "create") draft[index] = clone(change.value);
      else for (const [field, value] of patchEntries(change)) {
        if (change.unverifiedFields?.includes(field) || !same(value, change.base?.[field], field)) setField(draft[index], field, value);
      }
    } else {
      draft.push(clone(change.value));
    }
  }
  for (const operation of orderDraft?.operations ?? []) {
    const sourceIndex = draft.findIndex((resource) => resource.id === operation.sourceId);
    const targetIndex = draft.findIndex((resource) => resource.id === operation.targetId);
    if (sourceIndex < 0 || targetIndex < 0) continue;
    const [moved] = draft.splice(sourceIndex, 1);
    const updatedTargetIndex = draft.findIndex((resource) => resource.id === operation.targetId);
    draft.splice(updatedTargetIndex + (operation.placeAfter ? 1 : 0), 0, moved);
  }
  return draft;
}

// A blocked record (or ordering operation) must never prevent other records from publishing.
export function partitionCatalogChanges(latestResources, changes, orderDraft = null) {
  let resources = clone(latestResources);
  const acceptedChanges = [];
  const conflicts = [];
  for (const change of changes) {
    try {
      resources = mergeCatalogChanges(resources, [change]);
      acceptedChanges.push(change);
    } catch (error) {
      if (!(error instanceof CatalogConflictError)) throw error;
      conflicts.push(...error.conflicts);
    }
  }
  let orderApplied = false;
  if (orderDraft?.operations?.length) {
    try {
      resources = mergeCatalogChanges(resources, [], orderDraft);
      orderApplied = true;
    } catch (error) {
      if (!(error instanceof CatalogConflictError)) throw error;
      conflicts.push(...error.conflicts);
    }
  }
  return { resources, acceptedChanges, conflicts, orderApplied };
}

// Choices apply to the remote version just reviewed. The caller checks it again before resolving.
export function resolveCatalogChange(change, remote, choices) {
  let conflict;
  try { mergeCatalogChanges(remote ? [remote] : [], [change]); }
  catch (error) {
    if (!(error instanceof CatalogConflictError)) throw error;
    conflict = error.conflicts[0];
  }
  if (!conflict) return change;
  const fields = conflict.fields ?? ["record"];
  if (fields.some((field) => !["mine", "github"].includes(choices[field]))) {
    throw new Error("Izvēlies versiju katram konfliktējošajam laukam.");
  }
  if (conflict.type === "deleted") return choices.record === "mine"
    ? { kind: "create", id: change.id, value: clone(change.value) } : null;
  if (conflict.type === "delete") return choices.record === "mine"
    ? { ...clone(change), base: clone(remote) } : null;
  const value = applyDraftForDisplay([remote], [change])[0];
  for (const field of fields) {
    if (choices[field] === "github") setField(value, field, remote[field]);
  }
  const resolved = createUpdateChange(remote, value);
  return changedFields(remote, value).length ? resolved : null;
}

export function isRetryableGitHubConflict(error) {
  if (error?.status === 409) return true;
  return error?.status === 422 && /conflict|fast.?forward|sha|reference update/i.test(error.message ?? "");
}

export async function withOneConflictRetry(operation) {
  try {
    return await operation(0);
  } catch (error) {
    if (!isRetryableGitHubConflict(error)) throw error;
    return operation(1);
  }
}

export const catalogSyncInternals = { clone, same };
