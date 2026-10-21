// Daily report counter in Firestore: one document per UTC day, incremented in a
// transaction, so the cap holds across Cloud Run instances and restarts.

import { Firestore } from '@google-cloud/firestore';
import { utcDay } from './app.js';

export class FirestoreCounter {
  constructor(limit, { collection = 'daily_usage', db = new Firestore() } = {}) {
    this.limit = limit;
    this.collection = db.collection(collection);
    this.db = db;
  }

  async take() {
    const ref = this.collection.doc(utcDay(new Date()));
    return this.db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const used = snap.exists ? snap.get('count') : 0;
      if (used >= this.limit) return { ok: false, remaining: 0 };
      tx.set(ref, { count: used + 1, updated: new Date() }, { merge: true });
      return { ok: true, remaining: this.limit - used - 1 };
    });
  }

  async remaining() {
    const snap = await this.collection.doc(utcDay(new Date())).get();
    return Math.max(0, this.limit - (snap.exists ? snap.get('count') : 0));
  }
}
