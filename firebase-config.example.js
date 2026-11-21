// ============================================================================
// PeraWise AI - Firebase configuration TEMPLATE (placeholders only)
//
// How to use it:
//   1. Copy this file to  public/js/firebase-config.js
//      (and keep the same file name, other files import it).
//   2. Replace every YOUR_... value below with the values from YOUR Firebase project:
//        - Firebase console > Project settings > General > Your apps > Web app > SDK setup and configuration
//        - The reCAPTCHA Enterprise site key: the key you created for your website in the Google Cloud console
//          (Google may show it under "reCAPTCHA Enterprise" or "Fraud Defense"). Register it in
//          Firebase console > App Check > Apps.
//   3. Never put a Gemini API key in this file. Firebase AI Logic keeps that key on the server side.
//   4. Local testing only: when the page runs on localhost, the browser prints an
//      "App Check debug token" in the Console. Register that token in
//      Firebase console > App Check > Apps > Manage debug tokens. Never share or commit it.
//
// The real firebase-config.js of the deployed site is not part of the submission copy.
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app-check.js";
import { getAI, GoogleAIBackend } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-ai.js";

const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.YOUR_REGION.firebasedatabase.app",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Debug token is only used when running on your own computer
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

export const app = initializeApp(firebaseConfig);

// Paste your reCAPTCHA Enterprise site key here (Google Cloud console). It is used by Firebase App Check.
initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider("YOUR_RECAPTCHA_ENTERPRISE_SITE_KEY"),
  isTokenAutoRefreshEnabled: true,
});

export const auth = getAuth(app);
export const db = getFirestore(app);
export const ai = getAI(app, { backend: new GoogleAIBackend() });