import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, type ButtonProps } from '@astryxdesign/core/Button'
import { TextInput, type TextInputProps } from '@astryxdesign/core/TextInput'
import { X } from 'lucide-react'

export const symbolUrl = import.meta.env.BASE_URL + 'brand/PRESTIQUE_LABS_Symbol_Original.png'
export const wordmarkUrl = import.meta.env.BASE_URL + 'brand/PRESTIQUE_LABS_Wordmark_Original.png'
export function Action(props: ButtonProps) { return <Button size="lg" {...props} className={'press action-' + (props.variant ?? 'secondary') + ' ' + (props.className ?? '')} /> }
export function Field(props: TextInputProps) { return <TextInput size="lg" {...props} /> }
export function Brand({ full = false, className = '' }: { full?: boolean; className?: string }) {
  return full
    ? <span className={'brand-lockup ' + className}><img src={symbolUrl} alt="" /><img src={wordmarkUrl} alt="PRESTIQUE LABS" /></span>
    : <span className={'brand-mark ' + className} role="img" aria-label="PRESTIQUE LABS"><span aria-hidden="true" /></span>
}
export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    dialog.querySelector<HTMLInputElement>('input[type="text"], input:not([type])')?.focus()
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} className="dialog-panel" aria-label={title} onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === event.currentTarget) close() }}>
    <div className="dialog-inner">
      <div className="dialog-heading"><h2>{title}</h2><Action label="닫기" icon={<X size={18}/>} variant="ghost" isIconOnly onClick={close} /></div>
      {children}
    </div>
  </dialog>
}
export function TextPrompt({ title, field, initial = '', verb = '확인', confirmed, close }: {
  title: string; field: string; initial?: string; verb?: string; confirmed: (value: string) => void | Promise<void>; close: () => void
}) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <Modal title={title} close={() => { if (!busy) close() }}>
    <form onSubmit={async event => {
      event.preventDefault()
      if (busy || !value.trim()) return
      setBusy(true)
      setError('')
      try { await confirmed(value.trim()); close() } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
      finally { setBusy(false) }
    }}>
      <Field label={field} value={value} onChange={setValue} hasAutoFocus aria-required />
      {error && <p role="alert" className="failure-inline">{error}</p>}
      <div className="dialog-actions"><Action label="취소" onClick={close} isDisabled={busy}/><Action type="submit" label={verb} variant="primary" isDisabled={!value.trim()} isLoading={busy} /></div>
    </form>
  </Modal>
}
export function Confirm({ title, description, verb, confirmed, close }: { title: string; description: string; verb: string; confirmed: () => Promise<void>; close: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <Modal title={title} close={() => { if (!busy) close() }}>
    <p>{description}</p>
    {error && <p role="alert" className="failure-inline">{error}</p>}
    <div className="dialog-actions"><Action label="취소" onClick={close} isDisabled={busy}/><Action label={verb} variant="primary" isLoading={busy} onClick={async () => {
      setBusy(true)
      try { await confirmed(); close() } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
      finally { setBusy(false) }
    }} /></div>
  </Modal>
}

