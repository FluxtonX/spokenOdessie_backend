const admin = require("firebase-admin");

const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

console.log("Checking Firebase Env Vars:");
console.log("- Project ID:", process.env.FIREBASE_PROJECT_ID ? "Found" : "Missing");
console.log("- Client Email:", process.env.FIREBASE_CLIENT_EMAIL ? "Found" : "Missing");
console.log("- Private Key:", process.env.FIREBASE_PRIVATE_KEY ? "Found" : "Missing");

if (firebaseConfig.projectId && firebaseConfig.clientEmail && firebaseConfig.privateKey) {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(firebaseConfig),
    });
    console.log("Firebase Admin initialized");
  }
} else {
  console.warn(
    "Firebase Admin NOT initialized: Missing credentials in .env file"
  );
}

module.exports = admin;
