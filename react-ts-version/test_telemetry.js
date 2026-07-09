import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getDatabase, ref, get } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyDupqh8inn1tZ1p-KIzV3RIMst7IdpUYPw",
  authDomain: "mathimaticore.firebaseapp.com",
  databaseURL: "https://mathimaticore-default-rtdb.firebaseio.com",
  projectId: "mathimaticore",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

signInWithEmailAndPassword(auth, 'teacher_039604483@mathmaticore.local', '290984039604483')
  .then(() => {
    return get(ref(database, 'users/students/student_user1/telemetry_sessions'));
  })
  .then((snap) => {
    const data = snap.val();
    if(!data) { console.log('No sessions found'); process.exit(0); }
    const sessionIds = Object.keys(data).sort();
    const latest = sessionIds[sessionIds.length-1];
    console.log('Latest Session:', latest);
    const sessionData = data[latest];
    const keys = Object.keys(sessionData).sort();
    let events = [];
    keys.forEach(k => {
      let chunk = sessionData[k];
      if(typeof chunk === 'string') {
        try { chunk = JSON.parse(chunk); } catch(e) {}
      }
      if(Array.isArray(chunk)) events = events.concat(chunk);
      else if(typeof chunk === 'object') events = events.concat(Object.values(chunk));
    });
    console.log('Total events:', events.length);
    console.log('First event type:', events[0]?.type);
    console.log('Second event type:', events[1]?.type);
    console.log('Has Meta:', !!events.find(e => e.type === 4));
    console.log('Has FullSnapshot:', !!events.find(e => e.type === 2));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
