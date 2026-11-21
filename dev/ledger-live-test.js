(async () => {
  const { auth, db } = await import("./js/firebase-config.js");
  const ledgerMod = await import("./js/ledger.js");
  const fireMod = await import("https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js");

  const sinoUser = auth.currentUser;
  if (!sinoUser) {
    console.log("Please log in first, then run this again.");
    return;
  }
  const uidNya = sinoUser.uid;
  const utangCol = fireMod.collection(db, "users", uidNya, "ledger");
  const ginawaIds = [];
  const resultaArr = [];

  function isDenied(siraNya) {
    return !!siraNya && siraNya.code === "permission-denied";
  }

  function check(labelTxt, okBa, extraTxt) {
    resultaArr.push(okBa);
    console.log((okBa ? "PASS  " : "FAIL  ") + labelTxt + (extraTxt ? "  (" + extraTxt + ")" : ""));
  }

  try {
    const naisave = await ledgerMod.addLedgerEntries(uidNya, [
      { friendName: "ZZ Test Ana", type: "lent", amountCentavos: 20000, note: "Lunch" },
      { friendName: "ZZ Test Ben", type: "lent", amountCentavos: 3333 },
    ]);
    naisave.forEach((isaRow) => ginawaIds.push(isaRow.id));
    const rowsNya = (await ledgerMod.getLedgerFresh(uidNya)).filter((isaRow) => isaRow.friendName.startsWith("ZZ Test"));
    const okBa = rowsNya.length === 2 && rowsNya.some((isaRow) => isaRow.amount === 200) && rowsNya.some((isaRow) => isaRow.amount === 33.33);
    check("ledger.js saves a batch of 2 and reads it back (200 and 33.33)", okBa);
  } catch (siraNya) {
    check("ledger.js saves a batch of 2 and reads it back", false, siraNya.code || siraNya.message);
  }

  const goodDoc = { friendName: "ZZ Test Raw", friendKey: "zz test raw", type: "lent", amount: 5, note: "", date: "2026-11-20" };

  async function tryCreate(labelTxt, dataNya, shouldWork, createdAtVal) {
    try {
      const bagongRef = await fireMod.addDoc(utangCol, { ...dataNya, createdAt: createdAtVal || fireMod.serverTimestamp() });
      ginawaIds.push(bagongRef.id);
      check(labelTxt, shouldWork, shouldWork ? "allowed" : "ALLOWED but it should be denied");
    } catch (siraNya) {
      check(labelTxt, !shouldWork && isDenied(siraNya), siraNya.code || siraNya.message);
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

  if (ginawaIds.length > 0) {
    try {
      await fireMod.updateDoc(fireMod.doc(db, "users", uidNya, "ledger", ginawaIds[0]), { amount: 1 });
      check("editing an entry is denied", false, "UPDATE WAS ALLOWED");
    } catch (siraNya) {
      check("editing an entry is denied", isDenied(siraNya), siraNya.code || siraNya.message);
    }
  }
  try {
    await fireMod.getDocs(fireMod.collection(db, "users", "someone-elses-uid", "ledger"));
    check("reading another user's ledger is denied", false, "READ WAS ALLOWED");
  } catch (siraNya) {
    check("reading another user's ledger is denied", isDenied(siraNya), siraNya.code || siraNya.message);
  }
  try {
    await fireMod.addDoc(fireMod.collection(db, "users", "someone-elses-uid", "ledger"), { ...goodDoc, createdAt: fireMod.serverTimestamp() });
    check("writing to another user's ledger is denied", false, "WRITE WAS ALLOWED");
  } catch (siraNya) {
    check("writing to another user's ledger is denied", isDenied(siraNya), siraNya.code || siraNya.message);
  }

  let natanggal = 0;
  for (const docIdNya of ginawaIds) {
    try {
      await ledgerMod.deleteLedgerEntry(uidNya, docIdNya);
      natanggal++;
    } catch (siraNya) {
      console.log("Could not delete " + docIdNya + ": " + siraNya.code);
    }
  }
  check("test entries deleted", natanggal === ginawaIds.length, natanggal + " of " + ginawaIds.length);
  const natira = (await ledgerMod.getLedgerFresh(uidNya)).filter((isaRow) => isaRow.friendName.startsWith("ZZ Test")).length;
  check("no test entries left behind", natira === 0);

  console.log("\n" + resultaArr.filter(Boolean).length + " of " + resultaArr.length + " checks passed.");
})();
