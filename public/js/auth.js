import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { auth } from "./firebase-config.js";

export async function signUp(pangalan, sulatEmail, passWord) {
  const bagongAcc = await createUserWithEmailAndPassword(auth, sulatEmail, passWord);
  if (pangalan) await updateProfile(bagongAcc.user, { displayName: pangalan });
  return bagongAcc.user;
}

export function logIn(sulatEmail, passWord) {
  return signInWithEmailAndPassword(auth, sulatEmail, passWord);
}

export function logOut() {
  return signOut(auth);
}

export function watchAuth(kapagMayUser) {
  return onAuthStateChanged(auth, kapagMayUser);
}

export function friendlyError(problema) {
  const kodigo = problema.code;
  switch (kodigo) {
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/email-already-in-use":
      return "That email is already registered. Try logging in.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection.";
    default:
      return "Something went wrong. Please try again.";
  }
}
