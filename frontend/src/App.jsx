import React, { useState, useEffect } from 'react';
import { db, messaging, VAPID_KEY } from './firebase';
import { collection, doc, setDoc, addDoc, onSnapshot, query, orderBy, updateDoc, deleteDoc } from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';

export default function App() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [fcmToken, setFcmToken] = useState('');
  const [notificationsList, setNotificationsList] = useState([]);
  
  const [darkMode, setDarkMode] = useState(false);
  const [totalSentCount, setTotalSentCount] = useState(0);
  const [userName, setUserName] = useState('');
  const [isNameSet, setIsNameSet] = useState(false);
  const [tempName, setTempName] = useState('');
  const [actionFeedback, setActionFeedback] = useState({}); 
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [connectionStatus, setConnectionStatus] = useState("Connecting...");

  useEffect(() => {
    const savedName = localStorage.getItem('studio_username');
    if (savedName) {
      setUserName(savedName);
      setIsNameSet(true);
    }
  }, []);

  // ⚡ STABLE HTTPS PRODUCTION PIPELINE PIPING
  useEffect(() => {
    async function initializeNotificationPipeline() {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
          setConnectionStatus("Unsupported");
          return;
        }

        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        await navigator.serviceWorker.ready;

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setConnectionStatus("Permission Denied");
          return;
        }

        const targetDeviceToken = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: registration
        });

        if (targetDeviceToken) {
          setFcmToken(targetDeviceToken);
          
          // 🔥 BUG FIX 2 RESOLVED: Field key altered from 'fcmToken' to 'token' 
          // to prevent backend read extraction queries from pulling an undefined value.
          await setDoc(doc(db, "config", "targetDevice"), {
            token: targetDeviceToken, 
            heartbeat: new Date().toISOString(),
            lastSeen: Date.now()
          }, { merge: true });

          setConnectionStatus("Connected");
        } else {
          setConnectionStatus("Token Generation Failed");
        }
      } catch (error) {
        console.error("Pipeline Crash Details:", error);
        setConnectionStatus("Error Linking Pipeline");
      }
    }

    initializeNotificationPipeline();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setNotificationsList(list);
      const count = list.reduce((acc, curr) => acc + (curr.sentCount || 0), 0);
      setTotalSentCount(count);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onMessage(messaging, (payload) => {
      new Notification(payload.notification.title, {
        body: payload.notification.body,
        icon: '/icons.svg'
      });
    });
    return () => unsubscribe();
  }, []);

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'notifications'), {
        title,
        body,
        createdAt: new Date().toISOString(),
        sentCount: 0
      });
      setTitle('');
      setBody('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendNotification = async (id, notificationTitle, notificationBody) => {
    setActionFeedback(prev => ({ ...prev, [id]: 'Sending...' }));
    try {
      const docRef = doc(db, 'notifications', id);
      const target = notificationsList.find(n => n.id === id);
      await updateDoc(docRef, { sentCount: (target.sentCount || 0) + 1 });
      
      // 🔥 BUG FIX 1 RESOLVED: Destination route redirected 
      // from 'triggerQueue' directly into 'notification_triggers'
      await addDoc(collection(db, 'notification_triggers'), {
        title: notificationTitle,
        body: notificationBody,
        token: fcmToken,
        triggeredAt: new Date().toISOString()
      });
      
      setActionFeedback(prev => ({ ...prev, [id]: 'Dispatched! 🚀' }));
      setTimeout(() => setActionFeedback(prev => ({ ...prev, [id]: null })), 3000);
    } catch (err) {
      console.error(err);
      setActionFeedback(prev => ({ ...prev, [id]: 'Failed' }));
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (window.confirm("Delete this reminder template?")) {
      await deleteDoc(doc(db, 'notifications', id));
    }
  };

  const handleUsernameSubmit = (e) => {
    e.preventDefault();
    if (!tempName.trim()) return;
    localStorage.setItem('studio_username', tempName.trim());
    setUserName(tempName.trim());
    setIsNameSet(true);
  };

  const applyPreset = (presetType) => {
    if (presetType === 'water') {
      setTitle('💧 Hydration Check!');
      setBody('Time to look up from your screen and take a sip of water.');
    } else if (presetType === 'break') {
      setTitle('🧘 Break Time!');
      setBody('Step away from your monitor, stretch your arms, and look outside for a moment.');
    }
  };

  if (!isNameSet) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: darkMode ? '#0f111a' : '#f3f4f6', color: darkMode ? '#fff' : '#000', fontFamily: 'sans-serif' }}>
        <form onSubmit={handleUsernameSubmit} style={{ background: darkMode ? '#1e2230' : '#fff', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <h2>Welcome to NotifX</h2>
          <p style={{ opacity: 0.7, marginBottom: '20px' }}>Enter your name to unlock your notification studio workspace</p>
          <input type="text" value={tempName} onChange={(e) => setTempName(e.target.value)} placeholder="e.g., Niyati Joshi" required style={{ width: '80%', padding: '12px', borderRadius: '6px', border: '1px solid #ccc', marginBottom: '20px', fontSize: '16px' }} />
          <br />
          <button type="submit" style={{ padding: '12px 30px', border: 'none', borderRadius: '6px', backgroundColor: '#3b82f6', color: '#fff', fontSize: '16px', cursor: 'pointer', fontWeight: 'bold' }}>Enter Studio Workspace</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: darkMode ? '#0f111a' : '#f8fafc', minHeight: '100vh', color: darkMode ? '#f8fafc' : '#0f111a', fontFamily: 'sans-serif', transition: 'all 0.3s ease' }}>
      
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 40px', borderBottom: `1px solid ${darkMode ? '#1e2230' : '#e2e8f0'}`, background: darkMode ? '#161925' : '#fff' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>NJ's Workspace <span style={{ fontSize: '14px', fontWeight: 400, opacity: 0.6 }}>({userName})</span></h1>
          <p style={{ margin: '5px 0 0 0', fontSize: '13px', opacity: 0.7 }}>Create, organize, and automate systemic desktop intervals</p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ background: darkMode ? '#1e2230' : '#f1f5f9', padding: '8px 16px', borderRadius: '20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
            <span style={{ color: connectionStatus === "Connected" ? "#10b981" : "#f59e0b" }}>●</span> 
            <span style={{ opacity: 0.9 }}>{connectionStatus}</span>
          </div>
          <button onClick={() => setDarkMode(!darkMode)} style={{ background: darkMode ? '#1e2230' : '#e2e8f0', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: 'inherit' }}>
            {darkMode ? '☀️ Light' : '🌙 Dark'}
          </button>
          <button onClick={() => { localStorage.clear(); setIsNameSet(false); }} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '13px' }}>Switch User</button>
        </div>
      </header>

      <div style={{ padding: '20px 40px 0 40px' }}>
        <div style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', color: '#fff', padding: '20px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 15px rgba(29, 78, 216, 0.2)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px' }}>🚀 Productivity Analytics Hub</h3>
            <p style={{ margin: '5px 0 0 0', opacity: 0.9, fontSize: '14px' }}>You have successfully dispatched <strong style={{ fontSize: '18px' }}>{totalSentCount}</strong> secure system alerts this active session context loops!</p>
          </div>
          <button onClick={() => setTotalSentCount(0)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', padding: '8px 16px', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>Reset Count</button>
        </div>
      </div>

      <main style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', padding: '30px 40px' }}>
        <section style={{ background: darkMode ? '#161925' : '#fff', padding: '30px', borderRadius: '12px', border: `1px solid ${darkMode ? '#1e2230' : '#e2e8f0'}` }}>
          <h2 style={{ marginTop: 0, marginBottom: '20px', fontSize: '20px', borderBottom: '2px solid #3b82f6', paddingBottom: '10px' }}>Create New Reminder</h2>
          
          <div style={{ marginBottom: '25px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', opacity: 0.8 }}>Quick Presets Macros:</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => applyPreset('water')} style={{ flex: 1, padding: '10px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid #3b82f6', borderRadius: '6px', color: '#3b82f6', cursor: 'pointer', fontWeight: 'bold' }}>💧 Water Check</button>
              <button onClick={() => applyPreset('break')} style={{ flex: 1, padding: '10px', background: 'rgba(168, 85, 247, 0.1)', border: '1px solid #a855f7', borderRadius: '6px', color: '#a855f7', cursor: 'pointer', fontWeight: 'bold' }}>🧘 Posture Break</button>
            </div>
          </div>

          <form onSubmit={handleSaveTemplate}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>Notification Heading Banner Title:</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Complete LeetCode Contest Stack!" required style={{ width: '100%', padding: '12px', boxSizing: 'border-box', borderRadius: '6px', border: `1px solid ${darkMode ? '#2e3440' : '#cbd5e1'}`, background: darkMode ? '#0f111a' : '#fff', color: 'inherit', fontSize: '15px' }} />
            </div>

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>Notification Message Content Body:</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write what you want the system desktop alert drawer toast message card to display..." required rows="4" style={{ width: '100%', padding: '12px', boxSizing: 'border-box', borderRadius: '6px', border: `1px solid ${darkMode ? '#2e3440' : '#cbd5e1'}`, background: darkMode ? '#0f111a' : '#fff', color: 'inherit', fontSize: '14px', resize: 'vertical' }}></textarea>
            </div>

            <button type="submit" disabled={isSubmitting} style={{ width: '100%', padding: '14px', background: '#3b82f6', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '16px', fontWeight: 'bold', cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.7 : 1 }}>
              {isSubmitting ? 'Saving Template...' : '💾 Save Reminder Template'}
            </button>
          </form>
        </section>

        <section style={{ background: darkMode ? '#161925' : '#fff', padding: '30px', borderRadius: '12px', border: `1px solid ${darkMode ? '#1e2230' : '#e2e8f0'}`, display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ marginTop: 0, marginBottom: '20px', fontSize: '20px', borderBottom: '2px solid #10b981', paddingBottom: '10px' }}>Saved Reminders Collection ({notificationsList.length})</h2>
          
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '500px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {notificationsList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', opacity: 0.5 }}>No templates saved. Build your first tracking rule in the generator deck panel left.</div>
            ) : (
              notificationsList.map((item) => (
                <div key={item.id} style={{ background: darkMode ? '#1e2230' : '#f1f5f9', padding: '20px', borderRadius: '8px', borderLeft: '4px solid #10b981', display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative' }}>
                  <button onClick={() => handleDeleteTemplate(item.id)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: '#ef4444', fontSize: '16px', cursor: 'pointer' }}>✕</button>
                  
                  <div style={{ paddingRight: '25px' }}>
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>{item.title}</h4>
                    <p style={{ margin: '5px 0 0 0', fontSize: '13px', opacity: 0.8, lineHeight: '1.4' }}>{item.body}</p>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px', borderTop: `1px solid ${darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, paddingTop: '10px' }}>
                    <span style={{ fontSize: '11px', opacity: 0.5, fontWeight: 'bold' }}>🔥 Dispatched: {item.sentCount || 0} times</span>
                    
                    <button onClick={() => handleSendNotification(item.id, item.title, item.body)} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', minWidth: '110px' }}>
                      {actionFeedback[item.id] || 'Send Instant 🚀'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}