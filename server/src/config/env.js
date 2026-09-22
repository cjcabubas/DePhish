import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
// Always load server/.env, even when started from the repository root.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
export function readConfig(env = process.env) {
  const config = {
    mlApiUrl: env.ML_API_URL || 'http://127.0.0.1:8000',
    dbName: env.DB_NAME || undefined,
    scanCollectionName: env.COLLECTION_NAME || 'scan_reports',
    port: Number(env.PORT || 5000), host: env.HOST || '127.0.0.1',
    production: env.NODE_ENV === 'production', mongoUri: env.MONGODB_URI || '',
    sessionSecret: env.SESSION_SECRET || '', trustProxy: env.TRUST_PROXY === '1',
    origins: (env.CLIENT_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(s => s.trim()).filter(Boolean),
  };
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('PORT must be a valid port.');
  if (['reports', 'threat_indicators'].includes(config.scanCollectionName)) throw new Error('COLLECTION_NAME must keep scan history separate from reports and threat_indicators.');
  if (config.sessionSecret && config.sessionSecret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.');
  if (config.mongoUri && !/^mongodb(?:\+srv)?:\/\//.test(config.mongoUri)) throw new Error('MONGODB_URI must be a MongoDB connection string.');
  if (config.origins.some(origin => { try { return new URL(origin).origin !== origin; } catch { return true; } })) throw new Error('CLIENT_ORIGINS must contain exact origins.');
  if (config.production && config.origins.some(origin => !origin.startsWith('https://'))) throw new Error('Production CLIENT_ORIGINS must use HTTPS.');
  return config;
}
