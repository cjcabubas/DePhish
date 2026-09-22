import mongoose from 'mongoose';
import MongoStore from 'connect-mongo';
import { readConfig } from './config/env.js';
import { User, userRepository } from './models/User.js';
import { createApp } from './app.js';
import { createScanRepository } from './models/ScanReport.js';
import { createIdentifierRepository } from './models/FlaggedIdentifier.js';
import { createConsentRepository } from './models/ScanConsent.js';
import { createReportRepository } from './models/CommunityReport.js';
import { createLearningProgressRepository } from './models/LearningProgress.js';
const config = readConfig();
let store;
let scans;
let identifiers;
let consents;
let reports;
let progress;
if (config.mongoUri && config.sessionSecret) {
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000, dbName: config.dbName });
    await User.init(); // Establish the unique email index before accepting signup.
    scans = createScanRepository(config.scanCollectionName);
    await scans.init();
    consents = createConsentRepository();
    await consents.init();
    reports = createReportRepository();
    await reports.init();
    identifiers = createIdentifierRepository();
    await identifiers.init();
    progress = createLearningProgressRepository();
    await progress.init();
    store = MongoStore.create({ clientPromise: Promise.resolve(mongoose.connection.getClient()), collectionName: 'sessions', ttl: 7 * 24 * 60 * 60 });
    store.on('error', () => console.error('Session storage error. Check database connectivity.'));
  } catch {
    console.error('Accounts unavailable: database setup failed. Check Atlas connection and access rules. Scanning requires consent storage to be available.');
    await mongoose.disconnect();
    store = undefined;
    scans = undefined;
    consents = undefined;
    identifiers = undefined;
    reports = undefined;
    progress = undefined;
  }
} else {
  console.log('Accounts are unconfigured. Set MONGODB_URI and SESSION_SECRET in server/.env, then restart.');
}
const app = createApp({ config, users: userRepository, store, scans, identifiers, consents, reports, progress, isReady: () => Boolean(store) && mongoose.connection.readyState === 1 });
const server = app.listen(config.port, config.host, () => console.log('Auth service listening on port ' + config.port));
async function shutdown() { server.close(async () => { await mongoose.disconnect(); process.exit(0); }); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
