import { deleteLedgerEntry } from "./ledger.js";
import { computeBalances, formatCentavos } from "./ledger-math.js";

console.info("ledger-ui.js loaded");

// Draws the "Who owes whom" panel. The HTML structure and class names match
// dev/panel-preview.html, so ledger.css styles it. Everything is set with
// textContent (never innerHTML), so a friend's name can never run as code.

const TYPE_LABELS = {
  lent: "Lent",
  borrowed: "Borrowed",
  they_paid: "Paid you back",
  i_paid: "You paid back",
};

function balanceText(balanceCentavos) {
  if (balanceCentavos > 0) return "Owes you " + formatCentavos(balanceCentavos);
  if (balanceCentavos < 0) return "You owe " + formatCentavos(-balanceCentavos);
  return "Settled";
}

export function initLedgerPanel(getUser) {
  const owedEl = document.getElementById("ledger-owed");
  const oweEl = document.getElementById("ledger-owe");
  const emptyEl = document.getElementById("ledger-empty");
  const listEl = document.getElementById("friend-list");
  const messageEl = document.getElementById("ledger-message");

  // Friends whose history is open. Kept when the list refreshes, so a live update does not close it.
  const open = new Set();

  async function removeEntry(entry, button) {
    const user = getUser();
    if (!user) return;
    if (!window.confirm("Delete this entry? The balance will change.")) return;
    messageEl.textContent = "";
    button.disabled = true;
    try {
      await deleteLedgerEntry(user.uid, entry.id);
    } catch (error) {
      console.error("Could not delete the ledger entry:", error);
      messageEl.textContent = "Could not delete the entry. Please try again.";
      button.disabled = false;
    }
  }

  function buildEntry(entry) {
    const li = document.createElement("li");
    li.className = "entry";

    const label = TYPE_LABELS[entry.type] || entry.type;
    const title = document.createElement("strong");
    const sub = document.createElement("span");
    sub.className = "muted";
    if (entry.note) {
      title.textContent = entry.note;
      sub.textContent = label + " - " + entry.date;
    } else {
      title.textContent = label;
      sub.textContent = entry.date;
    }
    const info = document.createElement("div");
    info.className = "entry-info";
    info.append(title, sub);

    const amount = document.createElement("span");
    amount.className = "entry-amount";
    amount.textContent = formatCentavos(Math.round(entry.amount * 100));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "delete";
    del.textContent = "Delete";
    del.addEventListener("click", () => removeEntry(entry, del));

    li.append(info, amount, del);
    return li;
  }

  function buildFriend(friend, entries) {
    const li = document.createElement("li");
    const state = friend.balanceCentavos > 0 ? "positive" : friend.balanceCentavos < 0 ? "negative" : "settled";
    li.className = "friend " + state;
    li.dataset.key = friend.friendKey;

    const isOpen = open.has(friend.friendKey);

    const name = document.createElement("span");
    name.className = "friend-name";
    name.textContent = friend.friendName;
    const balance = document.createElement("span");
    balance.className = "friend-balance";
    balance.textContent = balanceText(friend.balanceCentavos);

    const row = document.createElement("button");
    row.type = "button";
    row.className = "friend-row";
    row.setAttribute("aria-expanded", String(isOpen));
    row.append(name, balance);

    const history = document.createElement("ul");
    history.className = "history";
    history.hidden = !isOpen;
    entries.forEach((entry) => history.appendChild(buildEntry(entry)));

    row.addEventListener("click", () => {
      const nowOpen = row.getAttribute("aria-expanded") !== "true";
      row.setAttribute("aria-expanded", String(nowOpen));
      history.hidden = !nowOpen;
      if (nowOpen) open.add(friend.friendKey);
      else open.delete(friend.friendKey);
    });

    li.append(row, history);
    return li;
  }

  // entries: newest first (that is what watchLedger gives us)
  function render(entries) {
    // Remember which friend had the keyboard focus, so a live update does not drop it
    const active = document.activeElement;
    const focusedFriend = active && active.closest ? active.closest(".friend") : null;
    const focusedKey = focusedFriend ? focusedFriend.dataset.key : null;

    const { friends, owedToYou, youOwe } = computeBalances(entries);
    owedEl.textContent = formatCentavos(owedToYou);
    oweEl.textContent = formatCentavos(youOwe);
    emptyEl.hidden = friends.length > 0;

    const byKey = new Map();
    for (const entry of entries) {
      if (!byKey.has(entry.friendKey)) byKey.set(entry.friendKey, []);
      byKey.get(entry.friendKey).push(entry);
    }

    listEl.replaceChildren(...friends.map((f) => buildFriend(f, byKey.get(f.friendKey) || [])));

    for (const key of [...open]) {
      if (!byKey.has(key)) open.delete(key);
    }
    if (focusedKey !== null) {
      for (const li of listEl.children) {
        if (li.dataset.key === focusedKey) {
          const row = li.querySelector(".friend-row");
          if (row) row.focus();
        }
      }
    }
  }

  // Used on login and logout, so one user never sees another user's list
  function clear() {
    open.clear();
    messageEl.textContent = "";
    render([]);
  }

  return { render, clear };
}