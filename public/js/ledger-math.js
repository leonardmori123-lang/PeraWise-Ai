console.info("ledger-math.js loaded");

export const ENTRY_TYPES = ["lent", "borrowed", "they_paid", "i_paid"];
const tandaBal = { lent: 1, borrowed: -1, they_paid: -1, i_paid: 1 };

export const MAX_NAME_LENGTH = 40;
export const MAX_FRIENDS_PER_SPLIT = 20;
export const MAX_AMOUNT_CENTAVOS = 999999999;

const akoWords = ["me", "i", "myself", "ako"];

export function pesosToCentavos(pesoVal) {
  const pwedeNum =
    typeof pesoVal === "number" || (typeof pesoVal === "string" && pesoVal.trim() !== "");
  const nHalaga = pwedeNum ? Number(pesoVal) : NaN;
  if (!Number.isFinite(nHalaga) || nHalaga <= 0) {
    return { error: "The amount must be a number greater than 0." };
  }
  const sentimoVal = Math.round(nHalaga * 100);
  if (sentimoVal < 1) return { error: "The amount is too small." };
  if (sentimoVal > MAX_AMOUNT_CENTAVOS) return { error: "The amount is too large." };
  return { centavos: sentimoVal };
}

export function centavosToPesos(sentimoVal) {
  return Math.round(sentimoVal) / 100;
}

export function formatCentavos(sentimoVal) {
  const tandaNeg = sentimoVal < 0 ? "-" : "";
  const absSent = Math.abs(Math.round(sentimoVal));
  const pisoStr = String(Math.floor(absSent / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const centsStr = String(absSent % 100).padStart(2, "0");
  return tandaNeg + "₱" + pisoStr + "." + centsStr;
}

export function cleanName(hilawPangalan) {
  if (typeof hilawPangalan !== "string") return { error: "A friend's name is needed." };

  const linisPangalan = hilawPangalan
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!linisPangalan) return { error: "A friend's name is needed." };
  if (!/[\p{L}\p{N}]/u.test(linisPangalan)) {
    return { error: "A friend's name needs at least one letter or number." };
  }

  const susiPangalan = linisPangalan.toLowerCase();
  if (akoWords.includes(susiPangalan)) {
    return { error: "That word means the user, not a friend. Use the friend's real name.", self: true };
  }
  if (linisPangalan.length > MAX_NAME_LENGTH || susiPangalan.length > MAX_NAME_LENGTH) {
    return { error: "A friend's name can be at most " + MAX_NAME_LENGTH + " characters." };
  }
  return { name: linisPangalan, key: susiPangalan };
}

function quoted(hilawPangalan) {
  return JSON.stringify(String(hilawPangalan).slice(0, MAX_NAME_LENGTH));
}

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

  const taoMap = new Map();
  for (const hilawPangalan of friends) {
    const linis = cleanName(hilawPangalan);
    if (linis.self) continue;
    if (linis.error) return { error: "Problem with the friend " + quoted(hilawPangalan) + ": " + linis.error };
    if (!taoMap.has(linis.key)) taoMap.set(linis.key, linis.name);
  }

  if (taoMap.size === 0) {
    return {
      error:
        "Name at least one friend to split with. The user is included automatically, so do not list the user.",
    };
  }
  if (taoMap.size > MAX_FRIENDS_PER_SPLIT) {
    return { error: "A bill can be split with at most " + MAX_FRIENDS_PER_SPLIT + " friends at a time." };
  }

  let nagbayadKey = "me";
  const meronPayer = paidBy !== undefined && paidBy !== null && String(paidBy).trim() !== "";
  if (meronPayer) {
    const nagbayad = cleanName(paidBy);
    if (nagbayad.self) {
      nagbayadKey = "me";
    } else if (nagbayad.error) {
      return { error: "Problem with who paid " + quoted(paidBy) + ": " + nagbayad.error };
    } else if (!taoMap.has(nagbayad.key)) {
      return {
        error:
          nagbayad.name + " paid, so " + nagbayad.name + " must also be in participants. Call split_bill again with " +
          nagbayad.name + " added to participants.",
      };
    } else {
      nagbayadKey = nagbayad.key;
    }
  }

  const bilangKaibigan = taoMap.size;
  const bilangLahat = bilangKaibigan + 1;
  const shareSent = Math.floor(totalCentavos / bilangLahat);
  if (shareSent < 1) {
    return { error: "That amount is too small to split between " + bilangLahat + " people." };
  }
  const leftoverSent = totalCentavos - shareSent * bilangLahat;

  const listahanEntry = [];
  let akinShare;
  let pangalanPayer = "me";

  if (nagbayadKey === "me") {
    for (const [susiPangalan, pangalanShow] of taoMap) {
      listahanEntry.push({ friendName: pangalanShow, friendKey: susiPangalan, type: "lent", amountCentavos: shareSent });
    }
    akinShare = shareSent + leftoverSent;
  } else {
    pangalanPayer = taoMap.get(nagbayadKey);
    listahanEntry.push({
      friendName: pangalanPayer,
      friendKey: nagbayadKey,
      type: "borrowed",
      amountCentavos: shareSent,
    });
    akinShare = shareSent;
  }

  return {
    totalCentavos,
    headcount: bilangLahat,
    shareCentavos: shareSent,
    myShareCentavos: akinShare,
    remainderCentavos: leftoverSent,
    payer: pangalanPayer,
    entries: listahanEntry,
  };
}

export function computeBalances(listahanEntry) {
  const perKaibigan = new Map();
  let nilaktawan = 0;

  for (const isaEntry of Array.isArray(listahanEntry) ? listahanEntry : []) {
    const tipoNya = isaEntry && isaEntry.type;
    const susiNya = isaEntry && isaEntry.friendKey;
    const sentimoVal = Math.round(Number(isaEntry && isaEntry.amount) * 100);
    const okEntry =
      typeof tipoNya === "string" &&
      Object.hasOwn(tandaBal, tipoNya) &&
      typeof susiNya === "string" &&
      susiNya !== "" &&
      Number.isInteger(sentimoVal) &&
      sentimoVal > 0;
    if (!okEntry) {
      nilaktawan++;
      continue;
    }

    if (!perKaibigan.has(susiNya)) {
      perKaibigan.set(susiNya, {
        friendName: typeof isaEntry.friendName === "string" && isaEntry.friendName ? isaEntry.friendName : susiNya,
        friendKey: susiNya,
        balanceCentavos: 0,
      });
    }
    perKaibigan.get(susiNya).balanceCentavos += tandaBal[tipoNya] * sentimoVal;
  }

  const listFriends = [...perKaibigan.values()].sort((una, sunod) => {
    const unaZero = una.balanceCentavos === 0;
    const sunodZero = sunod.balanceCentavos === 0;
    if (unaZero !== sunodZero) return unaZero ? 1 : -1;
    const masMalaki = Math.abs(sunod.balanceCentavos) - Math.abs(una.balanceCentavos);
    return masMalaki !== 0 ? masMalaki : una.friendName.localeCompare(sunod.friendName);
  });

  let utangSakin = 0;
  let utangKo = 0;
  for (const isaFriend of listFriends) {
    if (isaFriend.balanceCentavos > 0) utangSakin += isaFriend.balanceCentavos;
    if (isaFriend.balanceCentavos < 0) utangKo += -isaFriend.balanceCentavos;
  }

  return { friends: listFriends, owedToYou: utangSakin, youOwe: utangKo, skipped: nilaktawan };
}

export function checkRepayment({ friendName, balanceCentavos, amountCentavos, direction }) {
  const kulangHint = (kulangSent) =>
    " The missing utang is " + formatCentavos(kulangSent) +
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
        error: friendName + " does not owe the user anything right now." + kulangHint(amountCentavos),
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
      const kulangSent = amountCentavos - balanceCentavos;
      return {
        error:
          friendName + " only owes the user " + formatCentavos(balanceCentavos) +
          ", but the repayment is " + formatCentavos(amountCentavos) + "." + kulangHint(kulangSent),
        reason: "too_much",
        balanceCentavos,
        missingCentavos: kulangSent,
      };
    }
    return { ok: true, type: "they_paid", remainingCentavos: balanceCentavos - amountCentavos };
  }

  if (balanceCentavos === 0) {
    return {
      error: "The user does not owe " + friendName + " anything right now." + kulangHint(amountCentavos),
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
  const utangKo = -balanceCentavos;
  if (amountCentavos > utangKo) {
    const kulangSent = amountCentavos - utangKo;
    return {
      error:
        "The user only owes " + friendName + " " + formatCentavos(utangKo) +
        ", but the repayment is " + formatCentavos(amountCentavos) + "." + kulangHint(kulangSent),
      reason: "too_much",
      balanceCentavos,
      missingCentavos: kulangSent,
    };
  }
  return { ok: true, type: "i_paid", remainingCentavos: balanceCentavos + amountCentavos };
}
