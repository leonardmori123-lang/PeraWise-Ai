import { Schema } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-ai.js";
import {
  CATEGORIES, addExpense, getExpensesInRange, isValidDate, todayString, formatPeso,
} from "./expenses.js";
import { addLedgerEntries, getLedgerFresh } from "./ledger.js";
import {
  cleanName, pesosToCentavos, formatCentavos, splitBill, computeBalances, checkRepayment,
} from "./ledger-math.js";

console.info("ai-tools.js loaded");

export const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "add_expense",
        description:
          "Save a new expense for the logged-in user. Use this only when the user spent their own money on something for themselves. Do NOT use it for money lent to or borrowed from friends, repayments, or bills split with friends (use the utang functions for those).",
        parameters: Schema.object({
          properties: {
            amount: Schema.number({
              description: "Amount spent in Philippine pesos. Must be greater than 0.",
            }),
            category: Schema.string({
              description:
                "Exactly one of: Food, Transport, Bills, Shopping, Health, Education, Entertainment, Other.",
            }),
            note: Schema.string({
              description: "Short description of the expense, for example 'Lunch at canteen'.",
            }),
            date: Schema.string({
              description:
                "Date of the expense as YYYY-MM-DD. Use today's date unless the user says otherwise.",
            }),
          },
          optionalProperties: ["note", "date"],
        }),
      },
      {
        name: "get_spending_summary",
        description:
          "Get the user's total spending, number of expenses and totals per category between two dates (inclusive). Use this for any question about how much the user spent.",
        parameters: Schema.object({
          properties: {
            start_date: Schema.string({ description: "First day to include, as YYYY-MM-DD." }),
            end_date: Schema.string({ description: "Last day to include, as YYYY-MM-DD." }),
            category: Schema.string({
              description: "Optional. Only include expenses from this category.",
            }),
          },
          optionalProperties: ["category"],
        }),
      },
      {
        name: "record_utang",
        description:
          "Record utang: a friend owes the user money, or the user owes a friend money. Use this for lending, borrowing, 'owes me' and 'I owe' statements. Money lent or owed is not an expense, so do not call add_expense for it.",
        parameters: Schema.object({
          properties: {
            friend_name: Schema.string({
              description: "The friend's name only, for example 'Ana'. Never 'me', 'I' or the user's own name.",
            }),
            amount: Schema.number({
              description: "Amount in Philippine pesos. Must be greater than 0.",
            }),
            direction: Schema.enumString({
              enum: ["they_owe_me", "i_owe_them"],
              description: "they_owe_me: the friend owes the user. i_owe_them: the user owes the friend.",
            }),
            note: Schema.string({ description: "Short reason, for example 'Lunch'." }),
            date: Schema.string({
              description: "Date as YYYY-MM-DD. Use today's date unless the user says otherwise.",
            }),
          },
          optionalProperties: ["note", "date"],
        }),
      },
      {
        name: "record_repayment",
        description:
          "Record that existing utang was paid back: a friend paying the user back, or the user paying a friend back. It only works if that utang is already recorded; otherwise it returns an error (with missing_utang_amount when some utang was never recorded).",
        parameters: Schema.object({
          properties: {
            friend_name: Schema.string({ description: "The friend's name only. Never 'me' or 'I'." }),
            amount: Schema.number({
              description: "Amount paid back in Philippine pesos. Must be greater than 0.",
            }),
            direction: Schema.enumString({
              enum: ["they_paid_me", "i_paid_them"],
              description: "they_paid_me: the friend paid the user back. i_paid_them: the user paid the friend back.",
            }),
            note: Schema.string({ description: "Optional short note." }),
            date: Schema.string({
              description: "Date as YYYY-MM-DD. Use today's date unless the user says otherwise.",
            }),
          },
          optionalProperties: ["note", "date"],
        }),
      },
      {
        name: "split_bill",
        description:
          "Split one bill equally between the user and friends. The app does the maths, so never calculate shares yourself. The user is ALWAYS included automatically, so list only the OTHER people in participants and never put 'me' in the list. If the user paid, leave paid_by out. If a friend paid, set paid_by to that friend's name and also include that friend in participants.",
        parameters: Schema.object({
          properties: {
            total_amount: Schema.number({
              description: "The whole bill in Philippine pesos. Must be greater than 0.",
            }),
            participants: Schema.array({
              items: Schema.string(),
              description: "Names of the other people sharing the bill, not including the user.",
            }),
            paid_by: Schema.string({
              description: "Only when a friend paid: that friend's name. Leave out when the user paid.",
            }),
            note: Schema.string({ description: "Short description, for example 'Dinner'." }),
            date: Schema.string({
              description: "Date as YYYY-MM-DD. Use today's date unless the user says otherwise.",
            }),
          },
          optionalProperties: ["paid_by", "note", "date"],
        }),
      },
      {
        name: "get_balances",
        description:
          "Look up utang: who owes the user, whom the user owes, and the totals. Give friend_name to see one friend's balance and recent entries. Use this for any question like 'who owes me?' or 'how much does Ana owe me?'.",
        parameters: Schema.object({
          properties: {
            friend_name: Schema.string({
              description: "Optional. Only look at this friend.",
            }),
          },
          optionalProperties: ["friend_name"],
        }),
      },
    ],
  },
];

function hanapCat(pangalanCat) {
  return CATEGORIES.find((isaCat) => isaCat.toLowerCase() === String(pangalanCat || "").trim().toLowerCase());
}

function round2(numVal) {
  return Math.round(numVal * 100) / 100;
}

async function toolAddExpense(uidNya, argsNya) {
  const halagaNum = Number(argsNya.amount);
  if (!Number.isFinite(halagaNum) || halagaNum <= 0 || halagaNum >= 10000000) {
    return { error: "The amount must be a number greater than 0." };
  }
  if (argsNya.date && !isValidDate(argsNya.date)) {
    return { error: "The date must be a real date written as YYYY-MM-DD." };
  }
  const kategoryaNya = hanapCat(argsNya.category) || "Other";
  const noteNya = String(argsNya.note || "").trim().slice(0, 200);
  const petsaNya = argsNya.date || todayString();

  await addExpense(uidNya, { amount: halagaNum, category: kategoryaNya, note: noteNya, date: petsaNya });
  return {
    success: true,
    saved: { amount: halagaNum, category: kategoryaNya, note: noteNya, date: petsaNya },
    message: "Saved " + formatPeso(halagaNum) + " under " + kategoryaNya + " for " + petsaNya + ".",
  };
}

async function toolGetSummary(uidNya, argsNya) {
  if (!isValidDate(argsNya.start_date) || !isValidDate(argsNya.end_date)) {
    return { error: "start_date and end_date must be real dates written as YYYY-MM-DD." };
  }
  if (argsNya.start_date > argsNya.end_date) {
    return { error: "start_date must not be after end_date." };
  }

  let mgaItem = await getExpensesInRange(uidNya, argsNya.start_date, argsNya.end_date);
  const kategoryaNya = hanapCat(argsNya.category);
  if (kategoryaNya) mgaItem = mgaItem.filter((isaItem) => isaItem.category === kategoryaNya);

  const perCat = {};
  let kabuuan = 0;
  for (const isaItem of mgaItem) {
    kabuuan += isaItem.amount;
    perCat[isaItem.category] = round2((perCat[isaItem.category] || 0) + isaItem.amount);
  }

  return {
    start_date: argsNya.start_date,
    end_date: argsNya.end_date,
    category_filter: kategoryaNya || "all",
    total_spent_php: round2(kabuuan),
    expense_count: mgaItem.length,
    by_category_php: perCat,
    expenses: mgaItem.slice(0, 15).map((isaItem) => ({
      date: isaItem.date,
      category: isaItem.category,
      note: isaItem.note,
      amount_php: isaItem.amount,
    })),
  };
}

const tipoLabel = {
  lent: "lent",
  borrowed: "borrowed",
  they_paid: "friend paid back",
  i_paid: "user paid back",
};

function makeNameResolver(knownFriends) {
  const perSusi = new Map();
  for (const hilawPangalan of Array.isArray(knownFriends) ? knownFriends : []) {
    const kilala = cleanName(hilawPangalan);
    if (!kilala.error && !perSusi.has(kilala.key)) perSusi.set(kilala.key, kilala.name);
  }
  return (pangalanIn) => {
    const linis = cleanName(pangalanIn);
    return !linis.error && perSusi.has(linis.key) ? perSusi.get(linis.key) : pangalanIn;
  };
}

function readDate(petsaVal) {
  if (petsaVal === undefined || petsaVal === null || petsaVal === "") return { date: todayString() };
  if (!isValidDate(petsaVal)) return { error: "The date must be a real date written as YYYY-MM-DD." };
  return { date: petsaVal };
}

function readDirection(direksyon, allowedList) {
  return allowedList.includes(direksyon) ? { direction: direksyon } : { error: "direction must be " + allowedList.join(" or ") + "." };
}

function shortNote(noteVal) {
  return String(noteVal === undefined || noteVal === null ? "" : noteVal).replace(/\s+/g, " ").trim();
}

function joinNames(pangalanArr) {
  if (pangalanArr.length <= 1) return pangalanArr.join("");
  return pangalanArr.slice(0, -1).join(", ") + " and " + pangalanArr[pangalanArr.length - 1];
}

async function toolRecordUtang(uidNya, argsNya, contextNya) {
  const pangalan = cleanName(argsNya.friend_name);
  if (pangalan.error) return { error: pangalan.error };
  const peraSent = pesosToCentavos(argsNya.amount);
  if (peraSent.error) return { error: peraSent.error };
  const direksyon = readDirection(argsNya.direction, ["they_owe_me", "i_owe_them"]);
  if (direksyon.error) return direksyon;
  const kailan = readDate(argsNya.date);
  if (kailan.error) return kailan;

  const pangalanShow = makeNameResolver(contextNya.knownFriends)(pangalan.name);
  const silaMayUtang = direksyon.direction === "they_owe_me";
  await addLedgerEntries(uidNya, [
    {
      friendName: pangalanShow,
      type: silaMayUtang ? "lent" : "borrowed",
      amountCentavos: peraSent.centavos,
      note: shortNote(argsNya.note),
      date: kailan.date,
    },
  ]);
  return {
    success: true,
    message: silaMayUtang
      ? "Recorded: " + pangalanShow + " owes you " + formatCentavos(peraSent.centavos) + "."
      : "Recorded: you owe " + pangalanShow + " " + formatCentavos(peraSent.centavos) + ".",
  };
}

async function toolRecordRepayment(uidNya, argsNya, contextNya) {
  const pangalan = cleanName(argsNya.friend_name);
  if (pangalan.error) return { error: pangalan.error };
  const peraSent = pesosToCentavos(argsNya.amount);
  if (peraSent.error) return { error: peraSent.error };
  const direksyon = readDirection(argsNya.direction, ["they_paid_me", "i_paid_them"]);
  if (direksyon.error) return direksyon;
  const kailan = readDate(argsNya.date);
  if (kailan.error) return kailan;

  const { friends } = computeBalances(await getLedgerFresh(uidNya));
  const nahanap = friends.find((isaFriend) => isaFriend.friendKey === pangalan.key);
  const pangalanShow = nahanap ? nahanap.friendName : makeNameResolver(contextNya.knownFriends)(pangalan.name);

  const checkNya = checkRepayment({
    friendName: pangalanShow,
    balanceCentavos: nahanap ? nahanap.balanceCentavos : 0,
    amountCentavos: peraSent.centavos,
    direction: direksyon.direction,
  });
  if (checkNya.error) {
    const refused = { error: checkNya.error, reason: checkNya.reason };
    if (checkNya.missingCentavos) refused.missing_utang_amount = formatCentavos(checkNya.missingCentavos);
    return refused;
  }

  await addLedgerEntries(uidNya, [
    {
      friendName: pangalanShow,
      type: checkNya.type,
      amountCentavos: peraSent.centavos,
      note: shortNote(argsNya.note),
      date: kailan.date,
    },
  ]);

  const unangSabi =
    direksyon.direction === "they_paid_me"
      ? "Recorded: " + pangalanShow + " paid you back " + formatCentavos(peraSent.centavos) + "."
      : "Recorded: you paid " + pangalanShow + " back " + formatCentavos(peraSent.centavos) + ".";
  const natira = checkNya.remainingCentavos;
  const duloSabi =
    natira === 0
      ? pangalanShow + " is now settled."
      : natira > 0
        ? pangalanShow + " still owes you " + formatCentavos(natira) + "."
        : "You still owe " + pangalanShow + " " + formatCentavos(-natira) + ".";
  return { success: true, message: unangSabi + " " + duloSabi };
}

async function toolSplitBill(uidNya, argsNya, contextNya) {
  const peraSent = pesosToCentavos(argsNya.total_amount);
  if (peraSent.error) return { error: peraSent.error };
  if (!Array.isArray(argsNya.participants) || argsNya.participants.length > 100) {
    return { error: "participants must be a list of the other people's names (not including the user)." };
  }
  const kailan = readDate(argsNya.date);
  if (kailan.error) return kailan;

  const splitResult = splitBill({
    totalCentavos: peraSent.centavos,
    friends: argsNya.participants,
    paidBy: argsNya.paid_by,
  });
  if (splitResult.error) return { error: splitResult.error };

  const ayusinPangalan = makeNameResolver(contextNya.knownFriends);
  const noteBase = shortNote(argsNya.note).slice(0, 100) || "Split bill";
  const noteNya =
    noteBase + " (" + formatCentavos(splitResult.totalCentavos) + " split " + splitResult.headcount + " ways)";
  await addLedgerEntries(
    uidNya,
    splitResult.entries.map((isaEntry) => ({
      friendName: ayusinPangalan(isaEntry.friendName),
      type: isaEntry.type,
      amountCentavos: isaEntry.amountCentavos,
      note: noteNya,
      date: kailan.date,
    }))
  );

  const pangalanArr = [];
  const nakitaNa = new Set();
  for (const hilawPangalan of argsNya.participants) {
    const linis = cleanName(hilawPangalan);
    if (linis.error || nakitaNa.has(linis.key)) continue;
    nakitaNa.add(linis.key);
    pangalanArr.push(ayusinPangalan(linis.name));
  }
  const lahatSila = joinNames(["you", ...pangalanArr]);
  const shareTxt = formatCentavos(splitResult.shareCentavos);
  const unahan = "Split " + formatCentavos(splitResult.totalCentavos) + " between " + lahatSila + ": " + shareTxt + " each. ";

  if (splitResult.payer === "me") {
    const extraTxt =
      splitResult.remainderCentavos > 0 ? " You cover the extra " + formatCentavos(splitResult.remainderCentavos) + "." : "";
    const utangSila = pangalanArr.length === 1 ? pangalanArr[0] + " owes you " : joinNames(pangalanArr) + " each owe you ";
    return { success: true, message: unahan + utangSila + shareTxt + "." + extraTxt };
  }
  const nagbayad = ayusinPangalan(splitResult.payer);
  return { success: true, message: unahan + nagbayad + " paid, so you owe " + nagbayad + " " + shareTxt + "." };
}

async function toolGetBalances(uidNya, argsNya) {
  const listahanEntry = await getLedgerFresh(uidNya);
  const balancesNya = computeBalances(listahanEntry);
  const describeFn = (isaFriend) => ({
    name: isaFriend.friendName,
    status: isaFriend.balanceCentavos > 0 ? "owes_you" : isaFriend.balanceCentavos < 0 ? "you_owe" : "settled",
    amount: formatCentavos(Math.abs(isaFriend.balanceCentavos)),
  });

  const gustoPangalan = argsNya.friend_name;
  if (gustoPangalan !== undefined && gustoPangalan !== null && String(gustoPangalan).trim() !== "") {
    const pangalan = cleanName(gustoPangalan);
    if (pangalan.error) return { error: pangalan.error };
    const nahanap = balancesNya.friends.find((isaFriend) => isaFriend.friendKey === pangalan.key);
    if (!nahanap) {
      return {
        friend: pangalan.name,
        status: "no_utang_recorded",
        known_friends: balancesNya.friends.slice(0, 50).map((isaFriend) => isaFriend.friendName),
      };
    }
    return {
      ...describeFn(nahanap),
      recent_entries: listahanEntry
        .filter((isaEntry) => isaEntry.friendKey === pangalan.key)
        .slice(0, 10)
        .map((isaEntry) => ({
          date: isaEntry.date,
          kind: tipoLabel[isaEntry.type] || isaEntry.type,
          amount: formatCentavos(Math.round(isaEntry.amount * 100)),
          note: isaEntry.note,
        })),
    };
  }

  return {
    owed_to_you_total: formatCentavos(balancesNya.owedToYou),
    you_owe_total: formatCentavos(balancesNya.youOwe),
    friend_count: balancesNya.friends.length,
    friends: balancesNya.friends.slice(0, 50).map(describeFn),
  };
}

export async function runTool(uidNya, pangalanFn, argsNya, contextNya = {}) {
  console.info("AI requested function:", pangalanFn, argsNya);
  try {
    if (pangalanFn === "add_expense") return await toolAddExpense(uidNya, argsNya);
    if (pangalanFn === "get_spending_summary") return await toolGetSummary(uidNya, argsNya);
    if (pangalanFn === "record_utang") return await toolRecordUtang(uidNya, argsNya, contextNya);
    if (pangalanFn === "record_repayment") return await toolRecordRepayment(uidNya, argsNya, contextNya);
    if (pangalanFn === "split_bill") return await toolSplitBill(uidNya, argsNya, contextNya);
    if (pangalanFn === "get_balances") return await toolGetBalances(uidNya, argsNya);
    return { error: "Unknown function: " + pangalanFn };
  } catch (siraFn) {
    console.error("Function failed:", pangalanFn, siraFn);
    return { error: "The app could not complete this action. Please try again." };
  }
}
