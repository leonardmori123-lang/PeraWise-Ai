import {
  collection, doc, deleteDoc, query, orderBy, onSnapshot, getDocsFromServer, writeBatch, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { isValidDate, todayString } from "./expenses.js";
import { ENTRY_TYPES, MAX_AMOUNT_CENTAVOS, cleanName, centavosToPesos } from "./ledger-math.js";

console.info("ledger.js loaded");

const MAX_SAVE_BATCH = 20;
const MAX_NOTE_CHARS = 200;

function utangFolder(uidNya) {
  return collection(db, "users", uidNya, "ledger");
}

function putolText(sulat, maxChars) {
  let resultSulat = "";
  for (const isaChar of sulat) {
    if (resultSulat.length + isaChar.length > maxChars) break;
    resultSulat += isaChar;
  }
  return resultSulat;
}

function linisNote(hilawNote) {
  const sulat = String(hilawNote || "")
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return putolText(sulat, MAX_NOTE_CHARS);
}

function handaEntry(isaEntry) {
  const pangalan = cleanName(isaEntry && isaEntry.friendName);
  if (pangalan.error) throw new Error(pangalan.error);

  if (!ENTRY_TYPES.includes(isaEntry.type)) {
    throw new Error("Unknown ledger entry type.");
  }
  const sentimoVal = isaEntry.amountCentavos;
  if (!Number.isInteger(sentimoVal) || sentimoVal < 1 || sentimoVal > MAX_AMOUNT_CENTAVOS) {
    throw new Error("The amount must be a whole number of centavos between 1 and " + MAX_AMOUNT_CENTAVOS + ".");
  }
  const petsaVal = isaEntry.date || todayString();
  if (!isValidDate(petsaVal)) {
    throw new Error("The date must be a real date written as YYYY-MM-DD.");
  }

  return {
    friendName: pangalan.name,
    friendKey: pangalan.key,
    type: isaEntry.type,
    amount: centavosToPesos(sentimoVal),
    note: linisNote(isaEntry.note),
    date: petsaVal,
  };
}

export async function addLedgerEntries(uidNya, listahanEntry) {
  if (!Array.isArray(listahanEntry) || listahanEntry.length < 1 || listahanEntry.length > MAX_SAVE_BATCH) {
    throw new Error("Save between 1 and " + MAX_SAVE_BATCH + " ledger entries at a time.");
  }
  const readyRows = listahanEntry.map(handaEntry);

  const batchWrite = writeBatch(db);
  const naisave = [];
  for (const rowData of readyRows) {
    const bagongRef = doc(utangFolder(uidNya));
    batchWrite.set(bagongRef, { ...rowData, createdAt: serverTimestamp() });
    naisave.push({ id: bagongRef.id, ...rowData });
  }
  await batchWrite.commit();
  return naisave;
}

export function deleteLedgerEntry(uidNya, docIdNya) {
  if (typeof docIdNya !== "string" || docIdNya === "") throw new Error("An entry id is needed.");
  return deleteDoc(doc(db, "users", uidNya, "ledger", docIdNya));
}

function gawingItem(snapDoc) {
  const { createdAt, ...ibaData } = snapDoc.data();
  return { id: snapDoc.id, ...ibaData, createdAtMs: createdAt ? createdAt.toMillis() : null };
}

function newestMuna(mgaItem) {
  return mgaItem.sort((una, sunod) => {
    if (una.date !== sunod.date) return una.date < sunod.date ? 1 : -1;
    const unaMs = una.createdAtMs === null ? Number.MAX_SAFE_INTEGER : una.createdAtMs;
    const sunodMs = sunod.createdAtMs === null ? Number.MAX_SAFE_INTEGER : sunod.createdAtMs;
    if (unaMs !== sunodMs) return sunodMs - unaMs;
    return una.id < sunod.id ? 1 : -1;
  });
}

export function watchLedger(uidNya, kapagMayList) {
  const hanapUtang = query(utangFolder(uidNya), orderBy("date", "desc"));
  return onSnapshot(
    hanapUtang,
    (snapUtang) => kapagMayList(newestMuna(snapUtang.docs.map(gawingItem))),
    (siraListen) => console.error("Ledger listener error:", siraListen)
  );
}

export async function getLedgerFresh(uidNya) {
  const snapFresh = await getDocsFromServer(query(utangFolder(uidNya)));
  return newestMuna(snapFresh.docs.map(gawingItem));
}
