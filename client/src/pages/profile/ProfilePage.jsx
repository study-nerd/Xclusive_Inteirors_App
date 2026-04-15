import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../../lib/api'
import { Button, Card, PageHeader, Spinner, Badge, Label, Input } from '../../components/shared'
import { KeyRound, CheckCircle } from 'lucide-react'
import useAuthStore from '../../store/authStore'

export default function ProfilePage() {
  const { user } = useAuthStore()
  const [form, setForm]   = useState({ current_password: '', new_password: '', confirm: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/users/me').then(r => r.data.data),
  })

  const mutation = useMutation({
    mutationFn: (data) => api.patch('/users/me/change-password', data),
    onSuccess: () => { setSuccess(true); setError(''); setForm({ current_password: '', new_password: '', confirm: '' }) },
    onError: (err) => setError(err.response?.data?.message || 'Failed to change password'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (form.new_password !== form.confirm) {
      setError('New passwords do not match'); return
    }
    if (form.new_password.length < 6) {
      setError('New password must be at least 6 characters'); return
    }
    mutation.mutate({ current_password: form.current_password, new_password: form.new_password })
  }

  const isAdmin        = user?.role === 'admin'
  const alreadyChanged = me?.password_changed_by_user
  const canChange      = !isAdmin && !alreadyChanged

  return (
    <div className="max-w-lg mx-auto">
      <PageHeader title="My Profile" />

      {/* User info */}
      <Card className="p-5 mb-5">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{user?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Role</span>
            <Badge variant="secondary" className="capitalize">{user?.role}</Badge>
          </div>
          {!isAdmin && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Password changed</span>
              <Badge variant={alreadyChanged ? 'success' : 'secondary'}>
                {alreadyChanged ? `Yes — ${new Date(me?.password_changed_at).toLocaleDateString('en-IN')}` : 'Not yet'}
              </Badge>
            </div>
          )}
        </div>
      </Card>

      {/* Password change section */}
      {isAdmin && (
        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <KeyRound size={16} />
            <span>Admins can reset other users' passwords from the Users page.</span>
          </div>
        </Card>
      )}

      {!isAdmin && alreadyChanged && (
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle size={16} />
            <span>You have already changed your password. Contact an admin if you need it reset.</span>
          </div>
        </Card>
      )}

      {canChange && (
        <Card className="p-5">
          <h3 className="font-semibold mb-1 flex items-center gap-2">
            <KeyRound size={16} />Change Password
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            You can change your password once. After that, contact an admin to reset it.
          </p>

          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm flex items-center gap-2">
              <CheckCircle size={15} />Password changed successfully.
            </div>
          )}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Current Password</Label>
              <Input
                type="password"
                className="mt-1"
                value={form.current_password}
                onChange={e => setForm(f => ({ ...f, current_password: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label>New Password</Label>
              <Input
                type="password"
                className="mt-1"
                placeholder="Min 6 characters"
                value={form.new_password}
                onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label>Confirm New Password</Label>
              <Input
                type="password"
                className="mt-1"
                value={form.confirm}
                onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                required
              />
            </div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Spinner className="mr-2" />}
              Change Password
            </Button>
          </form>
        </Card>
      )}
    </div>
  )
}
