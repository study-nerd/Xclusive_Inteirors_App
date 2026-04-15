import { cn } from '../../lib/utils'
import { forwardRef } from 'react'

/* ── Button ─────────────────────────────── */
export const Button = forwardRef(({ className, variant = 'default', size = 'default', ...props }, ref) => {
  const variants = {
    default: 'bg-primary text-primary-foreground hover:bg-orange-600',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    link: 'text-primary underline-offset-4 hover:underline',
  }
  const sizes = {
    default: 'h-10 px-4 py-2',
    sm: 'h-9 rounded-md px-3 text-sm',
    lg: 'h-11 rounded-md px-8',
    icon: 'h-10 w-10',
  }
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        variants[variant], sizes[size], className
      )}
      {...props}
    />
  )
})
Button.displayName = 'Button'

/* ── Badge ──────────────────────────────── */
export const Badge = ({ className, variant = 'default', ...props }) => {
  const variants = {
    default: 'bg-primary text-primary-foreground',
    secondary: 'bg-secondary text-secondary-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
    outline: 'border border-input text-foreground',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    info: 'bg-blue-100 text-blue-800',
  }
  return (
    <div className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
      variants[variant], className
    )} {...props} />
  )
}

/* ── Card ───────────────────────────────── */
export const Card = ({ className, ...props }) => (
  <div className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...props} />
)
export const CardHeader = ({ className, ...props }) => (
  <div className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
)
export const CardTitle = ({ className, ...props }) => (
  <h3 className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
)
export const CardContent = ({ className, ...props }) => (
  <div className={cn('p-6 pt-0', className)} {...props} />
)

/* ── Input ──────────────────────────────── */
export const Input = forwardRef(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  />
))
Input.displayName = 'Input'

/* ── Textarea ───────────────────────────── */
export const Textarea = forwardRef(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

/* ── Label ──────────────────────────────── */
export const Label = ({ className, ...props }) => (
  <label className={cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)} {...props} />
)

/* ── Select ─────────────────────────────── */
export const Select = forwardRef(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  >
    {children}
  </select>
))
Select.displayName = 'Select'

/* ── Modal ──────────────────────────────── */
export const Modal = ({ open, onClose, title, children, className }) => {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={cn('relative bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto', className)}>
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

/* ── Spinner ────────────────────────────── */
export const Spinner = ({ className }) => (
  <div className={cn('animate-spin rounded-full border-2 border-gray-300 border-t-primary h-5 w-5', className)} />
)

/* ── StatusBadge ────────────────────────── */
export const StatusBadge = ({ status }) => {
  const map = {
    draft:            { label: 'Draft',            variant: 'secondary' },
    pending_approval: { label: 'Pending Approval', variant: 'warning' },
    approved:         { label: 'Approved',         variant: 'success' },
    rejected:         { label: 'Rejected',         variant: 'destructive' },
    active:           { label: 'Active',           variant: 'success' },
    completed:        { label: 'Completed',        variant: 'info' },
    template:         { label: 'Template',         variant: 'secondary' },
    open:             { label: 'Open',             variant: 'warning' },
    in_review:        { label: 'In Review',        variant: 'info' },
    resolved:         { label: 'Resolved',         variant: 'success' },
    submitted:        { label: 'Submitted',        variant: 'success' },
    pending:          { label: 'Pending',          variant: 'warning' },
    in_progress:      { label: 'In Progress',      variant: 'info' },
    delayed:          { label: 'Delayed',          variant: 'destructive' },
  }
  const { label, variant } = map[status] || { label: status, variant: 'secondary' }
  return <Badge variant={variant}>{label}</Badge>
}

/* ── PageHeader ─────────────────────────── */
export const PageHeader = ({ title, subtitle, action }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
    <div>
      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle && <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>}
    </div>
    {action && <div>{action}</div>}
  </div>
)

/* ── EmptyState ─────────────────────────── */
export const EmptyState = ({ icon: Icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    {Icon && <Icon size={48} className="text-muted-foreground mb-4" />}
    <h3 className="text-lg font-medium mb-1">{title}</h3>
    {description && <p className="text-muted-foreground text-sm mb-4">{description}</p>}
    {action}
  </div>
)
