const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Función auxiliar interna para evitar repetir código en las peticiones
async function peticionApi(endpoint, opciones = {}) {
  const token = localStorage.getItem('fixit_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...opciones.headers,
  };

  const respuesta = await fetch(`${API_URL}${endpoint}`, {
    ...opciones,
    headers,
  });

  const resultado = await respuesta.json();

  if (!respuesta.ok || (resultado.success === false && !resultado.ok)) {
    throw new Error(resultado.message || 'Ocurrió un error en la solicitud.');
  }

  return resultado.data !== undefined ? resultado.data : resultado;
}

// ==========================================
// AUTENTICACIÓN Y USUARIOS
// ==========================================

export async function registrarUsuario(datos) {
  return await peticionApi('/auth/register', {
    method: 'POST',
    body: JSON.stringify(datos),
  });
}

export async function iniciarSesion(datos) {
  return await peticionApi('/auth/login', {
    method: 'POST',
    body: JSON.stringify(datos),
  });
}

export async function obtenerUsuarioActual() {
  const token = localStorage.getItem('fixit_token');
  if (!token) throw new Error('No hay una sesión iniciada.');
  return await peticionApi('/users/me', { method: 'GET' });
}

export async function actualizarUsuario(datos) {
  const token = localStorage.getItem('fixit_token');
  if (!token) throw new Error('No hay una sesión iniciada.');
  return await peticionApi('/users/me', {
    method: 'PUT',
    body: JSON.stringify(datos),
  });
}

// ==========================================
// INCIDENCIAS Y CATÁLOGOS
// ==========================================

export async function obtenerCatalogosIncidencia() {
  return await peticionApi('/incidencias/catalogos', { method: 'GET' });
}

export async function obtenerMisIncidencias() {
  return await peticionApi('/incidencias/mis-incidencias', { method: 'GET' });
}

export async function obtenerDetalleIncidencia(id) {
  return await peticionApi(`/incidencias/${encodeURIComponent(id)}`, { method: 'GET' });
}

export async function registrarIncidencia(datos) {
  const token = localStorage.getItem('fixit_token');
  if (!token) throw new Error('Debes iniciar sesión para registrar una incidencia.');
  
  return await peticionApi('/incidencias', {
    method: 'POST',
    body: JSON.stringify(datos),
  });
}

// ==========================================
// TRIAJE
// ==========================================

export async function obtenerPreguntasTriaje(incidenciaId) {
  const token = localStorage.getItem('fixit_token');
  if (!token) throw new Error('Debes iniciar sesión para realizar el triaje.');

  const query = incidenciaId
    ? `?incidenciaId=${encodeURIComponent(incidenciaId)}`
    : '';

  return await peticionApi(`/triaje/preguntas${query}`, { method: 'GET' });
}

export async function guardarRespuestasTriaje(incidenciaId, respuestas) {
  const token = localStorage.getItem('fixit_token');
  if (!token) throw new Error('Debes iniciar sesión para guardar el triaje.');

  const payload = typeof incidenciaId === 'object' && !respuestas 
    ? incidenciaId 
    : { incidencia_id: incidenciaId, respuestas };

  return await peticionApi('/triaje/respuestas', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export const registrarRespuestasTriaje = guardarRespuestasTriaje;

// ==========================================
// TÉCNICOS (ACTUALIZADO CON SOPORTE DE FILTROS)
// ==========================================

export async function obtenerTecnicos(filtros = {}) {
  const params = new URLSearchParams();

  if (filtros.lat !== undefined && filtros.lat !== null) params.append('lat', filtros.lat);
  if (filtros.lng !== undefined && filtros.lng !== null) params.append('lng', filtros.lng);
  if (filtros.cercania) params.append('cercania', filtros.cercania);
  if (filtros.disponibilidad) params.append('disponibilidad', filtros.disponibilidad);

  const queryStr = params.toString() ? `?${params.toString()}` : '';
  return await peticionApi(`/tecnicos${queryStr}`, { method: 'GET' });
}

// Panel de moderación: todos los permisos se verifican también en el servidor.
export const adminApi = {
  certificados: () => peticionApi('/admin/certificados'),
  detalleTecnico: id => peticionApi(`/admin/tecnicos/${encodeURIComponent(id)}`),
  decidirCertificado: (id, estado, version) => peticionApi(`/admin/certificados/${encodeURIComponent(id)}`, { method:'PATCH', body:JSON.stringify({estado,version}) }),
  archivoCertificado: async (id, version) => {
    const response = await fetch(`${API_URL}/admin/certificados/${encodeURIComponent(id)}/archivo?version=${encodeURIComponent(version)}`, { headers:{Authorization:`Bearer ${localStorage.getItem('fixit_token')}`} });
    if (!response.ok) throw new Error('No se pudo descargar el documento. Actualiza el listado e inténtalo nuevamente.');
    const blob = await response.blob();
    const filename = response.headers.get('Content-Disposition')?.match(/filename="?([a-zA-Z0-9_.-]+)"?/)?.[1];
    const ext = ({'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[blob.type] || 'bin';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=filename || `certificado-${id}.${ext}`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  },
  resumen: () => peticionApi('/admin/resumen'),
  solicitudes: () => peticionApi('/admin/solicitudes'),
  decidirSolicitud: (id, estado) => peticionApi(`/admin/solicitudes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ estado }) }),
  usuarios: (q = '') => peticionApi(`/admin/usuarios?q=${encodeURIComponent(q)}`),
  crearUsuario: datos => peticionApi('/admin/usuarios', { method: 'POST', body: JSON.stringify(datos) }),
  actualizarUsuario: (id, datos) => peticionApi(`/admin/usuarios/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(datos) }),
  desactivarUsuario: id => peticionApi(`/admin/usuarios/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  triaje: () => peticionApi('/admin/triaje'),
  tiposEquipo: () => peticionApi('/admin/triaje/tipos-equipo'),
  categorias: () => peticionApi('/admin/triaje/categorias'),
  crearPregunta: datos => peticionApi('/admin/triaje/preguntas', { method: 'POST', body: JSON.stringify(datos) }),
  actualizarPregunta: (id, datos) => peticionApi(`/admin/triaje/preguntas/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(datos) }),
  crearOpcion: (id, datos) => peticionApi(`/admin/triaje/preguntas/${encodeURIComponent(id)}/opciones`, { method: 'POST', body: JSON.stringify(datos) }),
  actualizarOpcion: (id, datos) => peticionApi(`/admin/triaje/opciones/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(datos) }),
};