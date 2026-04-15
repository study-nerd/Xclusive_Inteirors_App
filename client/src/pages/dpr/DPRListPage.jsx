import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../lib/api'
import { Button, Card, PageHeader, Spinner, EmptyState, StatusBadge } from '../../components/shared'
import { Plus, FileText } from 'lucide-react'

export default function DPRListPage() {
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['dprs'],
    queryFn: () => api.get('/dpr').then(r => r.data.data),
  })

  return (
    <div>
      <PageHeader
        title="Daily Progress Reports"
        subtitle={`${data?.length || 0} reports`}
        action={<Button onClick={() => navigate('/dpr/new')}><Plus size={15} className="mr-2" />Submit DPR</Button>}
      />

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
      ) : !data?.length ? (
        <EmptyState icon={FileText} title="No DPRs submitted yet" description="Submit your first daily progress report" />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  {['Date','Project','Submitted By','Status',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map(dpr => (
                  <tr key={dpr.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/dpr/${dpr.id}`)}>
                    <td className="px-4 py-3 font-medium">
                      {new Date(dpr.report_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{dpr.project_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{dpr.submitted_by_name}</td>
                    <td className="px-4 py-3"><StatusBadge status={dpr.status} /></td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); navigate(`/dpr/${dpr.id}`) }}>View</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
