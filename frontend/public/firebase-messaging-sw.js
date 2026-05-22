// frontend/public/firebase-messaging-sw.js

// Import the official compatible Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Initialize the background app channel
firebase.initializeApp({
  apiKey: "AIzaSyD0Eb0io47XaNTarvsy6pYgEqA0HMiccEM",
  authDomain: "focus-buddy-3b565.firebaseapp.com",
  projectId: "focus-buddy-3b565",
  storageBucket: "focus-buddy-3b565.firebasestorage.app",
  messagingSenderId: "336013532152",
  appId: "1:336013532152:web:a771253870e7c5b21f940d"
});

const messaging = firebase.messaging();

// Intercept incoming notifications when the browser tab is completely closed or unfocused
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background payload: ', payload);
  
  const notificationTitle = payload.notification.title || "NotifX Alert!";
  const notificationOptions = {
    body: payload.notification.body || "You have an incoming notification.",
    icon: '/icons.svg', // Points to your frontend public vector assets folder
    tag: 'focus-buddy-notification', // Overwrites previous cards instead of cluttering the system drawer
    requireInteraction: true // Keeps the banner on Windows Desktop until user dismisses it
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});