import { deleteLedgerEntry } from "./ledger.js";
import { computeBalances, formatCents } from "./ledger-math.js";

console.info("ledger-ui.js loaded");

const TYPE_LABELS = {
  lent: "Lent",
  borrowed: "Borrowed",
  they_paid: "Paid you back",
  i_paid: "You paid back",
};

function formatBalanceStatus(cents) {
  if (cents > 0) return "Owes you " + formatCents(cents);
  if (cents < 0) return "You owe " + formatCents(-cents);
  return "Settled";
}

export function initLedgerPanel(getUser) {
  const owedBox = document.getElementById("ledger-owed");
  const oweBox = document.getElementById("ledger-owe");
  const emptyBox = document.getElementById("ledger-empty");
  const listBox = document.getElementById("friend-list");
  const msgBox = document.getElementById("ledger-message");

  const expandedFriendKeys = new Set();
  let friendNamesList = [];

  async function handleDeleteEntry(entry, deleteBtn) {
    const user = getUser();
    if (!user) return;
    if (!window.confirm("Delete this entry? The balance will change.")) return;
    msgBox.textContent = "";
    deleteBtn.disabled = true;
    try {
      await deleteLedgerEntry(user.uid, entry.id);
    } catch (error) {
      console.error("Could not delete the ledger entry:", error);
      msgBox.textContent = "Could not delete the entry. Please try again.";
      deleteBtn.disabled = false;
    }
  }

  function createEntryListItem(entry) {
    const listItem = document.createElement("li");
    listItem.className = "entry";

    const typeText = TYPE_LABELS[entry.type] || entry.type;
    const title = document.createElement("strong");
    const details = document.createElement("span");
    details.className = "muted";
    if (entry.note) {
      title.textContent = entry.note;
      details.textContent = typeText + " - " + entry.date;
    } else {
      title.textContent = typeText;
      details.textContent = entry.date;
    }
    const infoBox = document.createElement("div");
    infoBox.className = "entry-info";
    infoBox.append(title, details);

    const amountDisplay = document.createElement("span");
    amountDisplay.className = "entry-amount";
    amountDisplay.textContent = formatCents(Math.round(entry.amount * 100));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => handleDeleteEntry(entry, deleteBtn));

    listItem.append(infoBox, amountDisplay, deleteBtn);
    return listItem;
  }

  function createFriendListItem(friend, entries) {
    const listItem = document.createElement("li");
    const statusClass = friend.balanceCents > 0 ? "positive" : friend.balanceCents < 0 ? "negative" : "settled";
    listItem.className = "friend " + statusClass;
    listItem.dataset.key = friend.friendKey;

    const isExpanded = expandedFriendKeys.has(friend.friendKey);

    const nameSpan = document.createElement("span");
    nameSpan.className = "friend-name";
    nameSpan.textContent = friend.friendName;
    const balanceSpan = document.createElement("span");
    balanceSpan.className = "friend-balance";
    balanceSpan.textContent = formatBalanceStatus(friend.balanceCents);

    const rowBtn = document.createElement("button");
    rowBtn.type = "button";
    rowBtn.className = "friend-row";
    rowBtn.setAttribute("aria-expanded", String(isExpanded));
    rowBtn.append(nameSpan, balanceSpan);

    const historyList = document.createElement("ul");
    historyList.className = "history";
    historyList.hidden = !isExpanded;
    entries.forEach((entry) => historyList.appendChild(createEntryListItem(entry)));

    rowBtn.addEventListener("click", () => {
      const willExpand = rowBtn.getAttribute("aria-expanded") !== "true";
      rowBtn.setAttribute("aria-expanded", String(willExpand));
      historyList.hidden = !willExpand;
      if (willExpand) expandedFriendKeys.add(friend.friendKey);
      else expandedFriendKeys.delete(friend.friendKey);
    });

    listItem.append(rowBtn, historyList);
    return listItem;
  }

  function render(entries) {
    const activeElement = document.activeElement;
    const activeFriendRow = activeElement && activeElement.closest ? activeElement.closest(".friend") : null;
    const focusedKey = activeFriendRow ? activeFriendRow.dataset.key : null;

    const { friends, owedToYou, youOwe } = computeBalances(entries);
    friendNamesList = friends.map((friend) => friend.friendName);
    owedBox.textContent = formatCents(owedToYou);
    oweBox.textContent = formatCents(youOwe);
    emptyBox.hidden = friends.length > 0;

    const entriesByKey = new Map();
    for (const entry of entries) {
      if (!entriesByKey.has(entry.friendKey)) entriesByKey.set(entry.friendKey, []);
      entriesByKey.get(entry.friendKey).push(entry);
    }

    listBox.replaceChildren(...friends.map((friend) => createFriendListItem(friend, entriesByKey.get(friend.friendKey) || [])));

    for (const key of [...expandedFriendKeys]) {
      if (!entriesByKey.has(key)) expandedFriendKeys.delete(key);
    }
    if (focusedKey !== null) {
      for (const listItem of listBox.children) {
        if (listItem.dataset.key === focusedKey) {
          const rowBtn = listItem.querySelector(".friend-row");
          if (rowBtn) rowBtn.focus();
        }
      }
    }
  }

  function clear() {
    expandedFriendKeys.clear();
    msgBox.textContent = "";
    render([]);
  }

  return { render, clear, getFriendNames: () => friendNamesList.slice() };
}
