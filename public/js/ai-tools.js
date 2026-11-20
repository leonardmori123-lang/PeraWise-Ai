import { Schema } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-ai.js";
import {
  CATEGORIES, addExpense, getExpensesInRange, isValidDate, todayString, formatPeso,
} from "./expenses.js";
import { addLedgerEntries, getLedgerFresh } from "./ledger.js";
import {
  cleanName, pesosToCentavos, formatCentavos, splitBill, computeBalances, checkRepayment,
} from "./ledger-math.js";

console.info("ai-tools.js loaded");

// How tools talk to ai-agent.js:
// - WRITE tools (they save data) return { success: true, message: "..." } on success.
//   ai-agent.js collects those messages so nothing is saved twice if a model fails afterwards.
// - READ tools (they only look data up) must NOT return "success", so they are never counted as saves.
// - Any problem is returned as { error: "..." } so the AI can explain it to the user.

// ---------- The only functions the AI is allowed to request ----------
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
          "Record that existing utang was paid back: a friend paying the user back, or the user paying a friend back. It only works if that utang is already recorded; otherwise it returns an error.",
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

// ---------- Tool implementations (they run in the app, never inside the AI) ----------
function findCategory(name) {
  return CATEGORIES.find((c) => c.toLowerCase() === String(name || "").trim().toLowerCase());
}

function round2(n) {
  return Math.round(n * 100) / 100;
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
  if (category) items = items.filter((i) => i.category === category);

  const byCategory = {};
  let total = 0;
  for (const item of items) {
    total += item.amount;
    byCategory[item.category] = round2((byCategory[item.category] || 0) + item.amount);
  }

  return {
    start_date: args.start_date,
    end_date: args.end_date,
    category_filter: category || "all",
    total_spent_php: round2(total),
    expense_count: items.length,
    by_category_php: byCategory,
    expenses: items.slice(0, 15).map((i) => ({
      date: i.date,
      category: i.category,
      note: i.note,
      amount_php: i.amount,
    })),
  };
}

// ---------- Utang (shared expense ledger) tools ----------
const TYPE_LABELS = {
  lent: "lent",
  borrowed: "borrowed",
  they_paid: "friend paid back",
  i_paid: "user paid back",
};

// Lets a new entry reuse the spelling of a friend that is already on the panel ("ana" -> "Ana")
function makeNameResolver(knownFriends) {
  const byKey = new Map();
  for (const raw of Array.isArray(knownFriends) ? knownFriends : []) {
    const known = cleanName(raw);
    if (!known.error && !byKey.has(known.key)) byKey.set(known.key, known.name);
  }
  return (name) => {
    const cleaned = cleanName(name);
    return !cleaned.error && byKey.has(cleaned.key) ? byKey.get(cleaned.key) : name;
  };
}

function readDate(value) {
  if (value === undefined || value === null || value === "") return { date: todayString() };
  if (!isValidDate(value)) return { error: "The date must be a real date written as YYYY-MM-DD." };
  return { date: value };
}

function readDirection(value, allowed) {
  return allowed.includes(value) ? { direction: value } : { error: "direction must be " + allowed.join(" or ") + "." };
}

function shortNote(value) {
  return String(value === undefined || value === null ? "" : value).replace(/\s+/g, " ").trim();
}

function joinNames(names) {
  if (names.length <= 1) return names.join("");
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

async function toolRecordUtang(uid, args, context) {
  const name = cleanName(args.friend_name);
  if (name.error) return { error: name.error };
  const money = pesosToCentavos(args.amount);
  if (money.error) return { error: money.error };
  const dir = readDirection(args.direction, ["they_owe_me", "i_owe_them"]);
  if (dir.error) return dir;
  const when = readDate(args.date);
  if (when.error) return when;

  const friendName = makeNameResolver(context.knownFriends)(name.name);
  const owedToUser = dir.direction === "they_owe_me";
  await addLedgerEntries(uid, [
    {
      friendName,
      type: owedToUser ? "lent" : "borrowed",
      amountCentavos: money.centavos,
      note: shortNote(args.note),
      date: when.date,
    },
  ]);
  return {
    success: true,
    message: owedToUser
      ? "Recorded: " + friendName + " owes you " + formatCentavos(money.centavos) + "."
      : "Recorded: you owe " + friendName + " " + formatCentavos(money.centavos) + ".",
  };
}

async function toolRecordRepayment(uid, args, context) {
  const name = cleanName(args.friend_name);
  if (name.error) return { error: name.error };
  const money = pesosToCentavos(args.amount);
  if (money.error) return { error: money.error };
  const dir = readDirection(args.direction, ["they_paid_me", "i_paid_them"]);
  if (dir.error) return dir;
  const when = readDate(args.date);
  if (when.error) return when;

  // Always a fresh read from the server, so the check uses the real balance
  const { friends } = computeBalances(await getLedgerFresh(uid));
  const found = friends.find((f) => f.friendKey === name.key);
  const friendName = found ? found.friendName : makeNameResolver(context.knownFriends)(name.name);

  const check = checkRepayment({
    friendName,
    balanceCentavos: found ? found.balanceCentavos : 0,
    amountCentavos: money.centavos,
    direction: dir.direction,
  });
  if (check.error) return { error: check.error, reason: check.reason };

  await addLedgerEntries(uid, [
    {
      friendName,
      type: check.type,
      amountCentavos: money.centavos,
      note: shortNote(args.note),
      date: when.date,
    },
  ]);

  const lead =
    dir.direction === "they_paid_me"
      ? "Recorded: " + friendName + " paid you back " + formatCentavos(money.centavos) + "."
      : "Recorded: you paid " + friendName + " back " + formatCentavos(money.centavos) + ".";
  const left = check.remainingCentavos;
  const tail =
    left === 0
      ? friendName + " is now settled."
      : left > 0
        ? friendName + " still owes you " + formatCentavos(left) + "."
        : "You still owe " + friendName + " " + formatCentavos(-left) + ".";
  return { success: true, message: lead + " " + tail };
}

async function toolSplitBill(uid, args, context) {
  const money = pesosToCentavos(args.total_amount);
  if (money.error) return { error: money.error };
  if (!Array.isArray(args.participants) || args.participants.length > 100) {
    return { error: "participants must be a list of the other people's names (not including the user)." };
  }
  const when = readDate(args.date);
  if (when.error) return when;

  const result = splitBill({
    totalCentavos: money.centavos,
    friends: args.participants,
    paidBy: args.paid_by,
  });
  if (result.error) return { error: result.error };

  const resolve = makeNameResolver(context.knownFriends);
  const base = shortNote(args.note).slice(0, 100) || "Split bill";
  const note =
    base + " (" + formatCentavos(result.totalCentavos) + " split " + result.headcount + " ways)";
  await addLedgerEntries(
    uid,
    result.entries.map((e) => ({
      friendName: resolve(e.friendName),
      type: e.type,
      amountCentavos: e.amountCentavos,
      note,
      date: when.date,
    }))
  );

  // Names of the friends in this split, for the confirmation message
  const names = [];
  const seen = new Set();
  for (const raw of args.participants) {
    const cleaned = cleanName(raw);
    if (cleaned.error || seen.has(cleaned.key)) continue;
    seen.add(cleaned.key);
    names.push(resolve(cleaned.name));
  }
  const everyone = joinNames(["you", ...names]);
  const share = formatCentavos(result.shareCentavos);
  const head = "Split " + formatCentavos(result.totalCentavos) + " between " + everyone + ": " + share + " each. ";

  if (result.payer === "me") {
    const extra =
      result.remainderCentavos > 0 ? " You cover the extra " + formatCentavos(result.remainderCentavos) + "." : "";
    const owe = names.length === 1 ? names[0] + " owes you " : joinNames(names) + " each owe you ";
    return { success: true, message: head + owe + share + "." + extra };
  }
  const payer = resolve(result.payer);
  return { success: true, message: head + payer + " paid, so you owe " + payer + " " + share + "." };
}

async function toolGetBalances(uid, args) {
  const entries = await getLedgerFresh(uid);
  const balances = computeBalances(entries);
  const describe = (f) => ({
    name: f.friendName,
    status: f.balanceCentavos > 0 ? "owes_you" : f.balanceCentavos < 0 ? "you_owe" : "settled",
    amount: formatCentavos(Math.abs(f.balanceCentavos)),
  });

  const wanted = args.friend_name;
  if (wanted !== undefined && wanted !== null && String(wanted).trim() !== "") {
    const name = cleanName(wanted);
    if (name.error) return { error: name.error };
    const found = balances.friends.find((f) => f.friendKey === name.key);
    if (!found) {
      return {
        friend: name.name,
        status: "no_utang_recorded",
        known_friends: balances.friends.slice(0, 50).map((f) => f.friendName),
      };
    }
    return {
      ...describe(found),
      recent_entries: entries
        .filter((e) => e.friendKey === name.key)
        .slice(0, 10)
        .map((e) => ({
          date: e.date,
          kind: TYPE_LABELS[e.type] || e.type,
          amount: formatCentavos(Math.round(e.amount * 100)),
          note: e.note,
        })),
    };
  }

  return {
    owed_to_you_total: formatCentavos(balances.owedToYou),
    you_owe_total: formatCentavos(balances.youOwe),
    friend_count: balances.friends.length,
    friends: balances.friends.slice(0, 50).map(describe),
  };
}

// context: { knownFriends: [names already on the panel] }
export async function runTool(uid, name, args, context = {}) {
  console.info("AI requested function:", name, args);
  try {
    if (name === "add_expense") return await toolAddExpense(uid, args);
    if (name === "get_spending_summary") return await toolGetSummary(uid, args);
    if (name === "record_utang") return await toolRecordUtang(uid, args, context);
    if (name === "record_repayment") return await toolRecordRepayment(uid, args, context);
    if (name === "split_bill") return await toolSplitBill(uid, args, context);
    if (name === "get_balances") return await toolGetBalances(uid, args);
    return { error: "Unknown function: " + name };
  } catch (error) {
    console.error("Function failed:", name, error);
    return { error: "The app could not complete this action. Please try again." };
  }
}