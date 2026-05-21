import React, { useState, useEffect, useCallback } from 'react';
import { db, messaging, VAPID_KEY } from './firebase';
import { collection, doc, setDoc, addDoc, onSnapshot, query, orderBy, updateDoc, deleteDoc } from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';

export default function App() {
  // Core input states
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [fcmToken, setFcmToken] = useState('');
  const [notificationsList, setNotificationsList] = useState([]);
  
  // Custom theme and profile analytics counters
  const [darkMode, setDarkMode] = useState(false);
  const [totalSentCount, setTotalSentCount] = useState(0);
  const [userName, setUserName] = useState('');
  const [isNameSet, setIsNameSet] = useState(false);
  const [tempName, setTempName] = useState('');

  // Scheduler queues and interaction states
  const [delaySettings, setDelaySettings] = useState({});
  const [intervalSettings, setIntervalSettings] = useState({});
  const [activeTimers, setActiveTimers] = useState({});
  const [activeIntervals, setActiveIntervals] = useState({});
  const [actionFeedback, setActionFeedback] = useState({}); 
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load configuration tokens from localStorage on mount
  useEffect(() => {
    const savedName = localStorage.getItem('studio_username');
    if (savedName) {
      setUserName(savedName);
      setIsNameSet(true);
    }
    setDarkMode(localStorage.getItem('studio_darkmode') === 'true');
    setTotalSentCount(parseInt(localStorage.getItem('studio_sent_stat') || "0", 10));
  }, []);

  // Base-Safe Service Worker Registration Lifecycle
  useEffect(() => {
    let heartbeatLoop;
    let isMounted = true;

    async function establishHardwareLink() {
      try {
        if (!messaging) return;
        
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.warn("Desktop notification permissions denied by user.");
          return;
        }

        // Dynamically process sub-paths using Vite's asset base system
        const baseEnvPath = import.meta.env.BASE_URL || '/';
        const serviceWorkerPath = `${baseEnvPath.endsWith('/') ? baseEnvPath : baseEnvPath + '/'}firebase-messaging-sw.js`.replace(/\/+/g, '/');

        const registration = await navigator.serviceWorker.register(serviceWorkerPath);
        
        const token = await getToken(messaging, { 
          vapidKey: VAPID_KEY, 
          serviceWorkerRegistration: registration 
        });

        if (token && isMounted) {
          setFcmToken(token);
          
          // Seed active link instantly inside the config collection reference document
          await setDoc(doc(db, "config", "targetDevice"), { 
            token: token,
            lastSeen: Date.now()
          });

          // Heartbeat loop runs every 30 seconds to keep backend watchdog warm
          heartbeatLoop = setInterval(() => {
            updateDoc(doc(db, "config", "targetDevice"), { lastSeen: Date.now() })
              .catch(err => console.warn("Heartbeat write skipped:", err.message));
          }, 30000);
        }
      } catch (err) {
        console.error("Hardware channel registration failed:", err);
      }
    }
    
    establishHardwareLink();

    const unsubscribeForeground = onMessage(messaging, (payload) => {
      alert(`🔔 ${payload.notification.title}\n\n${payload.notification.body}`);
    });

    return () => {
      isMounted = false;
      unsubscribeForeground();
      if (heartbeatLoop) clearInterval(heartbeatLoop);
    };
  }, []);

  // Listen for custom saved template items in cloud Firestore
  useEffect(() => {
    const q = query(collection(db, "custom_notifications"), orderBy("createdAt", "desc"));
    const unsubscribeList = onSnapshot(q, (snapshot) => {
      const buffer = [];
      snapshot.forEach(doc => {
        buffer.push({ id: doc.id, ...doc.data() });
      });
      setNotificationsList(buffer);
    });
    return () => unsubscribeList();
  }, []);

  const toggleDarkMode = () => {
    const nextMode = !darkMode;
    setDarkMode(nextMode);
    localStorage.setItem('studio_darkmode', nextMode);
  };

  const handleSaveProfileName = (e) => {
    e.preventDefault();
    if (!tempName.trim()) return;
    localStorage.setItem('studio_username', tempName.trim());
    setUserName(tempName.trim());
    setIsNameSet(true);
  };

  const handleClearProfileName = () => {
    localStorage.removeItem('studio_username');
    setUserName('');
    setTempName('');
    setIsNameSet(false);
  };

  const useQuickTemplate = useCallback((qTitle, qBody) => {
    setTitle(qTitle);
    setBody(qBody);
  }, []);

  const handleSaveNotification = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "custom_notifications"), {
        title: title.trim(),
        body: body.trim(),
        createdAt: new Date()
      });
      setTitle('');
      setBody('');
    } catch (err) {
      console.error("Error saving document template node:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTemplate = async (id, e) => {
    e.stopPropagation();
    if (activeIntervals[id]) clearInterval(activeIntervals[id]);
    if (activeTimers[id]) clearTimeout(activeTimers[id]);
    try {
      await deleteDoc(doc(db, "custom_notifications", id));
    } catch (err) {
      console.error("Error removing database template node:", err);
    }
  };

  const showStatusFeedback = (id, message) => {
    setActionFeedback(prev => ({ ...prev, [id]: message }));
    setTimeout(() => {
      setActionFeedback(prev => ({ ...prev, [id]: null }));
    }, 2000);
  };

  const handleTriggerNotification = (notifItem) => {
    const id = notifItem.id;
    
    if (activeIntervals[id]) {
      clearInterval(activeIntervals[id]);
      setActiveIntervals(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
      showStatusFeedback(id, "Stopped 🛑");
      return;
    }

    const chosenIntervalMinutes = parseInt(intervalSettings[id] || "0", 10);
    const chosenDelayMinutes = parseInt(delaySettings[id] || "0", 10);

    const updateStats = () => {
      setTotalSentCount(prev => {
        const nextValue = prev + 1;
        localStorage.setItem('studio_sent_stat', nextValue);
        return nextValue;
      });
    };

    if (chosenIntervalMinutes > 0) {
      dispatchTriggerToFirestore(notifItem);
      updateStats();
      showStatusFeedback(id, "Repeating 🔁");
      
      const intervalId = setInterval(() => {
        dispatchTriggerToFirestore(notifItem);
        updateStats();
      }, chosenIntervalMinutes * 60 * 1000);

      setActiveIntervals(prev => ({ ...prev, [id]: intervalId }));
      return;
    }

    if (activeTimers[id]) clearTimeout(activeTimers[id]);

    if (chosenDelayMinutes === 0) {
      dispatchTriggerToFirestore(notifItem);
      updateStats();
      showStatusFeedback(id, "Sent ✨");
    } else {
      showStatusFeedback(id, "Queued ⏳");
      const timerId = setTimeout(() => {
        dispatchTriggerToFirestore(notifItem);
        updateStats();
        setActiveTimers(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
      }, chosenDelayMinutes * 60 * 1000);

      setActiveTimers(prev => ({ ...prev, [id]: timerId }));
    }
  };

  const deleteTriggerStatsLog = () => {
    localStorage.setItem('studio_sent_stat', '0');
    setTotalSentCount(0);
  };

  const dispatchTriggerToFirestore = async (item) => {
    try {
      await addDoc(collection(db, "notification_triggers"), {
        title: item.title,
        body: item.body,
        triggeredAt: new Date()
      });
    } catch (err) {
      console.error("Failed to commit trigger event payload:", err);
    }
  };

  const dynamicTheme = darkMode ? styles.dark : styles.light;

  if (!isNameSet) {
    return (
      <div style={{ ...styles.appContainer, backgroundColor: '#f8fafc' }}>
        <div style={styles.setupCard}>
          <h1 style={styles.setupTitle}>✨ Welcome to Notification Hub</h1>
          <p style={styles.setupSubtitle}>Please type your name to open your dashboard.</p>
          <form onSubmit={handleSaveProfileName} style={styles.form}>
            <div style={styles.inputGroup}>
              <label htmlFor="user-profile-setup-name" style={styles.label}>Your Name</label>
              <input type="text" id="user-profile-setup-name" value={tempName} onChange={e => setTempName(e.target.value)} placeholder="Enter your name..." style={styles.input} required maxLength={25} />
            </div>
            <button type="submit" style={styles.saveBtn}>Open Dashboard</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.appContainer, backgroundColor: dynamicTheme.bgCanvas }}>
      <div style={{ ...styles.mainCard, backgroundColor: dynamicTheme.bgPanel, borderColor: dynamicTheme.borderLine }}>
        
        {/* Workspace Profile Custom Top Banner Bar */}
        <div style={{ ...styles.headerBar, borderColor: dynamicTheme.borderLine }}>
          <div style={styles.userInfoSide}>
            <div style={{ ...styles.userAvatar, backgroundColor: dynamicTheme.avatarBg, color: dynamicTheme.textMain }}>
              {userName.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 style={{ ...styles.mainTitle, color: dynamicTheme.textMain }}>
                {userName}'s Workspace
                <span onClick={handleClearProfileName} style={styles.changeNameLink}> (switch user)</span>
              </h1>
              <p style={{ ...styles.subtitle, color: dynamicTheme.textMuted }}>Create, save, and schedule custom desktop reminders</p>
            </div>
          </div>
          
          <div style={styles.statusGroup}>
            <div style={styles.controlsRowTop}>
              <button onClick={toggleDarkMode} style={{ ...styles.themeToggleBtn, backgroundColor: dynamicTheme.avatarBg, color: dynamicTheme.textMain }}>
                {darkMode ? '☀️ Light' : '🌙 Dark'}
              </button>
              <div style={{ ...styles.metaBadge, backgroundColor: dynamicTheme.avatarBg, borderColor: dynamicTheme.borderLine, color: dynamicTheme.textMain }}>
                Total Saved: {notificationsList.length}
              </div>
            </div>
            
            <div style={{
              ...styles.statusBadge,
              backgroundColor: fcmToken ? '#ecfdf5' : '#fff1f2',
              color: fcmToken ? '#065f46' : '#9f1239'
            }}>
              <span style={{ ...styles.statusDot, backgroundColor: fcmToken ? '#10b981' : '#f43f5e' }}></span>
              <span>{fcmToken ? "Connected" : "Connecting..."}</span>
            </div>
          </div>
        </div>

        {/* Local Cached Metrics Tracker Strip */}
        <div style={{ ...styles.analyticsStrip, backgroundColor: dynamicTheme.avatarBg, borderColor: dynamicTheme.borderLine }}>
          <span style={{ ...styles.analyticsText, color: dynamicTheme.textMain }}>
            📊 <strong>Productivity Score:</strong> You have dispatched <strong>{totalSentCount}</strong> active notifications this session!
          </span>
          {totalSentCount > 0 && <button onClick={deleteTriggerStatsLog} style={styles.resetStatsLink}>Reset Count</button>}
        </div>

        {/* Workspace Layout Grid Splitter */}
        <div style={styles.layoutGrid}>
          
          {/* Creation Section Panel */}
          <div style={styles.leftPanel}>
            <h2 style={{ ...styles.sectionTitle, color: dynamicTheme.textMain }}>Create Reminder</h2>
            
            <div style={styles.quickTagsContainer}>
              <span style={styles.tagHelpText}>Presets:</span>
              <button type="button" onClick={() => useQuickTemplate("Water Reminder! 💧", "Time to drink a fresh glass of water.")} style={{ ...styles.macroTag, borderColor: dynamicTheme.borderLine, color: dynamicTheme.textMain }}>💧 Water</button>
              <button type="button" onClick={() => useQuickTemplate("Break Time! ☕", "Step away from your monitor and stretch.")} style={{ ...styles.macroTag, borderColor: dynamicTheme.borderLine, color: dynamicTheme.textMain }}>☕ Break</button>
            </div>

            <form onSubmit={handleSaveNotification} style={styles.form}>
              <div style={styles.inputGroup}>
                <label htmlFor="notification-title-input" style={{ ...styles.label, color: dynamicTheme.textMuted }}>Notification Title</label>
                <input id="notification-title-input" name="notificationTitle" type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Take a break!" style={{ ...styles.input, borderColor: dynamicTheme.borderLine, color: dynamicTheme.textMain, backgroundColor: dynamicTheme.bgCanvas }} required maxLength={50} />
              </div>

              <div style={styles.inputGroup}>
                <label htmlFor="notification-body-textarea" style={{ ...styles.label, color: dynamicTheme.textMuted }}>Message Body</label>
                <textarea id="notification-body-textarea" name="notificationBody" value={body} onChange={e => setBody(e.target.value)} placeholder="Type what you want the popup card to say..." rows="4" style={{ ...styles.textarea, borderColor: dynamicTheme.borderLine, color: dynamicTheme.textMain, backgroundColor: dynamicTheme.bgCanvas }} required maxLength={250} />
              </div>
              
              <button type="submit" disabled={isSubmitting} style={{ ...styles.saveBtn, backgroundColor: dynamicTheme.btnMain, color: dynamicTheme.btnText, opacity: isSubmitting ? 0.7 : 1 }}>
                {isSubmitting ? "Saving..." : "Save Template"}
              </button>
            </form>
          </div>

          {/* Active Registration Feed Section Panel */}
          <div style={styles.rightPanel}>
            <h2 style={{ ...styles.sectionTitle, color: dynamicTheme.textMain }}>Saved Reminders Collection</h2>
            <div style={styles.listContainer}>
              {notificationsList.length === 0 ? (
                <div style={{ ...styles.emptyState, backgroundColor: dynamicTheme.avatarBg, borderColor: dynamicTheme.borderLine, color: dynamicTheme.textMuted }}>No reminders saved yet. Create one on the left panel!</div>
              ) : (
                notificationsList.map((notif) => {
                  const id = notif.id;
                  const isTimerRunning = !!activeTimers[id];
                  const isIntervalRunning = !!activeIntervals[id];
                  const feedbackState = actionFeedback[id];
                  
                  return (
                    <div key={id} style={{ ...styles.templateCard, backgroundColor: dynamicTheme.bgCanvas, borderColor: dynamicTheme.borderLine }}>
                      <div style={styles.cardText}>
                        <div style={styles.titleRow}>
                          <span style={{ ...styles.cardTitle, color: dynamicTheme.textMain }}>{notif.title}</span>
                          <button onClick={(e) => handleDeleteTemplate(id, e)} style={styles.deleteBtn}>✕</button>
                        </div>
                        <p style={{ ...styles.cardBody, color: dynamicTheme.textMuted }}>{notif.body}</p>
                      </div>
                      
                      <div style={{ ...styles.controlCluster, borderColor: dynamicTheme.borderLine }}>
                        <select 
                          aria-label="Select delay configuration timing offset values"
                          disabled={isTimerRunning || isIntervalRunning}
                          value={delaySettings[id] || "0"} 
                          onChange={(e) => setDelaySettings(prev => ({ ...prev, [id]: e.target.value }))}
                          style={{ ...styles.selectDropdown, borderColor: dynamicTheme.borderLine, color: dynamicTheme.textMain, backgroundColor: dynamicTheme.bgPanel }}
                        >
                          <option value="0">Send Instantly</option>
                          <option value="5">Delay 5 Mins</option>
                          <option value="15">Delay 15 Mins</option>
                        </select>

                        <select 
                          aria-label="Select repeat intervals loop cycles properties"
                          disabled={isTimerRunning || isIntervalRunning}
                          value={intervalSettings[id] || "0"} 
                          onChange={(e) => setIntervalSettings(prev => ({ ...prev, [id]: e.target.value }))}
                          style={{ ...styles.selectDropdown, borderColor: dynamicTheme.borderLine, color: dynamicTheme.textMain, backgroundColor: dynamicTheme.bgPanel }}
                        >
                          <option value="0">Run Once</option>
                          <option value="5">Repeat 5 Mins</option>
                          <option value="30">Repeat 30 Mins</option>
                        </select>

                        <button 
                          onClick={() => handleTriggerNotification(notif)} 
                          style={{
                            ...styles.triggerBtn,
                            backgroundColor: feedbackState ? '#e2e8f0' : isIntervalRunning ? '#fee2e2' : isTimerRunning ? '#fef3c7' : '#eff6ff',
                            color: feedbackState ? '#475569' : isIntervalRunning ? '#991b1b' : isTimerRunning ? '#92400e' : '#1e40af',
                          }}
                        >
                          {feedbackState || (isIntervalRunning ? "Stop 🛑" : isTimerRunning ? "Queued ⏳" : "Send 🕊️")}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// Minimal Architecture Style Matrix Configuration Properties Tokens
const styles = {
  light: { bgCanvas: '#f8fafc', bgPanel: '#ffffff', borderLine: '#e2e8f0', textMain: '#1e293b', textMuted: '#64748b', avatarBg: '#f1f5f9', btnMain: '#1e293b', btnText: '#ffffff' },
  dark: { bgCanvas: '#0f172a', bgPanel: '#1e293b', borderLine: '#334155', textMain: '#f8fafc', textMuted: '#94a3b8', avatarBg: '#0f172a', btnMain: '#38bdf8', btnText: '#0f172a' },
  appContainer: { minHeight: '100vh', width: '100vw', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px', boxSizing: 'border-box', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', transition: 'background 0.25s ease' },
  setupCard: { width: '100%', maxWidth: '400px', backgroundColor: '#ffffff', borderRadius: '16px', padding: '35px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', border: '1px solid #e2e8f0', boxSizing: 'border-box' },
  setupTitle: { margin: '0 0 8px 0', fontWeight: '600', fontSize: '20px', color: '#1e293b', textAlign: 'center' },
  setupSubtitle: { margin: '0 0 24px 0', color: '#64748b', fontSize: '14px', textAlign: 'center', lineHeight: '1.4' },
  mainCard: { width: '100%', maxWidth: '1200px', minHeight: '680px', borderRadius: '16px', padding: '40px', boxShadow: '0 10px 25px rgba(0,0,0,0.02)', border: '1px solid', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', transition: 'background 0.25s ease, border-color 0.25s ease' },
  headerBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid', paddingBottom: '24px', marginBottom: '20px' },
  userInfoSide: { display: 'flex', alignItems: 'center', gap: '16px' },
  userAvatar: { width: '46px', height: '46px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: '600', fontSize: '15px', border: '1px solid #cbd5e1' },
  mainTitle: { margin: '0 0 4px 0', fontWeight: '600', fontSize: '22px' },
  changeNameLink: { fontSize: '12px', color: '#94a3b8', fontWeight: '400', cursor: 'pointer', marginLeft: '8px' },
  subtitle: { margin: 0, fontSize: '13px' },
  statusGroup: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' },
  controlsRowTop: { display: 'flex', alignItems: 'center', gap: '12px' },
  themeToggleBtn: { border: '1px solid #cbd5e1', padding: '5px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' },
  metaBadge: { fontSize: '12px', border: '1px solid', padding: '4px 10px', borderRadius: '6px', fontWeight: '500' },
  statusBadge: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '500' },
  statusDot: { width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block' },
  analyticsStrip: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid', padding: '12px 20px', borderRadius: '10px', marginBottom: '24px' },
  analyticsText: { fontSize: '13px' },
  resetStatsLink: { background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: '500', textDecoration: 'underline' },
  layoutGrid: { display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '48px', flexGrow: 1 },
  leftPanel: { display: 'flex', flexDirection: 'column' },
  rightPanel: { display: 'flex', flexDirection: 'column', borderLeft: '1px solid #cbd5e1', paddingLeft: '48px' },
  sectionTitle: { margin: '0 0 20px 0', fontSize: '15px', fontWeight: '600', letterSpacing: '0.3px' },
  quickTagsContainer: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' },
  tagHelpText: { fontSize: '12px', color: '#94a3b8', marginRight: '4px' },
  macroTag: { background: 'none', border: '1px solid', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '500', cursor: 'pointer' },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '12px', fontWeight: '500' },
  input: { border: '1px solid', borderRadius: '8px', padding: '12px 14px', fontSize: '14px', outline: 'none', width: '100%', boxSizing: 'border-box' },
  textarea: { border: '1px solid', borderRadius: '8px', padding: '12px 14px', fontSize: '14px', outline: 'none', resize: 'none', width: '100%', boxSizing: 'border-box' },
  saveBtn: { border: 'none', padding: '14px', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', fontSize: '14px', marginTop: '8px', width: '100%' },
  listContainer: { display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '430px', overflowY: 'auto', paddingRight: '8px' },
  emptyState: { border: '1px dashed', borderRadius: '8px', padding: '40px 20px', textAlign: 'center', fontSize: '13px' },
  templateCard: { border: '1px solid', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' },
  cardText: { width: '100%' },
  titleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  cardTitle: { fontWeight: '600', fontSize: '15px' },
  cardBody: { margin: 0, fontSize: '13px', lineHeight: '1.5' },
  deleteBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#94a3b8', padding: '4px' },
  controlCluster: { display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end', marginTop: '2px', borderTop: '1px solid', paddingTop: '14px' },
  selectDropdown: { padding: '6px 10px', borderRadius: '6px', border: '1px solid', fontSize: '12px', outline: 'none', cursor: 'pointer', fontWeight: '500' },
  triggerBtn: { border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', minWidth: '90px' }
};