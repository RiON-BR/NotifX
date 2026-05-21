const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

// Cloud Function that listens for any status changes inside your Firestore rooms
exports.onBuddyStatusChange = onDocumentUpdated("rooms/{roomId}", async (event) => {
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();

  if (!beforeData || !afterData) return;

  const roles = ["buddyA", "buddyB"];

  for (const role of roles) {
    const opponentRole = role === "buddyA" ? "buddyB" : "buddyA";
    
    // Check if a buddy changed their status
    if (beforeData[role]?.status !== afterData[role]?.status) {
      const targetToken = afterData[opponentRole]?.fcmToken;
      const buddyName = afterData[role]?.name || role;
      const newStatus = afterData[role]?.status;

      // Skip if the opponent doesn't have a valid real token registered
      if (!targetToken || targetToken.startsWith("MOCK-TOKEN")) {
        logger.log(`Skipping notification for ${opponentRole} due to mock token fallback.`);
        continue;
      }

      let title = "🎯 Focus Buddy Update";
      let body = `${buddyName} changed status to ${newStatus}`;

      if (newStatus === "focusing") {
        title = "🚀 Time to Lock In!";
        body = `${buddyName} just started a 45-minute focus block. Join them!`;
      } else if (newStatus === "completed") {
        title = "🎉 Block Completed!";
        body = `${buddyName} successfully finished their focus session!`;
      } else if (newStatus === "abandoned") {
        title = "🚨 Session Dropped";
        body = `${buddyName} dropped out of their focus block early.`;
      }

      const message = {
        notification: { title, body },
        token: targetToken,
      };

      try {
        await admin.messaging().send(message);
        logger.log(`Notification sent cleanly to ${opponentRole}`);
      } catch (error) {
        logger.error("Error sending push notification:", error);
      }
    }
  }
});