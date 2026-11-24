console.info("ledger-math.js loaded");

export const ENTRY_TYPES = ["lent", "borrowed", "they_paid", "i_paid"];
const BALANCE_SIGNS = { lent: 1, borrowed: -1, they_paid: -1, i_paid: 1 };

export const MAX_NAME_LENGTH = 40;
export const MAX_FRIENDS_PER_SPLIT = 20;
export const MAX_AMOUNT_CENTS = 999999999;

const SELF_WORDS = ["me", "i", "myself", "ako"];

export function pesosToCents(pesoValue) {
  const isValidInput =
    typeof pesoValue === "number" || (typeof pesoValue === "string" && pesoValue.trim() !== "");
  const amount = isValidInput ? Number(pesoValue) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "The amount must be a number greater than 0." };
  }
  const cents = Math.round(amount * 100);
  if (cents < 1) return { error: "The amount is too small." };
  if (cents > MAX_AMOUNT_CENTS) return { error: "The amount is too large." };
  return { cents };
}

export function centsToPesos(cents) {
  return Math.round(cents) / 100;
}

export function formatCents(cents) {
  const sign = cents < 0 ? "-" : "";
  const absCents = Math.abs(Math.round(cents));
  const pesosStr = String(Math.floor(absCents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const centsStr = String(absCents % 100).padStart(2, "0");
  return sign + "₱" + pesosStr + "." + centsStr;
}

export function cleanName(rawName) {
  if (typeof rawName !== "string") return { error: "A friend's name is needed." };

  const normalizedName = rawName
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedName) return { error: "A friend's name is needed." };
  if (!/[\p{L}\p{N}]/u.test(normalizedName)) {
    return { error: "A friend's name needs at least one letter or number." };
  }

  const nameKey = normalizedName.toLowerCase();
  if (SELF_WORDS.includes(nameKey)) {
    return { error: "That word means the user, not a friend. Use the friend's real name.", self: true };
  }
  if (normalizedName.length > MAX_NAME_LENGTH || nameKey.length > MAX_NAME_LENGTH) {
    return { error: "A friend's name can be at most " + MAX_NAME_LENGTH + " characters." };
  }
  return { name: normalizedName, key: nameKey };
}

function quoted(rawName) {
  return JSON.stringify(String(rawName).slice(0, MAX_NAME_LENGTH));
}

export function splitBill({ totalCents, friends, paidBy = "me" } = {}) {
  if (
    !Number.isInteger(totalCents) ||
    totalCents < 1 ||
    totalCents > MAX_AMOUNT_CENTS
  ) {
    return { error: "The total must be a whole number of cents greater than 0." };
  }
  if (!Array.isArray(friends)) {
    return { error: "friends must be a list of names." };
  }

  const friendsMap = new Map();
  for (const rawName of friends) {
    const parsedName = cleanName(rawName);
    if (parsedName.self) continue;
    if (parsedName.error) return { error: "Problem with the friend " + quoted(rawName) + ": " + parsedName.error };
    if (!friendsMap.has(parsedName.key)) friendsMap.set(parsedName.key, parsedName.name);
  }

  if (friendsMap.size === 0) {
    return {
      error:
        "Name at least one friend to split with. The user is included automatically, so do not list the user.",
    };
  }
  if (friendsMap.size > MAX_FRIENDS_PER_SPLIT) {
    return { error: "A bill can be split with at most " + MAX_FRIENDS_PER_SPLIT + " friends at a time." };
  }

  let payerKey = "me";
  const hasPayer = paidBy !== undefined && paidBy !== null && String(paidBy).trim() !== "";
  if (hasPayer) {
    const payer = cleanName(paidBy);
    if (payer.self) {
      payerKey = "me";
    } else if (payer.error) {
      return { error: "Problem with who paid " + quoted(paidBy) + ": " + payer.error };
    } else if (!friendsMap.has(payer.key)) {
      return {
        error:
          payer.name + " paid, so " + payer.name + " must also be in participants. Call split_bill again with " +
          payer.name + " added to participants.",
      };
    } else {
      payerKey = payer.key;
    }
  }

  const friendCount = friendsMap.size;
  const totalParticipants = friendCount + 1;
  const shareCents = Math.floor(totalCents / totalParticipants);
  if (shareCents < 1) {
    return { error: "That amount is too small to split between " + totalParticipants + " people." };
  }
  const remainderCents = totalCents - shareCents * totalParticipants;

  const entries = [];
  let myShare;
  let payerName = "me";

  if (payerKey === "me") {
    for (const [friendKey, friendName] of friendsMap) {
      entries.push({
        friendName,
        friendKey,
        type: "lent",
        amountCents: shareCents,
      });
    }
    myShare = shareCents + remainderCents;
  } else {
    payerName = friendsMap.get(payerKey);
    entries.push({
      friendName: payerName,
      friendKey: payerKey,
      type: "borrowed",
      amountCents: shareCents,
    });
    myShare = shareCents;
  }

  return {
    totalCents,
    headcount: totalParticipants,
    shareCents,
    myShareCents: myShare,
    remainderCents,
    payer: payerName,
    entries,
  };
}

export function computeBalances(entries) {
  const balancesByFriend = new Map();
  let skippedCount = 0;

  for (const entry of Array.isArray(entries) ? entries : []) {
    const entryType = entry && entry.type;
    const friendKey = entry && entry.friendKey;
    const cents = Math.round(Number(entry && entry.amount) * 100);
    const isValidEntry =
      typeof entryType === "string" &&
      Object.hasOwn(BALANCE_SIGNS, entryType) &&
      typeof friendKey === "string" &&
      friendKey !== "" &&
      Number.isInteger(cents) &&
      cents > 0;
    if (!isValidEntry) {
      skippedCount++;
      continue;
    }

    if (!balancesByFriend.has(friendKey)) {
      balancesByFriend.set(friendKey, {
        friendName: typeof entry.friendName === "string" && entry.friendName ? entry.friendName : friendKey,
        friendKey,
        balanceCents: 0,
      });
    }
    balancesByFriend.get(friendKey).balanceCents += BALANCE_SIGNS[entryType] * cents;
  }

  const friendsList = [...balancesByFriend.values()].sort((a, b) => {
    const aIsZero = a.balanceCents === 0;
    const bIsZero = b.balanceCents === 0;
    if (aIsZero !== bIsZero) return aIsZero ? 1 : -1;
    const diff = Math.abs(b.balanceCents) - Math.abs(a.balanceCents);
    return diff !== 0 ? diff : a.friendName.localeCompare(b.friendName);
  });

  let owedToYou = 0;
  let youOwe = 0;
  for (const friend of friendsList) {
    if (friend.balanceCents > 0) owedToYou += friend.balanceCents;
    if (friend.balanceCents < 0) youOwe += -friend.balanceCents;
  }

  return { friends: friendsList, owedToYou, youOwe, skipped: skippedCount };
}

export function checkRepayment({ friendName, balanceCents, amountCents, direction }) {
  const missingHint = (missingCents) =>
    " The missing debt is " + formatCents(missingCents) +
    ". If it was never recorded, offer to record that amount as debt first.";

  if (direction !== "they_paid_me" && direction !== "i_paid_them") {
    return { error: "direction must be they_paid_me or i_paid_them.", reason: "bad_direction", balanceCents };
  }
  if (!Number.isInteger(amountCents) || amountCents < 1) {
    return { error: "The amount must be greater than 0.", reason: "bad_amount", balanceCents };
  }

  if (direction === "they_paid_me") {
    if (balanceCents === 0) {
      return {
        error: friendName + " does not owe the user anything right now." + missingHint(amountCents),
        reason: "no_debt",
        balanceCents,
        missingCents: amountCents,
      };
    }
    if (balanceCents < 0) {
      return {
        error:
          "The user owes " + friendName + " " + formatCents(-balanceCents) +
          ", so " + friendName + " has nothing to pay back. Ask if the user meant that they paid " + friendName + ".",
        reason: "wrong_way",
        balanceCents,
      };
    }
    if (amountCents > balanceCents) {
      const missingCents = amountCents - balanceCents;
      return {
        error:
          friendName + " only owes the user " + formatCents(balanceCents) +
          ", but the repayment is " + formatCents(amountCents) + "." + missingHint(missingCents),
        reason: "too_much",
        balanceCents,
        missingCents,
      };
    }
    return { ok: true, type: "they_paid", remainingCents: balanceCents - amountCents };
  }

  if (balanceCents === 0) {
    return {
      error: "The user does not owe " + friendName + " anything right now." + missingHint(amountCents),
      reason: "no_debt",
      balanceCents,
      missingCents: amountCents,
    };
  }
  if (balanceCents > 0) {
    return {
      error:
        friendName + " owes the user " + formatCents(balanceCents) +
        ", so the user has nothing to pay back. Ask if the user meant that " + friendName + " paid them.",
      reason: "wrong_way",
      balanceCents,
    };
  }
  const userDebt = -balanceCents;
  if (amountCents > userDebt) {
    const missingCents = amountCents - userDebt;
    return {
      error:
        "The user only owes " + friendName + " " + formatCents(userDebt) +
        ", but the repayment is " + formatCents(amountCents) + "." + missingHint(missingCents),
      reason: "too_much",
      balanceCents,
      missingCents,
    };
  }
  return { ok: true, type: "i_paid", remainingCents: balanceCents + amountCents };
}
