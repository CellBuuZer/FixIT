import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminApi, obtenerUsuarioActual } from '../services/api';
import './DashboardAdmin.css';

const blankUser = { nombre_completo: '', correo: '', telefono: '', contrasena: '', rol: 'CLIENTE' };
const initialOption = { texto: '', peso: 1, siguiente_pregunta_id: '', categoria_id: '' };
const defaultDeviceTypes = [
  { id: 'GENERAL', codigo: 'GENERAL', nombre: 'General' },
  { id: 'LAPTOP', codigo: 'LAPTOP', nombre: 'Laptop' },
  { id: 'PC_ESCRITORIO', codigo: 'PC_ESCRITORIO', nombre: 'PC de Escritorio' },
  { id: 'SMARTPHONE', codigo: 'SMARTPHONE', nombre: 'Smartphone' },
  { id: 'TABLET', codigo: 'TABLET', nombre: 'Tablet' },
  { id: 'OTRO', codigo: 'OTRO', nombre: 'Otro' }
];
const shortDate = date => date ? new Date(date).toLocaleDateString('es-PE') : '—';

export default function DashboardAdmin() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState([]);
  const [docsError, setDocsError] = useState('');
  const [docsFilter, setDocsFilter] = useState('PENDIENTE');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('inicio');
  const [summary, setSummary] = useState({});
  const [requests, setRequests] = useState([]);
  const [people, setPeople] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [deviceTypes, setDeviceTypes] = useState(defaultDeviceTypes);
  const [triajeFilter, setTriajeFilter] = useState('TODOS');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newUser, setNewUser] = useState(blankUser);
  const [editing, setEditing] = useState(null);
  const [newQuestion, setNewQuestion] = useState({ tipo_equipo_codigo: 'LAPTOP', texto: '', nro_orden: 1 });
  const [expanded, setExpanded] = useState(null);
  const [optionDraft, setOptionDraft] = useState(initialOption);

  const refreshDocs = useCallback(async () => {
    try {
      setDocs(await adminApi.certificados());
      setDocsError('');
    } catch (err) {
      setDocsError(err.message);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const timer = setInterval(refreshDocs, 30000);
    return () => clearInterval(timer);
  }, [user, refreshDocs]);

  async function openDetail(id) {
    setDetailLoading(true);
    setDetail(null);
    setNotice(null);
    try {
      setDetail(await adminApi.detalleTecnico(id));
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setDetailLoading(false);
    }
  }

  async function decideDoc(doc, estado) {
    if (!window.confirm(`¿${estado === 'APROBADO' ? 'Aprobar' : 'Rechazar'} este documento?`)) return;
    setBusy(true);
    setNotice(null);
    try {
      await adminApi.decidirCertificado(doc.id, estado, doc.version);
      await refreshDocs();
      setNotice({ type: 'success', text: 'Decisión guardada.' });
    } catch (err) {
      await refreshDocs();
      setNotice({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function downloadDoc(doc) {
    try {
      await adminApi.archivoCertificado(doc.id, doc.version);
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  }

  const refresh = useCallback(async () => {
    const [a, b, c, d, e, f] = await Promise.all([
      adminApi.resumen(),
      adminApi.solicitudes(),
      adminApi.usuarios(),
      adminApi.triaje(),
      adminApi.categorias(),
      adminApi.tiposEquipo().catch(() => defaultDeviceTypes)
    ]);
    setSummary(a);
    setRequests(b);
    setPeople(c);
    setQuestions(d);
    setCategories(e);
    if (Array.isArray(f) && f.length > 0) setDeviceTypes(f);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const u = await obtenerUsuarioActual();
        if (!mounted) return;
        if (!['ADMIN', 'MODERADOR'].includes(u.rol) || u.estado !== 'ACTIVO') {
          navigate('/dashboard-cliente', { replace: true });
          return;
        }
        setUser(u);
        await Promise.all([refresh(), refreshDocs()]);
      } catch {
        if (mounted) {
          localStorage.removeItem('fixit_token');
          localStorage.removeItem('fixit_user');
          navigate('/login', { replace: true });
        }
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [navigate, refresh, refreshDocs]);

  async function action(task, success = 'Cambios guardados correctamente.') {
    setBusy(true);
    setNotice(null);
    try {
      await task();
      await refresh();
      setNotice({ type: 'success', text: success });
      return true;
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const logout = () => {
    localStorage.removeItem('fixit_token');
    localStorage.removeItem('fixit_user');
    navigate('/login', { replace: true });
  };

  if (checking) return <div className="adm-loading">Verificando acceso de administración…</div>;
  if (!user) return null;

  const matches = people.filter(p => `${p.nombre_completo} ${p.correo}`.toLowerCase().includes(query.toLowerCase()));
  const pendingDocs = docs.filter(d => d.estado === 'PENDIENTE');
  const visibleDocs = docs.filter(d => docsFilter === 'TODOS' || d.estado === docsFilter);
  const pending = requests.filter(r => r.estado_verificacion === 'PENDIENTE');
  const deviceLabel = code => deviceTypes.find(t => t.codigo === code)?.nombre || code || 'General';
  const visibleQuestions = questions.filter(q => triajeFilter === 'TODOS' || (q.tipo_equipo_codigo || 'GENERAL') === triajeFilter);

  return (
    <div className="adm-shell">
      <aside className="adm-sidebar">
        <Link className="adm-brand" to="/"><span className="adm-brand-icon">✦</span> Fix<span>IT</span><small>ADMIN PANEL</small></Link>
        <div className="adm-side-title">GESTIÓN</div>
        {[
          ['inicio', '▦', 'Resumen'],
          ['solicitudes', '✓', 'Solicitudes'],
          ['certificados', '▤', 'Certificados'],
          ['usuarios', '♙', 'Usuarios y técnicos'],
          ['triaje', '☷', 'Triaje']
        ].map(([id, icon, title]) => (
          <button
            key={id}
            className={`adm-nav ${tab === id ? 'active' : ''}`}
            onClick={() => { setTab(id); setNotice(null); }}
          >
            <span>{icon}</span>{title}
            {id === 'solicitudes' && pending.length > 0 && <b>{pending.length}</b>}
            {id === 'certificados' && pendingDocs.length > 0 && <b>{pendingDocs.length}</b>}
          </button>
        ))}
        <div className="adm-side-bottom">
          <Link to="/">← Volver a FixIT</Link>
          <button onClick={logout}>Cerrar sesión</button>
        </div>
      </aside>

      <div className="adm-main">
        <header className="adm-top">
          <div>
            <span className="adm-top-kicker">PANEL DE CONTROL</span>
            <h1>
              {({
                inicio: 'Resumen general',
                solicitudes: 'Solicitudes de técnicos',
                usuarios: 'Usuarios y técnicos',
                certificados: 'Revisión de certificados',
                triaje: 'Gestión de triaje'
              })[tab]}
            </h1>
          </div>
          <span className="adm-profile">
            <span className="adm-avatar">{user.nombre_completo?.charAt(0)}</span>
            <span>{user.nombre_completo}<small>{user.rol}</small></span>
          </span>
        </header>

        {notice && (
          <div role="alert" className={`adm-alert ${notice.type}`}>
            {notice.text}
            <button aria-label="Cerrar aviso" onClick={() => setNotice(null)}>×</button>
          </div>
        )}

        {docsError && (
          <div className="adm-alert error" role="alert">
            No se pudo actualizar certificados: {docsError}
            <button onClick={refreshDocs}>Reintentar</button>
          </div>
        )}

        {tab === 'inicio' && (
          <>
            <p className="adm-muted">Supervisa las solicitudes y el contenido de FixIT desde un solo lugar.</p>
            {pendingDocs.length > 0 && (
              <section className="adm-doc-alert" role="status">
                <span className="adm-doc-icon">!</span>
                <div>
                  <strong>{pendingDocs.length} documento(s) por revisar</strong>
                  <p>Revisa los certificados y antecedentes enviados por los técnicos.</p>
                </div>
                <button className="adm-primary" onClick={() => { setDocsFilter('PENDIENTE'); setTab('certificados'); }}>
                  Revisar documentos →
                </button>
              </section>
            )}
            <div className="adm-stats">
              {[
                ['Clientes activos', summary.clientes, '♙'],
                ['Técnicos activos', summary.tecnicos, '⚒'],
                ['Solicitudes pendientes', summary.pendientes, '◷'],
                ['Preguntas activas', summary.preguntas, '☷']
              ].map(([label, count, icon]) => (
                <div className="adm-stat" key={label}>
                  <span className="adm-stat-icon">{icon}</span>
                  <div><small>{label}</small><strong>{count ?? '—'}</strong></div>
                </div>
              ))}
            </div>
            <section className="adm-card">
              <h2>Accesos rápidos</h2>
              <div className="adm-shortcuts">
                <button onClick={() => setTab('solicitudes')}>Revisar postulaciones <span>→</span></button>
                <button onClick={() => setTab('usuarios')}>Administrar cuentas <span>→</span></button>
                <button onClick={() => setTab('triaje')}>Editar cuestionario <span>→</span></button>
              </div>
            </section>
          </>
        )}

        {tab === 'solicitudes' && (
          <section className="adm-card">
            <div className="adm-card-heading">
              <div>
                <h2>Revisión de postulaciones</h2>
                <p>Aprueba o rechaza los perfiles que solicitan trabajar como técnicos.</p>
              </div>
              <span className="adm-chip">{pending.length} pendientes</span>
            </div>
            <div className="adm-table-wrap">
              <table>
                <thead>
                  <tr><th>Técnico</th><th>Experiencia</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {requests.map(r => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.nombre_completo}</strong>
                        <small>{r.correo}</small>
                        {r.biografia && <small>{r.biografia.slice(0, 110)}</small>}
                      </td>
                      <td>{r.anios_experiencia || 0} años</td>
                      <td><span className={`adm-status ${r.estado_verificacion.toLowerCase()}`}>{r.estado_verificacion}</span></td>
                      <td>{shortDate(r.creado_en)}</td>
                      <td className="adm-actions">
                        <button className="adm-btn" disabled={detailLoading} onClick={() => openDetail(r.id)}>Ver ficha</button>
                        <button
                          disabled={busy || r.estado_verificacion === 'VERIFICADO'}
                          className="adm-btn approve"
                          onClick={() => action(() => adminApi.decidirSolicitud(r.id, 'VERIFICADO'), 'Técnico aprobado.')}
                        >
                          Aprobar
                        </button>
                        <button
                          disabled={busy || r.estado_verificacion === 'RECHAZADO'}
                          className="adm-btn reject"
                          onClick={() => window.confirm('¿Rechazar esta solicitud?') && action(() => adminApi.decidirSolicitud(r.id, 'RECHAZADO'), 'Solicitud rechazada.')}
                        >
                          Rechazar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!requests.length && <tr><td colSpan="5">Aún no hay solicitudes.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'certificados' && (
          <section className="adm-card">
            <div className="adm-card-heading">
              <div>
                <h2>Documentos enviados</h2>
                <p>Aprueba o rechaza cada archivo de forma independiente.</p>
              </div>
              <button className="adm-btn" onClick={refreshDocs}>Actualizar</button>
            </div>
            <div className="adm-doc-filters">
              {['PENDIENTE', 'APROBADO', 'RECHAZADO', 'TODOS'].map(f => (
                <button
                  key={f}
                  className={`adm-btn ${docsFilter === f ? 'adm-filter-active' : ''}`}
                  onClick={() => setDocsFilter(f)}
                  aria-pressed={docsFilter === f}
                >
                  {f === 'TODOS' ? 'Todos' : f} {f === 'PENDIENTE' && `(${pendingDocs.length})`}
                </button>
              ))}
            </div>
            <DocumentTable docs={visibleDocs} busy={busy} download={downloadDoc} decide={decideDoc} openDetail={openDetail} />
          </section>
        )}

        {detailLoading && <p className="adm-muted" role="status">Cargando ficha del técnico…</p>}
        {detail && (
          <div className="adm-modal-cover" onMouseDown={() => setDetail(null)}>
            <section
              className="adm-modal adm-tech-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Ficha del técnico"
              onMouseDown={e => e.stopPropagation()}
              onKeyDown={e => { if (e.key === 'Escape') setDetail(null); }}
            >
              <div className="adm-card-heading">
                <div>
                  <span className="adm-top-kicker">FICHA PROFESIONAL</span>
                  <h2>{detail.nombre_completo}</h2>
                  <span className={`adm-status ${detail.estado_verificacion?.toLowerCase()}`}>{detail.estado_verificacion}</span>
                </div>
                <button autoFocus className="adm-btn" onClick={() => setDetail(null)}>Cerrar ×</button>
              </div>
              <dl className="adm-tech-grid">
                {[
                  ['Correo', detail.correo],
                  ['Teléfono', detail.telefono],
                  ['Documento', [detail.tipo_documento, detail.nro_documento].filter(Boolean).join(' ')],
                  ['Cuenta', detail.estado],
                  ['Experiencia', `${detail.anios_experiencia ?? 0} años`],
                  ['Tarifa por hora', `S/ ${detail.tarifa_hora_min ?? '—'} – ${detail.tarifa_hora_max ?? '—'}`],
                  ['Calificación', `${detail.calificacion_prom ?? '—'} (${detail.resenas ?? 0} reseñas)`],
                  ['Reservas', Number(detail.acepta_reservas) ? 'Sí' : 'No'],
                  ['Registro', shortDate(detail.creado_en)],
                  ['Especialidades', detail.especialidades?.map(x => x.nombre).join(', ')],
                  ['Cobertura', detail.cobertura?.map(x => x.nombre).join(', ')],
                  ['Modalidades', detail.modalidades?.map(x => x.nombre).join(', ')]
                ].map(([label, value]) => (
                  <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>
                ))}
              </dl>
              <h3>Biografía</h3>
              <p className="adm-tech-bio">{detail.biografia || 'Sin biografía registrada.'}</p>
              <h3>Certificados y antecedentes</h3>
              <DocumentTable docs={docs.filter(d => d.tecnico_id === detail.id)} busy={busy} download={downloadDoc} decide={decideDoc} />
            </section>
          </div>
        )}

        {tab === 'usuarios' && (
          <>
            <section className="adm-card">
              <div className="adm-card-heading">
                <div>
                  <h2>Directorio de cuentas</h2>
                  <p>Editar datos, reactivar o desactivar cuentas sin perder su historial.</p>
                </div>
                <input className="adm-search" placeholder="Buscar por nombre o correo…" value={query} onChange={e => setQuery(e.target.value)} />
              </div>
              <div className="adm-table-wrap">
                <table>
                  <thead>
                    <tr><th>Nombre y correo</th><th>Rol</th><th>Estado</th><th>Registro</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {matches.map(p => (
                      <tr key={p.id}>
                        <td><strong>{p.nombre_completo}</strong><small>{p.correo}</small></td>
                        <td>{p.rol}</td>
                        <td><span className={`adm-status ${p.estado.toLowerCase()}`}>{p.estado}</span></td>
                        <td>{shortDate(p.creado_en)}</td>
                        <td className="adm-actions">
                          {p.rol === 'TECNICO' && <button className="adm-btn" disabled={detailLoading} onClick={() => openDetail(p.id)}>Ver ficha</button>}
                          {['CLIENTE', 'TECNICO'].includes(p.rol) && (
                            <>
                              <button className="adm-btn" onClick={() => setEditing({ ...p })}>Editar</button>
                              {p.estado === 'ACTIVO' ? (
                                <button
                                  className="adm-btn reject"
                                  disabled={busy}
                                  onClick={() => window.confirm(`¿Desactivar la cuenta de ${p.nombre_completo}?`) && action(() => adminApi.desactivarUsuario(p.id))}
                                >
                                  Desactivar
                                </button>
                              ) : (
                                <button
                                  className="adm-btn approve"
                                  disabled={busy}
                                  onClick={() => action(() => adminApi.actualizarUsuario(p.id, { ...p, estado: 'ACTIVO' }))}
                                >
                                  Reactivar
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!matches.length && <tr><td colSpan="5">No se encontraron usuarios.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="adm-card adm-form-card">
              <h2>Agregar un nuevo usuario o técnico</h2>
              <form onSubmit={async e => {
                e.preventDefault();
                if (await action(() => adminApi.crearUsuario(newUser), 'Cuenta creada. Los técnicos nuevos quedan pendientes de revisión.')) {
                  setNewUser(blankUser);
                }
              }}>
                <div className="adm-form-grid">
                  <label>Nombre completo<input required minLength="2" value={newUser.nombre_completo} onChange={e => setNewUser({ ...newUser, nombre_completo: e.target.value })} /></label>
                  <label>Correo electrónico<input required type="email" value={newUser.correo} onChange={e => setNewUser({ ...newUser, correo: e.target.value })} /></label>
                  <label>Teléfono<input value={newUser.telefono} onChange={e => setNewUser({ ...newUser, telefono: e.target.value })} /></label>
                  <label>Contraseña temporal<input required minLength="8" type="password" autoComplete="new-password" value={newUser.contrasena} onChange={e => setNewUser({ ...newUser, contrasena: e.target.value })} /></label>
                  <label>Tipo de cuenta
                    <select value={newUser.rol} onChange={e => setNewUser({ ...newUser, rol: e.target.value })}>
                      <option value="CLIENTE">Cliente</option>
                      <option value="TECNICO">Técnico</option>
                    </select>
                  </label>
                </div>
                <button className="adm-primary" disabled={busy}>Crear cuenta</button>
              </form>
            </section>
          </>
        )}

        {tab === 'triaje' && (
          <>
            <section className="adm-card adm-form-card">
              <h2>Crear pregunta</h2>
              <form onSubmit={async e => {
                e.preventDefault();
                const tipoActual = newQuestion.tipo_equipo_codigo || 'LAPTOP';
                const ordenSiguiente = questions.filter(q => (q.tipo_equipo_codigo || 'GENERAL') === tipoActual).length + 1;
                if (await action(() => adminApi.crearPregunta({
                  ...newQuestion,
                  tipo_equipo_codigo: tipoActual,
                  nro_orden: Number(newQuestion.nro_orden)
                }))) {
                  setNewQuestion({ tipo_equipo_codigo: tipoActual, texto: '', nro_orden: ordenSiguiente + 1 });
                }
              }}>
                <div className="adm-form-grid">
                  <label>Tipo de equipo
                    <select
                      value={newQuestion.tipo_equipo_codigo}
                      onChange={e => {
                        const codigo = e.target.value;
                        const siguiente = questions.filter(q => (q.tipo_equipo_codigo || 'GENERAL') === codigo).length + 1;
                        setNewQuestion({ ...newQuestion, tipo_equipo_codigo: codigo, nro_orden: siguiente });
                      }}
                    >
                      {deviceTypes.map(t => (
                        <option key={t.codigo} value={t.codigo}>{t.nombre}</option>
                      ))}
                    </select>
                  </label>
                  <label className="adm-wide">Texto de la pregunta
                    <input required value={newQuestion.texto} onChange={e => setNewQuestion({ ...newQuestion, texto: e.target.value })} />
                  </label>
                  <label>Orden
                    <input type="number" min="1" max="32767" required value={newQuestion.nro_orden} onChange={e => setNewQuestion({ ...newQuestion, nro_orden: e.target.value })} />
                  </label>
                </div>
                <button disabled={busy} className="adm-primary">Agregar pregunta</button>
              </form>
            </section>

            <section className="adm-card">
              <div className="adm-card-heading">
                <div>
                  <h2>Cuestionarios por equipo</h2>
                  <p>Filtra las preguntas según el tipo de dispositivo del cliente.</p>
                </div>
                <span className="adm-chip">{visibleQuestions.length} preguntas</span>
              </div>
              <div className="adm-doc-filters">
                {[{ codigo: 'TODOS', nombre: 'Todos' }, ...deviceTypes].map(t => {
                  const count = t.codigo === 'TODOS'
                    ? questions.length
                    : questions.filter(q => (q.tipo_equipo_codigo || 'GENERAL') === t.codigo).length;
                  return (
                    <button
                      key={t.codigo}
                      type="button"
                      className={`adm-btn ${triajeFilter === t.codigo ? 'adm-filter-active' : ''}`}
                      onClick={() => setTriajeFilter(t.codigo)}
                      aria-pressed={triajeFilter === t.codigo}
                    >
                      {t.nombre} ({count})
                    </button>
                  );
                })}
              </div>
            </section>

            {visibleQuestions.map(q => {
              const tipoPregunta = q.tipo_equipo_codigo || 'GENERAL';
              const preguntasMismoEquipo = questions.filter(p => (p.tipo_equipo_codigo || 'GENERAL') === tipoPregunta);
              return (
                <section className="adm-card adm-question" key={q.id}>
                  <div className="adm-card-heading">
                    <div>
                      <span className="adm-top-kicker">{deviceLabel(tipoPregunta)} · ORDEN {q.nro_orden}</span>
                      <h2>{q.texto}</h2>
                      <p>{q.opciones.length} opciones · {Number(q.activa) ? 'Visible' : 'Oculta'}</p>
                    </div>
                    <button
                      className="adm-btn"
                      onClick={() => {
                        setExpanded(expanded === q.id ? null : q.id);
                        setOptionDraft(initialOption);
                      }}
                    >
                      {expanded === q.id ? 'Cerrar' : 'Editar pregunta'}
                    </button>
                  </div>

                  {expanded === q.id && (
                    <div className="adm-question-editor">
                      <form onSubmit={e => {
                        e.preventDefault();
                        const data = new FormData(e.currentTarget);
                        action(() => adminApi.actualizarPregunta(q.id, {
                          tipo_equipo_codigo: data.get('tipo_equipo_codigo'),
                          texto: data.get('texto'),
                          nro_orden: Number(data.get('nro_orden')),
                          activa: data.get('activa') === 'on'
                        }));
                      }}>
                        <label>Pregunta
                          <textarea name="texto" key={q.id + q.texto} defaultValue={q.texto} required />
                        </label>
                        <div className="adm-inline">
                          <label>Tipo de equipo
                            <select name="tipo_equipo_codigo" key={q.id + tipoPregunta} defaultValue={tipoPregunta}>
                              {deviceTypes.map(t => (
                                <option key={t.codigo} value={t.codigo}>{t.nombre}</option>
                              ))}
                            </select>
                          </label>
                          <label>Orden
                            <input name="nro_orden" type="number" min="1" max="32767" defaultValue={q.nro_orden} required />
                          </label>
                          <label className="adm-check">
                            <input type="checkbox" name="activa" defaultChecked={Boolean(Number(q.activa))} /> Pregunta activa
                          </label>
                          <button className="adm-primary" disabled={busy}>Guardar pregunta</button>
                        </div>
                      </form>

                      <h3>Opciones de respuesta</h3>
                      {q.opciones.map(o => (
                        <OptionEditor
                          key={`${o.id}-${o.texto}-${o.peso}-${o.siguiente_pregunta_id || ''}-${o.categoria_id || ''}`}
                          option={o}
                          question={q}
                          questions={preguntasMismoEquipo}
                          categories={categories}
                          busy={busy}
                          save={datos => action(() => adminApi.actualizarOpcion(o.id, datos), 'Opción actualizada.')}
                        />
                      ))}

                      <form
                        className="adm-option-form"
                        onSubmit={async e => {
                          e.preventDefault();
                          if (await action(() => adminApi.crearOpcion(q.id, { ...optionDraft, peso: Number(optionDraft.peso) }), 'Opción agregada.')) {
                            setOptionDraft(initialOption);
                          }
                        }}
                      >
                        <h3>Agregar opción</h3>
                        <label>Respuesta
                          <input required placeholder="Nueva respuesta" value={optionDraft.texto} onChange={e => setOptionDraft({ ...optionDraft, texto: e.target.value })} />
                        </label>
                        <div className="adm-form-grid">
                          <label>Peso
                            <input type="number" min="-32768" max="32767" value={optionDraft.peso} onChange={e => setOptionDraft({ ...optionDraft, peso: e.target.value })} />
                          </label>
                          <label>Ir a la siguiente pregunta
                            <select value={optionDraft.siguiente_pregunta_id} onChange={e => setOptionDraft({ ...optionDraft, siguiente_pregunta_id: e.target.value })}>
                              <option value="">Finalizar triaje</option>
                              {preguntasMismoEquipo.filter(p => p.id !== q.id && Number(p.activa)).map(p => (
                                <option key={p.id} value={p.id}>{p.texto}</option>
                              ))}
                            </select>
                          </label>
                          <label>Categoría asociada
                            <select value={optionDraft.categoria_id} onChange={e => setOptionDraft({ ...optionDraft, categoria_id: e.target.value })}>
                              <option value="">Sin categoría</option>
                              {categories.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                          </label>
                        </div>
                        <button className="adm-primary" disabled={busy}>Agregar opción</button>
                      </form>
                    </div>
                  )}
                </section>
              );
            })}
          </>
        )}

        {editing && (
          <div className="adm-modal-cover" role="presentation" onMouseDown={() => setEditing(null)}>
            <div className="adm-modal" role="dialog" aria-modal="true" aria-label="Editar usuario" onMouseDown={e => e.stopPropagation()}>
              <div className="adm-card-heading">
                <h2>Editar cuenta</h2>
                <button className="adm-btn" onClick={() => setEditing(null)}>Cerrar ×</button>
              </div>
              <form onSubmit={async e => {
                e.preventDefault();
                if (await action(() => adminApi.actualizarUsuario(editing.id, editing))) setEditing(null);
              }}>
                <label>Nombre completo<input required value={editing.nombre_completo} onChange={e => setEditing({ ...editing, nombre_completo: e.target.value })} /></label>
                <label>Correo electrónico<input required type="email" value={editing.correo} onChange={e => setEditing({ ...editing, correo: e.target.value })} /></label>
                <label>Teléfono<input value={editing.telefono || ''} onChange={e => setEditing({ ...editing, telefono: e.target.value })} /></label>
                <label>Estado
                  <select value={editing.estado} onChange={e => setEditing({ ...editing, estado: e.target.value })}>
                    <option value="ACTIVO">Activo</option>
                    <option value="INACTIVO">Inactivo</option>
                  </select>
                </label>
                <button className="adm-primary" disabled={busy}>Guardar cambios</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OptionEditor({ option, question, questions, categories, busy, save }) {
  const [draft, setDraft] = useState({
    texto: option.texto,
    peso: option.peso,
    siguiente_pregunta_id: option.siguiente_pregunta_id || '',
    categoria_id: option.categoria_id || ''
  });

  return (
    <form className="adm-option-editor" onSubmit={e => { e.preventDefault(); save({ ...draft, peso: Number(draft.peso) }); }}>
      <label>Respuesta<input required value={draft.texto} onChange={e => setDraft({ ...draft, texto: e.target.value })} /></label>
      <label>Peso<input type="number" min="-32768" max="32767" value={draft.peso} onChange={e => setDraft({ ...draft, peso: e.target.value })} /></label>
      <label>Siguiente pregunta
        <select value={draft.siguiente_pregunta_id} onChange={e => setDraft({ ...draft, siguiente_pregunta_id: e.target.value })}>
          <option value="">Fin</option>
          {questions
            .filter(p => p.id !== question.id && (Number(p.activa) || p.id === draft.siguiente_pregunta_id))
            .map(p => <option key={p.id} value={p.id}>{p.texto}</option>)}
        </select>
      </label>
      <label>Categoría
        <select value={draft.categoria_id} onChange={e => setDraft({ ...draft, categoria_id: e.target.value })}>
          <option value="">Ninguna</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </label>
      <button className="adm-btn" disabled={busy}>Guardar</button>
    </form>
  );
}

function DocumentTable({ docs, busy, download, decide, openDetail }) {
  return (
    <div className="adm-table-wrap">
      <table>
        <thead>
          <tr>{openDetail && <th>Técnico</th>}<th>Documento</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          {docs.map(d => (
            <tr key={d.id}>
              {openDetail && (
                <td>
                  <button className="adm-btn" onClick={() => openDetail(d.tecnico_id)}>{d.nombre_completo}</button>
                  <small>{d.correo}</small>
                </td>
              )}
              <td><strong>{d.tipo}</strong></td>
              <td><span className={`adm-status ${d.estado?.toLowerCase()}`}>{d.estado}</span></td>
              <td>{shortDate(d.creado_en)}</td>
              <td className="adm-actions">
                <button className="adm-btn" onClick={() => download(d)}>Descargar</button>
                {d.estado === 'PENDIENTE' && (
                  <>
                    <button disabled={busy} className="adm-btn approve" onClick={() => decide(d, 'APROBADO')}>Aprobar</button>
                    <button disabled={busy} className="adm-btn reject" onClick={() => decide(d, 'RECHAZADO')}>Rechazar</button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {!docs.length && <tr><td colSpan={openDetail ? 5 : 4}>No hay documentos en este listado.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}