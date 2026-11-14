import mongoose from 'mongoose';
import path from 'path';
import net from 'net';
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
  database: process.env.MONGO_INITDB_DATABASE || 'admafia_crm',
  host: 'unknown',
  port: 27017,
  lastError: null,
};

/**
 * Probes whether a TCP port is open before attempting Mongoose connection.
 * Prevents unhandled socket ECONNREFUSED error toasts in IDE during offline local development.
 */
function probePort(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let reachable = false;

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      reachable = true;
      socket.destroy();
      resolve(true);
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    try {
      socket.connect(port, host);
    } catch (e) {
      resolve(false);
    }
  });
}

/**
 * Initializes connection to MongoDB for Marketing Posts, Artwork Revisions, and Telemetry.
 * Uses graceful connection timeout and pre-flight port probing so offline local development does not crash or throw unhandled socket errors.
 */
export async function initMongo() {
  if (isConnected) return mongoStatus;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    let mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/admafia_crm';
    if (!mongoUri.includes('directConnection=')) {
      mongoUri += (mongoUri.includes('?') ? '&' : '?') + 'directConnection=true';
    }

    try {
      // Parse host & port for status reporting
      try {
        const parsed = new URL(mongoUri.replace('mongodb://', 'http://').replace('mongodb+srv://', 'http://'));
        mongoStatus.host = parsed.hostname;
        mongoStatus.port = Number(parsed.port || 27017);
        mongoStatus.database = parsed.pathname.replace(/^\//, '').split('?')[0] || mongoStatus.database;
      } catch (parseErr) {
        mongoStatus.host = '127.0.0.1';
      }

      // Pre-flight check: Is the MongoDB server actually listening?
      const isListening = await probePort(mongoStatus.host, mongoStatus.port, 1500);
      if (!isListening) {
        isConnected = false;
        mongoStatus.connected = false;
        mongoStatus.lastError = `Port ${mongoStatus.port} closed (MongoDB daemon not running locally)`;
        console.log(`[MongoDB] Notice: Standalone MongoDB server is not running on ${mongoStatus.host}:${mongoStatus.port}.`);
        console.log('[MongoDB] Running in graceful offline mode. Core PostgreSQL CRM remains 100% active.');
        return mongoStatus;
      }

      console.log(`[MongoDB] Connecting to ${mongoUri.replace(/:[^:]*@/, ':***@')}...`);

      mongoose.set('strictQuery', false);
      mongoConnection = await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        maxPoolSize: 20,
        directConnection: true,
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
