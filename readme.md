
# 🎯 Focus Buddy System

A professional, real-time peer accountability application designed to sync pomodoro focus intervals between study buddies. This system tracks workspace status changes, logs templates locally, and pushes automated desktop notification banners using a completely free, hybrid local-server cloud topology.

---

## 🏗️ Architectural Data Flow

This project avoids paid cloud computation fees (such as Firebase Blaze Plan requirements for Cloud Functions) by executing a real-time orchestration loop through a lightweight Node.js script hosted on your local infrastructure. It simultaneously maintains a real-time communication pipeline via Firestore and a persistent database mirror via a local MongoDB instance.

```
                               ┌─────────────────────────────┐
                               │  Firebase Firestore Cloud   │
                               └──────────────┬──────────────┘
                                              ▲
                                      (Real-time Sync)
                                              ▼
 ┌────────────────────────┐        ┌──────────────────┐        ┌────────────────────────┐
 │   Tab A (Operator A)   ├───────►│  Local Backend   │◄───────┤   Tab B (Operator B)   │
 │      (React UI)        │        │   (server.js)    │        │      (React UI)        │
 └────────────────────────┘        └────────┬─────────┘        └────────────────────────┘
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     ▼                                             ▼
 ┌────────────────────────┐                               ┌────────────────────────┐
 │      Local MongoDB     │                               │  Google FCM Gateway    │
 │ (Template Master Sync) │                               └────────────┬───────────┘
 └────────────────────────┘                                            │
                                                               (Native Push Delivery)
                                                                       ▼
                                                          ┌────────────────────────┐
                                                          │ Windows Desktop Banner │
                                                          └────────────────────────┘

```

1. **User Action:** User B updates their status or triggers a reminder, writing an operational document to the Firestore cloud database.
2. **UI Synchronization:** User A’s browser window catches this remote mutation instantly via an open WebSocket stream (`onSnapshot`), changing the workspace display states in real-time.
3. **Backend Evaluation:** Simultaneously, the locally running Node.js script (`server.js`) catches the document delta, verifies if the browser viewport is active via an online heartbeat ledger, and mirrors a persistent copy down to **MongoDB**.
4. **Push Execution:** The backend routes the data packet to the **Google Firebase Cloud Messaging (FCM)** gateway using an authenticated administrative credential signature.
5. **Desktop Display:** Google locates the matching client device token, prompting the browser's background Service Worker thread (`firebase-messaging-sw.js`) to slide out a native system notification banner accompanied by a custom audio chime.

---

## 📦 Tech Stack & Core Dependencies

### Frontend Dashboard Layout

* **Framework:** React.js (Scaffolded using Vite)
* **State Management:** React Hook Lifecycle Sockets (`useState`, `useEffect`, `useCallback`)
* **Core Communication Library:** `firebase` Client Web SDK (Handles the direct client-to-cloud streams)
* **Local Caching:** Browser `localStorage` (Persists your custom profile configuration names, local session analytics stats, and dark mode configuration states)

### Backend Automation Layer

* **Runtime Environment:** Node.js Engine
* **Cloud Integration SDK:** `firebase-admin` (Privileged SDK used to listen to real-time database mutations and broadcast push payloads)
* **Object Data Modeling (ODM):** `mongoose` (Establishes a schema blueprint layer to manage persistent data streams directly into MongoDB)

---

## 📁 Repository Directory Structure

Maintain your workspace structure exactly like this to prevent compiler path execution errors:

```text
📁 focus-buddy/
├── 📁 backend/
│   ├── 📄 server.js                     # Multi-database listener & push processor
│   ├── 📄 serviceAccountKey.json        # High-security private key from Firebase
│   └── 📄 package.json                  # Express, Mongoose, and Admin SDK configurations
├── 📁 frontend/
│   ├── 📁 public/
│   │   └── 📄 firebase-messaging-sw.js  # Background service worker script
│   ├── 📁 src/
│   │   ├── 📄 App.jsx                   # Minimalist Slate Dashboard interface layout
│   │   ├── 📄 firebase.js               # Client configurations initialization
│   │   └── 📄 index.css                 # Core framework layout overrides
│   ├── 📄 index.html
│   └── 📄 package.json
├── 📄 firebase.json                     # Project configuration blueprints
└── 📄 .firebaserc                       # Global project target environment mappings

```

---

## 🚀 Step-by-Step Installation & Run Guide

### 1. Secure Your Credentials Key

1. Navigate to the online [Firebase Console Website](https://console.firebase.google.com/).
2. Click the gear icon next to **Project Overview** in the left sidebar and select **Project Settings**.
3. Move over to the **Service accounts** tab.
4. Click the large blue **Generate new private key** button at the bottom of the page.
5. Save the downloaded `.json` file inside your `backend/` directory and rename it exactly to: `serviceAccountKey.json`.

### 2. Launch the MongoDB Database Instance

Ensure your local MongoDB community instance is running on your computer. If it is not running as a background Windows service, open a terminal partition and turn it on manually:

```cmd
md C:\data\db
for /R "C:\Program Files\MongoDB" %i in (mongod.exe) do if exist "%i" "%i" --dbpath "C:\data\db"

```

Keep this window open. Open **MongoDB Compass** and connect to `mongodb://127.0.0.1:27017` to visually monitor your incoming data backups.

### 3. Boot Up the Automation Backend

Open a separate terminal split window pointing directly to your `backend/` directory folder and execute:

```cmd
cd backend
npm install
node server.js

```

*Your terminal logs will print:*

```text
🚀 Real-Time Firestore Listener Sync Active!
🍃 MongoDB Backup Channel Online!

```

### 4. Launch the React Client UI

Open an additional clean terminal split panel targeting your `frontend/` directory and spin up the development engine:

```cmd
cd frontend
npm install
npm run dev

```

Open the generated local address URL (`http://localhost:5173/`) inside your web browser.

---

## 🧪 Production-Grade Core Features Included

* **🌙 Adaptive Dark Mode:** A low-strain, dark-slate theme (`#0f172a`) toggle mapped right into your top utility corner to comfortably protect your eyes during late-night focus sessions.
* **📊 Dual-Database Mirror Syncing:** Every template saved on your frontend interface is securely stored in cloud Firestore and cloned locally into your MongoDB `notification_studio` collections array instantly.
* **🔊 Custom Audio Chimes Engine:** Includes an audio dropdown configuration selector that pairs specific notification categories with custom digital alerts (e.g., Soft Zen Bells, Electronic Digital Pings).
* **📈 Productivity Analytics Metric Tracker:** Built-in persistence logs that keep track of your active focus habits, updating a session score counter dashboard strip every single time your backend script dispatches a push event.