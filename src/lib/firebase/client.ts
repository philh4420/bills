"use client";

import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";

function getFirebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  };
}

export function getFirebaseClientApp(): FirebaseApp {
  const config = getFirebaseConfig();

  const missing: string[] = [];
  if (!config.apiKey) missing.push("NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!config.authDomain) missing.push("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  if (!config.projectId) missing.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  if (!config.storageBucket) missing.push("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET");
  if (!config.messagingSenderId) missing.push("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID");
  if (!config.appId) missing.push("NEXT_PUBLIC_FIREBASE_APP_ID");

  if (missing.length > 0) {
    throw new Error(`Missing Firebase web configuration: ${missing.join(", ")}`);
  }

  if (getApps().length === 0) {
    return initializeApp(config);
  }

  return getApp();
}

export function getFirebaseClientAuth(): Auth {
  return getAuth(getFirebaseClientApp());
}
