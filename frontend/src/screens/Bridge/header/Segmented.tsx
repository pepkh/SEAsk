import styles from './BridgeHeader.module.css'

interface Props<T extends string> {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}

/** A row of mutually exclusive buttons (radio group). */
export function Segmented<T extends string>({ label, options, value, onChange }: Props<T>) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
