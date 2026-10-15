import mongoose from 'mongoose';

export const ownershipFields = (user, guestId = null) => ({
  userId: user ? String(user._id) : null,
  guestId: user ? null : guestId,
  submittedBy: user ? 'user' : 'guest',
  originallySubmittedAsGuest: !user,
});

// The guest row serializes claiming with slow/in-flight guest submissions. A
// claim and both history updates commit together, or none of them commit.
export function createOwnershipService(scans, reports, collection = 'guest_identities') {
  const schema = new mongoose.Schema({
    _id: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revision: { type: Number, default: 0 },
    claimedAt: Date,
  }, { timestamps: true, bufferCommands: false });
  const Guest = mongoose.models.GuestIdentity || mongoose.model('GuestIdentity', schema, collection);
  async function ensure(guestId) {
    try { await Guest.updateOne({ _id: guestId }, { $setOnInsert: { userId: null } }, { upsert: true }); }
    catch (error) { if (error.code !== 11000) throw error; }
  }
  return {
    init: () => Guest.init(),
    async create(repository, fields) {
      if (fields.userId) return repository.create(fields);
      if (!fields.guestId) throw new Error('Guest ownership is required.');
      await ensure(fields.guestId);
      return mongoose.connection.transaction(async session => {
        const guest = await Guest.findOneAndUpdate({ _id: fields.guestId }, { $inc: { revision: 1 } }, { new: true, session });
        const ownership = guest.userId ? { userId: guest.userId, submittedBy: 'user',
          originallySubmittedAsGuest: true, ...('source' in fields ? { source: 'account' } : {}) } : {};
        return repository.create({ ...fields, ...ownership }, session);
      });
    },
    async claim(guestId, userId) {
      if (!guestId) return;
      await ensure(guestId);
      return mongoose.connection.transaction(async session => {
        const guest = await Guest.findOneAndUpdate({ _id: guestId, $or: [{ userId: null }, { userId }] },
          { $set: { userId, claimedAt: new Date() }, $inc: { revision: 1 } }, { new: true, session });
        // A previously claimed cookie never transfers ownership to another account.
        if (!guest) return;
        await scans.claimGuest(guestId, userId, session);
        await reports.claimGuest(guestId, userId, session);
      });
    },
  };
}

export const createOwned = (ownership, repository, fields) => ownership
  ? ownership.create(repository, fields) : repository.create(fields);
