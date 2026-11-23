// Limitador de peticiones por IP, en memoria y sin dependencias externas.
// Suficiente para una sola instancia. Si despliegas varias réplicas,
// cámbialo por un limitador con almacenamiento compartido (p. ej. Redis).
export function createRateLimiter({ windowMs, max, message }) {
  const hits = new Map();

  // Limpieza periódica de entradas vencidas (unref: no bloquea el cierre del proceso).
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs).unref();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = req.ip || 'desconocido';

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({
        ok: false,
        message: message || 'Demasiadas solicitudes. Inténtalo de nuevo más tarde.'
      });
    }

    next();
  };
}
