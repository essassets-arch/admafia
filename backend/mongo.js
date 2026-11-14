import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import net from 'net';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

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

function probePort(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
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
    } catch {
      resolve(false);
    }
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveAuthoritativeMongoUri() {
  const inDocker = fs.existsSync('/.dockerenv');
  let raw = (process.env.MONGO_URI || '').trim();

  // Guard against legacy .env.example placeholder credentials or host-localhost inside Docker
  if (!raw || raw.includes('your_secure_mongo_password') || raw.includes('admafia_mongo:')) {
    raw = inDocker
      ? 'mongodb://mongo:27017/admafia_crm?directConnection=true'
      : 'mongodb://127.0.0.1:27017/admafia_crm?directConnection=true';
  } else if (inDocker && (raw.includes('//localhost:') || raw.includes('//127.0.0.1:'))) {
    raw = raw.replace('//localhost:', '//mongo:').replace('//127.0.0.1:', '//mongo:');
  }

  if (!raw.includes('directConnection=')) {
    raw += (raw.includes('?') ? '&' : '?') + 'directConnection=true';
  }
  return raw;
}

/**
 * Initializes authoritative connection to MongoDB 7.0 Replica Set (`rs0`) for AdMafia CRM.
 */
export async function initMongo() {
  if (isConnected && mongoose.connection.readyState === 1) return mongoStatus;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const inDocker = fs.existsSync('/.dockerenv');
    const maxAttempts = inDocker || process.env.NODE_ENV === 'production' ? 12 : 3;
    const mongoUri = resolveAuthoritativeMongoUri();

    try {
      const parsed = new URL(mongoUri.replace('mongodb://', 'http://').replace('mongodb+srv://', 'http://'));
      mongoStatus.host = parsed.hostname;
      mongoStatus.port = Number(parsed.port || 27017);
      mongoStatus.database = parsed.pathname.replace(/^\//, '').split('?')[0] || mongoStatus.database;
    } catch {
      mongoStatus.host = inDocker ? 'mongo' : '127.0.0.1';
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const isListening = await probePort(mongoStatus.host, mongoStatus.port, 1500);
        if (!isListening) {
          throw new Error(`Port ${mongoStatus.port} not yet accepting connections on ${mongoStatus.host}`);
        }

        if (attempt === 1) {
          console.log(`[MongoDB] Connecting to ${mongoUri.replace(/:[^:]*@/, ':***@')}...`);
        }

        mongoose.set('strictQuery', false);
        await mongoose.connect(mongoUri, {
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 5000,
          maxPoolSize: 25,
          directConnection: true,
        });

        isConnected = true;
        mongoStatus.connected = true;
        mongoStatus.lastError = null;

        console.log(
          `[MongoDB] Authoritative CRM database connected: "${mongoStatus.database}" on ${mongoStatus.host}:${mongoStatus.port}`
        );

        mongoose.connection.removeAllListeners('error');
        mongoose.connection.removeAllListeners('disconnected');

        mongoose.connection.on('error', (err) => {
          console.warn('[MongoDB] Connection error event:', err.message);
          mongoStatus.connected = false;
          mongoStatus.lastError = err.message;
        });

        mongoose.connection.on('disconnected', () => {
          console.warn('[MongoDB] Disconnected from MongoDB server.');
          mongoStatus.connected = false;
          isConnected = false;
          initPromise = null;
        });

        return mongoStatus;
      } catch (err) {
        isConnected = false;
        mongoStatus.connected = false;
        mongoStatus.lastError = err.message;

        if (attempt < maxAttempts) {
          console.warn(
            `[MongoDB] Connection attempt ${attempt}/${maxAttempts} waiting for ${mongoStatus.host}:${mongoStatus.port} (${err.message})...`
          );
          await sleep(1500);
        } else {
          console.error(
            `[MongoDB] Failed to reach MongoDB at ${mongoStatus.host}:${mongoStatus.port} after ${maxAttempts} attempts: ${err.message}`
          );
          initPromise = null;
          return mongoStatus;
        }
      }
    }

    initPromise = null;
    return mongoStatus;
  })();

  return initPromise;
}

export function isMongoConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

export function getMongoStatus() {
  return {
    ...mongoStatus,
    connected: isConnected && mongoose.connection.readyState === 1,
    readyState: mongoose.connection.readyState,
  };
}

export default mongoose;
