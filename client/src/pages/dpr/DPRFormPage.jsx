import { useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { Button, Input, Label, Select, Textarea, PageHeader, Spinner, Card } from '../../components/shared'
import { Image, Mic, X, Upload } from 'lucide-react'

export default function DPRFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()

  const [form, setForm] = useState({
    project_id: searchParams.get('project_id') || '',
    report_date: new Date().toISOString().split('T')[0],
    work_description: '',
    progress_summary: '',
    work_completed: '',
    issues_faced: '',
    material_used: '',
  })
  const [images, setImages] = useState([])
  const [imagePreviews, setImagePreviews] = useState([])
  const [voice, setVoice] = useState([])
  const [error, setError] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [recorder, setRecorder] = useState(null)
  const imageRef = useRef()

  const { data: projects } = useQuery({
    queryKey: ['projects-select'],
    queryFn: () => api.get('/projects?status=active').then(r => r.data.data),
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleImages = (files) => {
    const arr = Array.from(files)
    setImages(prev => [...prev, ...arr])
    arr.forEach(f => {
      const reader = new FileReader()
      reader.onload = e => setImagePreviews(prev => [...prev, { name: f.name, src: e.target.result }])
      reader.readAsDataURL(f)
    })
  }

  const removeImage = (idx) => {
    setImages(prev => prev.filter((_, i) => i !== idx))
    setImagePreviews(prev => prev.filter((_, i) => i !== idx))
  }

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const rec = new MediaRecorder(stream)
    const chunks = []
    rec.ondataavailable = e => chunks.push(e.data)
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' })
      const file = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' })
      setVoice(prev => [...prev, file])
    }
    rec.start()
    setRecorder(rec)
    setIsRecording(true)
  }

  const stopRecording = () => {
    recorder?.stop()
    setIsRecording(false)
    setRecorder(null)
  }

  const mutation = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v))
      images.forEach(f => fd.append('images', f))
      voice.forEach(f => fd.append('voice', f))
      return api.post('/dpr', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: () => { qc.invalidateQueries(['dprs']); navigate('/dpr') },
    onError: (err) => setError(err.response?.data?.message || 'Failed to submit DPR'),
  })

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader title="Submit Daily Progress Report" />
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">{error}</div>}

      <form onSubmit={e => { e.preventDefault(); mutation.mutate() }} className="space-y-4">
        <Card className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Project *</Label>
              <Select className="mt-1" value={form.project_id} onChange={e => set('project_id', e.target.value)} required>
                <option value="">Select project</option>
                {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Report Date *</Label>
              <Input type="date" className="mt-1" value={form.report_date} onChange={e => set('report_date', e.target.value)} required />
            </div>
          </div>

          <div>
            <Label>Work Description</Label>
            <Textarea className="mt-1" rows={3} value={form.work_description} onChange={e => set('work_description', e.target.value)} placeholder="Describe the work done today..." />
          </div>
          <div>
            <Label>Progress Summary</Label>
            <Textarea className="mt-1" rows={2} value={form.progress_summary} onChange={e => set('progress_summary', e.target.value)} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Work Completed</Label>
              <Textarea className="mt-1" rows={2} value={form.work_completed} onChange={e => set('work_completed', e.target.value)} />
            </div>
            <div>
              <Label>Issues Faced</Label>
              <Textarea className="mt-1" rows={2} value={form.issues_faced} onChange={e => set('issues_faced', e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Material Used</Label>
            <Textarea className="mt-1" rows={2} value={form.material_used} onChange={e => set('material_used', e.target.value)} />
          </div>
        </Card>

        {/* Image Upload */}
        <Card className="p-5">
          <h3 className="font-medium mb-3 flex items-center gap-2"><Image size={16} />Site Photos</h3>
          <input ref={imageRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleImages(e.target.files)} />
          <Button type="button" variant="outline" size="sm" onClick={() => imageRef.current.click()}>
            <Upload size={14} className="mr-2" />Upload Photos
          </Button>
          {imagePreviews.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              {imagePreviews.map((img, i) => (
                <div key={i} className="relative">
                  <img src={img.src} alt={img.name} className="w-full h-24 object-cover rounded-lg border" />
                  <button type="button" onClick={() => removeImage(i)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Voice Note */}
        <Card className="p-5">
          <h3 className="font-medium mb-3 flex items-center gap-2"><Mic size={16} />Voice Notes</h3>
          <div className="flex gap-2">
            {!isRecording ? (
              <Button type="button" variant="outline" size="sm" onClick={startRecording}>
                <Mic size={14} className="mr-2" />Start Recording
              </Button>
            ) : (
              <Button type="button" variant="destructive" size="sm" onClick={stopRecording}>
                <span className="animate-pulse mr-2">●</span>Stop Recording
              </Button>
            )}
          </div>
          {voice.length > 0 && (
            <div className="mt-2 text-sm text-muted-foreground">
              {voice.length} voice note{voice.length > 1 ? 's' : ''} recorded
            </div>
          )}
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner className="mr-2" />}Submit DPR
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/dpr')}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}
