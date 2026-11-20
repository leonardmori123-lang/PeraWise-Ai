// Pure helpers for the utang ledger.
// This file has NO Firebase and NO page code, so it can be tested in a plain browser page or in Node.
// All money maths is done in whole centavos (integers) to avoid floating-point mistakes.
// Firestore stores pesos (like expenses do), so use centavosToPesos() when saving
// and pesosToCentavos() when reading.

console.info("ledger-math.js loaded");

// ---------- Constants ----------
// lent       = "Ana owes me"        -> balance +
// borrowed   = "I owe Ana"          -> balance -
// they_paid  = "Ana paid me back"   -> balance -
// i_paid     = "I paid Ana back"    -> balance +
// A positive balance means the friend owes you. A negative balance means you owe the friend.
export const ENTRY_TYPES = ["lent", "borrowed", "they_paid", "i_paid"];
const SIGN = { lent: 1, borrowed: -1, they_paid: -1, i_paid: 1 };

export const MAX_NAME_LENGTH = 40;
export const MAX_FRIENDS_PER_SPLIT = 20;
export const MAX_AMOUNT_CENTAVOS = 999999999; // 1 centavo less than 10,000,000 pesos (the rules limit)

// Words that mean "the user", so they are never saved as a friend
const SELF_WORDS = ["me", "i", "myself", "ako"];

// ---------- Money helpers ----------
export function pesosToCentavos(pesos) {
  const usable =
    typeof pesos === "number" || (typeof pesos === "string" && pesos.trim() !== "");
  const n = usable ? Number(pesos) : NaN;
  if (!Number.isFinite(n) || n <= 0) {
    return { error: "The amount must be a number greater than 0." };
  }
  const centavos = Math.round(n * 100);
  if (centavos < 1) return { error: "The amount is too small." };
  if (centavos > MAX_AMOUNT_CENTAVOS) return { error: "The amount is too large." };
  return { centavos };
}

export function centavosToPesos(centavos) {
  return Math.round(centavos) / 100;
}

// 123456 -> "₱1,234.56" (same look as formatPeso in expenses.js, but always the same in every browser)
export function formatCentavos(centavos) {
  const sign = centavos < 0 ? "-" : "";
  const abs = Math.abs(Math.round(centavos));
  const pesos = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = String(abs % 100).padStart(2, "0");
  return sign + "₱" + pesos + "." + cents;
}

// ---------- Names ----------
// Returns { name, key } for a good name, or { error } (plus self: true if it means the user).
// name = what we show ("Ana"). key = what we group by ("ana").
export function cleanName(raw) {
  if (typeof raw !== "string") return { error: "A friend's name is needed." };

  const name = raw
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ") // new lines, tabs and other control characters become spaces
    .replace(/\p{Cf}/gu, "") // invisible characters (zero-width, text-direction marks) are removed
    .replace(/\s+/g, " ")
    .trim();

  if (!name) return { error: "A friend's name is needed." };
  if (!/[\p{L}\p{N}]/u.test(name)) {
    return { error: "A friend's name needs at least one letter or number." };
  }

  const key = name.toLowerCase();
  if (SELF_WORDS.includes(key)) {
    return { error: "That word means the user, not a friend. Use the friend's real name.", self: true };
  }
  if (name.length > MAX_NAME_LENGTH || key.length > MAX_NAME_LENGTH) {
    return { error: "A friend's name can be at most " + MAX_NAME_LENGTH + " characters." };
  }
  return { name, key };
}

// Short, safe text for error messages (JSON.stringify hides control characters)
function quoted(raw) {
  return JSON.stringify(String(raw).slice(0, MAX_NAME_LENGTH));
}

// ---------- Splitting a bill ----------
// The user is ALWAYS part of the split. "friends" holds only the other people.
// Everyone pays the same share, rounded DOWN to a whole centavo. The person who paid keeps the leftover centavos.
//
//   paidBy = "me" (or empty)  -> one "lent" entry per friend
//   paidBy = a friend's name  -> one "borrowed" entry for that friend (your share only)
//
// Returns { totalCentavos, headcount, shareCentavos, myShareCentavos, remainderCentavos, payer, entries }
// or { error }. Each entry is { friendName, friendKey, type, amountCentavos }.
export function splitBill({ totalCentavos, friends, paidBy = "me" } = {}) {
  if (
    !Number.isInteger(totalCentavos) ||
    totalCentavos < 1 ||
    totalCentavos > MAX_AMOUNT_CENTAVOS
  ) {
    return { error: "The total must be a whole number of centavos greater than 0." };
  }
  if (!Array.isArray(friends)) {
    return { error: "friends must be a list of names." };
  }

  // Clean every name, remove duplicates (Ben, ben and " BEN " are one person), skip words that mean the user
  const people = new Map(); // key -> display name
  for (const raw of friends) {
    const cleaned = cleanName(raw);
    if (cleaned.self) continue;
    if (cleaned.error) return { error: "Problem with the friend " + quoted(raw) + ": " + cleaned.error };
    if (!people.has(cleaned.key)) people.set(cleaned.key, cleaned.name);
  }

  if (people.size === 0) {
    return {
      error:
        "Name at least one friend to split with. The user is included automatically, so do not list the user.",
    };
  }
  if (people.size > MAX_FRIENDS_PER_SPLIT) {
    return { error: "A bill can be split with at most " + MAX_FRIENDS_PER_SPLIT + " friends at a time." };
  }

  // Who paid? Nobody named, or a word that means the user -> the user paid.
  let payerKey = "me";
  const hasPayer = paidBy !== undefined && paidBy !== null && String(paidBy).trim() !== "";
  if (hasPayer) {
    const payer = cleanName(paidBy);
    if (payer.self) {
      payerKey = "me";
    } else if (payer.error) {
      return { error: "Problem with who paid " + quoted(paidBy) + ": " + payer.error };
    } else if (!people.has(payer.key)) {
      return {
        error:
          payer.name + " paid, so " + payer.name + " must also be in participants. Call split_bill again with " +
          payer.name + " added to participants.",
      };
    } else {
      payerKey = payer.key;
    }
  }

  const friendCount = people.size;
  const headcount = friendCount + 1; // the friends plus the user
  const shareCentavos = Math.floor(totalCentavos / headcount);
  if (shareCentavos < 1) {
    return { error: "That amount is too small to split between " + headcount + " people." };
  }
  const remainderCentavos = totalCentavos - shareCentavos * headcount;

  const entries = [];
  let myShareCentavos;
  let payerName = "me";

  if (payerKey === "me") {
    // The user paid, so every friend owes the user one share. The user keeps the leftover centavos.
    for (const [key, name] of people) {
      entries.push({ friendName: name, friendKey: key, type: "lent", amountCentavos: shareCentavos });
    }
    myShareCentavos = shareCentavos + remainderCentavos;
  } else {
    // A friend paid, so the user owes that friend one share. What the others owe the friend is not our business.
    payerName = people.get(payerKey);
    entries.push({
      friendName: payerName,
      friendKey: payerKey,
      type: "borrowed",
      amountCentavos: shareCentavos,
    });
    myShareCentavos = shareCentavos;
  }

  return {
    totalCentavos,
    headcount,
    shareCentavos,
    myShareCentavos,
    remainderCentavos,
    payer: payerName,
    entries,
  };
}

// ---------- Balances ----------
// entries are ledger documents as stored in Firestore: { friendName, friendKey, type, amount (in pesos) }.
// Pass them newest first: the newest spelling of a name is the one that is shown.
// Returns { friends, owedToYou, youOwe, skipped } with every money value in centavos.
// friends is sorted: people with a balance first (biggest amount first), settled people last.
export function computeBalances(entries) {
  const byKey = new Map();
  let skipped = 0;

  for (const entry of Array.isArray(entries) ? entries : []) {
    const type = entry && entry.type;
    const key = entry && entry.friendKey;
    const centavos = Math.round(Number(entry && entry.amount) * 100);
    const valid =
      typeof type === "string" &&
      Object.hasOwn(SIGN, type) &&
      typeof key === "string" &&
      key !== "" &&
      Number.isInteger(centavos) &&
      centavos > 0;
    if (!valid) {
      skipped++;
      continue;
    }

    if (!byKey.has(key)) {
      byKey.set(key, {
        friendName: typeof entry.friendName === "string" && entry.friendName ? entry.friendName : key,
        friendKey: key,
        balanceCentavos: 0,
      });
    }
    byKey.get(key).balanceCentavos += SIGN[type] * centavos;
  }

  const friends = [...byKey.values()].sort((a, b) => {
    const aSettled = a.balanceCentavos === 0;
    const bSettled = b.balanceCentavos === 0;
    if (aSettled !== bSettled) return aSettled ? 1 : -1;
    const bigger = Math.abs(b.balanceCentavos) - Math.abs(a.balanceCentavos);
    return bigger !== 0 ? bigger : a.friendName.localeCompare(b.friendName);
  });

  let owedToYou = 0;
  let youOwe = 0;
  for (const f of friends) {
    if (f.balanceCentavos > 0) owedToYou += f.balanceCentavos;
    if (f.balanceCentavos < 0) youOwe += -f.balanceCentavos;
  }

  return { friends, owedToYou, youOwe, skipped };
}

// ---------- Checking a repayment ----------
// direction: "they_paid_me" (a friend pays the user back) or "i_paid_them" (the user pays a friend back)
// balanceCentavos must come from a fresh read of the ledger (positive = the friend owes the user).
// Returns { ok: true, type, remainingCentavos }
// or { error, reason, balanceCentavos, missingCentavos? }.
// missingCentavos is the part of the repayment that has no recorded utang behind it.
export function checkRepayment({ friendName, balanceCentavos, amountCentavos, direction }) {
  const missingHint = (missing) =>
    " The missing utang is " + formatCentavos(missing) +
    ". If it was never recorded, offer to record that amount as utang first.";

  if (direction !== "they_paid_me" && direction !== "i_paid_them") {
    return { error: "direction must be they_paid_me or i_paid_them.", reason: "bad_direction", balanceCentavos };
  }
  if (!Number.isInteger(amountCentavos) || amountCentavos < 1) {
    return { error: "The amount must be greater than 0.", reason: "bad_amount", balanceCentavos };
  }

  if (direction === "they_paid_me") {
    if (balanceCentavos === 0) {
      return {
        error: friendName + " does not owe the user anything right now." + missingHint(amountCentavos),
        reason: "no_debt",
        balanceCentavos,
        missingCentavos: amountCentavos,
      };
    }
    if (balanceCentavos < 0) {
      return {
        error:
          "The user owes " + friendName + " " + formatCentavos(-balanceCentavos) +
          ", so " + friendName + " has nothing to pay back. Ask if the user meant that they paid " + friendName + ".",
        reason: "wrong_way",
        balanceCentavos,
      };
    }
    if (amountCentavos > balanceCentavos) {
      const missing = amountCentavos - balanceCentavos;
      return {
        error:
          friendName + " only owes the user " + formatCentavos(balanceCentavos) +
          ", but the repayment is " + formatCentavos(amountCentavos) + "." + missingHint(missing),
        reason: "too_much",
        balanceCentavos,
        missingCentavos: missing,
      };
    }
    return { ok: true, type: "they_paid", remainingCentavos: balanceCentavos - amountCentavos };
  }

  // direction === "i_paid_them"
  if (balanceCentavos === 0) {
    return {
      error: "The user does not owe " + friendName + " anything right now." + missingHint(amountCentavos),
      reason: "no_debt",
      balanceCentavos,
      missingCentavos: amountCentavos,
    };
  }
  if (balanceCentavos > 0) {
    return {
      error:
        friendName + " owes the user " + formatCentavos(balanceCentavos) +
        ", so the user has nothing to pay back. Ask if the user meant that " + friendName + " paid them.",
      reason: "wrong_way",
      balanceCentavos,
    };
  }
  const owed = -balanceCentavos;
  if (amountCentavos > owed) {
    const missing = amountCentavos - owed;
    return {
      error:
        "The user only owes " + friendName + " " + formatCentavos(owed) +
        ", but the repayment is " + formatCentavos(amountCentavos) + "." + missingHint(missing),
      reason: "too_much",
      balanceCentavos,
      missingCentavos: missing,
    };
  }
  return { ok: true, type: "i_paid", remainingCentavos: balanceCentavos + amountCentavos };
}