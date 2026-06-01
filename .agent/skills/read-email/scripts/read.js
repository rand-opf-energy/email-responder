const { execSync } = require('child_process');
const https = require('https');

// Target Apps Script Web App URL - Replace with your deployed Web App URL or set the APPS_SCRIPT_WEB_APP_URL environment variable!
const WEB_APP_URL = process.env.APPS_SCRIPT_WEB_APP_URL || 'YOUR_DEPLOYED_WEB_APP_URL_PLACEHOLDER';

// Parse command line arguments
const args = process.argv.slice(2);
let query = 'is:unread';
let limit = 5;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--query' && args[i + 1]) {
    query = args[i + 1];
    i++;
  } else if (args[i] === '--limit' && args[i + 1]) {
    limit = parseInt(args[i + 1], 10);
    i++;
  }
}

// Helper to fetch the secret locally from GCP Secret Manager
function fetchSecretFromGCP() {
  try {
    const cmd = 'gcloud secrets versions access latest --secret="EMAIL_RESPONDER_DEBUG_SECRET" --project="opf-insight"';
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch (error) {
    console.error('❌ Error fetching secret from GCP Secret Manager.');
    console.error('👉 Make sure you have the correct active gcloud session and project permissions for "opf-insight".');
    process.exit(1);
  }
}

// Helper to make HTTPS requests with redirect support (Apps Script web apps redirect to GGC servers!)
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const get = (targetUrl) => {
      https.get(targetUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow redirect
          return get(res.headers.location);
        }
        
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON response: ${data.slice(0, 100)}`));
          }
        });
      }).on('error', reject);
    };
    get(url);
  });
}

async function main() {
  if (WEB_APP_URL === 'YOUR_DEPLOYED_WEB_APP_URL_PLACEHOLDER') {
    console.error('❌ Error: Web App URL is not configured.');
    console.error('👉 Please deploy your Google Apps Script as a Web App, then set the APPS_SCRIPT_WEB_APP_URL environment variable or update the placeholder in this script.');
    process.exit(1);
  }

  console.log('🔐 Fetching debug secret from GCP Secret Manager...');
  const secret = fetchSecretFromGCP();
  
  console.log(`🔍 Querying email responder Web App (query: "${query}", limit: ${limit})...`);
  const apiUrl = `${WEB_APP_URL}?secret=${encodeURIComponent(secret)}&query=${encodeURIComponent(query)}&limit=${limit}`;
  
  try {
    const response = await fetchJson(apiUrl);
    
    if (response.error) {
      console.error(`❌ API Error: ${response.error}`);
      process.exit(1);
    }
    
    const threads = response.threads || [];
    console.log(`Found ${threads.length} matching threads.\n`);
    
    for (const t of threads) {
      console.log(`================================================================================`);
      console.log(`🧵 Thread ID: ${t.threadId}`);
      console.log(`Subject    : ${t.subject || '(No Subject)'}`);
      console.log(`Messages   : ${t.messages.length}`);
      console.log(`================================================================================`);
      
      for (const msg of t.messages) {
        console.log(`--- Message ID: ${msg.id} ---`);
        console.log(`From   : ${msg.sender}`);
        console.log(`To     : ${msg.recipient}`);
        console.log(`Cc     : ${msg.cc || '(None)'}`);
        console.log(`Date   : ${msg.date}`);
        console.log(`Body   :\n${msg.body.trim() || '(Empty Body)'}`);
        console.log(`--------------------------------------------------------------------------------\n`);
      }
    }
    
  } catch (error) {
    console.error('❌ Failed to fetch emails:', error.message);
    process.exit(1);
  }
}

main();
