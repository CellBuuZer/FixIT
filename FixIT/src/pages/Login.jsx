import { useState } from 'react'
import { iniciarSesion } from '../services/api'
import { Link, useNavigate } from 'react-router-dom'
import './Login.css'

const paths = {
  user: <><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2Z"/></>,
  headset: <><path d="M3 14v-3a9 9 0 0 1 18 0v3M21 16v2a3 3 0 0 1-3 3h-4"/><rect x="3" y="11" width="4" height="7" rx="2"/><rect x="17" y="11" width="4" height="7" rx="2"/></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4m-4 4v2"/></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  hidden: <><path d="m3 3 18 18M10 5c7-1 12 7 12 7a19 19 0 0 1-4 5M6 6a19 19 0 0 0-4 6s4 7 10 7c2 0 3-.4 4-1"/></>,
}
function Icon({ name }) { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg> }

function Login() {
  const navigate = useNavigate()
  const [correo, setCorreo] = useState(() => { try { return localStorage.getItem('fixit_remembered_email') || '' } catch { return '' } })
  const [remember, setRemember] = useState(Boolean(correo))
  const [contrasena, setContrasena] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [role, setRole] = useState('CLIENTE')
  const manejarLogin = async (e) => {
    e.preventDefault()
    if (busy) return
    setError(''); setBusy(true)
    try {
      const resultado = await iniciarSesion({ correo, contrasena })
      const token = resultado?.data?.token || resultado?.token
      const user = resultado?.data?.user || resultado?.user || resultado?.usuario
      if (!token || !user) throw new Error('La respuesta del servidor no tiene el formato de token esperado.')
      localStorage.setItem('fixit_token', token)
      localStorage.setItem('fixit_user', JSON.stringify(user))
      try { if (remember) localStorage.setItem('fixit_remembered_email', correo); else localStorage.removeItem('fixit_remembered_email') } catch { /* memoria de correo opcional */ }
      const actual = String(user.rol || '').toUpperCase()
      navigate(actual === 'TECNICO' ? '/dashboard-tecnico' : ['ADMIN', 'MODERADOR'].includes(actual) ? '/admin' : '/dashboard-cliente', { replace: true })
    } catch (err) { setError(err.message || 'Correo o contraseña incorrectos.') }
    finally { setBusy(false) }
  }
  const register = role === 'TECNICO' ? '/registro-tecnico' : '/register'
  return (
    <div className="fx-login">
      <section className="fx-login-card" aria-labelledby="fx-login-title">
        <header className="fx-login-heading"><h1 id="fx-login-title">Bienvenido a <span>FixIT</span></h1><p>Accede a tu cuenta para gestionar tus solicitudes.</p></header>
        <nav className="fx-login-tabs" aria-label="Acceso a la cuenta"><Link to="/login" aria-current="page">Iniciar sesión</Link><Link to={register}>Crear cuenta</Link></nav>
        <div className="fx-login-roles" role="group" aria-label="Tipo de cuenta">
          {[['CLIENTE','user','Cliente'],['TECNICO','headset','Técnico de soporte'],['ADMIN','shield','Administrador']].map(([id,icon,label]) => <button key={id} type="button" aria-pressed={role === id} onClick={() => setRole(id)}><Icon name={icon}/><span>{label}</span></button>)}
        </div>
        <p className="fx-login-hint">{role === 'ADMIN' ? 'Acceso para administradores y moderadores autorizados.' : role === 'TECNICO' ? 'Gestiona tus servicios y solicitudes de soporte.' : 'Ingresa con los datos de tu cuenta.'}</p>
        <form onSubmit={manejarLogin} aria-busy={busy}>
          {error && <div className="fx-login-error" role="alert">{error}</div>}
          <label htmlFor="correo-input">Correo electrónico</label>
          <div className="fx-login-field"><Icon name="mail"/><input id="correo-input" type="email" autoComplete="username" placeholder="nombre@ejemplo.com" value={correo} onChange={e => setCorreo(e.target.value)} required/></div>
          <label htmlFor="password-input">Contraseña</label>
          <div className="fx-login-field"><Icon name="lock"/><input id="password-input" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" value={contrasena} onChange={e => setContrasena(e.target.value)} required/><button type="button" className="fx-login-eye" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}><Icon name={visible ? 'eye' : 'hidden'}/></button></div>
          <div className="fx-login-options"><label><input type="checkbox" checked={remember} onChange={e => { setRemember(e.target.checked); if (!e.target.checked) { try { localStorage.removeItem('fixit_remembered_email') } catch { /* opcional */ } } }}/> Recordar correo</label><Link to="/recuperar-password">¿Olvidaste tu contraseña?</Link></div>
          <button className="fx-login-submit" type="submit" disabled={busy}>{busy ? 'Ingresando…' : 'Iniciar sesión'}</button>
        </form>
        <div className="fx-login-bottom"><span>¿Eres nuevo? <Link to={register}>Regístrate aquí</Link></span></div>
        <Link className="fx-login-support" to="/help"><Icon name="headset"/> ¿Necesitas ayuda?</Link>
      </section>
    </div>
  )
}
export default Login
