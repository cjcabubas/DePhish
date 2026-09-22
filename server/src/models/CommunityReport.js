import mongoose from 'mongoose';

export function createReportRepository(collectionName = 'reports', indicatorCollection = 'threat_indicators') {
  const candidateSchema = new mongoose.Schema({
    id: { type: String, required: true }, kind: { type: String, enum: ['url', 'domain', 'email', 'phone'], required: true },
    value: { type: String, required: true }, source: String,
  }, { _id: false });
  const schema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    sourceScanId: { type: mongoose.Schema.Types.ObjectId, default: null },
    consentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    content: { message: String, suspiciousUrl: String, senderEmail: String, phone: String, details: String },
    analysis: { type: mongoose.Schema.Types.Mixed, required: true },
    candidates: [candidateSchema],
    status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending', required: true },
    revision: { type: Number, default: 0 },
    approvedIndicatorIds: [String], reviewNote: String,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, default: null }, reviewedAt: Date,
    reviewLog: [{ _id: false, status: String, note: String, emailReviewed: Boolean,
      indicatorIds: [String], reviewer: mongoose.Schema.Types.ObjectId, at: Date }],
    expiresAt: { type: Date, required: true },
  }, { timestamps: true, bufferCommands: false });
  schema.index({ status: 1, createdAt: -1 });
  schema.index({ userId: 1, createdAt: -1 });
  schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  const threatSchema = new mongoose.Schema({
    reportId: { type: mongoose.Schema.Types.ObjectId, required: true },
    key: { type: String, required: true }, kind: { type: String, enum: ['url', 'domain', 'email', 'phone'], required: true },
    value: { type: String, required: true }, verifiedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    expiresAt: { type: Date, required: true },
  }, { timestamps: true, bufferCommands: false });
  threatSchema.index({ reportId: 1, key: 1 }, { unique: true });
  threatSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  const Report = mongoose.models.CommunityReport || mongoose.model('CommunityReport', schema, collectionName);
  const Threat = mongoose.models.VerifiedThreatIndicator || mongoose.model('VerifiedThreatIndicator', threatSchema, indicatorCollection);
  const live = () => ({ expiresAt: { $gt: new Date() } });
  return {
    init: async () => { await Report.init(); await Threat.init(); },
    create: fields => Report.create(fields),
    find: id => Report.findOne({ _id: id, ...live() }).lean(),
    async list({ userId, status, page = 1 }) {
      const scope = { ...live(), ...(userId ? { userId } : {}) };
      const filter = { ...scope, ...(status ? { status } : {}) };
      const [reports, total, counts] = await Promise.all([
        Report.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 20).limit(20).lean(),
        Report.countDocuments(filter),
        Promise.all(['pending', 'verified', 'rejected'].map(status => Report.countDocuments({ ...scope, status }))),
      ]);
      return { reports, total, page, counts: { pending: counts[0], verified: counts[1], rejected: counts[2] } };
    },
    async review(id, revision, decision, reviewer) {
      // The status change and indicator publication/retraction succeed together.
      // No nontransactional fallback: a failed transaction leaves the previous decision intact.
      return mongoose.connection.transaction(async session => {
        const report = await Report.findOneAndUpdate({ _id: id, revision, ...live() }, {
          $set: { status: decision.status, approvedIndicatorIds: decision.indicators.map(item => item.id),
            reviewNote: decision.note, reviewedBy: reviewer, reviewedAt: new Date() }, $inc: { revision: 1 },
          $push: { reviewLog: { $each: [{ status: decision.status, note: decision.note, emailReviewed: decision.emailReviewed,
            indicatorIds: decision.indicators.map(item => item.id), reviewer, at: new Date() }], $slice: -50 } },
        }, { new: true, runValidators: true, session }).lean();
        if (!report) return null;
        await Threat.deleteMany({ reportId: id }, { session });
        if (decision.status === 'verified' && decision.indicators.length) {
          await Threat.insertMany(decision.indicators.map(item => ({ reportId: id, key: item.id, kind: item.kind,
            value: item.value, verifiedBy: reviewer, expiresAt: report.expiresAt })), { session });
        }
        return report;
      });
    },
    async threats(page = 1) {
      const pipeline = [
        { $match: live() },
        { $lookup: { from: collectionName, localField: 'reportId', foreignField: '_id', as: 'report' } },
        { $unwind: '$report' },
        { $match: { 'report.status': 'verified', 'report.expiresAt': { $gt: new Date() } } },
        { $group: { _id: { kind: '$kind', value: '$value' }, reportIds: { $addToSet: '$reportId' }, verifiedAt: { $max: '$updatedAt' } } },
        { $sort: { verifiedAt: -1, '_id.kind': 1, '_id.value': 1 } },
        { $facet: { items: [{ $skip: (page - 1) * 20 }, { $limit: 20 }], count: [{ $count: 'total' }] } },
      ];
      const [result] = await Threat.aggregate(pipeline).option({ maxTimeMS: 10000 });
      return { indicators: result.items.map(item => ({ ...item._id, reportIds: item.reportIds, verifiedAt: item.verifiedAt })),
        total: result.count[0]?.total || 0, page };
    },
  };
}
