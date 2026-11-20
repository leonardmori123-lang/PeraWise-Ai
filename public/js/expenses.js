import {
  collection, addDoc, deleteDoc, doc, query, orderBy, where, getDocs, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

export const CATEGORIES = [
  "Food", "Transport", "Bills", "Shopping", "Health", "Education", "Entertainment", "Other",
];

function expensesRef(uid) {
  return collection(db, "users", uid, "expenses");
}

export function addExpense(uid, { amount, category, note, date }) {
  return addDoc(expensesRef(uid), {
    amount: Number(amount),
    category,
    note: note || "",
    date, // "YYYY-MM-DD"
    createdAt: serverTimestamp(),
  });
}

export function deleteExpense(uid, id) {
  return deleteDoc(doc(db, "users", uid, "expenses", id));
}

export function watchExpenses(uid, callback) {
  const q = query(expensesRef(uid), orderBy("date", "desc"));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error("Expenses listener error:", err)
  );
}

// Local date as YYYY-MM-DD (avoids the UTC off-by-one-day problem in the Philippines)
export function todayString() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function formatPeso(value) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}

// True only for real dates written as YYYY-MM-DD
export function isValidDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// All expenses between two dates (inclusive), newest first
export async function getExpensesInRange(uid, startDate, endDate) {
  const q = query(
    expensesRef(uid),
    where("date", ">=", startDate),
    where("date", "<=", endDate)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}