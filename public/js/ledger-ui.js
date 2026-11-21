import { deleteLedgerEntry } from "./ledger.js";
import { computeBalances, formatCentavos } from "./ledger-math.js";

console.info("ledger-ui.js loaded");

const tipoLabel = {
  lent: "Lent",
  borrowed: "Borrowed",
  they_paid: "Paid you back",
  i_paid: "You paid back",
};

function balasahin(sentimoVal) {
  if (sentimoVal > 0) return "Owes you " + formatCentavos(sentimoVal);
  if (sentimoVal < 0) return "You owe " + formatCentavos(-sentimoVal);
  return "Settled";
}

export function initLedgerPanel(kuninUser) {
  const owedBox = document.getElementById("ledger-owed");
  const oweBox = document.getElementById("ledger-owe");
  const emptyBox = document.getElementById("ledger-empty");
  const listBox = document.getElementById("friend-list");
  const msgBox = document.getElementById("ledger-message");

  const bukasSet = new Set();
  let pangalanList = [];

  async function burahinEntry(isaEntry, btnNya) {
    const sinoUser = kuninUser();
    if (!sinoUser) return;
    if (!window.confirm("Delete this entry? The balance will change.")) return;
    msgBox.textContent = "";
    btnNya.disabled = true;
    try {
      await deleteLedgerEntry(sinoUser.uid, isaEntry.id);
    } catch (siraDel) {
      console.error("Could not delete the ledger entry:", siraDel);
      msgBox.textContent = "Could not delete the entry. Please try again.";
      btnNya.disabled = false;
    }
  }

  function gawaEntryLi(isaEntry) {
    const rowLi = document.createElement("li");
    rowLi.className = "entry";

    const tipoTxt = tipoLabel[isaEntry.type] || isaEntry.type;
    const pamagat = document.createElement("strong");
    const detalye = document.createElement("span");
    detalye.className = "muted";
    if (isaEntry.note) {
      pamagat.textContent = isaEntry.note;
      detalye.textContent = tipoTxt + " - " + isaEntry.date;
    } else {
      pamagat.textContent = tipoTxt;
      detalye.textContent = isaEntry.date;
    }
    const infoBox = document.createElement("div");
    infoBox.className = "entry-info";
    infoBox.append(pamagat, detalye);

    const pesoBox = document.createElement("span");
    pesoBox.className = "entry-amount";
    pesoBox.textContent = formatCentavos(Math.round(isaEntry.amount * 100));

    const burahinBtn = document.createElement("button");
    burahinBtn.type = "button";
    burahinBtn.className = "delete";
    burahinBtn.textContent = "Delete";
    burahinBtn.addEventListener("click", () => burahinEntry(isaEntry, burahinBtn));

    rowLi.append(infoBox, pesoBox, burahinBtn);
    return rowLi;
  }

  function gawaFriendLi(isaFriend, mgaEntry) {
    const rowLi = document.createElement("li");
    const estadoNya = isaFriend.balanceCentavos > 0 ? "positive" : isaFriend.balanceCentavos < 0 ? "negative" : "settled";
    rowLi.className = "friend " + estadoNya;
    rowLi.dataset.key = isaFriend.friendKey;

    const nakaBukas = bukasSet.has(isaFriend.friendKey);

    const pangalanSpan = document.createElement("span");
    pangalanSpan.className = "friend-name";
    pangalanSpan.textContent = isaFriend.friendName;
    const balSpan = document.createElement("span");
    balSpan.className = "friend-balance";
    balSpan.textContent = balasahin(isaFriend.balanceCentavos);

    const rowBtn = document.createElement("button");
    rowBtn.type = "button";
    rowBtn.className = "friend-row";
    rowBtn.setAttribute("aria-expanded", String(nakaBukas));
    rowBtn.append(pangalanSpan, balSpan);

    const historyUl = document.createElement("ul");
    historyUl.className = "history";
    historyUl.hidden = !nakaBukas;
    mgaEntry.forEach((isaEntry) => historyUl.appendChild(gawaEntryLi(isaEntry)));

    rowBtn.addEventListener("click", () => {
      const buksanNa = rowBtn.getAttribute("aria-expanded") !== "true";
      rowBtn.setAttribute("aria-expanded", String(buksanNa));
      historyUl.hidden = !buksanNa;
      if (buksanNa) bukasSet.add(isaFriend.friendKey);
      else bukasSet.delete(isaFriend.friendKey);
    });

    rowLi.append(rowBtn, historyUl);
    return rowLi;
  }

  function render(listahanEntry) {
    const nakaFocus = document.activeElement;
    const friendFocus = nakaFocus && nakaFocus.closest ? nakaFocus.closest(".friend") : null;
    const susiFocus = friendFocus ? friendFocus.dataset.key : null;

    const { friends, owedToYou, youOwe } = computeBalances(listahanEntry);
    pangalanList = friends.map((isaFriend) => isaFriend.friendName);
    owedBox.textContent = formatCentavos(owedToYou);
    oweBox.textContent = formatCentavos(youOwe);
    emptyBox.hidden = friends.length > 0;

    const perSusi = new Map();
    for (const isaEntry of listahanEntry) {
      if (!perSusi.has(isaEntry.friendKey)) perSusi.set(isaEntry.friendKey, []);
      perSusi.get(isaEntry.friendKey).push(isaEntry);
    }

    listBox.replaceChildren(...friends.map((isaFriend) => gawaFriendLi(isaFriend, perSusi.get(isaFriend.friendKey) || [])));

    for (const susiNya of [...bukasSet]) {
      if (!perSusi.has(susiNya)) bukasSet.delete(susiNya);
    }
    if (susiFocus !== null) {
      for (const rowLi of listBox.children) {
        if (rowLi.dataset.key === susiFocus) {
          const rowBtn = rowLi.querySelector(".friend-row");
          if (rowBtn) rowBtn.focus();
        }
      }
    }
  }

  function clear() {
    bukasSet.clear();
    msgBox.textContent = "";
    render([]);
  }

  return { render, clear, getFriendNames: () => pangalanList.slice() };
}
