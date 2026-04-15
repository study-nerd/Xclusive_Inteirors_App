import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { Button, Card, PageHeader, Spinner, Badge } from '../../components/shared'
import { Bell, CheckCheck, Package, XCircle, CheckCircle, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const TYPE_CONFIG = {
  receipt_overdue: { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50' },
  discrepancy:     { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50' },
  po_approved:     { icon: CheckCircle,  color: 'text-green-600',  bg: 'bg-green-50'  },
  po_rejected:     { icon: XCircle,      color: 'text-red-600',    bg: 'bg-red-50'    },
}

const fmt = (d) => new Date(d).toLocaleDateString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
})

export default function NotificationsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data.data),
    refetchInterval: 60_000, // poll every minute
  })

  const markReadMutation = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries(['notifications', 'notif-count']),
  })

  const markAllMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries(['notifications', 'notif-count']),
  })

  const unread = (data || []).filter(n => !n.is_read).length

  const handleClick = (n) => {
    if (!n.is_read) markReadMutation.mutate(n.id)
    if (n.po_id) navigate(`/purchase-orders/${n.po_id}`)
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : 'All caught up'}
        action={unread > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllMutation.mutate()} disabled={markAllMutation.isPending}>
            <CheckCheck size={14} className="mr-2" />Mark all read
          </Button>
        )}
      />

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
      ) : !data?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bell size={40} className="mx-auto mb-3 opacity-30" />
          <p>No notifications yet</p>
        </div>
      ) : (
        <Card>
          <div className="divide-y">
            {data.map(n => {
              const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.discrepancy
              const Icon = cfg.icon
              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition ${!n.is_read ? 'bg-blue-50/40' : ''}`}
                >
                  <div className={`mt-0.5 p-2 rounded-full ${cfg.bg} shrink-0`}>
                    <Icon size={16} className={cfg.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{n.title}</span>
                      {!n.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                    </div>
                    {n.body && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{fmt(n.created_at)}</p>
                  </div>
                  {n.po_number && (
                    <Badge variant="secondary" className="shrink-0 text-xs">{n.po_number}</Badge>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
