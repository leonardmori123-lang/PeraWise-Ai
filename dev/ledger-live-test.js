// LIVE TEST for the ledger rules and ledger.js (dev only, not part of the app).
//
// How to run:
//  1. Deploy the rules, then open http://127.0.0.1:5500/public/index.html and LOG IN.
//  2. Press F12 and open the Console tab.
//  3. Copy this whole file, paste it into the Console and press Enter.
//     (Chrome may ask you to type "allow pasting" first. Type it and paste again.)
//
// It creates a few test entries named "ZZ Test ...", checks that the rules allow
// and deny the right things, then deletes ONLY the entries it created.
// Every line should say PASS. A "denied" line only passes if Firestore answers permission-denied.
// If you see a code like "unavailable" or a blocked-request error, pause your ad blocker for this site and run it again.

(async () => {
  const { auth, db } = await import("./js/firebase-config.js");
  const L = await import("./js/ledger.js");
  const fs = await import("https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js");

  const user = auth.currentUser;
  if (!user) {
    console.log("Please log in first, then run this again.");
    return;
  }
  const uid = user.uid;
  const col = fs.collection(db, "users", uid, "ledger");
  const created = []; // ids of every test entry, so we can delete them at the end
  const results = [];

  // A request only counts as "denied by the rules" if Firestore says permission-denied.
  // Any other error (blocked by an ad blocker, offline, etc.) is shown as FAIL.
  function isDenied(e) {
    return !!e && e.code === "permission-denied";
  }

  function check(label, ok, extra) {
    results.push(ok);
    console.log((ok ? "PASS  " : "FAIL  ") + label + (extra ? "  (" + extra + ")" : ""));
  }

  // 1. Through ledger.js: this should work
  try {
    const saved = await L.addLedgerEntries(uid, [
      { friendName: "ZZ Test Ana", type: "lent", amountCentavos: 20000, note: "Lunch" },
      { friendName: "ZZ Test Ben", type: "lent", amountCentavos: 3333 },
    ]);
    saved.forEach((s) => created.push(s.id));
    const rows = (await L.getLedgerFresh(uid)).filter((r) => r.friendName.startsWith("ZZ Test"));
    const ok = rows.length === 2 && rows.some((r) => r.amount === 200) && rows.some((r) => r.amount === 33.33);
    check("ledger.js saves a batch of 2 and reads it back (200 and 33.33)", ok);
  } catch (e) {
    check("ledger.js saves a batch of 2 and reads it back", false, e.code || e.message);
  }

  // 2. Straight to Firestore, skipping ledger.js: now only the rules decide
  const good = { friendName: "ZZ Test Raw", friendKey: "zz test raw", type: "lent", amount: 5, note: "", date: "2026-11-20" };

  async function tryCreate(label, data, shouldWork, createdAt) {
    try {
      const ref = await fs.addDoc(col, { ...data, createdAt: createdAt || fs.serverTimestamp() });
      created.push(ref.id);
      check(label, shouldWork, shouldWork ? "allowed" : "ALLOWED but it should be denied");
    } catch (e) {
      check(label, !shouldWork && isDenied(e), e.code || e.message);
    }
  }

  await tryCreate("valid document is ALLOWED", good, true);
  await tryCreate("type 'gift' is denied", { ...good, type: "gift" }, false);
  await tryCreate("amount 0 is denied", { ...good, amount: 0 }, false);
  await tryCreate("amount 10,000,000 is denied", { ...good, amount: 10000000 }, false);
  await tryCreate("amount as text is denied", { ...good, amount: "5" }, false);
  await tryCreate("extra field is denied", { ...good, extra: 1 }, false);
  await tryCreate("empty name is denied", { ...good, friendName: "" }, false);
  await tryCreate("41-character name is denied", { ...good, friendName: "a".repeat(41) }, false);
  await tryCreate("empty key is denied", { ...good, friendKey: "" }, false);
  await tryCreate("bad date format is denied", { ...good, date: "20-11-2026" }, false);
  await tryCreate("201-character note is denied", { ...good, note: "n".repeat(201) }, false);
  const withoutNote = { ...good };
  delete withoutNote.note;
  await tryCreate("missing note is denied", withoutNote, false);
  await tryCreate("a createdAt made by the browser clock is denied", good, false, new Date());

  // 3. Updates and other people's data
  if (created.length > 0) {
    try {
      await fs.updateDoc(fs.doc(db, "users", uid, "ledger", created[0]), { amount: 1 });
      check("editing an entry is denied", false, "UPDATE WAS ALLOWED");
    } catch (e) {
      check("editing an entry is denied", isDenied(e), e.code || e.message);
    }
  }
  try {
    await fs.getDocs(fs.collection(db, "users", "someone-elses-uid", "ledger"));
    check("reading another user's ledger is denied", false, "READ WAS ALLOWED");
  } catch (e) {
    check("reading another user's ledger is denied", isDenied(e), e.code || e.message);
  }
  try {
    await fs.addDoc(fs.collection(db, "users", "someone-elses-uid", "ledger"), { ...good, createdAt: fs.serverTimestamp() });
    check("writing to another user's ledger is denied", false, "WRITE WAS ALLOWED");
  } catch (e) {
    check("writing to another user's ledger is denied", isDenied(e), e.code || e.message);
  }

  // 4. Clean up: delete only the entries made above (this also proves delete is allowed)
  let deleted = 0;
  for (const id of created) {
    try {
      await L.deleteLedgerEntry(uid, id);
      deleted++;
    } catch (e) {
      console.log("Could not delete " + id + ": " + e.code);
    }
  }
  check("test entries deleted", deleted === created.length, deleted + " of " + created.length);
  const left = (await L.getLedgerFresh(uid)).filter((r) => r.friendName.startsWith("ZZ Test")).length;
  check("no test entries left behind", left === 0);

  console.log("\n" + results.filter(Boolean).length + " of " + results.length + " checks passed.");
})();