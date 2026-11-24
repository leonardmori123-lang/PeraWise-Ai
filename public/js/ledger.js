import {
  collection, doc, deleteDoc, query, orderBy, onSnapshot, getDocsFromServer, writeBatch, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { isValidDate, todayString } from "./expenses.js";
import { ENTRY_TYPES, MAX_AMOUNT_CENTS, cleanName, centsToPesos } from "./ledger-math.js";

console.info("ledger.js loaded");

const MAX_SAVE_BATCH = 20;
const MAX_NOTE_CHARS = 200;

function getLedgerCollection(uid) {
  return collection(db, "users", uid, "ledger");
}

function truncateText(text, maxChars) {
  let result = "";
  for (const char of text) {
    if (result.length + char.length > maxChars) break;
    result += char;
  }
  return result;
}

function cleanNote(rawNote) {
  const text = String(rawNote || "")
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return truncateText(text, MAX_NOTE_CHARS);
}

function prepareEntry(entry) {
  const friend = cleanName(entry && entry.friendName);
  if (friend.error) throw new Error(friend.error);

  if (!ENTRY_TYPES.includes(entry.type)) {
    throw new Error("Unknown ledger entry type.");
  }
  const cents = entry.amountCents;
  if (!Number.isInteger(cents) || cents < 1 || cents > MAX_AMOUNT_CENTS) {
    throw new Error("The amount must be a whole number of cents between 1 and " + MAX_AMOUNT_CENTS + ".");
  }
  const dateValue = entry.date || todayString();
  if (!isValidDate(dateValue)) {
    throw new Error("The date must be a real date written as YYYY-MM-DD.");
  }

  return {
    friendName: friend.name,
    friendKey: friend.key,
    type: entry.type,
    amount: centsToPesos(cents),
    note: cleanNote(entry.note),
    date: dateValue,
  };
}

export async function addLedgerEntries(uid, entries) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > MAX_SAVE_BATCH) {
    throw new Error("Save between 1 and " + MAX_SAVE_BATCH + " ledger entries at a time.");
  }
  const preparedRows = entries.map(prepareEntry);

  const batch = writeBatch(db);
  const savedEntries = [];
  for (const row of preparedRows) {
    const docRef = doc(getLedgerCollection(uid));
    batch.set(docRef, { ...row, createdAt: serverTimestamp() });
    savedEntries.push({ id: docRef.id, ...row });
  }
  await batch.commit();
  return savedEntries;
}

export function deleteLedgerEntry(uid, docId) {
  if (typeof docId !== "string" || docId === "") throw new Error("An entry id is needed.");
  return deleteDoc(doc(db, "users", uid, "ledger", docId));
}

function formatDocItem(docSnapshot) {
  const { createdAt, ...otherData } = docSnapshot.data();
  return { id: docSnapshot.id, ...otherData, createdAtMs: createdAt ? createdAt.toMillis() : null };
}

function sortByNewest(items) {
  return items.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const aMs = a.createdAtMs === null ? Number.MAX_SAFE_INTEGER : a.createdAtMs;
    const bMs = b.createdAtMs === null ? Number.MAX_SAFE_INTEGER : b.createdAtMs;
    if (aMs !== bMs) return bMs - aMs;
    return a.id < b.id ? 1 : -1;
  });
}

export function watchLedger(uid, callback) {
  const ledgerQuery = query(getLedgerCollection(uid), orderBy("date", "desc"));
  return onSnapshot(
    ledgerQuery,
    (snapshot) => callback(sortByNewest(snapshot.docs.map(formatDocItem))),
    (error) => console.error("Ledger listener error:", error)
  );
}

export async function getLedgerFresh(uid) {
  const snapshot = await getDocsFromServer(query(getLedgerCollection(uid)));
  return sortByNewest(snapshot.docs.map(formatDocItem));
}
