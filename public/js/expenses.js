import {
  collection, addDoc, deleteDoc, doc, query, orderBy, where, getDocs, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

export const CATEGORIES = [
  "Food", "Transport", "Bills", "Shopping", "Health", "Education", "Entertainment", "Other",
];

function getExpensesCollection(uid) {
  return collection(db, "users", uid, "expenses");
}

export function addExpense(uid, { amount, category, note, date }) {
  return addDoc(getExpensesCollection(uid), {
    amount: Number(amount),
    category,
    note: note || "",
    date,
    createdAt: serverTimestamp(),
  });
}

export function deleteExpense(uid, docId) {
  return deleteDoc(doc(db, "users", uid, "expenses", docId));
}

export function watchExpenses(uid, callback) {
  const expensesQuery = query(getExpensesCollection(uid), orderBy("date", "desc"));
  return onSnapshot(
    expensesQuery,
    (snapshot) => callback(snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }))),
    (error) => console.error("Expenses listener error:", error)
  );
}

export function todayString() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

export function formatPeso(amount) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);
}

export function isValidDate(dateString) {
  if (typeof dateString !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;
  const [year, month, day] = dateString.split("-").map(Number);
  const checkDate = new Date(year, month - 1, day);
  return checkDate.getFullYear() === year && checkDate.getMonth() === month - 1 && checkDate.getDate() === day;
}

export async function getExpensesInRange(uid, startDate, endDate) {
  const rangeQuery = query(
    getExpensesCollection(uid),
    where("date", ">=", startDate),
    where("date", "<=", endDate)
  );
  const snapshot = await getDocs(rangeQuery);
  return snapshot.docs
    .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
