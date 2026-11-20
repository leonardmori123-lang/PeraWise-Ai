import { initChat } from "./chat.js";
import { signUp, logIn, logOut, watchAuth, friendlyError } from "./auth.js";
import {
  CATEGORIES, addExpense, deleteExpense, watchExpenses, todayString, formatPeso,
} from "./expenses.js";

// ---------- Auth elements ----------
const authView = document.getElementById("auth-view");
const appView = document.getElementById("app-view");
const authForm = document.getElementById("auth-form");
const nameField = document.getElementById("name-field");
const nameInput = document.getElementById("name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitBtn = document.getElementById("submit-btn");
const toggleLink = document.getElementById("toggle-mode");
const toggleText = document.getElementById("toggle-text");
const authTitle = document.getElementById("auth-title");
const authMessage = document.getElementById("auth-message");
const welcome = document.getElementById("welcome");
const logoutBtn = document.getElementById("logout-btn");

// ---------- Expense elements ----------
const expenseForm = document.getElementById("expense-form");
const amountInput = document.getElementById("amount");
const categorySelect = document.getElementById("category");
const dateInput = document.getElementById("date");
const noteInput = document.getElementById("note");
const addBtn = document.getElementById("add-btn");
const expenseMessage = document.getElementById("expense-message");
const expenseList = document.getElementById("expense-list");
const emptyMsg = document.getElementById("empty-msg");
const totalEl = document.getElementById("total");

let isSignUp = false;
let currentUser = null;
let stopExpenses = null;
const chat = initChat(() => currentUser);

// ---------- Auth UI ----------
function setMode(signUpMode) {
  isSignUp = signUpMode;
  authTitle.textContent = isSignUp ? "Create your account" : "Welcome back";
  submitBtn.textContent = isSignUp ? "Sign up" : "Log in";
  nameField.hidden = !isSignUp;
  toggleText.textContent = isSignUp ? "Already have an account?" : "New to PeraWise?";
  toggleLink.textContent = isSignUp ? "Log in" : "Sign up";
  passwordInput.autocomplete = isSignUp ? "new-password" : "current-password";
  authMessage.textContent = "";
}

function showWelcome(user) {
  welcome.textContent = "Hello, " + (user.displayName || user.email) + "!";
}

toggleLink.addEventListener("click", (e) => {
  e.preventDefault();
  setMode(!isSignUp);
});

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authMessage.textContent = "";
  submitBtn.disabled = true;
  try {
    const email = emailInput.value.trim();
    if (isSignUp) {
      const user = await signUp(nameInput.value.trim(), email, passwordInput.value);
      showWelcome(user);
    } else {
      await logIn(email, passwordInput.value);
    }
    authForm.reset();
  } catch (error) {
    authMessage.textContent = friendlyError(error);
  } finally {
    submitBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", () => logOut());

// ---------- Expenses UI ----------
function populateCategories() {
  CATEGORIES.forEach((c) => {
    const option = document.createElement("option");
    option.value = c;
    option.textContent = c;
    categorySelect.appendChild(option);
  });
}

function renderExpenses(items) {
  expenseList.replaceChildren();
  let total = 0;

  items.forEach((item) => {
    total += item.amount;

    const li = document.createElement("li");
    li.className = "expense";

    const info = document.createElement("div");
    info.className = "expense-info";
    const title = document.createElement("strong");
    title.textContent = item.note || item.category;
    const sub = document.createElement("span");
    sub.className = "muted";
    sub.textContent = item.category + " - " + item.date;
    info.append(title, sub);

    const amount = document.createElement("div");
    amount.className = "expense-amount";
    amount.textContent = formatPeso(item.amount);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "delete";
    del.textContent = "Delete";
    del.addEventListener("click", () => deleteExpense(currentUser.uid, item.id));

    li.append(info, amount, del);
    expenseList.appendChild(li);
  });

  totalEl.textContent = formatPeso(total);
  emptyMsg.hidden = items.length > 0;
}

expenseForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  expenseMessage.textContent = "";
  const amount = parseFloat(amountInput.value);
  if (!(amount > 0)) {
    expenseMessage.textContent = "Enter an amount greater than 0.";
    return;
  }
  addBtn.disabled = true;
  try {
    await addExpense(currentUser.uid, {
      amount,
      category: categorySelect.value,
      note: noteInput.value.trim(),
      date: dateInput.value,
    });
    expenseForm.reset();
    dateInput.value = todayString();
  } catch (error) {
    console.error(error);
    expenseMessage.textContent = "Could not save the expense. Please try again.";
  } finally {
    addBtn.disabled = false;
  }
});

// ---------- Start ----------
populateCategories();
dateInput.value = todayString();

watchAuth((user) => {
  chat.reset();
  currentUser = user;
  authView.hidden = !!user;
  appView.hidden = !user;

  if (stopExpenses) {
    stopExpenses();
    stopExpenses = null;
  }
  if (user) {
    showWelcome(user);
    stopExpenses = watchExpenses(user.uid, renderExpenses);
  } else {
    expenseList.replaceChildren();
  }
});