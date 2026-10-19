import { storeAnalysis, storeOwned, storeReport } from "./storageFormat.js";
import { storeLearningModules } from "./learningProgressService.js";

// A patch includes its original values as a compare-and-swap guard. A concurrent
// writer wins; rerunning the migration safely picks up any skipped document.
export function migrationPatch(collection, row) {
  let next;
  if (collection === "scans" || collection === "reports") {
    next =
      collection === "scans"
        ? { ...storeOwned(row), result: storeAnalysis(row.result) }
        : storeReport(row);
    // Historical guests may predate guest cookies. Keep their origin explicit.
    if (row.source === "guest" || row.submittedBy === "guest" || row.guestId)
      next.originallySubmittedAsGuest = true;
  } else if (collection === "learning") {
    next = { ...row, modules: storeLearningModules(row.modules) };
  } else if (collection === "otps") {
    next = { ...row };
    delete next.name;
    delete next.action;
  } else {
    throw new Error("Unsupported migration collection");
  }
  const filter = { _id: row._id },
    $set = {},
    $unset = {};
  for (const key of new Set([...Object.keys(row), ...Object.keys(next)])) {
    if (JSON.stringify(row[key]) === JSON.stringify(next[key])) continue;
    filter[key] = Object.hasOwn(row, key)
      ? { $eq: row[key] }
      : { $exists: false };
    if (Object.hasOwn(next, key)) $set[key] = next[key];
    else $unset[key] = "";
  }
  // Ownership changes and consent updates must not race removal of their labels.
  for (const key of ["userId", "guestId", "consentId"])
    if (collection === "scans" || collection === "reports")
      filter[key] = Object.hasOwn(row, key)
        ? { $eq: row[key] }
        : { $exists: false };
  const update = {
    ...(Object.keys($set).length ? { $set } : {}),
    ...(Object.keys($unset).length ? { $unset } : {}),
  };
  return Object.keys(update).length ? { filter, update } : null;
}
