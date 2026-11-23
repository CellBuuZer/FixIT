import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import './DashboardTecnico.css'

const RAW_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
const BASE_URL = RAW_API_URL.replace(/\/api$/, '')

const FORM_INICIAL = {
    nombre: '', telefono: '', biografia: '', anios_experiencia: '',
    tarifa_hora_min: '', tarifa_hora_max: '', distrito_id: '',
    calle: '', referencia: '', latitud: null, longitud: null,
    avatar: null, avatarPreview: null
}

async function peticionApi(endpoint, { body, headers: extraHeaders, signal, method = 'GET' } = {}) {
    const token = localStorage.getItem('fixit_token')
    const esFormData = body instanceof FormData
    const headers = {
        ...(esFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extraHeaders
    }
    const respuesta = await fetch(`${RAW_API_URL}${endpoint}`, { method, headers, body, signal })
    const json = await respuesta.json().catch(() => ({}))
    if (!respuesta.ok || json.success === false || json.ok === false) {
        throw new Error(json.message || 'Ocurrió un error en la solicitud.')
    }
    return json
}

function getAvatarUrl(url) {
    if (!url) return null
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    if (url.startsWith('/uploads')) return `${BASE_URL}${url}`
    return url
}

function DashboardTecnico() {
    const navigate = useNavigate()
    const [perfil, setPerfil] = useState(null)
    const [cargando, setCargando] = useState(true)
    const [error, setError] = useState('')

    const [vistaActual, setVistaActual] = useState('resumen')
    const [solicitudes, setSolicitudes] = useState([])
    const [errorSolicitudes, setErrorSolicitudes] = useState('')
    const [cargaSolicitudes, setCargaSolicitudes] = useState(true)
    const [filtroSolicitudes, setFiltroSolicitudes] = useState('TODAS')
    const [procesandoSolicitud, setProcesandoSolicitud] = useState(null)
    const [avisoSolicitud, setAvisoSolicitud] = useState('')

    const [distritosDisponibles, setDistritosDisponibles] = useState([])
    const [distritosSeleccionados, setDistritosSeleccionados] = useState([])
    const [modalidadesDisponibles, setModalidadesDisponibles] = useState([])
    const [modalidadesSeleccionadas, setModalidadesSeleccionadas] = useState([])

    const [formData, setFormData] = useState(FORM_INICIAL)
    const [mensajeExito, setMensajeExito] = useState('')
    const [passwordData, setPasswordData] = useState({ actual: '', nueva: '', confirmar: '' })
    const [mensajePassword, setMensajePassword] = useState('')
    const [certData, setCertData] = useState({ nombre: '', tipo: 'TITULO', archivo: null })
    const [mensajeCert, setMensajeCert] = useState('')

    const pendientes = solicitudes.filter(s => s.estado === 'PENDIENTE').length

    const aplicarDatosPerfil = useCallback((data) => {
        setPerfil(data)
        setFormData({
            nombre: data.nombre || '',
            telefono: data.telefono || '',
            biografia: data.biografia || '',
            anios_experiencia: data.anios_experiencia || '',
            tarifa_hora_min: data.tarifa_hora_min || '',
            tarifa_hora_max: data.tarifa_hora_max || '',
            distrito_id: data.distrito_id || '',
            calle: data.calle || '',
            referencia: data.referencia || '',
            latitud: data.latitud || null,
            longitud: data.longitud || null,
            avatar: null,
            avatarPreview: null
        })
        if (Array.isArray(data.cobertura)) {
            setDistritosSeleccionados(data.cobertura.map(d => d.distrito_id || d.id))
        }
        if (Array.isArray(data.modalidades)) {
            setModalidadesSeleccionadas(data.modalidades.map(m => m.modalidad_id || m.id))
        }
    }, [])

    const handleCerrarSesion = useCallback(() => {
        localStorage.removeItem('fixit_token')
        localStorage.removeItem('fixit_user')
        navigate('/login')
    }, [navigate])

    // Limpiar URL temporal de vista previa de avatar al cambiar o desmontar
    useEffect(() => {
        const preview = formData.avatarPreview
        return () => { if (preview) URL.revokeObjectURL(preview) }
    }, [formData.avatarPreview])

    useEffect(() => {
        const token = localStorage.getItem('fixit_token')
        if (!token) { navigate('/login'); return }

        let activo = true
        ;(async () => {
            try {
                const [jsonPerfil, jsonDistritos, jsonModalidades] = await Promise.all([
                    peticionApi('/tecnicos/me'),
                    peticionApi('/distritos').catch(() => ({ data: [] })),
                    peticionApi('/tecnicos/modalidades').catch(() => ({ data: [] }))
                ])
                if (!activo) return
                aplicarDatosPerfil(jsonPerfil.data)
                if (jsonDistritos.data) setDistritosDisponibles(jsonDistritos.data)
                if (jsonModalidades.data) setModalidadesDisponibles(jsonModalidades.data)
            } catch (err) {
                if (activo) setError(err.message)
            } finally {
                if (activo) setCargando(false)
            }
        })()
        return () => { activo = false }
    }, [navigate, aplicarDatosPerfil])

    useEffect(() => {
        if (!perfil || procesandoSolicitud) return
        const controller = new AbortController()
        let timer

        const cargar = async () => {
            try {
                const json = await peticionApi('/citas/mis-solicitudes', { signal: controller.signal })
                if (!Array.isArray(json.data)) throw new Error('No se pudieron cargar las solicitudes.')
                if (!controller.signal.aborted) { setSolicitudes(json.data); setErrorSolicitudes('') }
            } catch (err) {
                if (!controller.signal.aborted && err.name !== 'AbortError') setErrorSolicitudes(err.message)
            } finally {
                if (!controller.signal.aborted) {
                    setCargaSolicitudes(false)
                    timer = setTimeout(cargar, 30000)
                }
            }
        }

        cargar()
        return () => { controller.abort(); clearTimeout(timer) }
    }, [perfil, vistaActual, procesandoSolicitud])

    useEffect(() => {
        if (!mensajeExito && !mensajePassword) return
        const target = document.querySelector('.tech-main-content') || window
        target.scrollTo({ top: 0, behavior: 'smooth' })
    }, [mensajeExito, mensajePassword])

    async function decidirSolicitud(id, estado) {
        const msg = estado === 'CONFIRMADA' ? '¿Confirmar esta solicitud?' : '¿Rechazar esta solicitud?'
        if (procesandoSolicitud || !window.confirm(msg)) return
        setProcesandoSolicitud(id); setAvisoSolicitud(''); setErrorSolicitudes('')
        try {
            const json = await peticionApi(`/citas/${encodeURIComponent(id)}/decision`, {
                method: 'PATCH',
                body: JSON.stringify({ estado })
            })
            setSolicitudes(prev => prev.map(s => s.id === id ? { ...s, estado: json.data.estado } : s))
            setAvisoSolicitud('Solicitud actualizada correctamente.')
        } catch (err) {
            setErrorSolicitudes(err.message)
        } finally {
            setProcesandoSolicitud(null)
        }
    }

    const handleInputChange = (e) => {
        const { name, value } = e.target
        if (name === 'nombre' && !/^[a-zA-ZÀ-ÿ\s]*$/.test(value)) return
        if (name === 'telefono' && (!/^[0-9]*$/.test(value) || value.length > 9)) return
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const capturarUbicacionTaller = () => {
        if (!navigator.geolocation) {
            setError('Tu navegador no soporta geolocalización.')
            return
        }
        setMensajeExito('Obteniendo ubicación GPS...')
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setFormData(prev => ({
                    ...prev,
                    latitud: position.coords.latitude,
                    longitud: position.coords.longitude
                }))
                setMensajeExito('¡Coordenadas del taller capturadas con éxito!')
                setTimeout(() => setMensajeExito(''), 3000)
            },
            (err) => {
                console.error('Error GPS:', err)
                setError('No se pudo obtener la ubicación. Verifica los permisos de tu navegador.')
            },
            { enableHighAccuracy: true }
        )
    }

    const toggleSeleccion = (id, setter) => {
        setter(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
    }

    const refrescarPerfil = async () => {
        const jsonPerfil = await peticionApi('/tecnicos/me')
        if (jsonPerfil.success) aplicarDatosPerfil(jsonPerfil.data)
    }

    const handleGuardarPerfil = async (e) => {
        e.preventDefault()
        setError(''); setMensajeExito('')

        const dataToSend = new FormData()
        const campos = [
            'nombre', 'telefono', 'biografia', 'anios_experiencia',
            'tarifa_hora_min', 'tarifa_hora_max', 'distrito_id', 'calle'
        ]
        campos.forEach(campo => dataToSend.append(campo, formData[campo]))
        dataToSend.append('referencia', formData.referencia || '')
        if (formData.latitud) dataToSend.append('latitud', formData.latitud)
        if (formData.longitud) dataToSend.append('longitud', formData.longitud)
        dataToSend.append('cobertura', JSON.stringify(distritosSeleccionados))
        dataToSend.append('modalidades', JSON.stringify(modalidadesSeleccionadas))
        if (formData.avatar) dataToSend.append('avatar', formData.avatar)

        try {
            await peticionApi('/tecnicos/me', { method: 'PUT', body: dataToSend })
            setMensajeExito('¡Perfil, dirección y modalidades actualizados con éxito!')
            await refrescarPerfil()
            setTimeout(() => setMensajeExito(''), 4000)
        } catch (err) {
            setError(err.message)
        }
    }

    const handleActualizarPassword = (e) => {
        e.preventDefault()
        setMensajePassword('')
        if (!passwordData.actual || !passwordData.nueva || !passwordData.confirmar) {
            setMensajePassword('⚠️ Completa todos los campos de contraseña.')
            return
        }
        if (passwordData.nueva !== passwordData.confirmar) {
            setMensajePassword('⚠️ Las nuevas contraseñas no coinciden.')
            return
        }
        setMensajePassword('✅ Contraseña actualizada correctamente.')
        setPasswordData({ actual: '', nueva: '', confirmar: '' })
        setTimeout(() => setMensajePassword(''), 4000)
    }

    const handleSubirCertificado = async (e) => {
        e.preventDefault()
        setMensajeCert('')
        if (!certData.archivo) {
            setMensajeCert('⚠️ Por favor selecciona un archivo PDF o imagen.')
            return
        }

        const dataToSend = new FormData()
        dataToSend.append('nombre', certData.nombre)
        dataToSend.append('tipo', certData.tipo)
        dataToSend.append('archivo', certData.archivo)

        try {
            const json = await peticionApi('/tecnicos/me/certificaciones', { method: 'POST', body: dataToSend })
            setMensajeCert(`✅ ${json.message}`)
            setCertData({ nombre: '', tipo: 'TITULO', archivo: null })
            await refrescarPerfil()
            setTimeout(() => setMensajeCert(''), 4000)
        } catch (err) {
            setMensajeCert(`⚠️ ${err.message || 'No se pudo subir el documento.'}`)
        }
    }

    if (cargando) return <div className="dashboard-loading"><h2>Cargando tu espacio de trabajo...</h2></div>
    if (error) return <div className="dashboard-error"><h2>Error</h2><p>{error}</p><button onClick={handleCerrarSesion} className="btn-retry">Volver</button></div>

    const solicitudesFiltradas = solicitudes.filter(s => filtroSolicitudes === 'TODAS' || s.estado === filtroSolicitudes)

    return (
        <div className="tech-layout">
            <aside className="tech-sidebar">
                <div className="sidebar-brand">
                    <h2>FixIT Pro</h2>
                    <span className="brand-badge">Panel de Especialista</span>
                </div>
                <nav className="sidebar-nav">
                    {[
                        ['resumen', '📊 Mi Resumen'],
                        ['trabajos', '🛠️ Solicitudes'],
                        ['documentos', '📁 Mis Certificados'],
                        ['perfil', '⚙️ Editar Perfil'],
                        ['seguridad', '🔒 Seguridad']
                    ].map(([id, label]) => (
                        <button
                            key={id}
                            className={`nav-item ${vistaActual === id ? 'active' : ''}`}
                            onClick={() => setVistaActual(id)}
                        >
                            {label}
                            {id === 'trabajos' && pendientes > 0 && <span className="ts-count">{pendientes}</span>}
                        </button>
                    ))}
                </nav>
                <div className="sidebar-footer">
                    <div className="sidebar-user-mini" title={perfil.nombre}>{perfil.nombre}</div>
                    <button onClick={handleCerrarSesion} className="btn-logout-sidebar">Cerrar Sesión</button>
                </div>
            </aside>

            <main className="tech-main-content">
                {vistaActual === 'resumen' && (
                    <div className="fade-in">
                        {perfil.estado_verificacion === 'PENDIENTE' && (
                            <div className="verification-banner">
                                <h3 className="banner-title">⚠️ Destaca en el catálogo</h3>
                                <p className="banner-text">Tu cuenta está activa como <strong>Técnico Estándar</strong>. Sube tus certificados o antecedentes para obtener la insignia de <strong>Técnico Verificado</strong>.</p>
                                <button className="btn-verify" onClick={() => setVistaActual('documentos')}>Subir Documentos</button>
                            </div>
                        )}

                        {pendientes > 0 && (
                            <div className="ts-banner">
                                <div><strong>{pendientes} solicitudes pendientes</strong><p>Revisa los servicios que te han solicitado.</p></div>
                                <button type="button" className="ts-primary" onClick={() => setVistaActual('trabajos')}>Ver solicitudes →</button>
                            </div>
                        )}
                        {errorSolicitudes && <p className="ts-error" role="alert">No se pudo actualizar la bandeja: {errorSolicitudes}</p>}

                        <div className="dashboard-grid">
                            <aside className="profile-sidebar">
                                <div className="avatar-wrapper">
                                    {perfil.avatar_url ? (
                                        <img src={getAvatarUrl(perfil.avatar_url)} alt="Avatar" className="avatar-img" />
                                    ) : (
                                        <span className="avatar-initial">{perfil.nombre.charAt(0).toUpperCase()}</span>
                                    )}
                                </div>
                                <h2 className="profile-name">{perfil.nombre}</h2>
                                <p className="profile-email">{perfil.correo}</p>
                                <p className="profile-phone" style={{ marginTop: '0.4rem', color: '#4b5563', fontSize: '0.9rem' }}>📱 {perfil.telefono || 'Sin teléfono registrado'}</p>
                                <div className="status-container">
                                    <span className={`status-badge ${perfil.estado === 'ACTIVO' ? 'status-active' : 'status-inactive'}`}>
                                        Estado: {perfil.estado}
                                    </span>
                                </div>
                            </aside>

                            <section className="metrics-panel">
                                <h3 className="section-title">Resumen de Actividad</h3>
                                <div className="stats-grid">
                                    <div className="stat-card">
                                        <p className="stat-label">CALIFICACIÓN</p>
                                        <h2 className="stat-value text-blue">⭐ {perfil.calificacion ? perfil.calificacion.toFixed(1) : '0.0'}</h2>
                                        <p className="stat-subtext">{perfil.resenas || 0} reseñas</p>
                                    </div>
                                    <div className="stat-card">
                                        <p className="stat-label">MI TARIFA</p>
                                        <h2 className="stat-value text-green">S/ {perfil.tarifa_hora_min ? Number(perfil.tarifa_hora_min).toFixed(2) : '0.00'}</h2>
                                        <p className="stat-subtext">Por hora base</p>
                                    </div>
                                    <div className="stat-card">
                                        <p className="stat-label">CERTIFICADOS</p>
                                        <h2 className="stat-value text-purple">{perfil.certificaciones?.length || 0}</h2>
                                        <p className="stat-subtext">Registrados (Máx. 5)</p>
                                    </div>
                                </div>
                            </section>
                        </div>

                        <div className="tech-card" style={{ marginTop: '2rem' }}>
                            <h3 className="section-title" style={{ marginTop: 0 }}>📋 Información Detallada de tu Perfil</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                                <div>
                                    <h4 style={{ color: '#374151', marginBottom: '0.5rem', fontSize: '1rem' }}>💡 Biografía / Especialidades</h4>
                                    <p style={{ color: '#6b7280', fontSize: '0.95rem', lineHeight: '1.5', background: '#f9fafb', padding: '1rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                        {perfil.biografia || 'Aún no has agregado una biografía.'}
                                    </p>
                                    <p style={{ marginTop: '1rem', color: '#374151', fontSize: '0.95rem' }}>
                                        <strong>Experiencia:</strong> {perfil.anios_experiencia ? `${perfil.anios_experiencia} años` : 'No especificado'}
                                    </p>
                                </div>

                                <div>
                                    <h4 style={{ color: '#374151', marginBottom: '0.5rem', fontSize: '1rem' }}>📍 Dirección de tu Taller Base</h4>
                                    <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.95rem', color: '#4b5563' }}>
                                        <p><strong>Distrito:</strong> {perfil.nombre_distrito || perfil.distrito_nombre || 'No asignado'}</p>
                                        <p style={{ marginTop: '0.4rem' }}><strong>Calle:</strong> {perfil.calle || 'No especificada'}</p>
                                        {perfil.referencia && <p style={{ marginTop: '0.4rem' }}><strong>Referencia:</strong> {perfil.referencia}</p>}
                                        <p style={{ marginTop: '0.4rem', color: perfil.latitud ? '#10b981' : '#9ca3af' }}>
                                            {perfil.latitud ? '✓ GPS Sincronizado' : '⚠️ GPS no configurado'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                                <div>
                                    <h4 style={{ color: '#374151', marginBottom: '0.5rem', fontSize: '1rem' }}>🏠 Modalidades de Servicio</h4>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        {perfil.modalidades?.length > 0 ? (
                                            perfil.modalidades.map((mod, i) => (
                                                <span key={i} style={{ background: '#e0f2fe', color: '#0369a1', padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: '600' }}>
                                                    ✓ {mod.nombre || mod.nombre_modalidad}
                                                </span>
                                            ))
                                        ) : <p className="empty-text">No has seleccionado modalidades.</p>}
                                    </div>
                                </div>

                                <div>
                                    <h4 style={{ color: '#374151', marginBottom: '0.5rem', fontSize: '1rem' }}>🗺️ Distritos de Cobertura</h4>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', maxHeight: '120px', overflowY: 'auto' }}>
                                        {perfil.cobertura?.length > 0 ? (
                                            perfil.cobertura.map((cob, i) => (
                                                <span key={i} style={{ background: '#f3f4f6', color: '#374151', padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', border: '1px solid #d1d5db' }}>
                                                    {cob.nombre || cob.nombre_distrito}
                                                </span>
                                            ))
                                        ) : <p className="empty-text">No has seleccionado distritos de cobertura.</p>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {vistaActual === 'trabajos' && (
                    <div className="fade-in">
                        <div className="ts-heading">
                            <div><h2>Bandeja de solicitudes</h2><p>Gestiona las reservas de tus clientes.</p></div>
                            <span className="ts-pill pendiente">{pendientes} pendientes</span>
                        </div>
                        <div className="ts-filters" aria-label="Filtrar solicitudes">
                            {[['TODAS', 'Todas'], ['PENDIENTE', 'Pendientes'], ['CONFIRMADA', 'Confirmadas'], ['RECHAZADA', 'Rechazadas']].map(([val, label]) => (
                                <button type="button" key={val} aria-pressed={filtroSolicitudes === val} onClick={() => setFiltroSolicitudes(val)}>{label}</button>
                            ))}
                        </div>
                        {avisoSolicitud && <p className="alert-success" role="status">{avisoSolicitud}</p>}
                        {errorSolicitudes && <p className="ts-error" role="alert">{errorSolicitudes}</p>}
                        {cargaSolicitudes ? (
                            <div className="tray-box">Cargando solicitudes…</div>
                        ) : (
                            <div className="ts-list">
                                {solicitudesFiltradas.map(s => (
                                    <article className="ts-card" key={s.id}>
                                        <div className="ts-head">
                                            <div className="ts-avatar">{s.cliente_nombre?.charAt(0) || 'C'}</div>
                                            <div><h3>{s.cliente_nombre}</h3><p>Solicitud #{s.id.slice(0, 8)}</p></div>
                                            <span className={`ts-pill ${s.estado.toLowerCase()}`}>{s.estado}</span>
                                        </div>
                                        <p className="ts-description">{s.incidencia_descripcion}</p>
                                        <dl className="ts-details">
                                            <div><dt>Modalidad</dt><dd>{s.modalidad}</dd></div>
                                            <div><dt>Fecha y hora (Perú)</dt><dd>{s.inicia_en}</dd></div>
                                            <div><dt>Tarifa estimada</dt><dd>S/ {Number(s.precio_est_min).toFixed(2)} – {Number(s.precio_est_max).toFixed(2)}</dd></div>
                                        </dl>
                                        {s.estado === 'PENDIENTE' && (
                                            <div className="ts-actions">
                                                <button type="button" className="ts-reject" disabled={!!procesandoSolicitud} onClick={() => decidirSolicitud(s.id, 'RECHAZADA')}>Rechazar</button>
                                                <button type="button" className="ts-primary" disabled={!!procesandoSolicitud || !s.puede_confirmar} onClick={() => decidirSolicitud(s.id, 'CONFIRMADA')}>Aceptar solicitud</button>
                                                {!s.puede_confirmar && <small>La fecha de esta reserva ya pasó.</small>}
                                            </div>
                                        )}
                                    </article>
                                ))}
                                {!errorSolicitudes && !solicitudesFiltradas.length && (
                                    <div className="tray-box">No tienes solicitudes en esta categoría.</div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {vistaActual === 'documentos' && (
                    <div className="fade-in">
                        <h2 className="section-title">Gestión de Certificados y Antecedentes (Seguridad)</h2>
                        {mensajeCert && (
                            <div className={mensajeCert.includes('✅') ? 'alert-success' : 'alert-warning'}>{mensajeCert}</div>
                        )}

                        <div className="tech-card">
                            <p className="form-description">
                                Sube tus títulos técnicos, constancias o tu certificado de <strong>Antecedentes Policiales/Penales</strong> en formato PDF, JPG o PNG (Máximo 5 documentos en total). El administrador revisará tus archivos para otorgarte la insignia de confianza.
                            </p>
                            <form onSubmit={handleSubirCertificado}>
                                <div className="form-grid-2">
                                    <div>
                                        <label className="form-label">Nombre del Documento</label>
                                        <input type="text" placeholder="Ej: Certificado Policial / Título ISIL" value={certData.nombre} onChange={(e) => setCertData(prev => ({ ...prev, nombre: e.target.value }))} className="form-input" required />
                                    </div>
                                    <div>
                                        <label className="form-label">Tipo de Documento</label>
                                        <select value={certData.tipo} onChange={(e) => setCertData(prev => ({ ...prev, tipo: e.target.value }))} className="form-input">
                                            <option value="TITULO">Diploma / Título Técnico</option>
                                            <option value="EXPERIENCIA">Constancia de Trabajo</option>
                                            <option value="ANTECEDENTES">Certificado de Antecedentes</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="file-dropzone">
                                    <p className="file-dropzone-text">Selecciona tu archivo en PDF o Imagen (Máx. 5MB)</p>
                                    <input type="file" accept=".pdf,image/png,image/jpeg,image/jpg" onChange={(e) => setCertData(prev => ({ ...prev, archivo: e.target.files[0] }))} className="file-input-center" required />
                                </div>
                                <button type="submit" className="btn-submit">Subir Documento para Validación</button>
                            </form>
                        </div>

                        <div className="tech-card">
                            <h4 className="list-title">Documentos registrados ({perfil.certificaciones?.length || 0} / 5):</h4>
                            {perfil.certificaciones?.length > 0 ? (
                                <ul className="cert-list">
                                    {perfil.certificaciones.map((cert, idx) => (
                                        <li key={idx} className="cert-list-item">
                                            📁 <strong>{cert.tipo}</strong> — {cert.estado === 'APROBADO' ? '✅ Verificado por Admin' : '⏳ En revisión'}
                                        </li>
                                    ))}
                                </ul>
                            ) : <p className="empty-text">No has subido ningún documento todavía.</p>}
                        </div>
                    </div>
                )}

                {vistaActual === 'perfil' && (
                    <div className="fade-in">
                        <h2 className="section-title">Configuración y Edición de Perfil</h2>
                        {mensajeExito && <div className="alert-success">{mensajeExito}</div>}

                        <form onSubmit={handleGuardarPerfil} className="tech-card">
                            <div className="avatar-edit-section">
                                <div className="avatar-wrapper small">
                                    {formData.avatarPreview ? (
                                        <img src={formData.avatarPreview} alt="Vista previa" className="avatar-img" />
                                    ) : perfil.avatar_url ? (
                                        <img src={getAvatarUrl(perfil.avatar_url)} alt="Avatar actual" className="avatar-img" />
                                    ) : (
                                        <span className="avatar-initial small">{perfil.nombre.charAt(0).toUpperCase()}</span>
                                    )}
                                </div>
                                <div>
                                    <label className="form-label">Actualizar Foto de Perfil</label>
                                    <input
                                        type="file" name="avatar" accept="image/png, image/jpeg, image/jpg"
                                        onChange={(e) => {
                                            const file = e.target.files[0]
                                            if (file) setFormData(prev => ({ ...prev, avatar: file, avatarPreview: URL.createObjectURL(file) }))
                                        }}
                                        className="file-input-small"
                                    />
                                    <p className="form-hint">Formatos permitidos: JPG, PNG (Máx. 2MB)</p>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Correo Electrónico (No modificable)</label>
                                <input type="email" value={perfil.correo || ''} disabled className="form-input disabled" />
                            </div>

                            <div className="form-grid-2">
                                <div>
                                    <label className="form-label">Nombre y Apellidos</label>
                                    <input type="text" name="nombre" value={formData.nombre} onChange={handleInputChange} className="form-input" required />
                                </div>
                                <div>
                                    <label className="form-label">Número de Celular</label>
                                    <input type="text" name="telefono" value={formData.telefono} onChange={handleInputChange} className="form-input" required />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Breve Biografía / Especialidades</label>
                                <textarea name="biografia" rows="3" value={formData.biografia} onChange={handleInputChange} className="form-input" required />
                            </div>

                            <div className="form-grid-3">
                                <div>
                                    <label className="form-label">Años Experiencia</label>
                                    <input type="number" min="0" name="anios_experiencia" value={formData.anios_experiencia} onChange={handleInputChange} className="form-input" required />
                                </div>
                                <div>
                                    <label className="form-label">Tarifa Mín (S/)</label>
                                    <input type="number" step="0.01" min="0" name="tarifa_hora_min" value={formData.tarifa_hora_min} onChange={handleInputChange} className="form-input" required />
                                </div>
                                <div>
                                    <label className="form-label">Tarifa Máx (S/)</label>
                                    <input type="number" step="0.01" min="0" name="tarifa_hora_max" value={formData.tarifa_hora_max} onChange={handleInputChange} className="form-input" required />
                                </div>
                            </div>

                            <div className="cobertura-section" style={{ marginTop: '1.5rem', borderTop: '1px solid #e5e7eb', paddingTop: '1.5rem' }}>
                                <label className="cobertura-title">📍 Dirección de tu Taller Base</label>
                                <p className="cobertura-subtitle">Indica dónde está ubicado tu taller para calcular distancias exactas con los clientes.</p>

                                <div className="form-group" style={{ marginTop: '1rem' }}>
                                    <label className="form-label">Distrito del Taller</label>
                                    <select name="distrito_id" value={formData.distrito_id} onChange={handleInputChange} className="form-input" required>
                                        <option value="">Selecciona el distrito de tu taller...</option>
                                        {distritosDisponibles.map((distrito) => {
                                            const idDistrito = distrito.id || distrito.distrito_id
                                            const nombreDistrito = distrito.nombre || distrito.nombre_distrito
                                            return <option key={idDistrito} value={idDistrito}>{nombreDistrito}</option>
                                        })}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Dirección / Calle / Avenida del Taller</label>
                                    <input type="text" name="calle" value={formData.calle} onChange={handleInputChange} className="form-input" required placeholder="Ej. Av. Javier Prado Este 456" />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Referencia (Opcional)</label>
                                    <input type="text" name="referencia" value={formData.referencia} onChange={handleInputChange} className="form-input" placeholder="Ej. Frente a la estación del metropolitano" />
                                </div>

                                <div className="form-group" style={{ backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '8px', border: '1px dashed #d1d5db' }}>
                                    <label className="form-label">Coordenadas GPS de tu Taller</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                                        <button type="button" className="btn-secundario" onClick={capturarUbicacionTaller} style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: '#e5e7eb', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
                                            📍 Obtener ubicación actual por GPS
                                        </button>
                                        <span style={{ fontSize: '0.85rem', color: formData.latitud ? '#10b981' : '#6b7280', fontWeight: formData.latitud ? '600' : 'normal' }}>
                                            {formData.latitud && formData.longitud
                                                ? `✓ GPS Guardado: ${Number(formData.latitud).toFixed(5)}, ${Number(formData.longitud).toFixed(5)}`
                                                : 'Aún no has compartido la ubicación exacta de tu taller.'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="cobertura-section">
                                <label className="cobertura-title">🏠 Modalidad de Servicio (¿Cómo atiendes?)</label>
                                <p className="cobertura-subtitle">Selecciona las modalidades bajo las cuales ofreces soporte técnico.</p>
                                {modalidadesDisponibles.length === 0 ? (
                                    <p className="empty-text">Cargando modalidades...</p>
                                ) : (
                                    <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                                        {modalidadesDisponibles.map((mod) => {
                                            const idMod = mod.id || mod.modalidad_id
                                            return (
                                                <label key={idMod} className="distrito-label">
                                                    <input type="checkbox" checked={modalidadesSeleccionadas.includes(idMod)} onChange={() => toggleSeleccion(idMod, setModalidadesSeleccionadas)} className="distrito-checkbox" />
                                                    {mod.nombre}
                                                </label>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="cobertura-section">
                                <label className="cobertura-title">🗺️ Distritos de Cobertura (¿Dónde ofreces servicio?)</label>
                                <p className="cobertura-subtitle">Selecciona los distritos donde puedes desplazarte para atender a tus clientes.</p>
                                {distritosDisponibles.length === 0 ? (
                                    <p className="empty-text">Cargando distritos disponibles...</p>
                                ) : (
                                    <div className="distritos-grid">
                                        {distritosDisponibles.map((distrito) => {
                                            const idDistrito = distrito.id || distrito.distrito_id
                                            const nombreDistrito = distrito.nombre || distrito.nombre_distrito
                                            return (
                                                <label key={idDistrito} className="distrito-label">
                                                    <input type="checkbox" checked={distritosSeleccionados.includes(idDistrito)} onChange={() => toggleSeleccion(idDistrito, setDistritosSeleccionados)} className="distrito-checkbox" />
                                                    {nombreDistrito}
                                                </label>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            <button type="submit" className="btn-submit" style={{ marginTop: '2rem' }}>Guardar Cambios del Perfil</button>
                        </form>
                    </div>
                )}

                {vistaActual === 'seguridad' && (
                    <div className="fade-in">
                        <h2 className="section-title">🔒 Seguridad y Contraseña</h2>
                        {mensajePassword && (
                            <div className={mensajePassword.includes('✅') ? 'alert-success' : 'alert-warning'}>{mensajePassword}</div>
                        )}
                        <div className="tech-card">
                            <p className="form-description">Actualiza tu contraseña de acceso para mantener tu cuenta de especialista segura.</p>
                            <form onSubmit={handleActualizarPassword}>
                                {[
                                    ['actual', 'Contraseña Actual', '••••••••', 'Contraseña actual'],
                                    ['nueva', 'Nueva Contraseña', 'Mínimo 6 caracteres', 'Nueva contraseña'],
                                    ['confirmar', 'Confirmar Nueva Contraseña', 'Repite la nueva contraseña', 'Confirmar contraseña']
                                ].map(([campo, label, placeholder]) => (
                                    <div className="form-group" key={campo}>
                                        <label className="form-label">{label}</label>
                                        <input
                                            type="password"
                                            placeholder={placeholder}
                                            value={passwordData[campo]}
                                            onChange={(e) => setPasswordData(prev => ({ ...prev, [campo]: e.target.value }))}
                                            className="form-input"
                                            required
                                        />
                                    </div>
                                ))}
                                <button type="submit" className="btn-submit" style={{ marginTop: '1rem' }}>Actualizar Contraseña</button>
                            </form>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}

export default DashboardTecnico