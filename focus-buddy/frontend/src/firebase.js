import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getMessaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyD0Eb0io47XaNTarvsy6pYgEqA0HMiccEM",
  authDomain: "focus-buddy-3b565.firebaseapp.com",
  projectId: "focus-buddy-3b565",
  storageBucket: "focus-buddy-3b565.firebasestorage.app",
  messagingSenderId: "336013532152",
  appId: "1:336013532152:web:a771253870e7c5b21f940d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let messaging = null;
try {
  messaging = getMessaging(app);
} catch (e) {
  console.warn("Messaging initialization bypassed in this environment context.");
}

const VAPID_KEY = "BFJHmUNkzX_euJTDVoyW44cR9iEVcAMzYa9D-pwJFD9APd0JQJH5DGtnZbs403kE-IM3qM-HlyeNIoleVmJYTIs";

export { db, messaging, VAPID_KEY };