import { Router } from 'express';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);
// Consultar el rol ACTUAL en MySQL: no confiar en un rol antiguo dentro de un JWT.
router.use(async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT rol, estado FROM usuarios WHERE id = ? LIMIT 1', [req.user.sub]);
    if (!rows.length || rows[0].estado !== 'ACTIVO' || !['ADMIN', 'MODERADOR'].includes(rows[0].rol)) {
      return res.status(403).json({ ok: false, message: 'Acceso exclusivo para administradores y moderadores.' });
    }
    req.adminRol = rows[0].rol;
    next();
  } catch (err) { next(err); }
});

const invalid = (res, message) => res.status(400).json({ ok: false, message });
const validId = id => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(String(id));
const clean = (value, max = 255) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const isFlag = value => value === true || value === false;

const normalizeTipoEquipo = value => {
  const code = clean(value, 30).toUpperCase();
  return code || 'GENERAL';
};

async function isValidTipoEquipo(codigo) {
  if (codigo === 'GENERAL') return true;
  const [rows] = await pool.execute('SELECT id FROM tipos_equipo WHERE codigo = ? LIMIT 1', [codigo]);
  return rows.length > 0;
}

router.get('/resumen', async (_req, res, next) => {
  try {
    const [[totales]] = await pool.query(`SELECT
      (SELECT COUNT(*) FROM usuarios WHERE rol = 'CLIENTE' AND estado = 'ACTIVO') clientes,
      (SELECT COUNT(*) FROM usuarios WHERE rol = 'TECNICO' AND estado = 'ACTIVO') tecnicos,
      (SELECT COUNT(*) FROM perfiles_tecnico WHERE estado_verificacion = 'PENDIENTE') pendientes,
      (SELECT COUNT(*) FROM preguntas_triaje WHERE activa = 1) preguntas`);
    res.json({ ok: true, data: totales });
  } catch (err) { next(err); }
});

router.get('/solicitudes', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT u.id, u.nombre_completo, u.correo, u.telefono, u.estado,
      p.biografia, p.anios_experiencia, p.estado_verificacion, p.creado_en, p.avatar_url,
      p.tarifa_hora_min, p.tarifa_hora_max
      FROM perfiles_tecnico p JOIN usuarios u ON u.id = p.usuario_id
      ORDER BY FIELD(p.estado_verificacion,'PENDIENTE','RECHAZADO','VERIFICADO'), p.creado_en DESC LIMIT 300`);
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

router.patch('/solicitudes/:id', async (req, res, next) => {
  const { estado } = req.body;
  if (!validId(req.params.id) || !['VERIFICADO', 'RECHAZADO', 'PENDIENTE'].includes(estado)) return invalid(res, 'Estado o identificador inválido.');
  try {
    const [result] = await pool.execute(`UPDATE perfiles_tecnico p JOIN usuarios u ON u.id = p.usuario_id
      SET p.estado_verificacion = ?, p.verificado_en = CASE WHEN ? = 'VERIFICADO' THEN NOW(3) ELSE NULL END,
      p.acepta_reservas = CASE WHEN ? = 'VERIFICADO' THEN 1 ELSE 0 END
      WHERE p.usuario_id = ? AND u.rol = 'TECNICO' AND u.estado = 'ACTIVO'`,
      [estado, estado, estado, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ ok: false, message: 'Solicitud no encontrada o cuenta inactiva.' });
    res.json({ ok: true, message: 'Solicitud actualizada.' });
  } catch (err) { next(err); }
});

// Revisión independiente de documentos. Protegida por los middlewares de este router.
const documentVersion = url => createHash('sha256').update(String(url)).digest('hex');
const documentData = ({ url_archivo, ...row }) => ({ ...row, version: documentVersion(url_archivo) });

router.get('/certificados', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT d.id, d.tecnico_id, d.tipo, d.estado, d.creado_en, d.url_archivo,
      u.nombre_completo, u.correo FROM documentos_tecnico d JOIN usuarios u ON u.id = d.tecnico_id
      WHERE u.rol = 'TECNICO' ORDER BY (d.estado = 'PENDIENTE') DESC, d.creado_en DESC`);
    res.json({ ok: true, data: rows.map(documentData) });
  } catch (err) { next(err); }
});

router.get('/tecnicos/:id', async (req, res, next) => {
  if (!validId(req.params.id)) return invalid(res, 'Identificador inválido.');
  try {
    const id = req.params.id;
    const [[perfil]] = await pool.execute(`SELECT u.id, u.nombre_completo, u.correo, u.telefono, u.estado,
      u.tipo_documento, u.nro_documento, p.biografia, p.anios_experiencia, p.estado_verificacion,
      p.tarifa_hora_min, p.tarifa_hora_max, p.calificacion_prom, p.nro_reseñas AS resenas,
      p.acepta_reservas, p.creado_en, p.verificado_en FROM usuarios u JOIN perfiles_tecnico p ON p.usuario_id=u.id
      WHERE u.id=? AND u.rol='TECNICO'`, [id]);
    if (!perfil) return res.status(404).json({ ok:false, message:'Técnico no encontrado.' });
    const [[especialidades], [cobertura], [modalidades]] = await Promise.all([
      pool.execute('SELECT e.nombre FROM tecnico_especialidades t JOIN especialidades e ON e.id=t.especialidad_id WHERE t.tecnico_id=?', [id]),
      pool.execute('SELECT d.nombre FROM cobertura_tecnico t JOIN distritos d ON d.id=t.distrito_id WHERE t.tecnico_id=?', [id]),
      pool.execute('SELECT m.nombre FROM tecnico_modalidades t JOIN modalidades_servicio m ON m.id=t.modalidad_id WHERE t.tecnico_id=?', [id])
    ]);
    res.json({ok:true,data:{...perfil, especialidades, cobertura, modalidades}});
  } catch (err) { next(err); }
});

router.get('/certificados/:id/archivo', async (req, res, next) => {
  if (!validId(req.params.id)) return invalid(res, 'Identificador inválido.');
  try {
    const [[doc]] = await pool.execute('SELECT url_archivo FROM documentos_tecnico WHERE id=?', [req.params.id]);
    if (!doc) return res.status(404).json({ok:false,message:'Documento no encontrado.'});
    const match = /^\/uploads\/certificados\/([a-zA-Z0-9_-]+\.(?:pdf|jpe?g|png|webp))$/i.exec(doc.url_archivo);
    if (!match) return invalid(res, 'Ruta de archivo no permitida.');
    if (req.query.version !== documentVersion(doc.url_archivo)) return res.status(409).json({ok:false,message:'El documento cambió. Actualiza el listado.'});
    res.set('Cache-Control','no-store');
    res.download(path.join(process.cwd(), 'uploads', 'certificados', match[1]), match[1], err => {
      if (err && !res.headersSent) next(err);
    });
  } catch (err) { next(err); }
});

router.patch('/certificados/:id', async (req, res, next) => {
  const { estado, version } = req.body;
  if (!validId(req.params.id) || !['APROBADO','RECHAZADO'].includes(estado) || !/^[a-f0-9]{64}$/.test(String(version))) return invalid(res,'Decisión inválida.');
  try {
    const [result] = await pool.execute(`UPDATE documentos_tecnico SET estado=? WHERE id=? AND estado='PENDIENTE' AND SHA2(url_archivo,256)=?`, [estado, req.params.id, version]);
    if (!result.affectedRows) return res.status(409).json({ok:false,message:'El documento cambió o ya fue revisado. Actualiza el listado.'});
    res.json({ok:true,message:'Documento revisado.'});
  } catch (err) { next(err); }
});

router.get('/usuarios', async (req, res, next) => {
  try {
    const search = clean(req.query.q, 100);
    const [rows] = await pool.execute(`SELECT u.id, u.nombre_completo, u.correo, u.telefono, u.rol, u.estado, u.creado_en,
      p.estado_verificacion FROM usuarios u LEFT JOIN perfiles_tecnico p ON p.usuario_id = u.id
      WHERE (? = '' OR u.nombre_completo LIKE ? OR u.correo LIKE ?)
      ORDER BY u.creado_en DESC LIMIT 300`, [search, `%${search}%`, `%${search}%`]);
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/usuarios', async (req, res, next) => {
  const nombre = clean(req.body.nombre_completo, 150);
  const correo = clean(req.body.correo, 255).toLowerCase();
  const password = req.body.contrasena;
  const rol = req.body.rol;
  if (nombre.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || typeof password !== 'string' || password.length < 8 || !['CLIENTE', 'TECNICO'].includes(rol))
    return invalid(res, 'Verifica nombre, correo, contraseña (mínimo 8 caracteres) y rol.');
  const connection = await pool.getConnection();
  try {
    const [existing] = await connection.execute('SELECT id FROM usuarios WHERE correo = ?', [correo]);
    if (existing.length) return res.status(409).json({ ok: false, message: 'El correo ya existe.' });
    const id = randomUUID();
    const hash = await bcrypt.hash(password, 12);
    await connection.beginTransaction();
    await connection.execute(`INSERT INTO usuarios (id, correo, hash_contrasena, nombre_completo, telefono, rol, estado)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVO')`, [id, correo, hash, nombre, clean(req.body.telefono, 30) || null, rol]);
    if (rol === 'TECNICO') {
      await connection.execute(`INSERT INTO perfiles_tecnico (usuario_id, biografia, anios_experiencia, estado_verificacion,
        tarifa_hora_min, tarifa_hora_max, calificacion_prom, nro_reseñas, acepta_reservas)
        VALUES (?, '', 0, 'PENDIENTE', 0, 0, 0, 0, 0)`, [id]);
    }
    await connection.commit();
    res.status(201).json({ ok: true, data: { id }, message: 'Usuario creado correctamente.' });
  } catch (err) {
    await connection.rollback().catch(() => {});
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, message: 'El correo ya existe.' });
    next(err);
  } finally { connection.release(); }
});

router.patch('/usuarios/:id', async (req, res, next) => {
  const { id } = req.params;
  const { nombre_completo, correo, telefono, estado } = req.body;
  if (!validId(id) || !['ACTIVO', 'INACTIVO'].includes(estado) || clean(nombre_completo).length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(correo).toLowerCase())) return invalid(res, 'Datos del usuario inválidos.');
  if (id === req.user.sub && estado !== 'ACTIVO') return invalid(res, 'No puedes desactivar tu propia cuenta.');
  try {
    const [current] = await pool.execute('SELECT rol FROM usuarios WHERE id = ?', [id]);
    if (!current.length) return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    if (['ADMIN', 'MODERADOR'].includes(current[0].rol)) return res.status(403).json({ ok: false, message: 'Las cuentas de administración se gestionan fuera de este panel.' });
    await pool.execute('UPDATE usuarios SET nombre_completo = ?, correo = ?, telefono = ?, estado = ? WHERE id = ?',
      [clean(nombre_completo, 150), clean(correo, 255).toLowerCase(), clean(telefono, 30) || null, estado, id]);
    res.json({ ok: true, message: 'Usuario actualizado.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, message: 'Correo ya registrado.' });
    next(err);
  }
});

// Baja lógica: conserva citas, pagos, incidencias y auditoría relacionadas.
router.delete('/usuarios/:id', async (req, res, next) => {
  if (!validId(req.params.id) || req.params.id === req.user.sub) return invalid(res, 'No puedes desactivar esta cuenta.');
  try {
    const [result] = await pool.execute(`UPDATE usuarios SET estado = 'INACTIVO'
      WHERE id = ? AND rol IN ('CLIENTE','TECNICO')`, [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ ok: false, message: 'Cuenta no encontrada o protegida.' });
    res.json({ ok: true, message: 'Cuenta desactivada; sus registros históricos se conservan.' });
  } catch (err) { next(err); }
});

router.get('/triaje/tipos-equipo', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, codigo, nombre FROM tipos_equipo ORDER BY nombre, codigo');
    res.json({
      ok: true,
      data: [{ id: 'GENERAL', codigo: 'GENERAL', nombre: 'General' }, ...rows]
    });
  } catch (err) { next(err); }
});

router.get('/triaje', async (_req, res, next) => {
  try {
    const [preguntas] = await pool.query(
      'SELECT id, tipo_equipo_codigo, texto, nro_orden, activa FROM preguntas_triaje ORDER BY tipo_equipo_codigo, nro_orden, id'
    );
    const [opciones] = await pool.query(
      'SELECT id, pregunta_id, texto, siguiente_pregunta_id, categoria_id, peso FROM opciones_triaje ORDER BY peso, id'
    );
    res.json({ ok: true, data: preguntas.map(p => ({ ...p, opciones: opciones.filter(o => o.pregunta_id === p.id) })) });
  } catch (err) { next(err); }
});

router.post('/triaje/preguntas', async (req, res, next) => {
  const texto = clean(req.body.texto, 1000);
  const orden = Number(req.body.nro_orden);
  const tipoEquipoCodigo = normalizeTipoEquipo(req.body.tipo_equipo_codigo);
  if (!texto || !Number.isInteger(orden) || orden < 1 || orden > 32767) return invalid(res, 'Escribe una pregunta y un orden válido.');
  try {
    if (!(await isValidTipoEquipo(tipoEquipoCodigo))) {
      return invalid(res, 'Tipo de equipo inválido para la pregunta.');
    }
    const id = randomUUID();
    await pool.execute(
      'INSERT INTO preguntas_triaje (id, tipo_equipo_codigo, texto, nro_orden, activa) VALUES (?, ?, ?, ?, 1)',
      [id, tipoEquipoCodigo, texto, orden]
    );
    res.status(201).json({ ok: true, data: { id, tipo_equipo_codigo: tipoEquipoCodigo } });
  } catch (err) { next(err); }
});

router.patch('/triaje/preguntas/:id', async (req, res, next) => {
  const texto = clean(req.body.texto, 1000);
  const orden = Number(req.body.nro_orden);
  const activa = req.body.activa;
  const tipoEquipoCodigo = normalizeTipoEquipo(req.body.tipo_equipo_codigo);
  if (!validId(req.params.id) || !texto || !Number.isInteger(orden) || orden < 1 || orden > 32767 || !isFlag(activa)) {
    return invalid(res, 'Datos de pregunta inválidos.');
  }
  try {
    if (!(await isValidTipoEquipo(tipoEquipoCodigo))) {
      return invalid(res, 'Tipo de equipo inválido para la pregunta.');
    }
    const [result] = await pool.execute(
      'UPDATE preguntas_triaje SET tipo_equipo_codigo = ?, texto = ?, nro_orden = ?, activa = ? WHERE id = ?',
      [tipoEquipoCodigo, texto, orden, Number(activa), req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ ok: false, message: 'Pregunta no encontrada.' });
    res.json({ ok: true, message: 'Pregunta actualizada.' });
  } catch (err) { next(err); }
});

async function checkReferences(preguntaId, siguiente, categoria) {
  if (siguiente) {
    const [p] = await pool.execute('SELECT id FROM preguntas_triaje WHERE id = ? AND activa = 1', [siguiente]);
    if (!p.length || siguiente === preguntaId) return 'Pregunta siguiente inválida o inactiva.';
  }
  if (categoria) {
    const [c] = await pool.execute('SELECT id FROM categorias_problema WHERE id = ?', [categoria]);
    if (!c.length) return 'Categoría inválida.';
  }
  return null;
}

router.get('/triaje/categorias', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, nombre FROM categorias_problema ORDER BY nombre');
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/triaje/preguntas/:id/opciones', async (req, res, next) => {
  const preguntaId = req.params.id;
  const texto = clean(req.body.texto, 1000);
  const peso = Number(req.body.peso);
  const siguiente = req.body.siguiente_pregunta_id || null;
  const categoria = req.body.categoria_id || null;
  if (!validId(preguntaId) || !texto || !Number.isInteger(peso) || peso < -32768 || peso > 32767 ||
    (siguiente && !validId(siguiente)) || (categoria && !validId(categoria))) return invalid(res, 'Datos de opción inválidos.');
  try {
    const [q] = await pool.execute('SELECT id FROM preguntas_triaje WHERE id = ?', [preguntaId]);
    if (!q.length) return res.status(404).json({ ok: false, message: 'Pregunta no encontrada.' });
    const error = await checkReferences(preguntaId, siguiente, categoria);
    if (error) return invalid(res, error);
    const id = randomUUID();
    await pool.execute(`INSERT INTO opciones_triaje (id, pregunta_id, texto, siguiente_pregunta_id, categoria_id, peso)
      VALUES (?, ?, ?, ?, ?, ?)`, [id, preguntaId, texto, siguiente, categoria, peso]);
    res.status(201).json({ ok: true, data: { id } });
  } catch (err) { next(err); }
});

router.patch('/triaje/opciones/:id', async (req, res, next) => {
  const texto = clean(req.body.texto, 1000);
  const peso = Number(req.body.peso);
  const siguiente = req.body.siguiente_pregunta_id || null;
  const categoria = req.body.categoria_id || null;
  if (!validId(req.params.id) || !texto || !Number.isInteger(peso) || peso < -32768 || peso > 32767 ||
      (siguiente && !validId(siguiente)) || (categoria && !validId(categoria))) return invalid(res, 'Datos de opción inválidos.');
  try {
    const [rows] = await pool.execute('SELECT pregunta_id FROM opciones_triaje WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Opción no encontrada.' });
    const error = await checkReferences(rows[0].pregunta_id, siguiente, categoria);
    if (error) return invalid(res, error);
    await pool.execute('UPDATE opciones_triaje SET texto = ?, peso = ?, siguiente_pregunta_id = ?, categoria_id = ? WHERE id = ?',
      [texto, peso, siguiente, categoria, req.params.id]);
    res.json({ ok: true, message: 'Opción actualizada.' });
  } catch (err) { next(err); }
});

export default router;