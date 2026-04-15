import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import useAuthStore from '../../store/authStore'
import { Button, Card, PageHeader, Spinner, StatusBadge, Modal } from '../../components/shared'

export default function DPRDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const isAdmin = user?.role === 'admin'

  const { data: dpr, isLoading } = useQuery({
    queryKey: ['dpr', id],
    queryFn: () => api.get(`/dpr/${id}`).then((r) => r.data.data),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/dpr/${id}`),
    onSuccess: () => {
      qc.invalidateQueries(['dprs'])
      navigate('/dpr')
    },
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
  if (!dpr) return <div className="text-center py-16 text-muted-foreground">DPR not found</div>

  const sections = [
    { label: 'Work Description', value: dpr.work_description },
    { label: 'Progress Summary', value: dpr.progress_summary },
    { label: 'Work Completed', value: dpr.work_completed },
    { label: 'Issues Faced', value: dpr.issues_faced },
    { label: 'Material Used', value: dpr.material_used },
  ]

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title={`DPR - ${new Date(dpr.report_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`}
        subtitle={`${dpr.project_name} - Submitted by ${dpr.submitted_by_name}`}
        action={
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                Delete Permanently
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate('/dpr')}>Back</Button>
          </div>
        }
      />

      <div className="flex items-center gap-3 mb-5">
        <StatusBadge status={dpr.status} />
      </div>

      <Card className="p-5 space-y-4 mb-5">
        {sections.map(({ label, value }) => value ? (
          <div key={label}>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</div>
            <div className="text-sm whitespace-pre-line">{value}</div>
          </div>
        ) : null)}
      </Card>

      {dpr.images?.length > 0 && (
        <Card className="p-5 mb-5">
          <h3 className="font-medium mb-3">Site Photos ({dpr.images.length})</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {dpr.images.map((img) => (
              <a key={img.id} href={img.file_url} target="_blank" rel="noopener noreferrer">
                <img src={img.file_url} alt={img.file_name} className="w-full h-32 object-cover rounded-lg border hover:opacity-90 transition" />
              </a>
            ))}
          </div>
        </Card>
      )}

      {dpr.voice_notes?.length > 0 && (
        <Card className="p-5">
          <h3 className="font-medium mb-3">Voice Notes ({dpr.voice_notes.length})</h3>
          <div className="space-y-2">
            {dpr.voice_notes.map((vn) => (
              <div key={vn.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="text-sm text-muted-foreground flex-1">{vn.file_name}</div>
                <audio controls src={vn.file_url} className="h-8" />
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete DPR Permanently">
        <div className="p-4 bg-red-50 border border-red-200 rounded text-sm text-red-800 mb-4">
          This will permanently delete this DPR and its attached files. This cannot be undone.
        </div>
        <div className="flex gap-2">
          <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending && <Spinner className="mr-2" />}
            Delete Permanently
          </Button>
          <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
        </div>
      </Modal>
    </div>
  )
}
