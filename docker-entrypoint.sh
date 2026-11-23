#!/bin/sh
# Prepara la carpeta de uploads (puede ser un volumen montado, normalmente propiedad de root)
# y arranca la app SIN privilegios de root.
set -e

UPLOADS_DIR="/app/fixit-backend/uploads"
mkdir -p "$UPLOADS_DIR/avatars" "$UPLOADS_DIR/certificados" "$UPLOADS_DIR/incidencias"
chown -R node:node "$UPLOADS_DIR"

exec su-exec node "$@"
