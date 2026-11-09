// Runs once each time GitHub's scheduler wakes it up (about every 5 minutes).
const admin = require('firebase-admin');
const webpush = require('web-push');
const { tick } = require('./core');

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC.trim(), process.env.VAPID_PRIVATE.replace(/[\s"'=]/g, ''));

tick({
  db: admin.firestore(),
  send: (sub, payload) => webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600, urgency: 'high' }),
  fetchText: u => fetch(u, { cache: 'no-store' }).then(r => r.text()),
  now: Date.now(),
  appUrl: process.env.APP_URL,
  tzOffset: process.env.APP_TZ || '+05:30'
}).then(() => { console.log('Checked at', new Date().toISOString()); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
