import mongoose from 'mongoose';
import MongoStore from 'connect-mongo';
import { readConfig } from './config/env.js';
import { User, userRepository } from './models/User.js';
import { createApp } from './app.js';
const config = readConfig();
let store;
if (config.mongoUri && config.sessionSecret) {
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000, dbName: config.dbName });
    await User.init(); // Establish the unique email index before accepting signup.
    store = MongoStore.create({ clientPromise: Promise.resolve(mongoose.connection.getClient()), collectionName: 'sessions', ttl: 7 * 24 * 60 * 60 });
    store.on('error', () => console.error('Session storage error. Check database connectivity.'));
  } catch {
    console.error('Accounts unavailable: database setup failed. Check Atlas connection and access rules. Scanning remains available.');
    await mongoose.disconnect();
    store = undefined;
  }
} else {
  console.log('Accounts are unconfigured. Set MONGODB_URI and SESSION_SECRET in server/.env, then restart.');
}
const app = createApp({ config, users: userRepository, store, isReady: () => Boolean(store) && mongoose.connection.readyState === 1 });
const server = app.listen(config.port, config.host, () => console.log('Auth service listening on port ' + config.port));
async function shutdown() { server.close(async () => { await mongoose.disconnect(); process.exit(0); }); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
