import {
  collection, addDoc, deleteDoc, doc, query, orderBy, where, getDocs, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

export const CATEGORIES = [
  "Food", "Transport", "Bills", "Shopping", "Health", "Education", "Entertainment", "Other",
];

function gastosFolder(uidNya) {
  return collection(db, "users", uidNya, "expenses");
}

export function addExpense(uidNya, { amount, category, note, date }) {
  return addDoc(gastosFolder(uidNya), {
    amount: Number(amount),
    category,
    note: note || "",
    date,
    createdAt: serverTimestamp(),
  });
}

export function deleteExpense(uidNya, docIdNya) {
  return deleteDoc(doc(db, "users", uidNya, "expenses", docIdNya));
}

export function watchExpenses(uidNya, kapagMayList) {
  const hanapGastos = query(gastosFolder(uidNya), orderBy("date", "desc"));
  return onSnapshot(
    hanapGastos,
    (snapGastos) => kapagMayList(snapGastos.docs.map((isaDoc) => ({ id: isaDoc.id, ...isaDoc.data() }))),
    (siraListen) => console.error("Expenses listener error:", siraListen)
  );
}

export function todayString() {
  const arawNgayon = new Date();
  const buwanPad = String(arawNgayon.getMonth() + 1).padStart(2, "0");
  const arawPad = String(arawNgayon.getDate()).padStart(2, "0");
  return `${arawNgayon.getFullYear()}-${buwanPad}-${arawPad}`;
}

export function formatPeso(halagaNum) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(halagaNum);
}

export function isValidDate(petsaStr) {
  if (typeof petsaStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(petsaStr)) return false;
  const [taonNum, buwanNum, arawNum] = petsaStr.split("-").map(Number);
  const checkDt = new Date(taonNum, buwanNum - 1, arawNum);
  return checkDt.getFullYear() === taonNum && checkDt.getMonth() === buwanNum - 1 && checkDt.getDate() === arawNum;
}

export async function getExpensesInRange(uidNya, simulaPetsa, hanggangPetsa) {
  const hanapRange = query(
    gastosFolder(uidNya),
    where("date", ">=", simulaPetsa),
    where("date", "<=", hanggangPetsa)
  );
  const snapRange = await getDocs(hanapRange);
  return snapRange.docs
    .map((isaDoc) => ({ id: isaDoc.id, ...isaDoc.data() }))
    .sort((una, sunod) => (una.date < sunod.date ? 1 : -1));
}
