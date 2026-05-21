importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyD0Eb0io47XaNTarvsy6pYgEqA0HMiccEM",
  authDomain: "focus-buddy-3b565.firebaseapp.com",
  projectId: "focus-buddy-3b565",
  storageBucket: "focus-buddy-3b565.firebasestorage.app",
  messagingSenderId: "336013532152",
  appId: "1:336013532152:web:a771253870e7c5b21f940d"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background packet intercepted: ', payload);

  const notificationTitle = payload.notification.title || "Focus Buddy Reminder!";
  const notificationOptions = {
    body: payload.notification.body || "A workspace alert was triggered.",
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: 'focus-buddy-alert', 
    requireInteraction: true 
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});