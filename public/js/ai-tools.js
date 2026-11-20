import { Schema } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-ai.js";
import {
  CATEGORIES, addExpense, getExpensesInRange, isValidDate, todayString, formatPeso,
} from "./expenses.js";

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
          "Save a new expense for the logged-in user. Use this when the user says they spent or paid money on something.",
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

export async function runTool(uid, name, args) {
  console.info("AI requested function:", name, args);
  try {
    if (name === "add_expense") return await toolAddExpense(uid, args);
    if (name === "get_spending_summary") return await toolGetSummary(uid, args);
    return { error: "Unknown function: " + name };
  } catch (error) {
    console.error("Function failed:", name, error);
    return { error: "The app could not complete this action. Please try again." };
  }
}