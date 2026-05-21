const admin = require("firebase-admin");
const mongoose = require("mongoose");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
console.log("🚀 Real-Time Firestore Listener Sync Active!");

mongoose.connect('mongodb://localhost:27017/notification_studio')
  .then(() => console.log("🍃 MongoDB Backup Channel Online!"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

// --- MongoDB Backup Schema Configuration ---
const MongoTemplate = mongoose.model('NotificationBackup', new mongoose.Schema({
  title: String,
  body: String,
  firestoreId: String,
  backedUpAt: { type: Date, default: Date.now }
}));

const AnalyticsModel = mongoose.model('Analytics', new mongoose.Schema({
  metricName: { type: String, default: "total_dispatched" },
  count: { type: Number, default: 0 }
}));

async function logMetricsIncrement() {
  try {
    await AnalyticsModel.findOneAndUpdate(
      { metricName: "total_dispatched" },
      { $inc: { count: 1 } },
      { upsert: true, new: true }
    );
    console.log("📊 Analytics ledger entry updated (+1 trigger logged)");
  } catch (err) {
    console.error("Metrics increment exception caught:", err.message);
  }
}

// PIPELINE A: Listen for Notification Triggers & Route Native Pushes
db.collection("notification_triggers").onSnapshot((snapshot) => {
  snapshot.docChanges().forEach(async (change) => {
    if (change.type === "added") {
      const triggerId = change.doc.id;
      const triggerData = change.doc.data();

      try {
        const configDoc = await db.collection("config").doc("targetDevice").get();
        if (!configDoc.exists) return;

        const { token, lastSeen } = configDoc.data();

        // Safety Watchdog: Drop pipeline if local target session has been offline for > 2 mins
        if (lastSeen && lastSeen < Date.now() - (2 * 60 * 1000)) {
          console.warn(`⏳ Pipeline Suspended: Target browser window is closed or stale.`);
          await db.collection("notification_triggers").doc(triggerId).delete();
          return;
        }

        await admin.messaging().send({
          notification: { title: triggerData.title, body: triggerData.body },
          token: token
        });
        
        console.log(`✅ Push Broadcast Dispatched: [${triggerData.title}]`);
        await logMetricsIncrement();
        await db.collection("notification_triggers").doc(triggerId).delete();

      } catch (error) {
        await db.collection("notification_triggers").doc(triggerId).delete();
        console.error("❌ Google Network Gateway Exception:", error.message);
      }
    }
  });
});

// PIPELINE B: Mirror Templates Instantly into MongoDB Database Nodes
db.collection("custom_notifications").onSnapshot((snapshot) => {
  snapshot.docChanges().forEach(async (change) => {
    if (change.type === "added") {
      const docId = change.doc.id;
      const data = change.doc.data();
      try {
        const exists = await MongoTemplate.findOne({ firestoreId: docId });
        if (!exists) {
          const backup = new MongoTemplate({
            title: data.title,
            body: data.body,
            firestoreId: docId
          });
          await backup.save();
          console.log(`💾 MongoDB Record Synced: Added backup for [${data.title}]`);
        }
      } catch (err) {
        console.error("MongoDB replication failure:", err.message);
      }
    }
    if (change.type === "removed") {
      try {
        await MongoTemplate.deleteOne({ firestoreId: change.doc.id });
        console.log(`🗑️ MongoDB Record Synced: Removed backup for collection index reference: ${change.doc.id}`);
      } catch (err) {
        console.error("MongoDB document removal failure:", err.message);
      }
    }
  });
});