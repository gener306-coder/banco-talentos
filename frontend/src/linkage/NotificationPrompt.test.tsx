import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationPrompt } from './NotificationPrompt'
import { ConversationLink } from './UnreadBadge'

// T-S13-08: invitación a activar los avisos del navegador y acceso a la conversación con su contador.
let permission: NotificationPermission
const requestPermission = vi.fn(async () => { permission = 'granted'; return permission })

beforeEach(() => {
  permission = 'default'
  requestPermission.mockClear()
  vi.stubGlobal('Notification', { get permission() { return permission }, requestPermission })
  vi.stubGlobal('isSecureContext', true)
})
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('invitación a los avisos del navegador', () => {
  it('pide el permiso desde el clic y desaparece al concederlo', async () => {
    render(<NotificationPrompt />)
    const prompt = screen.getByRole('note', { name: 'Avisos del navegador' })
    expect(prompt).toHaveTextContent('Recibe un aviso del navegador cuando te escriban, aunque estés en otra pestaña.')
    expect(requestPermission).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Activar avisos' }))
    await vi.waitFor(() => expect(screen.queryByRole('note', { name: 'Avisos del navegador' })).not.toBeInTheDocument())
    expect(requestPermission).toHaveBeenCalledTimes(1)
  })

  it('con el permiso bloqueado explica cómo activarlo, y se puede descartar para siempre', () => {
    permission = 'denied'
    const { unmount } = render(<NotificationPrompt />)
    expect(screen.getByRole('note', { name: 'Avisos del navegador' })).toHaveTextContent('permítelos en la configuración del sitio')
    expect(screen.queryByRole('button', { name: 'Activar avisos' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar aviso' }))
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    unmount()
    render(<NotificationPrompt />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('recuerda el ahora no', () => {
    const { unmount } = render(<NotificationPrompt />)
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    unmount()
    render(<NotificationPrompt />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('no se muestra con el permiso concedido, sin soporte ni en una conexión que no es segura', () => {
    permission = 'granted'
    const { unmount } = render(<NotificationPrompt />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    unmount()
    permission = 'default'
    vi.stubGlobal('isSecureContext', false)
    const insecure = render(<NotificationPrompt />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    insecure.unmount()
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('Notification', undefined)
    Reflect.deleteProperty(window, 'Notification')
    render(<NotificationPrompt />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})

describe('acceso a la conversación en la fila', () => {
  it('sin mensajes es un ícono discreto; con mensajes los cuenta y abrevia más de 99', () => {
    const { rerender } = render(<MemoryRouter><ConversationLink to="/linkage-requests/41/chat" counterpart="UT del Golfo" count={0} /></MemoryRouter>)
    const link = screen.getByRole('link', { name: 'Abrir la conversación con UT del Golfo' })
    expect(link).toHaveAttribute('title', 'Conversación')
    expect(link).not.toHaveClass('has-unread')
    rerender(<MemoryRouter><ConversationLink to="/linkage-requests/41/chat" counterpart="UT del Golfo" count={1} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Abrir la conversación con UT del Golfo: 1 mensaje sin leer' })).toHaveClass('has-unread')
    rerender(<MemoryRouter><ConversationLink to="/linkage-requests/41/chat" counterpart="UT del Golfo" count={120} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Abrir la conversación con UT del Golfo: 120 mensajes sin leer' })).toHaveTextContent('99+')
  })
})
