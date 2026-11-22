import { Component } from 'react'
import type { ReactNode } from 'react'
import { AlertIcon } from './icons'
import { StateMessage } from './StateMessage'

interface Props { pathname: string; children: ReactNode }
interface State { failedAt: string | null }

/**
 * Auditoría QA: un error inesperado al pintar una vista ya no deja la aplicación en blanco. El encabezado, el menú de
 * cuenta y el footer siguen visibles, y la vista ofrece recargar. Al navegar a otra ruta el error se olvida.
 * Vive dentro de <main> y siempre está montado, para no cambiar la estructura del árbol (AppShell.test.tsx).
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { failedAt: null }

  static getDerivedStateFromError(): Partial<State> {
    // La ruta se fija en componentDidCatch, que sí conoce las props.
    return { failedAt: '' }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return state.failedAt && state.failedAt !== props.pathname ? { failedAt: null } : null
  }

  componentDidCatch() {
    this.setState({ failedAt: this.props.pathname })
  }

  render() {
    if (this.state.failedAt === null) return this.props.children
    return (
      <section className="card" aria-labelledby="route-error-title">
        <h2 id="route-error-title" className="visually-hidden">Error inesperado</h2>
        <StateMessage kind="error" icon={<AlertIcon />} title="Algo salió mal al mostrar esta vista"
          description="Tus datos no se perdieron. Recarga la página o vuelve al inicio."
          action={(
            <div className="actions">
              <button type="button" onClick={() => window.location.reload()}>Recargar</button>
              <a className="plain" href="/">Volver al inicio</a>
            </div>
          )} />
      </section>
    )
  }
}
