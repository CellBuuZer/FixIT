# FixIT: una sola imagen con frontend (build de Vite) + API Express.
# Construir:  docker build -t fixit .
# Ejecutar:   docker run -p 3000:3000 --env-file fixit-backend/.env -v fixit_uploads:/app/fixit-backend/uploads fixit

# ---------- 1) Build del frontend ----------
FROM node:22-alpine AS frontend-build
WORKDIR /build/FixIT
COPY FixIT/package.json FixIT/package-lock.json ./
RUN npm ci
COPY FixIT/ ./
# .env.production define VITE_API_URL=/api (misma origen)
RUN npm run build

# ---------- 2) Dependencias de producción del backend ----------
FROM node:22-alpine AS backend-deps
WORKDIR /build/fixit-backend
COPY fixit-backend/package.json fixit-backend/package-lock.json ./
RUN npm ci --omit=dev

# ---------- 3) Imagen final ----------
FROM node:22-alpine
ENV NODE_ENV=production
RUN apk add --no-cache su-exec
WORKDIR /app
COPY --from=backend-deps /build/fixit-backend/node_modules ./fixit-backend/node_modules
COPY fixit-backend/ ./fixit-backend/
COPY --from=frontend-build /build/FixIT/dist ./FixIT/dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /app/fixit-backend/uploads \
 && chown -R node:node /app/fixit-backend/uploads

# cwd = fixit-backend: la app guarda y sirve uploads/ relativo a este directorio
WORKDIR /app/fixit-backend
EXPOSE 3000
VOLUME ["/app/fixit-backend/uploads"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
