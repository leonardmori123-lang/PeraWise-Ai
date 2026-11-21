import { initChat } from "./chat.js";
import { watchLedger } from "./ledger.js";
import { initLedgerPanel } from "./ledger-ui.js";
import { signUp, logIn, logOut, watchAuth, friendlyError } from "./auth.js";
import {
  CATEGORIES, addExpense, deleteExpense, watchExpenses, todayString, formatPeso,
} from "./expenses.js";

const loginBox = document.getElementById("auth-view");
const homeBox = document.getElementById("app-view");
const loginForm = document.getElementById("auth-form");
const pangalanField = document.getElementById("name-field");
const pangalanInput = document.getElementById("name");
const emailBox = document.getElementById("email");
const passBox = document.getElementById("password");
const pasokBtn = document.getElementById("submit-btn");
const palitLink = document.getElementById("toggle-mode");
const palitTxt = document.getElementById("toggle-text");
const loginTitle = document.getElementById("auth-title");
const loginMsg = document.getElementById("auth-message");
const helloLine = document.getElementById("welcome");
const labasBtn = document.getElementById("logout-btn");

const gastosForm = document.getElementById("expense-form");
const halagaBox = document.getElementById("amount");
const kategoryaBox = document.getElementById("category");
const petsaBox = document.getElementById("date");
const noteBox = document.getElementById("note");
const dagdagBtn = document.getElementById("add-btn");
const gastosMsg = document.getElementById("expense-message");
const gastosUl = document.getElementById("expense-list");
const walangGastos = document.getElementById("empty-msg");
const totalBox = document.getElementById("total");

let gawaAccount = false;
let nakaLogin = null;
let tigilGastos = null;
let tigilUtang = null;
const panelUtang = initLedgerPanel(() => nakaLogin);
const usapChat = initChat(() => nakaLogin, () => panelUtang.getFriendNames());

function palitMode(signUpMuna) {
  gawaAccount = signUpMuna;
  loginTitle.textContent = gawaAccount ? "Create your account" : "Welcome back";
  pasokBtn.textContent = gawaAccount ? "Sign up" : "Log in";
  pangalanField.hidden = !gawaAccount;
  palitTxt.textContent = gawaAccount ? "Already have an account?" : "New to PeraWise?";
  palitLink.textContent = gawaAccount ? "Log in" : "Sign up";
  passBox.autocomplete = gawaAccount ? "new-password" : "current-password";
  loginMsg.textContent = "";
}

function sabihinHello(sinoUser) {
  helloLine.textContent = "Hello, " + (sinoUser.displayName || sinoUser.email) + "!";
}

palitLink.addEventListener("click", (clickEvt) => {
  clickEvt.preventDefault();
  palitMode(!gawaAccount);
});

loginForm.addEventListener("submit", async (submitEvt) => {
  submitEvt.preventDefault();
  loginMsg.textContent = "";
  pasokBtn.disabled = true;
  try {
    const sulatEmail = emailBox.value.trim();
    if (gawaAccount) {
      const bagongUser = await signUp(pangalanInput.value.trim(), sulatEmail, passBox.value);
      sabihinHello(bagongUser);
    } else {
      await logIn(sulatEmail, passBox.value);
    }
    loginForm.reset();
  } catch (siraAuth) {
    loginMsg.textContent = friendlyError(siraAuth);
  } finally {
    pasokBtn.disabled = false;
  }
});

labasBtn.addEventListener("click", () => logOut());

function lagayKategorya() {
  CATEGORIES.forEach((pangalanCat) => {
    const optNya = document.createElement("option");
    optNya.value = pangalanCat;
    optNya.textContent = pangalanCat;
    kategoryaBox.appendChild(optNya);
  });
}

function ipakitaGastos(mgaItem) {
  gastosUl.replaceChildren();
  let kabuuan = 0;

  mgaItem.forEach((isaItem) => {
    kabuuan += isaItem.amount;

    const rowLi = document.createElement("li");
    rowLi.className = "expense";

    const infoBox = document.createElement("div");
    infoBox.className = "expense-info";
    const pamagat = document.createElement("strong");
    pamagat.textContent = isaItem.note || isaItem.category;
    const detalye = document.createElement("span");
    detalye.className = "muted";
    detalye.textContent = isaItem.category + " - " + isaItem.date;
    infoBox.append(pamagat, detalye);

    const pesoBox = document.createElement("div");
    pesoBox.className = "expense-amount";
    pesoBox.textContent = formatPeso(isaItem.amount);

    const burahinBtn = document.createElement("button");
    burahinBtn.type = "button";
    burahinBtn.className = "delete";
    burahinBtn.textContent = "Delete";
    burahinBtn.addEventListener("click", () => deleteExpense(nakaLogin.uid, isaItem.id));

    rowLi.append(infoBox, pesoBox, burahinBtn);
    gastosUl.appendChild(rowLi);
  });

  totalBox.textContent = formatPeso(kabuuan);
  walangGastos.hidden = mgaItem.length > 0;
}

gastosForm.addEventListener("submit", async (submitEvt) => {
  submitEvt.preventDefault();
  gastosMsg.textContent = "";
  const halagaNum = parseFloat(halagaBox.value);
  if (!(halagaNum > 0)) {
    gastosMsg.textContent = "Enter an amount greater than 0.";
    return;
  }
  dagdagBtn.disabled = true;
  try {
    await addExpense(nakaLogin.uid, {
      amount: halagaNum,
      category: kategoryaBox.value,
      note: noteBox.value.trim(),
      date: petsaBox.value,
    });
    gastosForm.reset();
    petsaBox.value = todayString();
  } catch (siraSave) {
    console.error(siraSave);
    gastosMsg.textContent = "Could not save the expense. Please try again.";
  } finally {
    dagdagBtn.disabled = false;
  }
});

lagayKategorya();
petsaBox.value = todayString();

watchAuth((sinoUser) => {
  usapChat.reset();
  nakaLogin = sinoUser;
  loginBox.hidden = !!sinoUser;
  homeBox.hidden = !sinoUser;

  if (tigilGastos) {
    tigilGastos();
    tigilGastos = null;
  }
  if (tigilUtang) {
    tigilUtang();
    tigilUtang = null;
  }
  panelUtang.clear();
  if (sinoUser) {
    sabihinHello(sinoUser);
    tigilGastos = watchExpenses(sinoUser.uid, ipakitaGastos);
    tigilUtang = watchLedger(sinoUser.uid, panelUtang.render);
  } else {
    gastosUl.replaceChildren();
  }
});
