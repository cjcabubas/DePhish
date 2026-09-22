import mongoose from 'mongoose';
export function createScanRepository(collectionName = 'scan_reports') {
  const schema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: 'User' },
    source: { type: String, enum: ['account', 'guest'], default: 'account' },
    message: { type: String, maxlength: 5000 },
    tosAcknowledged: { type: Boolean, default: false },
    consentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScanConsent', default: null },
    expiresAt: { type: Date, default: null },
    retentionVersion: String,
    title: { type: String, required: true, maxlength: 80 },
    result: { type: mongoose.Schema.Types.Mixed, required: true },
  }, { timestamps: true, bufferCommands: false });
  schema.index({ userId: 1, createdAt: -1 });
  schema.index({ createdAt: -1 });
  schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  const Scan = mongoose.models.ScanReport || mongoose.model('ScanReport', schema, collectionName);
  return {
    init: () => Scan.init(),
    create: fields => Scan.create(fields),
    findOwned: (id, userId) => Scan.findOne({ _id: id, userId, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }).lean(),
    list: (userId, limit) => Scan.find({ userId, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }).sort({ createdAt: -1 }).limit(limit).lean(),
    async stats(userId, since) {
      const match = userId ? { userId: new mongoose.Types.ObjectId(userId) } : { $or: [{ userId: { $type: 'objectId' } }, { source: 'guest' }] };
      const countWhere = prediction => ({ $sum: { $cond: [{ $eq: ['$result.prediction', prediction] }, 1, 0] } });
      const [data] = await Scan.aggregate([
        { $match: { $and: [match, { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }] } },
        { $facet: {
          totals: [{ $group: { _id: null, total: { $sum: 1 }, phishing: countWhere('Phishing'), suspicious: countWhere('Suspicious'), legitimate: countWhere('Legitimate') } }],
          accounts: [{ $match: { userId: { $type: 'objectId' } } }, { $group: { _id: '$userId' } }, { $count: 'count' }],
          activity: [{ $match: { createdAt: { $gte: since } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } }, total: { $sum: 1 }, phishing: countWhere('Phishing'), suspicious: countWhere('Suspicious'), legitimate: countWhere('Legitimate') } }, { $sort: { _id: 1 } }],
          indicators: [{ $project: { categories: { $setUnion: [{ $map: { input: { $cond: [{ $isArray: '$result.detected_indicators' }, '$result.detected_indicators', []] }, as: 'indicator', in: '$$indicator.category' } }, []] } } }, { $unwind: '$categories' }, { $match: { categories: { $type: 'string', $ne: '' } } }, { $group: { _id: '$categories', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 5 }],
        } },
      ]).option({ maxTimeMS: 10000 });
      const totals = data?.totals[0] || { total: 0, phishing: 0, suspicious: 0, legitimate: 0 };
      return { total: totals.total, phishing: totals.phishing, suspicious: totals.suspicious, legitimate: totals.legitimate,
        unclassified: totals.total - totals.phishing - totals.suspicious - totals.legitimate,
        active_accounts: data?.accounts[0]?.count || 0,
        activity: (data?.activity || []).map(row => ({ date: row._id, total: row.total, phishing: row.phishing, suspicious: row.suspicious, legitimate: row.legitimate })),
        indicators: (data?.indicators || []).map(row => ({ category: row._id, count: row.count })) };
    },
  };
}
