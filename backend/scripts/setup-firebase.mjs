#!/usr/bin/env node
/**
 * From-Scratch Firebase Cloud Messaging (FCM) Provisioner & Validator for AdMafia CRM
 *
 * Usage Options:
 *   1. Import a downloaded Firebase Service Account JSON + Web App Config into `backend/.env.local`:
 *      node backend/scripts/setup-firebase.mjs --service-account ./serviceAccountKey.json --api-key AIza... --sender-id 123... --app-id 1:123:web:... --vapid-key BEl6...
 *
 *   2. Interactive / CLI Guided From-Scratch Provisioning via Google `firebase-tools`:
 *      npx firebase-tools login
 *      node backend/scripts/setup-firebase.mjs --create-project admafia-crm-prod
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_LOCAL_PATH = path.join(__dirname, '..', '.env.local');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[key] = next;
    }
  }
  return out;
}

function upsertEnvKeys(filePath, updates) {
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  for (const [key, val] of Object.entries(updates)) {
    if (val === undefined || val === null) continue;
    const escapedVal = String(val).replace(/\r?\n/g, '\\n');
    const lineRegex = new RegExp(`^${key}=.*$`, 'm');
    if (lineRegex.test(content)) {
      content = content.replace(lineRegex, `${key}=${escapedVal}`);
    } else {
      content += `\n${key}=${escapedVal}`;
    }
  }
  fs.writeFileSync(filePath, content.trim() + '\n', 'utf8');
}

async function main() {
  const args = parseArgs(process.argv);
  console.log('=== AdMafia Firebase Cloud Messaging (FCM) Setup Utility ===\n');

  if (args['create-project']) {
    const projectId = args['create-project'];
    console.log(`[1/3] Creating Firebase project "${projectId}" via firebase-tools...`);
    try {
      execSync(`npx --yes firebase-tools projects:create ${projectId} --display-name "AdMafia CRM"`, {
        stdio: 'inherit',
      });
      console.log(`[2/3] Creating Firebase Web App "AdMafia Web Portal"...`);
      execSync(`npx --yes firebase-tools apps:create WEB "AdMafia Web Portal" --project ${projectId}`, {
        stdio: 'inherit',
      });
      console.log(`[3/3] Fetching Web SDK configuration...`);
      const sdkRaw = execSync(`npx --yes firebase-tools apps:sdkconfig WEB --project ${projectId}`, {
        encoding: 'utf8',
      });
      const jsonMatch = sdkRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const sdk = JSON.parse(jsonMatch[0]);
        upsertEnvKeys(ENV_LOCAL_PATH, {
          FIREBASE_PROJECT_ID: sdk.projectId,
          FIREBASE_WEB_API_KEY: sdk.apiKey,
          FIREBASE_MESSAGING_SENDER_ID: sdk.messagingSenderId,
          FIREBASE_APP_ID: sdk.appId,
        });
        console.log(`\n✓ Wrote Web App keys to ${ENV_LOCAL_PATH}`);
      }
      console.log(
        `\nFinal Step for Server Push Signing:\n` +
        `1. Open https://console.firebase.google.com/project/${projectId}/settings/serviceaccounts/adminsdk\n` +
        `2. Click "Generate new private key" to download the JSON file.\n` +
        `3. Open https://console.firebase.google.com/project/${projectId}/settings/cloudmessaging -> Web Push certificates -> Generate key pair (VAPID).\n` +
        `4. Run:\n   node backend/scripts/setup-firebase.mjs --service-account <path-to-json> --vapid-key <VAPID_KEY>\n`
      );
      return;
    } catch (err) {
      console.error('\n[!] Firebase CLI requires a one-time Google sign-in first. Run:');
      console.error('    npx firebase-tools login');
      process.exit(1);
    }
  }

  if (args['service-account']) {
    const saPath = path.resolve(process.cwd(), args['service-account']);
    if (!fs.existsSync(saPath)) {
      console.error(`Service account JSON file not found at: ${saPath}`);
      process.exit(1);
    }
    const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
    if (!sa.project_id || !sa.client_email || !sa.private_key) {
      console.error('Invalid Firebase service account JSON: missing project_id, client_email, or private_key.');
      process.exit(1);
    }

    upsertEnvKeys(ENV_LOCAL_PATH, {
      FIREBASE_PROJECT_ID: sa.project_id,
      FIREBASE_CLIENT_EMAIL: sa.client_email,
      FIREBASE_PRIVATE_KEY: sa.private_key,
      ...(args['api-key'] ? { FIREBASE_WEB_API_KEY: args['api-key'] } : {}),
      ...(args['sender-id'] ? { FIREBASE_MESSAGING_SENDER_ID: args['sender-id'] } : {}),
      ...(args['app-id'] ? { FIREBASE_APP_ID: args['app-id'] } : {}),
      ...(args['vapid-key'] ? { FIREBASE_VAPID_KEY: args['vapid-key'] } : {}),
    });

    console.log(`✓ Successfully configured Firebase Admin & FCM credentials in ${ENV_LOCAL_PATH}`);
    console.log(`  Project ID   : ${sa.project_id}`);
    console.log(`  Client Email : ${sa.client_email}`);
    console.log(`  Restart backend container to activate Google FCM Web Push: docker restart admafia-backend-local`);
    return;
  }

  console.log('Available commands:');
  console.log('  1) Provision a brand-new Google Firebase project from scratch:');
  console.log('     npx firebase-tools login');
  console.log('     node backend/scripts/setup-firebase.mjs --create-project admafia-crm-live\n');
  console.log('  2) Import Firebase Service Account JSON + Web Push keys into git-ignored backend/.env.local:');
  console.log('     node backend/scripts/setup-firebase.mjs --service-account ./firebase-key.json --api-key <KEY> --sender-id <ID> --app-id <APP_ID> --vapid-key <VAPID>');
}

main();

