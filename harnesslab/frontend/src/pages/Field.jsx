import { useApp } from '../App'
import { IS_STATIC, useFetch } from '../api'
import { Empty, Spinner } from '../ui'

// The Field is its own document (harnesslab/backend/field.html), mounted here rather than re-implemented.
// Live: the backend serves it and it polls the corpus. Static export: the snapshot carries one self-contained
// Field per results dir, mounted as srcdoc. Same origin either way, so theme and oracle stay in step with the
// console through localStorage without any bridge code on this side.
export function FieldFrame({ className = 'w-full h-full block border-0' }) {
  const { results } = useApp()
  const snap = useFetch(IS_STATIC && results ? '/field/html?results=' + encodeURIComponent(results) : null, [results])
  if (!results) return <Spinner label="the field" />
  if (IS_STATIC) {
    if (snap.error) return <Empty>{String(snap.error.message || snap.error)}</Empty>
    if (!snap.data) return <Spinner label="the field" />
    return <iframe title="The Field" className={className} srcDoc={snap.data.html} />
  }
  return <iframe title="The Field" className={className} src={'/field?results=' + encodeURIComponent(results)} />
}

export default function Field() {
  return <FieldFrame />
}
