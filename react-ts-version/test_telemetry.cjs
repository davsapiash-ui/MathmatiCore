const { initializeApp } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
const { getDatabase, ref, get } = require("firebase/database");

const firebaseConfig = {
  apiKey: "AIzaSyMathmatiCoreAPIKeyPlaceholder", // Wait, I don't know the API key. Let me check the .env file!
};
