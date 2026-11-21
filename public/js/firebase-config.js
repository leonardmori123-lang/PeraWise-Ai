import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app-check.js";
import { getAI, GoogleAIBackend } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-ai.js";

const fbBits = {
  apiKey: "AIzaSyAHi1iXEIFlPs3glrbkZrigRjAPd2RaZyI",
  authDomain: "perawise-ai-39790.firebaseapp.com",
  databaseURL: "https://perawise-ai-39790-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "perawise-ai-39790",
  storageBucket: "perawise-ai-39790.firebasestorage.app",
  messagingSenderId: "1085090047169",
  appId: "1:1085090047169:web:94f6911223552b4af52040"
};

const hostNow = location.hostname;
if (hostNow === "localhost" || hostNow === "127.0.0.1") {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

export const app = initializeApp(fbBits);

initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider("6LdewScuAAAAAL_RXWOc4cRunF6Fn32EotcUKCa5"),
  isTokenAutoRefreshEnabled: true,
});

export const auth = getAuth(app);
export const db = getFirestore(app);
export const ai = getAI(app, { backend: new GoogleAIBackend() });
