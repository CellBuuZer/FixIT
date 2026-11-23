import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, testConnection } from './db.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import incidenciasRoutes from './routes/incidencias.routes.js';
import tecnicosRoutes from './routes/tecnicos.routes.js';
import triajeRoutes from './routes/triaje.routes.js';
import citasRoutes from './routes/citas.routes.js';
import distritosRoutes from './routes/distritos.routes.js';
import adminRoutes from './routes/admin.routes.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

// ==========================================
// VALIDACIÓN DE VARIABLES DE ENTORNO
// ==========================================
function validateEnv() {
  const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'JWT_SECRET'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(`❌ Faltan variables de entorno obligatorias: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (isProduction) {
    const secret = process.env.JWT_SECRET;
    if (secret.length < 32 || /CAMBIA_ESTA_CLAVE|UNA_CLAVE_LARGA/i.test(secret)) {
      console.error('❌ JWT_SECRET no es seguro para producción (usa un valor aleatorio de 32+ caracteres).');
      process.exit(1);
    }
  }
}

validateEnv();

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Orígenes permitidos por CORS. Solo hace falta si el frontend se sirve desde OTRO
// dominio. Acepta varios separados por coma. FRONTEND_URL tiene prioridad;
// CORS_ORIGIN se mantiene por compatibilidad con el .env.example anterior.
const allowedOrigins = (process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

// Detrás de un proxy (Render, Railway, Fly, Nginx...) Express necesita confiar en él
// para obtener la IP real del cliente (rate limiting) y detectar HTTPS.
// TRUST_PROXY: número de proxys (1 es lo habitual), 'true', 'false' o una subred.
if (process.env.TRUST_PROXY) {
  const value = process.env.TRUST_PROXY.trim();
  app.set(
    'trust proxy',
    /^\d+$/.test(value) ? Number(value) : value === 'true' ? true : value === 'false' ? false : value
  );
} else if (isProduction) {
  app.set('trust proxy', 1);
}

// ==========================================
// MIDDLEWARES DE SEGURIDAD Y CONFIGURACIÓN GENERAL
// ==========================================
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      // data: y blob: para imágenes incrustadas y vistas previas de archivos subidos.
      'img-src': ["'self'", 'data:', 'blob:'],
      // Se desactiva para poder probar la app por http://localhost; en producción
      // HTTPS se refuerza con HSTS (Helmet lo envía por defecto).
      'upgrade-insecure-requests': null
    }
  }
}));

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));

// Freno a la fuerza bruta en login/registro (por IP).
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 30),
  message: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'
});

// Endpoint de verificación de estado (Health Check)
app.get('/health', async (_req, res) => {
  try {
    await testConnection();
    res.json({ ok: true, service: 'fixit-backend', database: 'connected' });
  } catch {
    res.status(503).json({ ok: false, service: 'fixit-backend', database: 'disconnected' });
  }
});

// Rutas de la API
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/incidencias', incidenciasRoutes);
app.use('/api/triaje', triajeRoutes);
app.use('/api/tecnicos', tecnicosRoutes);
app.use('/api/citas', citasRoutes);
app.use('/api/distritos', distritosRoutes);
app.use('/api/admin', adminRoutes);

// ==========================================
// ARCHIVOS SUBIDOS (Avatares, fotos de incidencias)
// ==========================================
// Los certificados/antecedentes de los técnicos son documentos privados: NO se sirven
// de forma estática. Solo se descargan por /api/admin/certificados/:id/archivo (autenticado).
app.use('/uploads/certificados', (_req, res) => {
  res.status(404).json({ ok: false, message: 'Ruta no encontrada.' });
});

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
  index: false,
  dotfiles: 'ignore',
  maxAge: '1d',
  setHeaders: (res) => {
    // Archivos subidos por usuarios: que nunca puedan ejecutar scripts (p. ej. SVG) en nuestro origen.
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.set('X-Content-Type-Options', 'nosniff');
  }
}));

// ==========================================
// FRONTEND (build de Vite) — despliegue como una sola app
// ==========================================
// Si existe FixIT/dist, Express lo sirve. Si no existe (desarrollo con `npm run dev`),
// el backend funciona solo como API, igual que antes.
const distPath = process.env.FRONTEND_DIST
  ? path.resolve(process.env.FRONTEND_DIST)
  : path.resolve(__dirname, '../../FixIT/dist');
const serveFrontend = fs.existsSync(path.join(distPath, 'index.html'));

if (serveFrontend) {
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        // Vite genera nombres con hash: se pueden cachear "para siempre".
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));

  // Fallback de la SPA (React Router con BrowserRouter): cualquier GET que no sea
  // API, uploads ni un archivo con extensión devuelve index.html.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path === '/health' || req.path === '/api' || req.path.startsWith('/api/') || req.path.startsWith('/uploads')) {
      return next();
    }
    if (path.extname(req.path)) return next(); // un .js/.css/.png inexistente debe dar 404, no HTML
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Middleware para rutas no encontradas (404)
app.use((_req, res) => {
  res.status(404).json({ ok: false, message: 'Ruta no encontrada.' });
});

// Middleware global de manejo de errores
app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);

  // Errores de subida de archivos (límite de tamaño, campo inesperado...) son del cliente, no del servidor.
  if (error?.name === 'MulterError') {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'El archivo supera el tamaño máximo permitido.'
      : 'No se pudo procesar el archivo subido.';
    return res.status(400).json({ ok: false, message });
  }

  // JSON mal formado, cuerpo demasiado grande, etc.
  const status = Number(error?.status || error?.statusCode) || 500;
  if (status >= 400 && status < 500) {
    return res.status(status).json({ ok: false, message: 'Solicitud no válida.' });
  }

  console.error('❌ Error capturado en el servidor:', error);
  res.status(500).json({
    ok: false,
    message: isProduction ? 'Error interno del servidor.' : error.message
  });
});

// ==========================================
// ARRANQUE Y APAGADO ORDENADO
// ==========================================
let server;

try {
  await testConnection();
  server = app.listen(PORT, () => {
    console.log(`🚀 FixIT ejecutándose en http://localhost:${PORT}`);
    console.log(serveFrontend
      ? `🖥️  Frontend servido desde ${distPath}`
      : 'ℹ️  Sin build del frontend (FixIT/dist): modo solo API.');
  });
} catch (error) {
  console.error('❌ No se pudo conectar a MySQL:', error.message);
  process.exit(1);
}

function shutdown(signal) {
  console.log(`${signal} recibido. Cerrando servidor...`);
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  // Si algo cuelga, forzar la salida.
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
