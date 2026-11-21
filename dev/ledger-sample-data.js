(async () => {
  const { auth } = await import("./js/firebase-config.js");
  const ledgerMod = await import("./js/ledger.js");
  if (!auth.currentUser) {
    console.log("Please log in first, then run this again.");
    return;
  }
  await ledgerMod.addLedgerEntries(auth.currentUser.uid, [
    { friendName: "Ana", type: "lent", amountCentavos: 20000, note: "Lunch", date: "2026-11-18" },
    { friendName: "Ana", type: "they_paid", amountCentavos: 10000, date: "2026-11-20" },
    { friendName: "Cris", type: "lent", amountCentavos: 20000, note: "Dinner split", date: "2026-11-19" },
    { friendName: "Ben", type: "borrowed", amountCentavos: 15000, note: "Jeepney fare and snacks", date: "2026-11-17" },
    { friendName: "Dan", type: "lent", amountCentavos: 5000, note: "Load", date: "2026-11-10" },
    { friendName: "Dan", type: "they_paid", amountCentavos: 5000, date: "2026-11-12" },
  ]);
  console.log("Sample ledger entries added.");
})();
