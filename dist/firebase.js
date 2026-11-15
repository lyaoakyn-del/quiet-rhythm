import { firebaseConfig } from "./firebase-config.js";

const SDK_VERSION = "13.3.0";
let clientPromise;

export function connectFirebase() {
  if (!clientPromise) clientPromise = createClient();
  return clientPromise;
}

async function createClient() {
  try {
    const base = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
    const [appSdk, authSdk, firestoreSdk] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-auth.js`),
      import(`${base}/firebase-firestore.js`)
    ]);
    const app = appSdk.initializeApp(firebaseConfig);
    const auth = authSdk.getAuth(app);
    const db = firestoreSdk.getFirestore(app);
    const sessionsRef = (uid) => firestoreSdk.collection(db, "users", uid, "sessions");

    return {
      watchAuth(callback, onError) {
        return authSdk.onAuthStateChanged(auth, callback, onError);
      },
      sendSignInLink(email, actionCodeSettings) {
        return authSdk.sendSignInLinkToEmail(auth, email, actionCodeSettings);
      },
      isSignInWithEmailLink(link) {
        return authSdk.isSignInWithEmailLink(auth, link);
      },
      signInWithEmailLink(email, link) {
        return authSdk.signInWithEmailLink(auth, email, link);
      },
      signOut() {
        return authSdk.signOut(auth);
      },
      async loadSessions(uid) {
        const snapshot = await firestoreSdk.getDocs(sessionsRef(uid));
        return snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id }));
      },
      async saveSessions(uid, sessions) {
        const records = sessions.filter((session) => session && typeof session.id === "string");
        for (let start = 0; start < records.length; start += 400) {
          const batch = firestoreSdk.writeBatch(db);
          records.slice(start, start + 400).forEach((session) => {
            const reference = firestoreSdk.doc(db, "users", uid, "sessions", session.id);
            batch.set(reference, session, { merge: true });
          });
          await batch.commit();
        }
      },
      async clearSessions(uid) {
        const snapshot = await firestoreSdk.getDocs(sessionsRef(uid));
        for (let start = 0; start < snapshot.docs.length; start += 400) {
          const batch = firestoreSdk.writeBatch(db);
          snapshot.docs.slice(start, start + 400).forEach((entry) => batch.delete(entry.ref));
          await batch.commit();
        }
      }
    };
  } catch {
    return null;
  }
}
