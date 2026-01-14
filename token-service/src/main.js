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
  console.log('[EVAL] Running JS evaluator');
  console.log('[EVAL] env keys:', Object.keys(env));

  const properties = [];

  if (env.n) {
    console.log('[EVAL] Processing n parameter:', env.n.substring(0, 20) + '...');
    properties.push(`n: exportedVars.nFunction("${env.n}")`);
  }

  if (env.sig) {
    console.log('[EVAL] Processing sig parameter:', env.sig.substring(0, 20) + '...');
    properties.push(`sig: exportedVars.sigFunction("${env.sig}")`);
  }

  const code = `${data.output}\nreturn { ${properties.join(", ")} }`;

  console.log('[EVAL] Code length:', code.length);
  console.log('[EVAL] Exported vars in data:', data.exported);

  try {
    const fn = new Function(code);
    const result = fn();
    console.log('[EVAL] Result keys:', Object.keys(result));
    if (result.n) console.log('[EVAL] Transformed n:', result.n.substring(0, 20) + '...');
    if (result.sig) console.log('[EVAL] Transformed sig:', result.sig.substring(0, 20) + '...');
    return result;
  } catch (error) {
    console.error('[EVAL] Error executing code:', error);
    throw error;
  }
};

// Set the custom evaluator BEFORE any youtubei.js imports that might use it
Platform.shim.eval = jsEvaluator;
console.log('[INFO] Custom JS evaluator set');

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
  console.log('[INFO] Platform.shim.eval is set:', typeof Platform.shim.eval === 'function');

  try {
    // Don't pass po_token here - we'll add it per-video after deciphering
    const innertubeClient = await Innertube.create({
      retrieve_player: true,
      enable_session_cache: false,
    });

    console.log('[INFO] Innertube client created');
    console.log('[INFO] Session exists:', !!innertubeClient.session);
    console.log('[INFO] Player exists:', !!innertubeClient.session?.player);
    console.log('[INFO] Player ID:', innertubeClient.session?.player?.player_id || 'none');
    console.log('[INFO] Signature timestamp:', innertubeClient.session?.player?.signature_timestamp || 'none');
    console.log('[INFO] Player data exists:', !!innertubeClient.session?.player?.data);

    if (innertubeClient.session?.player?.data) {
      console.log('[INFO] Player data exported:', innertubeClient.session.player.data.exported);
    }

    // Pass the client to the routes
    setInnertubeClient(innertubeClient);
  } catch (error) {
    console.error('[ERROR] Failed to create Innertube client:', error);
    throw error;
  }
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
