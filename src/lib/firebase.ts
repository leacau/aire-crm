// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDhGY79PE-XiH8W1eAESRyBEFmytwdkKEk",
  authDomain: "crm-aire.firebaseapp.com",
  projectId: "crm-aire",
  storageBucket: "crm-aire.appspot.com",
  messagingSenderId: "128258561335",
  appId: "1:128258561335:web:05b7cf4b43e6eda24136b2",
  measurementId: "G-FC821FXKVW"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : undefined;
const auth = getAuth(app);
const db = getFirestore(app);

export { app, analytics, auth, db };