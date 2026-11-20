import {
  collection, doc, deleteDoc, query, orderBy, onSnapshot, getDocsFromServer, writeBatch, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { isValidDate, todayString } from "./expenses.js";
import { ENTRY_TYPES, MAX_AMOUNT_CENTAVOS, cleanName, centavosToPesos } from "./ledger-math.js";

console.info("ledger.js loaded");

// Firestore side of the utang ledger: users/{uid}/ledger/{entryId}
// One document per money event. Entries are only added or deleted, never edited.
// Balances are NOT stored. Use computeBalances() from ledger-math.js on the entries.

const MAX_ENTRIES_PER_SAVE = 20;
const MAX_NOTE_LENGTH = 200;

function ledgerRef(uid) {
  return collection(db, "users", uid, "ledger");
}

// Cut text to at most "max" characters without splitting an emoji in half
function truncate(text, max) {
  let out = "";
  for (const ch of text) {
    if (out.length + ch.length > max) break;
    out += ch;
  }
  return out;
}

// Notes become one clean line (same cleaning as friend names)
function cleanNote(raw) {
  const text = String(raw || "")
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return truncate(text, MAX_NOTE_LENGTH);
}

// Checks one entry and turns it into the document we save.
// It never trusts a friendKey that is passed in: the key is always made again from the name.
function prepareEntry(entry) {
  const name = cleanName(entry && entry.friendName);
  if (name.error) throw new Error(name.error);

  if (!ENTRY_TYPES.includes(entry.type)) {
    throw new Error("Unknown ledger entry type.");
  }
  const centavos = entry.amountCentavos;
  if (!Number.isInteger(centavos) || centavos < 1 || centavos > MAX_AMOUNT_CENTAVOS) {
    throw new Error("The amount must be a whole number of centavos between 1 and " + MAX_AMOUNT_CENTAVOS + ".");
  }
  const date = entry.date || todayString();
  if (!isValidDate(date)) {
    throw new Error("The date must be a real date written as YYYY-MM-DD.");
  }

  return {
    friendName: name.name,
    friendKey: name.key,
    type: entry.type,
    amount: centavosToPesos(centavos), // Firestore stores pesos, like expenses
    note: cleanNote(entry.note),
    date,
  };
}

// Save one or more entries together in ONE batch: either all of them are saved or none are.
// entries: [{ friendName, type, amountCentavos, note?, date? }]
// Returns the saved entries (with their new ids).
export async function addLedgerEntries(uid, entries) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > MAX_ENTRIES_PER_SAVE) {
    throw new Error("Save between 1 and " + MAX_ENTRIES_PER_SAVE + " ledger entries at a time.");
  }
  // Check everything first, so nothing is written if one entry is bad
  const prepared = entries.map(prepareEntry);

  const batch = writeBatch(db);
  const saved = [];
  for (const data of prepared) {
    const ref = doc(ledgerRef(uid));
    batch.set(ref, { ...data, createdAt: serverTimestamp() });
    saved.push({ id: ref.id, ...data });
  }
  await batch.commit();
  return saved;
}

export function deleteLedgerEntry(uid, id) {
  if (typeof id !== "string" || id === "") throw new Error("An entry id is needed.");
  return deleteDoc(doc(db, "users", uid, "ledger", id));
}

// ---------- Reading ----------
function toItem(snapshotDoc) {
  const { createdAt, ...data } = snapshotDoc.data();
  // createdAt is empty for a moment while a new entry is still being saved
  return { id: snapshotDoc.id, ...data, createdAtMs: createdAt ? createdAt.toMillis() : null };
}

// Newest first: by date, then by when it was saved (entries still being saved count as newest)
function newestFirst(items) {
  return items.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const am = a.createdAtMs === null ? Number.MAX_SAFE_INTEGER : a.createdAtMs;
    const bm = b.createdAtMs === null ? Number.MAX_SAFE_INTEGER : b.createdAtMs;
    if (am !== bm) return bm - am;
    return a.id < b.id ? 1 : -1;
  });
}

// Live updates for the "who owes whom" panel. Returns a function that stops listening.
export function watchLedger(uid, callback) {
  const q = query(ledgerRef(uid), orderBy("date", "desc"));
  return onSnapshot(
    q,
    (snap) => callback(newestFirst(snap.docs.map(toItem))),
    (err) => console.error("Ledger listener error:", err)
  );
}

// A fresh read straight from the server (never from the local cache).
// Use this before checking a balance for a repayment. If the app is offline it fails, which is the safe result.
export async function getLedgerFresh(uid) {
  const snap = await getDocsFromServer(query(ledgerRef(uid)));
  return newestFirst(snap.docs.map(toItem));
}