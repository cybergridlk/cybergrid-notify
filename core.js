// The brain of the notification server. Runs once a minute (see index.js).
async function tick({ db, send, fetchText, now, appUrl, tzOffset }) {
  // 1. phones/computers that asked for notifications
  const subsSnap = await db.collection('subs').get();
  const byUid = {};
  subsSnap.docs.forEach(d => {
    const x = d.data();
    (byUid[x.uid] = byUid[x.uid] || []).push({ ref: d.ref, sub: x.sub, dev: x.dev });
  });
  const push = async (uid, payload, skipDev) => {
    for (const s of byUid[uid] || []) {
      if (skipDev && s.dev === skipDev) continue;
      try { await send(s.sub, payload); }
      catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await s.ref.delete(); // device no longer exists
        else console.error('push failed', e.statusCode || e.message);
      }
    }
  };

  // 2. note reminders that are due
  for (const uid of Object.keys(byUid)) {
    const q = await db.collection('users').doc(uid).collection('n')
      .where('rm', '==', true).where('fd', '==', false).get();
    for (const d of q.docs) {
      const n = d.data();
      const at = n.atMs || Date.parse(n.at + tzOffset);
      if (!at || at > now) continue;
      await push(uid, { title: 'Reminder', body: String(n.t || '').slice(0, 140), tag: 'rem-' + d.id });
      await d.ref.update({ fd: true });
    }
  }

  // 3. low-stock alerts written by the app when a sale happens
  const al = await db.collectionGroup('a').get();
  for (const d of al.docs) {
    const x = d.data();
    await push(d.ref.parent.parent.id, { title: x.t, body: x.b, tag: x.tag || 'stock' }, x.dev);
    await d.ref.delete();
  }

  // 4. a new version of the app was published
  try {
    const m = /APP_VER='([^']+)'/.exec(await fetchText(appUrl + '/version.js'));
    if (m) {
      const ref = db.doc('meta/appVersion'), cur = await ref.get(), last = cur.exists ? cur.data().v : null;
      if (last && last !== m[1])
        for (const uid of Object.keys(byUid))
          await push(uid, { title: 'New version ' + m[1] + ' is ready', body: 'Open the app and tap Update now.', tag: 'upd' });
      if (last !== m[1]) await ref.set({ v: m[1] });
    }
  } catch (e) { console.error('version check', e.message); }
}
module.exports = { tick };
