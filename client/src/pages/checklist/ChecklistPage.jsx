import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { Button, Card, PageHeader, Spinner, Select, Label, Badge } from '../../components/shared'
import { CheckSquare, Square } from 'lucide-react'

export default function ChecklistPage() {
  const qc = useQueryClient()
  const [projectId, setProjectId] = useState('')

  const { data: projects } = useQuery({
    queryKey: ['projects-select'],
    queryFn: () => api.get('/projects?status=active').then(r => r.data.data),
  })

  const { data: checklists, isLoading } = useQuery({
    queryKey: ['checklists', projectId],
    queryFn: () => api.get(`/checklist/project/${projectId}`).then(r => r.data.data),
    enabled: !!projectId,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ itemId, is_completed }) => api.patch(`/checklist/items/${itemId}`, { is_completed }),
    onSuccess: () => qc.invalidateQueries(['checklists', projectId]),
  })

  const allItems = (checklists || []).flatMap(cl => cl.items || [])
  const completedCount = allItems.filter(i => i.is_completed).length

  return (
    <div>
      <PageHeader title="Checklist" subtitle="Track project milestones" />

      <div className="mb-5 max-w-sm">
        <Label>Select Project</Label>
        <Select className="mt-1" value={projectId} onChange={e => setProjectId(e.target.value)}>
          <option value="">— Choose a project —</option>
          {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>

      {!projectId ? (
        <div className="text-center text-muted-foreground py-12">Select a project to view its checklist</div>
      ) : isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
      ) : !checklists?.length ? (
        <div className="text-center text-muted-foreground py-12">No checklist assigned to this project</div>
      ) : (
        <>
          {/* Progress */}
          <div className="mb-4 p-4 bg-gray-50 rounded-lg flex items-center justify-between">
            <span className="text-sm font-medium">Progress: {completedCount} / {allItems.length} tasks</span>
            <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: allItems.length ? `${(completedCount / allItems.length) * 100}%` : '0%' }}
              />
            </div>
          </div>

          {(checklists || []).map(cl => (
            <Card key={cl.id} className="mb-4">
              <div className="p-4 border-b flex items-center justify-between">
                <h3 className="font-semibold">{cl.template_name || 'Checklist'}</h3>
                <Badge variant="secondary">{(cl.items || []).filter(i => i.is_completed).length}/{(cl.items || []).length} done</Badge>
              </div>
              <div className="divide-y">
                {(cl.items || []).map(item => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleMutation.mutate({ itemId: item.id, is_completed: !item.is_completed })}
                  >
                    {item.is_completed
                      ? <CheckSquare size={18} className="text-green-600 shrink-0" />
                      : <Square size={18} className="text-gray-400 shrink-0" />
                    }
                    <span className={`text-sm ${item.is_completed ? 'line-through text-muted-foreground' : ''}`}>
                      {item.task_name}
                    </span>
                    {item.is_completed && item.completed_by_name && (
                      <span className="ml-auto text-xs text-muted-foreground">{item.completed_by_name}</span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  )
}
