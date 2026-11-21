# PeraWise AI: Architecture

PeraWise AI is a chat-based expense and utang tracker for students. Users can type messages such as “spent 85 on lunch” or “Ana owes me 200”, and the app saves the details. It also has a live **Who owes whom** panel that shows each person's balance.

- **Live site:** https://perawise-ai-39790.web.app
- **Course:** Applications Development and Emerging Technologies – Final Project
- **Track:** A. Web Development + AI
- **Team:** Leonard D Mori and Louise Xavier F Lauronilla

## 1. Technology used

- **Front end:** HTML, CSS and JavaScript using ES modules. We did not use a framework or build tool, so the code is easier to open and explain.
- **Login and database:** Firebase Authentication handles email and password login, while Cloud Firestore stores the users' expenses and utang records.
- **AI:** Firebase AI Logic connects the app to Gemini through the Gemini Developer API. The main model is `gemini-3.5-flash-lite`, with `gemini-4-hydrogen` and `gemini-3.8-flash` as fallbacks.
- **Security:** Firestore security rules protect user data. Firebase App Check with reCAPTCHA Enterprise helps prevent other sites from using the app's Firebase services.
- **Hosting:** Firebase Hosting serves the files in the `public/` folder.
- **Development:** We use VS Code and the Live Server extension at `127.0.0.1:5500`. The Firebase JavaScript SDK is loaded from Google's CDN, so no npm install is needed.

## 2. How the system is set up

The app does not have its own backend server. The user's browser handles the app's JavaScript and connects to Firebase services. Firestore security rules control which records each user can access.

The main parts work together like this:

1. `auth.js` handles signing up, logging in and logging out through Firebase Authentication.
2. `chat.js` displays the conversation and sends the user's message to `ai-agent.js`.
3. `ai-agent.js` sends the message to Gemini through Firebase AI Logic. It also handles the instructions, reply language, model fallback and safety checks.
4. When the AI needs to save or read something, it requests one of the six functions in `ai-tools.js`.
5. Those functions use `expenses.js` or `ledger.js` to work with the user's Firestore data.
6. `main.js` and `ledger-ui.js` display the expense list and update the **Who owes whom** panel when Firestore data changes.

## 3. Main project files

The website is inside the `public/` folder. These are the main files:

- `index.html` contains the login screen and the main app screen, including the chat, expense form, expense list and balance panel.
- `css/style.css` and `css/ledger.css` handle the app's appearance.
- `js/firebase-config.js` connects the app to Firebase services.
- `js/auth.js` handles user accounts and login states.
- `js/main.js` connects the main parts of the app, including forms, lists, chat and the balance panel.
- `js/expenses.js` handles expense records and their categories.
- `js/ledger.js` handles saving, deleting and watching utang records.
- `js/ledger-math.js` contains the money calculations without Firebase code. This makes the calculations easier to test on their own.
- `js/ledger-ui.js` displays the balance panel.
- `js/chat.js`, `js/ai-agent.js` and `js/ai-tools.js` handle the chat, AI process and actions the AI can request.

Other important files include `firestore.rules` for database security, `firebase.json` and `.firebaserc` for Firebase setup, and `firestore.indexes.json` for database indexes. The `dev/` folder contains development and test helpers, while `docs/` contains project documentation. These folders are not served as part of the website.

## 4. How the data is stored

All records are saved under the user's Firebase ID. This keeps each user's data separate.

**Expenses** are stored at `users/{uid}/expenses/{id}`. Each record has an amount in pesos, a category, a note, a date and a creation time. The app supports eight categories: Food, Transport, Bills, Shopping, Health, Education, Entertainment and Other. Notes can be up to 200 characters, and amounts must be greater than zero and below ₱10,000,000.

**Utang records** are stored at `users/{uid}/ledger/{id}`. Each record includes the friend's name, a normalized version of the name for grouping, the transaction type, amount, note, date and creation time. Friends are stored as names in the records, so the app does not need a separate friends collection.

The four transaction types are:

- `lent`: someone owes the user, so the balance increases.
- `borrowed`: the user owes someone, so the balance decreases.
- `they_paid`: a friend paid the user back, so the balance decreases.
- `i_paid`: the user paid a friend back, so the balance increases.

The app does not store a separate balance. It calculates each balance from the saved records. This keeps the balance connected to the transaction history. Records can be added or deleted, but they cannot be edited.

## 5. What happens when someone sends a chat message

1. `chat.js` displays the message and sends it to `ai-agent.js` with recent chat history, the logged-in user's ID and the friend names shown in the balance panel.
2. `ai-agent.js` prepares the instructions for Gemini. These include the app's rules, the current date, the reply language and examples of how to handle common messages.
3. The app sends the message to the main Gemini model with the six available function descriptions. Each model call has a 15-second timeout. A fallback model is tried only when the previous model fails before anything has been saved.
4. When Gemini requests an action, `ai-tools.js` checks the details and runs the function using the logged-in user's ID. The AI cannot choose a different user ID.
5. The result is sent back to Gemini. The AI can make up to four rounds of function requests before giving its final reply.
6. The final reply appears in the chat. The app also checks that the AI did not claim to save something without calling a function.
7. Firestore listeners send updates to the page, so the expense list and balance panel can change without the user refreshing the page.

**Example: splitting a ₱900 dinner bill with Ben and Cris**

The AI identifies the total and the people involved, then asks the app to run `split_bill`. The app includes the user as a participant, calculates each person's share using centavos, and saves two records showing that Ben and Cris each owe the user ₱300. The records are saved in one batch, so either both are saved or neither is. The balance panel then updates, and the AI sends a confirmation.

## 6. What the AI can and cannot do

The AI uses Gemini to understand messages in English, Tagalog and Bisaya. It identifies details such as the person, amount and reason, chooses an expense category, and decides which app function to request. It can also answer questions about the user's spending and balances using the app's own data.

The AI has access to six functions:

- `add_expense` saves a normal expense.
- `get_spending_summary` totals expenses within a date range, with an optional category filter.
- `record_utang` records money the user lent or borrowed.
- `record_repayment` records a repayment after checking the current balance.
- `split_bill` divides a bill equally and saves the records together.
- `get_balances` shows who owes whom and can show a friend's recent records.

The AI does not calculate bill shares or balances. The app handles all money calculations in code because language models can make arithmetic mistakes. The AI also cannot edit or delete records, choose the user's ID, or access another user's data.

The app chooses the reply language instead of leaving that decision to the AI. Messages containing English receive an English reply. Otherwise, the app checks for Tagalog, then Bisaya. Very short replies such as “yes” keep the language used in the conversation.

## 7. Security and reliable records

The app uses a few checks to protect user data and avoid incorrect records:

- **User data:** Firestore rules only allow access to records under the logged-in user's ID.
- **Input checks:** The app and Firestore rules check field names, data types, amount limits and text lengths. Utang records cannot be updated.
- **AI actions:** The functions use the logged-in user's ID instead of accepting an ID from Gemini. The AI can only request the six functions listed above.
- **User-entered text:** Names and notes are cleaned and length-limited. The app treats them as data, not instructions. It also displays user text with `textContent` instead of inserting it as HTML.
- **App access:** App Check with reCAPTCHA Enterprise helps limit use of the Firebase services to the authorized site.
- **Duplicate saves:** The app does not switch to another model after a save. Bill splits are also saved as one batch to prevent only part of a split from being recorded.
- **Money amounts:** Calculations use whole centavos, and the values are checked by the app functions, ledger code and Firestore rules.

The Firebase web configuration is not treated as a secret. The Gemini key is kept by Firebase and is not included in the app's code. The App Check debug token is used only for local testing and is removed before submission.

## 8. Money calculations

The app does calculations in whole centavos instead of decimal pesos to avoid rounding problems. Firestore stores the final amounts in pesos.

When splitting a bill, the user is included in the number of participants. The app divides the total equally and rounds each share down to a whole centavo. Any leftover centavos are covered by the person who paid. For example, a ₱100 bill split between the user, Ana and Ben gives each person ₱33.33, with the payer covering the extra ₱0.01.

If the user paid, the app records what each friend owes the user. If a friend paid, the app records only the user's share as money borrowed. It does not track what the other friends owe that payer because the ledger only keeps track of the user's own money. A repayment is accepted only when it matches an existing balance.

## 9. Deployment and testing

The app is published through Firebase Hosting. The deploy command is:

```bash
firebase deploy --only hosting,firestore:rules
```

Firebase Hosting serves the `public/` folder. The `dev/` and `docs/` folders are used during development and are not part of the deployed website. After deployment, we check the site in a private browser window and on a phone. Local testing uses Live Server with the App Check debug token.

The project includes these test resources:

- `dev/ledger-live-test.js` checks the Firestore security rules.
- `dev/ledger-sample-data.js` provides sample records for testing the balance panel.
- `dev/panel-preview.html` is a static page used while working on the panel's design.
- `docs/AI_TEST_TABLE.md` contains AI test messages in English, Tagalog, Bisaya and mixed languages.
- `docs/TESTING.md` contains the full test checklist.

## 10. Main design choices and limitations

We used plain HTML, CSS and JavaScript because the project is easier to run and explain without a framework or build step. Firebase provides login, database, AI access, protection and hosting in one place, so we do not need to maintain a separate server. The trade-off is that the app depends on Google's services, and its AI instructions are visible in the browser.

We also chose to calculate balances from the transaction history instead of storing them separately. This helps prevent balances from becoming different from the saved records, although the app has to read the ledger to calculate them. Money calculations stay in regular JavaScript rather than Gemini, and amounts use centavos to avoid decimal rounding errors.

The app has a few limits at this stage:

- Bill splits are equal only. Unequal splits are not supported yet.
- Records cannot be edited. A user has to delete a record and add it again.
- The user's own share of a split is not saved as an expense.
- The app only supports Philippine pesos.
- Friend names are matched by letter case and spaces, so “Ana” and “Anna” are treated as different people.
- A bill split can include up to 20 friends, and a friend name can be up to 40 characters.
- The balance panel and AI read the ledger history, which is suitable for smaller records but may become slower with very large histories.
- The larger Gemini models can time out, so the app may need to try another model.

With more time, we would like to add unequal bill splits, editing records, better matching for similar friend names, the option to include the user's share as an expense, and a monthly budget with a spending chart.
