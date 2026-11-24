(async () => {
  const { auth, db } = await import("./js/firebase-config.js");
  const ledger = await import("./js/ledger.js");
  const firestore = await import("https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js");

  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.log("Please log in first, then run this again.");
    return;
  }
  const uid = currentUser.uid;
  const ledgerCollection = firestore.collection(db, "users", uid, "ledger");
  const createdIds = [];
  const testResults = [];

  function isDenied(error) {
    return !!error && error.code === "permission-denied";
  }

  function check(label, passed, extra) {
    testResults.push(passed);
    console.log((passed ? "PASS  " : "FAIL  ") + label + (extra ? "  (" + extra + ")" : ""));
  }

  try {
    const savedEntries = await ledger.addLedgerEntries(uid, [
      { friendName: "ZZ Test Ana", type: "lent", amountCents: 20000, note: "Lunch" },
      { friendName: "ZZ Test Ben", type: "lent", amountCents: 3333 },
    ]);
    savedEntries.forEach((row) => createdIds.push(row.id));
    const rows = (await ledger.getLedgerFresh(uid)).filter((row) => row.friendName.startsWith("ZZ Test"));
    const passed = rows.length === 2 && rows.some((row) => row.amount === 200) && rows.some((row) => row.amount === 33.33);
    check("ledger.js saves a batch of 2 and reads it back (200 and 33.33)", passed);
  } catch (error) {
    check("ledger.js saves a batch of 2 and reads it back", false, error.code || error.message);
  }

  const goodDoc = { friendName: "ZZ Test Raw", friendKey: "zz test raw", type: "lent", amount: 5, note: "", date: "2026-11-20" };

  async function tryCreate(label, data, shouldWork, createdAtVal) {
    try {
      const newDocRef = await firestore.addDoc(ledgerCollection, { ...data, createdAt: createdAtVal || firestore.serverTimestamp() });
      createdIds.push(newDocRef.id);
      check(label, shouldWork, shouldWork ? "allowed" : "ALLOWED but it should be denied");
    } catch (error) {
      check(label, !shouldWork && isDenied(error), error.code || error.message);
    }
  }

  await tryCreate("valid document is ALLOWED", goodDoc, true);
  await tryCreate("type 'gift' is denied", { ...goodDoc, type: "gift" }, false);
  await tryCreate("amount 0 is denied", { ...goodDoc, amount: 0 }, false);
  await tryCreate("amount 10,000,000 is denied", { ...goodDoc, amount: 10000000 }, false);
  await tryCreate("amount as text is denied", { ...goodDoc, amount: "5" }, false);
  await tryCreate("extra field is denied", { ...goodDoc, extra: 1 }, false);
  await tryCreate("empty name is denied", { ...goodDoc, friendName: "" }, false);
  await tryCreate("41-character name is denied", { ...goodDoc, friendName: "a".repeat(41) }, false);
  await tryCreate("empty key is denied", { ...goodDoc, friendKey: "" }, false);
  await tryCreate("bad date format is denied", { ...goodDoc, date: "20-11-2026" }, false);
  await tryCreate("201-character note is denied", { ...goodDoc, note: "n".repeat(201) }, false);
  const withoutNote = { ...goodDoc };
  delete withoutNote.note;
  await tryCreate("missing note is denied", withoutNote, false);
  await tryCreate("a createdAt made by the browser clock is denied", goodDoc, false, new Date());

  if (createdIds.length > 0) {
    try {
      await firestore.updateDoc(firestore.doc(db, "users", uid, "ledger", createdIds[0]), { amount: 1 });
      check("editing an entry is denied", false, "UPDATE WAS ALLOWED");
    } catch (error) {
      check("editing an entry is denied", isDenied(error), error.code || error.message);
    }
  }
  try {
    await firestore.getDocs(firestore.collection(db, "users", "someone-elses-uid", "ledger"));
    check("reading another user's ledger is denied", false, "READ WAS ALLOWED");
  } catch (error) {
    check("reading another user's ledger is denied", isDenied(error), error.code || error.message);
  }
  try {
    await firestore.addDoc(firestore.collection(db, "users", "someone-elses-uid", "ledger"), { ...goodDoc, createdAt: firestore.serverTimestamp() });
    check("writing to another user's ledger is denied", false, "WRITE WAS ALLOWED");
  } catch (error) {
    check("writing to another user's ledger is denied", isDenied(error), error.code || error.message);
  }

  let deletedCount = 0;
  for (const docId of createdIds) {
    try {
      await ledger.deleteLedgerEntry(uid, docId);
      deletedCount++;
    } catch (error) {
      console.log("Could not delete " + docId + ": " + error.code);
    }
  }
  check("test entries deleted", deletedCount === createdIds.length, deletedCount + " of " + createdIds.length);
  const remainingCount = (await ledger.getLedgerFresh(uid)).filter((row) => row.friendName.startsWith("ZZ Test")).length;
  check("no test entries left behind", remainingCount === 0);

  console.log("\n" + testResults.filter(Boolean).length + " of " + testResults.length + " checks passed.");
})();
