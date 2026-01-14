import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Innertube, Platform } from 'youtubei.js';
import { authMiddleware } from './middleware/auth.js';
import tokenRoutes, { setInnertubeClient } from './routes/token.js';
import { initializePOToken, getVideoPoToken } from './potoken/generator.js';

// Configuration
const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const SECRET_KEY = process.env.SECRET_KEY || 'development-secret-key';

console.log('[INFO] Starting Freedom Token Service');
console.log(`[INFO] Port: ${PORT}`);
console.log(`[INFO] Host: ${HOST}`);

// Custom JavaScript evaluator for youtubei.js (needed for URL deciphering)
// This runs the extracted signature/n-transform functions
const jsEvaluator = async (data, env) => {
  const properties = [];

  if (env.n) {
    properties.push(`n: exportedVars.nFunction("${env.n}")`);
  }

  if (env.sig) {
    properties.push(`sig: exportedVars.sigFunction("${env.sig}")`);
  }

  const code = `${data.output}\nreturn { ${properties.join(", ")} }`;

  return new Function(code)();
};

// Set the custom evaluator
Platform.shim.eval = jsEvaluator;

// Create Hono app
const app = new Hono();

// CORS (for development/testing only - in production, only CF Worker should call this)
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Service-Key', 'X-Request-Timestamp', 'X-Request-Signature'],
}));

// Auth middleware
app.use('*', authMiddleware(SECRET_KEY));

// Health check (no auth required)
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'freedom-token-service',
    timestamp: new Date().toISOString(),
  });
});

app.get('/healthz', (c) => {
  return c.json({ status: 'ok' });
});

// Token routes
app.route('/token', tokenRoutes);

// 404 handler
app.all('*', (c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Initialize services
async function initialize() {
  console.log('[INFO] Initializing PO token generator...');
  await initializePOToken();
  console.log('[INFO] PO token generator initialized');

  console.log('[INFO] Creating Innertube client...');
  const innertubeClient = await Innertube.create({
    retrieve_player: true,
    enable_session_cache: false,
    po_token: await getVideoPoToken('dQw4w9WgXcQ'), // Use a test video ID to get initial token
  });
  console.log('[INFO] Innertube client created');
  console.log(`[INFO] Player signature timestamp: ${innertubeClient.session.player?.signature_timestamp}`);

  // Pass the client to the routes
  setInnertubeClient(innertubeClient);
}

initialize()
  .then(() => {
    console.log('[INFO] All services initialized successfully');
  })
  .catch((error) => {
    console.error('[ERROR] Failed to initialize services:', error);
    console.error('[ERROR] The service will still start, but video requests may fail');
  });

// Start server
console.log(`[INFO] Server starting on http://${HOST}:${PORT}`);

serve({
  fetch: app.fetch,
  port: PORT,
  hostname: HOST,
});
