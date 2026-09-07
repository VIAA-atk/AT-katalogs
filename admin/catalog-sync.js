function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
  return [...fields].filter((field) => !same(base?.[field], value?.[field]));
}

export function createUpdateChange(base, value, fields = changedFields(base, value)) {
  const patch = {};
  for (const field of fields) {
    if (!same(base?.[field], value?.[field])) patch[field] = clone(value?.[field]);
  }
  return { kind: "update", id: base.id, base: clone(base), patch, value: clone(value) };
}

export function mergeCatalogChanges(latestResources, changes, orderDraft = null) {
  const merged = clone(latestResources);
  const conflicts = [];

  for (const change of changes) {
    const index = merged.findIndex((resource) => resource.id === change.id);

    if (change.kind === "create") {
      if (index < 0) merged.push(clone(change.value));
      else if (!same(merged[index], change.value)) {
        conflicts.push({ type: "created", id: change.id, label: recordLabel(change) });
      }
      continue;
    }

    if (change.kind === "delete") {
      if (index < 0) continue;
      if (!same(merged[index], change.base)) {
        conflicts.push({ type: "delete", id: change.id, label: recordLabel(change) });
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
    for (const [field, localValue] of Object.entries(change.patch)) {
      const baseValue = change.base?.[field];
      const remoteValue = remote?.[field];
      if (same(remoteValue, baseValue) || same(remoteValue, localValue)) {
        setField(next, field, localValue);
      } else {
        fieldConflicts.push(field);
      }
    }
    if (fieldConflicts.length) {
      conflicts.push({ type: "fields", id: change.id, label: recordLabel(change), fields: fieldConflicts });
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
      draft[index] = clone(change.value);
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
