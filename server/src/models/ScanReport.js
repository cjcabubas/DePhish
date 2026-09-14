import mongoose from 'mongoose';
export function createScanRepository(collectionName = 'scan_reports') {
  const schema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    title: { type: String, required: true, maxlength: 80 },
    result: { type: mongoose.Schema.Types.Mixed, required: true },
  }, { timestamps: true, bufferCommands: false });
  schema.index({ userId: 1, createdAt: -1 });
  const Scan = mongoose.models.ScanReport || mongoose.model('ScanReport', schema, collectionName);
  return {
    init: () => Scan.init(),
    create: fields => Scan.create(fields),
    list: (userId, limit) => Scan.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean(),
  };
}
