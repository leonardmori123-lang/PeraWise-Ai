// SAMPLE DATA for trying out the "Who owes whom" panel (dev only, not part of the app).
//
// How to run:
//  1. Open http://127.0.0.1:5500/public/index.html and LOG IN.
//  2. Press F12, open the Console tab, paste this whole file and press Enter.
//
// It adds 6 entries for 4 made-up friends. The panel should fill in right away:
//   Owed to you  PHP 300.00   (Cris 200 + Ana 100)
//   You owe      PHP 150.00   (Ben)
//   Dan is "Settled"
// Remove them later with the Delete buttons in the panel.

(async () => {
  const { auth } = await import("./js/firebase-config.js");
  const L = await import("./js/ledger.js");
  if (!auth.currentUser) {
    console.log("Please log in first, then run this again.");
    return;
  }
  await L.addLedgerEntries(auth.currentUser.uid, [
    { friendName: "Ana", type: "lent", amountCentavos: 20000, note: "Lunch", date: "2026-11-18" },
    { friendName: "Ana", type: "they_paid", amountCentavos: 10000, date: "2026-11-20" },
    { friendName: "Cris", type: "lent", amountCentavos: 20000, note: "Dinner split", date: "2026-11-19" },
    { friendName: "Ben", type: "borrowed", amountCentavos: 15000, note: "Jeepney fare and snacks", date: "2026-11-17" },
    { friendName: "Dan", type: "lent", amountCentavos: 5000, note: "Load", date: "2026-11-10" },
    { friendName: "Dan", type: "they_paid", amountCentavos: 5000, date: "2026-11-12" },
  ]);
  console.log("Sample ledger entries added.");
})();