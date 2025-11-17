const { ConvexHttpClient } = require('convex/browser');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const envPath = path.resolve(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}
const convexUrl = process.env.CONVEX_URL;
const deployKey = process.env.CONVEX_DEPLOY_KEY;
if (!convexUrl || !deployKey) {
  throw new Error('Missing Convex credentials');
}
const client = new ConvexHttpClient(convexUrl, { key: deployKey });
(async () => {
  const threads = await client.query('messaging:listThreads', { limit: 5 });
  console.log(JSON.stringify(threads, null, 2));
})();
