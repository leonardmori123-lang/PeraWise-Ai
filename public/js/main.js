import { initChat } from "./chat.js";
import { watchLedger } from "./ledger.js";
import { initLedgerPanel } from "./ledger-ui.js";
import { signUp, logIn, logOut, watchAuth, friendlyError } from "./auth.js";
import {
  CATEGORIES, addExpense, deleteExpense, watchExpenses, todayString, formatPeso,
} from "./expenses.js";

const authView = document.getElementById("auth-view");
const appView = document.getElementById("app-view");
const authForm = document.getElementById("auth-form");
const nameField = document.getElementById("name-field");
const nameInput = document.getElementById("name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitBtn = document.getElementById("submit-btn");
const toggleModeLink = document.getElementById("toggle-mode");
const toggleModeText = document.getElementById("toggle-text");
const authTitle = document.getElementById("auth-title");
const authMessage = document.getElementById("auth-message");
const welcomeMessage = document.getElementById("welcome");
const logoutBtn = document.getElementById("logout-btn");

const expenseForm = document.getElementById("expense-form");
const amountInput = document.getElementById("amount");
const categorySelect = document.getElementById("category");
const dateInput = document.getElementById("date");
const noteInput = document.getElementById("note");
const addExpenseBtn = document.getElementById("add-btn");
const expenseMessage = document.getElementById("expense-message");
const expenseList = document.getElementById("expense-list");
const emptyExpenseMsg = document.getElementById("empty-msg");
const totalSpentDisplay = document.getElementById("total");

let isSignUpMode = false;
let currentUser = null;
let unsubscribeExpenses = null;
let unsubscribeLedger = null;
const ledgerPanel = initLedgerPanel(() => currentUser);
const chat = initChat(() => currentUser, () => ledgerPanel.getFriendNames());

function toggleAuthMode(isSignUp) {
  isSignUpMode = isSignUp;
  authTitle.textContent = isSignUpMode ? "Create your account" : "Welcome back";
  submitBtn.textContent = isSignUpMode ? "Sign up" : "Log in";
  nameField.hidden = !isSignUpMode;
  toggleModeText.textContent = isSignUpMode ? "Already have an account?" : "New to PeraWise?";
  toggleModeLink.textContent = isSignUpMode ? "Log in" : "Sign up";
  passwordInput.autocomplete = isSignUpMode ? "new-password" : "current-password";
  authMessage.textContent = "";
}

function greetUser(user) {
  welcomeMessage.textContent = "Hello, " + (user.displayName || user.email) + "!";
}

toggleModeLink.addEventListener("click", (event) => {
  event.preventDefault();
  toggleAuthMode(!isSignUpMode);
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authMessage.textContent = "";
  submitBtn.disabled = true;
  try {
    const email = emailInput.value.trim();
    if (isSignUpMode) {
      const newUser = await signUp(nameInput.value.trim(), email, passwordInput.value);
      greetUser(newUser);
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

function populateCategories() {
  CATEGORIES.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categorySelect.appendChild(option);
  });
}

function renderExpenses(items) {
  expenseList.replaceChildren();
  let total = 0;

  items.forEach((item) => {
    total += item.amount;

    const listItem = document.createElement("li");
    listItem.className = "expense";

    const infoBox = document.createElement("div");
    infoBox.className = "expense-info";
    const title = document.createElement("strong");
    title.textContent = item.note || item.category;
    const details = document.createElement("span");
    details.className = "muted";
    details.textContent = item.category + " - " + item.date;
    infoBox.append(title, details);

    const amountDisplay = document.createElement("div");
    amountDisplay.className = "expense-amount";
    amountDisplay.textContent = formatPeso(item.amount);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deleteExpense(currentUser.uid, item.id));

    listItem.append(infoBox, amountDisplay, deleteBtn);
    expenseList.appendChild(listItem);
  });

  totalSpentDisplay.textContent = formatPeso(total);
  emptyExpenseMsg.hidden = items.length > 0;
}

expenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  expenseMessage.textContent = "";
  const amount = parseFloat(amountInput.value);
  if (!(amount > 0)) {
    expenseMessage.textContent = "Enter an amount greater than 0.";
    return;
  }
  addExpenseBtn.disabled = true;
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
    addExpenseBtn.disabled = false;
  }
});

populateCategories();
dateInput.value = todayString();

watchAuth((user) => {
  chat.reset();
  currentUser = user;
  authView.hidden = !!user;
  appView.hidden = !user;

  if (unsubscribeExpenses) {
    unsubscribeExpenses();
    unsubscribeExpenses = null;
  }
  if (unsubscribeLedger) {
    unsubscribeLedger();
    unsubscribeLedger = null;
  }
  ledgerPanel.clear();
  if (user) {
    greetUser(user);
    unsubscribeExpenses = watchExpenses(user.uid, renderExpenses);
    unsubscribeLedger = watchLedger(user.uid, ledgerPanel.render);
  } else {
    expenseList.replaceChildren();
  }
});
