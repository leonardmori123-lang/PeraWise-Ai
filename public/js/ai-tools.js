import { Schema } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-ai.js";
import {
  CATEGORIES, addExpense, getExpensesInRange, isValidDate, todayString, formatPeso,
} from "./expenses.js";
import { addLedgerEntries, getLedgerFresh } from "./ledger.js";
import {
  cleanName, pesosToCents, formatCents, splitBill, computeBalances, checkRepayment,
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

function findCategory(categoryName) {
  return CATEGORIES.find((cat) => cat.toLowerCase() === String(categoryName || "").trim().toLowerCase());
}

function roundToTwoDecimals(value) {
  return Math.round(value * 100) / 100;
}

async function toolAddExpense(uid, args) {
  const amount = Number(args.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 10000000) {
    return { error: "The amount must be a number greater than 0." };
  }
  if (args.date && !isValidDate(args.date)) {
    return { error: "The date must be a real date written as YYYY-MM-DD." };
  }
  const category = findCategory(args.category) || "Other";
  const note = String(args.note || "").trim().slice(0, 200);
  const date = args.date || todayString();

  await addExpense(uid, { amount, category, note, date });
  return {
    success: true,
    saved: { amount, category, note, date },
    message: "Saved " + formatPeso(amount) + " under " + category + " for " + date + ".",
  };
}

async function toolGetSummary(uid, args) {
  if (!isValidDate(args.start_date) || !isValidDate(args.end_date)) {
    return { error: "start_date and end_date must be real dates written as YYYY-MM-DD." };
  }
  if (args.start_date > args.end_date) {
    return { error: "start_date must not be after end_date." };
  }

  let items = await getExpensesInRange(uid, args.start_date, args.end_date);
  const category = findCategory(args.category);
  if (category) items = items.filter((item) => item.category === category);

  const byCategory = {};
  let total = 0;
  for (const item of items) {
    total += item.amount;
    byCategory[item.category] = roundToTwoDecimals((byCategory[item.category] || 0) + item.amount);
  }

  return {
    start_date: args.start_date,
    end_date: args.end_date,
    category_filter: category || "all",
    total_spent_php: roundToTwoDecimals(total),
    expense_count: items.length,
    by_category_php: byCategory,
    expenses: items.slice(0, 15).map((item) => ({
      date: item.date,
      category: item.category,
      note: item.note,
      amount_php: item.amount,
    })),
  };
}

const TYPE_LABELS = {
  lent: "lent",
  borrowed: "borrowed",
  they_paid: "friend paid back",
  i_paid: "user paid back",
};

function makeNameResolver(knownFriends) {
  const nameByKey = new Map();
  for (const rawName of Array.isArray(knownFriends) ? knownFriends : []) {
    const parsedName = cleanName(rawName);
    if (!parsedName.error && !nameByKey.has(parsedName.key)) nameByKey.set(parsedName.key, parsedName.name);
  }
  return (inputName) => {
    const parsedName = cleanName(inputName);
    return !parsedName.error && nameByKey.has(parsedName.key) ? nameByKey.get(parsedName.key) : inputName;
  };
}

function readDate(dateValue) {
  if (dateValue === undefined || dateValue === null || dateValue === "") return { date: todayString() };
  if (!isValidDate(dateValue)) return { error: "The date must be a real date written as YYYY-MM-DD." };
  return { date: dateValue };
}

function readDirection(direction, allowedList) {
  return allowedList.includes(direction) ? { direction } : { error: "direction must be " + allowedList.join(" or ") + "." };
}

function shortNote(noteValue) {
  return String(noteValue === undefined || noteValue === null ? "" : noteValue).replace(/\s+/g, " ").trim();
}

function joinNames(names) {
  if (names.length <= 1) return names.join("");
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

async function toolRecordDebt(uid, args, context) {
  const friend = cleanName(args.friend_name);
  if (friend.error) return { error: friend.error };
  const centsResult = pesosToCents(args.amount);
  if (centsResult.error) return { error: centsResult.error };
  const directionResult = readDirection(args.direction, ["they_owe_me", "i_owe_them"]);
  if (directionResult.error) return directionResult;
  const dateResult = readDate(args.date);
  if (dateResult.error) return dateResult;

  const displayName = makeNameResolver(context.knownFriends)(friend.name);
  const isTheyOwe = directionResult.direction === "they_owe_me";
  await addLedgerEntries(uid, [
    {
      friendName: displayName,
      type: isTheyOwe ? "lent" : "borrowed",
      amountCents: centsResult.cents,
      note: shortNote(args.note),
      date: dateResult.date,
    },
  ]);
  return {
    success: true,
    message: isTheyOwe
      ? "Recorded: " + displayName + " owes you " + formatCents(centsResult.cents) + "."
      : "Recorded: you owe " + displayName + " " + formatCents(centsResult.cents) + ".",
  };
}

async function toolRecordRepayment(uid, args, context) {
  const friend = cleanName(args.friend_name);
  if (friend.error) return { error: friend.error };
  const centsResult = pesosToCents(args.amount);
  if (centsResult.error) return { error: centsResult.error };
  const directionResult = readDirection(args.direction, ["they_paid_me", "i_paid_them"]);
  if (directionResult.error) return directionResult;
  const dateResult = readDate(args.date);
  if (dateResult.error) return dateResult;

  const { friends } = computeBalances(await getLedgerFresh(uid));
  const matchedFriend = friends.find((friendItem) => friendItem.friendKey === friend.key);
  const displayName = matchedFriend ? matchedFriend.friendName : makeNameResolver(context.knownFriends)(friend.name);

  const repaymentCheck = checkRepayment({
    friendName: displayName,
    balanceCents: matchedFriend ? matchedFriend.balanceCents : 0,
    amountCents: centsResult.cents,
    direction: directionResult.direction,
  });
  if (repaymentCheck.error) {
    const refused = { error: repaymentCheck.error, reason: repaymentCheck.reason };
    if (repaymentCheck.missingCents) refused.missing_utang_amount = formatCents(repaymentCheck.missingCents);
    return refused;
  }

  await addLedgerEntries(uid, [
    {
      friendName: displayName,
      type: repaymentCheck.type,
      amountCents: centsResult.cents,
      note: shortNote(args.note),
      date: dateResult.date,
    },
  ]);

  const openingMessage =
    directionResult.direction === "they_paid_me"
      ? "Recorded: " + displayName + " paid you back " + formatCents(centsResult.cents) + "."
      : "Recorded: you paid " + displayName + " back " + formatCents(centsResult.cents) + ".";
  const remainingCents = repaymentCheck.remainingCents;
  const closingMessage =
    remainingCents === 0
      ? displayName + " is now settled."
      : remainingCents > 0
        ? displayName + " still owes you " + formatCents(remainingCents) + "."
        : "You still owe " + displayName + " " + formatCents(-remainingCents) + ".";
  return { success: true, message: openingMessage + " " + closingMessage };
}

async function toolSplitBill(uid, args, context) {
  const centsResult = pesosToCents(args.total_amount);
  if (centsResult.error) return { error: centsResult.error };
  if (!Array.isArray(args.participants) || args.participants.length > 100) {
    return { error: "participants must be a list of the other people's names (not including the user)." };
  }
  const dateResult = readDate(args.date);
  if (dateResult.error) return dateResult;

  const splitResult = splitBill({
    totalCents: centsResult.cents,
    friends: args.participants,
    paidBy: args.paid_by,
  });
  if (splitResult.error) return { error: splitResult.error };

  const resolveName = makeNameResolver(context.knownFriends);
  const noteBase = shortNote(args.note).slice(0, 100) || "Split bill";
  const fullNote =
    noteBase + " (" + formatCents(splitResult.totalCents) + " split " + splitResult.headcount + " ways)";
  await addLedgerEntries(
    uid,
    splitResult.entries.map((entry) => ({
      friendName: resolveName(entry.friendName),
      type: entry.type,
      amountCents: entry.amountCents,
      note: fullNote,
      date: dateResult.date,
    }))
  );

  const participantNames = [];
  const seenKeys = new Set();
  for (const rawName of args.participants) {
    const cleaned = cleanName(rawName);
    if (cleaned.error || seenKeys.has(cleaned.key)) continue;
    seenKeys.add(cleaned.key);
    participantNames.push(resolveName(cleaned.name));
  }
  const allParticipants = joinNames(["you", ...participantNames]);
  const shareText = formatCents(splitResult.shareCents);
  const summaryPrefix = "Split " + formatCents(splitResult.totalCents) + " between " + allParticipants + ": " + shareText + " each. ";

  if (splitResult.payer === "me") {
    const extraText =
      splitResult.remainderCents > 0 ? " You cover the extra " + formatCents(splitResult.remainderCents) + "." : "";
    const debtStatement = participantNames.length === 1 ? participantNames[0] + " owes you " : joinNames(participantNames) + " each owe you ";
    return { success: true, message: summaryPrefix + debtStatement + shareText + "." + extraText };
  }
  const payerName = resolveName(splitResult.payer);
  return { success: true, message: summaryPrefix + payerName + " paid, so you owe " + payerName + " " + shareText + "." };
}

async function toolGetBalances(uid, args) {
  const entries = await getLedgerFresh(uid);
  const balances = computeBalances(entries);
  const describeFriend = (friendItem) => ({
    name: friendItem.friendName,
    status: friendItem.balanceCents > 0 ? "owes_you" : friendItem.balanceCents < 0 ? "you_owe" : "settled",
    amount: formatCents(Math.abs(friendItem.balanceCents)),
  });

  const targetFriendName = args.friend_name;
  if (targetFriendName !== undefined && targetFriendName !== null && String(targetFriendName).trim() !== "") {
    const friend = cleanName(targetFriendName);
    if (friend.error) return { error: friend.error };
    const matchedFriend = balances.friends.find((friendItem) => friendItem.friendKey === friend.key);
    if (!matchedFriend) {
      return {
        friend: friend.name,
        status: "no_utang_recorded",
        known_friends: balances.friends.slice(0, 50).map((friendItem) => friendItem.friendName),
      };
    }
    return {
      ...describeFriend(matchedFriend),
      recent_entries: entries
        .filter((entry) => entry.friendKey === friend.key)
        .slice(0, 10)
        .map((entry) => ({
          date: entry.date,
          kind: TYPE_LABELS[entry.type] || entry.type,
          amount: formatCents(Math.round(entry.amount * 100)),
          note: entry.note,
        })),
    };
  }

  return {
    owed_to_you_total: formatCents(balances.owedToYou),
    you_owe_total: formatCents(balances.youOwe),
    friend_count: balances.friends.length,
    friends: balances.friends.slice(0, 50).map(describeFriend),
  };
}

export async function runTool(uid, functionName, args, context = {}) {
  console.info("AI requested function:", functionName, args);
  try {
    if (functionName === "add_expense") return await toolAddExpense(uid, args);
    if (functionName === "get_spending_summary") return await toolGetSummary(uid, args);
    if (functionName === "record_utang") return await toolRecordDebt(uid, args, context);
    if (functionName === "record_repayment") return await toolRecordRepayment(uid, args, context);
    if (functionName === "split_bill") return await toolSplitBill(uid, args, context);
    if (functionName === "get_balances") return await toolGetBalances(uid, args);
    return { error: "Unknown function: " + functionName };
  } catch (error) {
    console.error("Function failed:", functionName, error);
    return { error: "The app could not complete this action. Please try again." };
  }
}
