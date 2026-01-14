import { Hono } from '@hono/hono';
import { cors } from '@hono/hono/cors';
import { authMiddleware } from './middleware/auth.ts';
import tokenRoutes from './routes/token.ts';
import { initializePOToken } from './potoken/generator.ts';

// Configuration
const PORT = parseInt(Deno.env.get('PORT') || '8790', 10);
const HOST = Deno.env.get('HOST') || '0.0.0.0';
const SECRET_KEY = Deno.env.get('SECRET_KEY') || 'development-secret-key';

console.log('[INFO] Starting Freedom Token Service');
console.log(`[INFO] Port: ${PORT}`);
console.log(`[INFO] Host: ${HOST}`);

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

// Initialize PO token in background
console.log('[INFO] Initializing PO token generator...');
initializePOToken()
  .then(() => {
    console.log('[INFO] PO token generator initialized successfully');
  })
  .catch((error) => {
    console.error('[ERROR] Failed to initialize PO token generator:', error);
    console.error('[ERROR] The service will still start, but video requests may fail');
  });

// Start server
console.log(`[INFO] Server starting on http://${HOST}:${PORT}`);

Deno.serve({
  port: PORT,
  hostname: HOST,
}, app.fetch);
