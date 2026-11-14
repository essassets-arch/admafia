import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

let mongoConnection = null;
let isConnected = false;
let initPromise = null;

const mongoStatus = {
  connected: false,
  engine: 'mongodb-7',
  database: process.env.MONGO_INITDB_DATABASE || 'admafia_marketing',
  host: 'unknown',
  port: 27017,
  lastError: null,
};

/**
 * Initializes connection to MongoDB for Marketing Posts, Artwork Revisions, and Telemetry.
 * Uses graceful connection timeout so offline local development does not crash the server.
 */
export async function initMongo() {
  if (isConnected) return mongoStatus;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/admafia_marketing';

    try {
      // Parse host & port for status reporting
      try {
        const parsed = new URL(mongoUri.replace('mongodb://', 'http://').replace('mongodb+srv://', 'http://'));
        mongoStatus.host = parsed.hostname;
        mongoStatus.port = Number(parsed.port || 27017);
        mongoStatus.database = parsed.pathname.replace(/^\//, '') || mongoStatus.database;
      } catch (parseErr) {
        mongoStatus.host = '127.0.0.1';
      }

      console.log(`[MongoDB] Connecting to ${mongoUri.replace(/:[^:]*@/, ':***@')}...`);

      mongoose.set('strictQuery', false);
      mongoConnection = await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 3000,
        connectTimeoutMS: 3000,
        maxPoolSize: 20,
      });

      isConnected = true;
      mongoStatus.connected = true;
      mongoStatus.lastError = null;

      console.log(`[MongoDB] Connected successfully to "${mongoStatus.database}" on ${mongoStatus.host}:${mongoStatus.port}`);

      mongoose.connection.on('error', (err) => {
        console.warn('[MongoDB] Connection error event:', err.message);
        mongoStatus.connected = false;
        mongoStatus.lastError = err.message;
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('[MongoDB] Disconnected from MongoDB server.');
        mongoStatus.connected = false;
        isConnected = false;
      });

      return mongoStatus;
    } catch (err) {
      isConnected = false;
      mongoStatus.connected = false;
      mongoStatus.lastError = err.message;
      console.warn(`[MongoDB] Standalone MongoDB server not reachable at ${mongoStatus.host}:${mongoStatus.port} (${err.message}).`);
      console.warn('[MongoDB] Running in graceful standalone mode. Core PostgreSQL CRM remains 100% active.');
      return mongoStatus;
    }
  })();

  return initPromise;
}

export function isMongoConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

export function getMongoStatus() {
  return {
    ...mongoStatus,
    readyState: mongoose.connection.readyState, // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  };
}

export default mongoose;
