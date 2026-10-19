import mongoose from "mongoose";
import {
  storeAnalysis,
  storeOwned,
  readOwned,
} from "../services/storageFormat.js";
export function createScanRepository(collectionName = "scan_reports") {
  const schema = new mongoose.Schema(
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
        ref: "User",
      },
      guestId: { type: String, default: null },
      submittedBy: {
        type: String,
        enum: ["user", "guest"],
      },
      originallySubmittedAsGuest: { type: Boolean, default: false },
      source: { type: String, enum: ["account", "guest"] },
      message: { type: String, maxlength: 5000 },
      tosAcknowledged: Boolean,
      consentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ScanConsent",
        default: null,
      },
      expiresAt: { type: Date, default: null },
      retentionVersion: String,
      title: { type: String, required: true, maxlength: 80 },
      result: { type: mongoose.Schema.Types.Mixed, required: true },
    },
    { timestamps: true, bufferCommands: false },
  );
  schema.index({ userId: 1, createdAt: -1 });
  schema.index({ guestId: 1, userId: 1 });
  schema.index({ createdAt: -1 });
  schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  const Scan =
    mongoose.models.ScanReport ||
    mongoose.model("ScanReport", schema, collectionName);
  return {
    init: () => Scan.init(),
    create: async (fields, session) => {
      const stored = {
        ...storeOwned(fields),
        result: storeAnalysis(fields.result),
      };
      return readOwned(
        session
          ? (await Scan.create([stored], { session }))[0]
          : await Scan.create(stored),
        "result",
      );
    },
    claimGuest: (guestId, userId, session) =>
      Scan.updateMany(
        { guestId, userId: null },
        {
          $set: {
            userId,
            originallySubmittedAsGuest: true,
          },
          $unset: { submittedBy: 1, source: 1 },
        },
        { session },
      ),
    findOwned: async (id, userId) =>
      readOwned(
        await Scan.findOne({
          _id: id,
          userId,
          $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        }).lean(),
        "result",
      ),
    list: async (userId, limit) =>
      (
        await Scan.find({
          userId,
          $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean()
      ).map((row) => readOwned(row, "result")),
    async stats(userId, since, end = new Date()) {
      const match = userId
        ? { userId: new mongoose.Types.ObjectId(userId) }
        : {
            $or: [
              { userId: { $type: "objectId" } },
              { guestId: { $type: "string" } },
              { source: "guest" },
              { originallySubmittedAsGuest: true },
            ],
          };
      const countWhere = (prediction) => ({
        $sum: {
          $cond: [
            {
              $eq: [
                {
                  $ifNull: [
                    "$result.prediction",
                    "$result.assessment.classification",
                  ],
                },
                prediction,
              ],
            },
            1,
            0,
          ],
        },
      });
      const [data] = await Scan.aggregate([
        {
          $match: {
            $and: [
              match,
              {
                $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
              },
            ],
          },
        },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  phishing: countWhere("Phishing"),
                  suspicious: countWhere("Suspicious"),
                  legitimate: countWhere("Legitimate"),
                },
              },
            ],
            accounts: [
              { $match: { userId: { $type: "objectId" } } },
              { $group: { _id: "$userId" } },
              { $count: "count" },
            ],
            activity: [
              {
                $match: {
                  createdAt: { ...(since ? { $gte: since } : {}), $lte: end },
                },
              },
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: "%Y-%m-%d",
                      date: "$createdAt",
                      timezone: "UTC",
                    },
                  },
                  total: { $sum: 1 },
                  phishing: countWhere("Phishing"),
                  suspicious: countWhere("Suspicious"),
                  legitimate: countWhere("Legitimate"),
                },
              },
              { $sort: { _id: 1 } },
            ],
            indicators: [
              {
                $project: {
                  categories: {
                    $setUnion: [
                      {
                        $map: {
                          input: {
                            $cond: [
                              {
                                $isArray: {
                                  $ifNull: [
                                    "$result.detected_indicators",
                                    "$result.indicatorAnalysis.indicators",
                                  ],
                                },
                              },
                              {
                                $ifNull: [
                                  "$result.detected_indicators",
                                  "$result.indicatorAnalysis.indicators",
                                ],
                              },
                              [],
                            ],
                          },
                          as: "indicator",
                          in: "$$indicator.category",
                        },
                      },
                      [],
                    ],
                  },
                },
              },
              { $unwind: "$categories" },
              { $match: { categories: { $type: "string", $ne: "" } } },
              { $group: { _id: "$categories", count: { $sum: 1 } } },
              { $sort: { count: -1, _id: 1 } },
              { $limit: 5 },
            ],
          },
        },
      ]).option({ maxTimeMS: 10000 });
      const totals = data?.totals[0] || {
        total: 0,
        phishing: 0,
        suspicious: 0,
        legitimate: 0,
      };
      return {
        total: totals.total,
        phishing: totals.phishing,
        suspicious: totals.suspicious,
        legitimate: totals.legitimate,
        unclassified:
          totals.total -
          totals.phishing -
          totals.suspicious -
          totals.legitimate,
        active_accounts: data?.accounts[0]?.count || 0,
        activity: (data?.activity || []).map((row) => ({
          date: row._id,
          total: row.total,
          phishing: row.phishing,
          suspicious: row.suspicious,
          legitimate: row.legitimate,
        })),
        indicators: (data?.indicators || []).map((row) => ({
          category: row._id,
          count: row.count,
        })),
      };
    },
  };
}
