import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MapPin, Clock, Camera, ChevronLeft, ChevronRight,
  AlertTriangle, CheckCircle, XCircle, Plus, X, Loader2,
  CalendarDays, Umbrella, Sun, Info,
} from 'lucide-react'
import api from '../../lib/api'
import { cn } from '../../lib/utils'
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '../../components/shared'

const MONTHS      = ['January','February','March','April','May','June','July','August','September','October','November','December']
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAY_ABBR    = ['Mo','Tu','We','Th','Fr','Sa','Su']

const STATUS_CFG = {
  present:  { label: 'Present',          dot: 'bg-green-500',  cell: 'bg-green-100 border-green-300 text-green-800'   },
  late:     { label: 'Late',             dot: 'bg-yellow-500', cell: 'bg-yellow-100 border-yellow-300 text-yellow-800' },
  half_day: { label: 'Half Day',         dot: 'bg-orange-500', cell: 'bg-orange-100 border-orange-300 text-orange-800' },
  absent:   { label: 'Absent',           dot: 'bg-red-500',    cell: 'bg-red-100 border-red-300 text-red-800'          },
  leave:    { label: 'Leave',            dot: 'bg-blue-500',   cell: 'bg-blue-100 border-blue-300 text-blue-800'       },
  holiday:  { label: 'Holiday',          dot: 'bg-purple-500', cell: 'bg-purple-100 border-purple-300 text-purple-800' },
  sunday:   { label: 'Sunday',           dot: 'bg-gray-400',   cell: 'bg-gray-100 border-gray-200 text-gray-400'       },
  future:   { label: '',                 dot: '',              cell: 'bg-white border-gray-100 text-gray-300'           },
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const d = (v) => (v * Math.PI) / 180
  const a = Math.sin(d(lat2 - lat1) / 2) ** 2 +
    Math.cos(d(lat1)) * Math.cos(d(lat2)) * Math.sin(d(lng2 - lng1) / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getNowIST() { return new Date(Date.now() + 5.5 * 3600 * 1000) }

function isBeforeWorkEnd() { return getNowIST().getUTCHours() < 19 }

// Snap 10:00–10:01 to "10:00 AM" for display
function fmtTime(ts) {
  if (!ts) return '—'
  const ist = new Date(new Date(ts).getTime() + 5.5 * 3600 * 1000)
  let h = ist.getUTCHours(), m = ist.getUTCMinutes()
  if (h === 10 && m <= 1) m = 0   // snap display to 10:00
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

function fmtDate(ds) {
  if (!ds) return ''
  const [y, mo, d] = ds.split('-')
  return `${parseInt(d)} ${SHORT_MONTHS[parseInt(mo) - 1]} ${y}`
}

function todayISTStr() { return getNowIST().toISOString().slice(0, 10) }

function StatusBadge({ status, className }) {
  const cfg = STATUS_CFG[status] || {}
  const colors = {
    present:  'bg-green-100 text-green-700 border-green-200',
    late:     'bg-yellow-100 text-yellow-700 border-yellow-200',
    half_day: 'bg-orange-100 text-orange-700 border-orange-200',
    absent:   'bg-red-100 text-red-700 border-red-200',
    leave:    'bg-blue-100 text-blue-700 border-blue-200',
    holiday:  'bg-purple-100 text-purple-700 border-purple-200',
    sunday:   'bg-gray-100 text-gray-500 border-gray-200',
  }
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border', colors[status] || 'bg-gray-100 text-gray-500', className)}>
      {cfg.label || 'Not Clocked In'}
    </span>
  )
}

// ── Calendar grid ─────────────────────────────────────────────────────────────
function MonthCalendar({ data, year, month, onPrev, onNext }) {
  const [tooltip, setTooltip] = useState(null)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const firstDow    = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const offset      = (firstDow + 6) % 7  // Mon-start

  const dataMap = {}
  ;(data || []).forEach(d => { dataMap[d.date] = d })

  const cells = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    cells.push(dataMap[ds] || { date: ds, status: 'future' })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={onPrev} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <span className="font-semibold text-gray-800">{MONTHS[month - 1]} {year}</span>
        <button onClick={onNext} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_ABBR.map(d => (
          <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => (
          <div
            key={i}
            onClick={() => cell && cell.status !== 'future' && setTooltip(tooltip?.date === cell.date ? null : cell)}
            className={cn(
              'aspect-square rounded-md border flex flex-col items-center justify-center text-xs font-medium relative select-none',
              cell ? (STATUS_CFG[cell.status]?.cell || 'bg-white border-gray-100 text-gray-300') : 'border-transparent',
              cell && cell.status !== 'future' ? 'cursor-pointer hover:opacity-80 transition-opacity' : '',
            )}
          >
            {cell && <span>{parseInt(cell.date.split('-')[2])}</span>}
            {cell?.is_flagged && (
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
            )}
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-gray-700">{fmtDate(tooltip.date)}</span>
            <button onClick={() => setTooltip(null)}><X size={14} /></button>
          </div>
          <StatusBadge status={tooltip.status} />
          {tooltip.clock_in_time && (
            <div className="mt-1 text-gray-600">In: <span className="font-medium">{fmtTime(tooltip.clock_in_time)}</span></div>
          )}
          {tooltip.clock_out_time && (
            <div className="text-gray-600">Out: <span className="font-medium">{fmtTime(tooltip.clock_out_time)}</span></div>
          )}
          {tooltip.total_hours && (
            <div className="text-gray-600">Hours: <span className="font-medium">{tooltip.total_hours}h</span></div>
          )}
          {tooltip.early_logout && tooltip.early_logout_note && (
            <div className="mt-1 text-orange-600 text-xs">Early out: {tooltip.early_logout_note}</div>
          )}
          {tooltip.clock_in_inside_fence === false && (
            <div className="mt-1 text-orange-500 text-xs flex items-center gap-1"><MapPin size={11} /> Clocked in outside office</div>
          )}
          {tooltip.holiday_name && (
            <div className="mt-1 text-purple-600 text-xs">{tooltip.holiday_name}</div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4">
        {Object.entries(STATUS_CFG).filter(([k]) => k !== 'future').map(([key, val]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={cn('w-2.5 h-2.5 rounded-sm', val.dot === 'bg-gray-400' ? 'bg-gray-400' : val.dot)} />
            <span className="text-xs text-gray-500">{val.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MyAttendancePage() {
  const qc = useQueryClient()

  // Tab: 'today' | 'calendar' | 'holidays'
  const [tab, setTab] = useState('today')

  // Calendar nav
  const istNow    = getNowIST()
  const [calYear,  setCalYear]  = useState(istNow.getUTCFullYear())
  const [calMonth, setCalMonth] = useState(istNow.getUTCMonth() + 1)

  // Holiday year nav
  const [holYear, setHolYear] = useState(istNow.getUTCFullYear())

  // Geolocation
  const [locState,    setLocState]    = useState('idle') // idle | loading | granted | denied
  const [userLat,     setUserLat]     = useState(null)
  const [userLng,     setUserLng]     = useState(null)
  const [distance,    setDistance]    = useState(null)
  const [insideFence, setInsideFence] = useState(null)

  // Clock action pending state
  const [pendingClock,  setPendingClock]  = useState(null) // { action, lat, lng, needsSelfie, needsNote }
  const [selfieFile,    setSelfieFile]    = useState(null)
  const [selfiePreview, setSelfiePreview] = useState(null)
  const [earlyNote,     setEarlyNote]     = useState('')
  const [clockLoading,  setClockLoading]  = useState(false)
  const [clockError,    setClockError]    = useState('')
  const [clockSuccess,  setClockSuccess]  = useState('')
  const selfieInputRef = useRef(null)

  // Leave form
  const [showLeaveForm, setShowLeaveForm] = useState(false)
  const [leaveForm,     setLeaveForm]     = useState({ start_date: '', end_date: '', reason: '' })
  const [leaveError,    setLeaveError]    = useState('')

  // Queries
  const todayQ = useQuery({
    queryKey: ['att-today'],
    queryFn:  () => api.get('/attendance/today').then(r => r.data.data),
    refetchInterval: 60_000,
  })

  const monthQ = useQuery({
    queryKey: ['att-monthly', calYear, calMonth],
    queryFn:  () => api.get(`/attendance/my-monthly?year=${calYear}&month=${calMonth}`).then(r => r.data.data),
    enabled:  tab === 'calendar',
  })

  const leavesQ = useQuery({
    queryKey: ['att-my-leaves'],
    queryFn:  () => api.get('/attendance/leave/my').then(r => r.data.data),
    enabled:  tab === 'calendar',
  })

  const holQ = useQuery({
    queryKey: ['att-holidays', holYear],
    queryFn:  () => api.get(`/attendance/holidays?year=${holYear}`).then(r => r.data.data),
    enabled:  tab === 'holidays',
  })

  const configQ = useQuery({
    queryKey: ['att-config'],
    queryFn:  () => api.get('/attendance/config').then(r => r.data.data),
    staleTime: Infinity,
  })
  const config = configQ.data ?? null

  // Geolocation fetch
  const fetchLocation = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!config) { reject(new Error('Config not loaded')); return }
      if (!navigator.geolocation) { setLocState('denied'); reject(new Error('Geolocation not supported')); return }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords
          const dist = haversine(lat, lng, config.officeLat, config.officeLng)
          setUserLat(lat); setUserLng(lng)
          setDistance(dist); setInsideFence(dist <= config.geofenceRadius)
          setLocState('granted')
          resolve({ lat, lng, distance: dist, inside: dist <= config.geofenceRadius })
        },
        () => { setLocState('denied'); reject(new Error('Location denied')) },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      )
    })
  }, [config])

  useEffect(() => {
    if (!config) return
    setLocState('loading'); fetchLocation().catch(() => {})
  }, [config, fetchLocation])

  // Selfie preview
  useEffect(() => {
    if (!selfieFile) { setSelfiePreview(null); return }
    const url = URL.createObjectURL(selfieFile)
    setSelfiePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [selfieFile])

  // Clock In / Out handler
  async function handleClockBtn(action) {
    setClockError(''); setClockSuccess(''); setClockLoading(true)
    let loc
    try { loc = await fetchLocation() } catch {
      setClockError('Could not get your location. Please allow location access and try again.')
      setClockLoading(false); return
    }

    const needsSelfie = !loc.inside
    const needsNote   = action === 'out' && isBeforeWorkEnd()

    if (!needsSelfie && !needsNote) {
      await submitClock(action, loc.lat, loc.lng, null, '')
    } else {
      setPendingClock({ action, lat: loc.lat, lng: loc.lng, needsSelfie, needsNote })
    }
    setClockLoading(false)
  }

  async function submitClock(action, lat, lng, selfie, note) {
    setClockLoading(true); setClockError('')
    const fd = new FormData()
    fd.append('lat', lat)
    fd.append('lng', lng)
    if (selfie) fd.append('selfie', selfie)
    if (action === 'out' && note?.trim()) fd.append('early_logout_note', note.trim())

    try {
      const res = await api.post(`/attendance/clock-${action}`, fd)
      setClockSuccess(res.data.message || `Clocked ${action} successfully.`)
      setPendingClock(null); setSelfieFile(null); setEarlyNote('')
      qc.invalidateQueries({ queryKey: ['att-today'] })
      qc.invalidateQueries({ queryKey: ['att-monthly', calYear, calMonth] })
    } catch (err) {
      const d = err.response?.data
      if (d?.needsSelfie) {
        setPendingClock(prev => ({ ...(prev || { action, lat, lng }), needsSelfie: true }))
        setClockError(d.message)
      } else {
        setClockError(d?.message || `Failed to clock ${action}.`)
      }
    } finally {
      setClockLoading(false)
    }
  }

  function handlePendingSubmit() {
    if (!pendingClock) return
    if (pendingClock.needsSelfie && !selfieFile) { setClockError('Please upload a selfie to proceed.'); return }
    if (pendingClock.needsNote && !earlyNote.trim()) { setClockError('Please provide a reason for early logout.'); return }
    submitClock(pendingClock.action, pendingClock.lat, pendingClock.lng, selfieFile, earlyNote)
  }

  // Leave mutations
  const leaveMut = useMutation({
    mutationFn: (data) => api.post('/attendance/leave', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['att-my-leaves'] })
      setShowLeaveForm(false); setLeaveForm({ start_date: '', end_date: '', reason: '' }); setLeaveError('')
    },
    onError: (err) => setLeaveError(err.response?.data?.message || 'Failed to submit leave.'),
  })

  const cancelLeaveMut = useMutation({
    mutationFn: (id) => api.delete(`/attendance/leave/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['att-my-leaves'] }),
  })

  const today  = todayQ.data
  const status = today?.status

  // Determine if clock buttons should be shown
  const canClockIn  = !status || (!today?.clock_in_time && !['holiday','sunday','leave'].includes(status))
  const canClockOut = today?.clock_in_time && !today?.clock_out_time

  const leaveDays = leaveForm.start_date && leaveForm.end_date
    ? Math.max(0, Math.round((new Date(leaveForm.end_date + 'T00:00:00Z') - new Date(leaveForm.start_date + 'T00:00:00Z')) / 86400000) + 1)
    : 0

  const TABS = [
    { key: 'today',    label: 'Today' },
    { key: 'calendar', label: 'Calendar & Leaves' },
    { key: 'holidays', label: 'Holidays' },
  ]

  const todayDateStr = (() => {
    const ist = getNowIST()
    const days  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    return `${days[ist.getUTCDay()]}, ${fmtDate(ist.toISOString().slice(0,10))}`
  })()

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Attendance</h1>
          <p className="text-sm text-gray-500 mt-0.5">{todayDateStr}</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                tab === t.key
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── TODAY TAB ─────────────────────────────────────────────────────── */}
      {tab === 'today' && (
        <div className="space-y-4">
          {/* Today Status Card */}
          <Card>
            <CardContent className="pt-5 pb-5">
              {todayQ.isLoading ? (
                <div className="flex items-center gap-2 text-gray-400"><Loader2 className="animate-spin" size={16} /> Loading…</div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Status</p>
                    {status
                      ? <StatusBadge status={status} className="text-sm px-3 py-1" />
                      : <span className="text-sm text-gray-400 italic">Not clocked in</span>
                    }
                    {today?.holiday_name && <p className="text-xs text-purple-600 mt-1">{today.holiday_name}</p>}
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Clock In</p>
                    <p className="font-semibold text-gray-800">{fmtTime(today?.clock_in_time)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Clock Out</p>
                    <p className="font-semibold text-gray-800">{fmtTime(today?.clock_out_time)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Hours</p>
                    <p className="font-semibold text-gray-800">
                      {today?.total_hours ? `${today.total_hours}h` : '—'}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Location Status */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Your Location</p>
              {locState === 'loading' && (
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <Loader2 size={15} className="animate-spin" /> Detecting location…
                </div>
              )}
              {locState === 'denied' && (
                <div className="flex items-center gap-2 text-red-500 text-sm">
                  <XCircle size={15} /> Location access denied. Please enable it in browser settings.
                </div>
              )}
              {locState === 'granted' && (
                <div className="flex items-center gap-3">
                  <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
                    insideFence ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                  )}>
                    <MapPin size={14} />
                    {insideFence ? 'Inside Office' : 'Outside Office'}
                  </div>
                  <button
                    onClick={() => { setLocState('loading'); fetchLocation().catch(() => {}) }}
                    className="text-xs text-orange-500 hover:text-orange-700 underline"
                  >
                    Refresh
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Clock Buttons */}
          {todayQ.data && !['holiday', 'sunday', 'leave'].includes(status) && (
            <div className="space-y-3">
              {clockSuccess && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                  <CheckCircle size={16} /> {clockSuccess}
                </div>
              )}
              {clockError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  <AlertTriangle size={16} /> {clockError}
                </div>
              )}

              {/* Main clock button */}
              {!pendingClock && (
                <div className="flex gap-3">
                  {canClockIn && (
                    <Button
                      onClick={() => handleClockBtn('in')}
                      disabled={clockLoading || !config || locState !== 'granted'}
                      className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6"
                    >
                      {clockLoading ? <Loader2 size={15} className="animate-spin" /> : <Clock size={15} />}
                      Clock In
                    </Button>
                  )}
                  {canClockOut && (
                    <Button
                      onClick={() => handleClockBtn('out')}
                      disabled={clockLoading || !config || locState !== 'granted'}
                      className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-6"
                    >
                      {clockLoading ? <Loader2 size={15} className="animate-spin" /> : <Clock size={15} />}
                      Clock Out
                    </Button>
                  )}
                  {today?.clock_out_time && (
                    <div className="flex items-center gap-2 text-gray-500 text-sm">
                      <CheckCircle size={15} className="text-green-500" />
                      Done for today. See you tomorrow!
                    </div>
                  )}
                </div>
              )}

              {/* Extra inputs panel (selfie / early note) */}
              {pendingClock && (
                <Card className="border-orange-200 bg-orange-50">
                  <CardContent className="pt-4 pb-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-orange-700">
                        Additional info required to clock {pendingClock.action}
                      </p>
                      <button onClick={() => { setPendingClock(null); setClockError(''); setSelfieFile(null); setEarlyNote('') }}>
                        <X size={16} className="text-gray-400" />
                      </button>
                    </div>

                    {pendingClock.needsSelfie && (
                      <div>
                        <p className="text-sm text-gray-600 mb-2 flex items-center gap-1.5">
                          <Camera size={14} className="text-orange-500" />
                          You are outside the office. Take a live selfie using your camera to proceed.
                        </p>
                        <input
                          ref={selfieInputRef}
                          type="file"
                          accept="image/*"
                          capture="user"
                          className="hidden"
                          onChange={e => setSelfieFile(e.target.files[0] || null)}
                        />
                        {selfiePreview ? (
                          <div className="relative inline-block">
                            <img src={selfiePreview} alt="selfie" className="w-28 h-28 object-cover rounded-lg border-2 border-orange-300" />
                            <button
                              onClick={() => { setSelfieFile(null); setSelfiePreview(null) }}
                              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                            >✕</button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => selfieInputRef.current?.click()}
                              className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-orange-300 rounded-lg text-orange-600 text-sm hover:bg-orange-100 transition-colors"
                            >
                              <Camera size={16} /> Open Camera &amp; Take Selfie
                            </button>
                            <p className="text-xs text-orange-500 mt-1.5">
                              Gallery uploads are not accepted. A live photo is required.
                            </p>
                          </>
                        )}
                      </div>
                    )}

                    {pendingClock.needsNote && (
                      <div>
                        <p className="text-sm text-gray-600 mb-2 flex items-center gap-1.5">
                          <AlertTriangle size={14} className="text-orange-500" />
                          You are leaving before 7:00 PM. Reason is required.
                        </p>
                        <textarea
                          value={earlyNote}
                          onChange={e => setEarlyNote(e.target.value)}
                          placeholder="Reason for early logout…"
                          rows={2}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                      </div>
                    )}

                    <Button
                      onClick={handlePendingSubmit}
                      disabled={clockLoading}
                      className="bg-orange-500 hover:bg-orange-600 text-white flex items-center gap-2"
                    >
                      {clockLoading ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
                      Submit Clock {pendingClock.action === 'in' ? 'In' : 'Out'}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Status messages for non-working conditions */}
          {status === 'holiday' && (
            <div className="flex items-center gap-3 p-4 bg-purple-50 border border-purple-200 rounded-lg text-purple-700">
              <CalendarDays size={18} /> <span className="text-sm font-medium">Today is a company holiday{today?.holiday_name ? `: ${today.holiday_name}` : ''}. Enjoy your day off!</span>
            </div>
          )}
          {status === 'sunday' && (
            <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg text-gray-600">
              <Sun size={18} /> <span className="text-sm font-medium">Sunday — Rest day. See you Monday!</span>
            </div>
          )}
          {status === 'leave' && (
            <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-700">
              <Umbrella size={18} /> <span className="text-sm font-medium">You have approved leave today.</span>
            </div>
          )}
        </div>
      )}

      {/* ── CALENDAR & LEAVES TAB ─────────────────────────────────────────── */}
      {tab === 'calendar' && (
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-5">
              {monthQ.isLoading ? (
                <div className="flex justify-center py-8 text-gray-400"><Loader2 className="animate-spin" /></div>
              ) : (
                <MonthCalendar
                  data={monthQ.data || []}
                  year={calYear}
                  month={calMonth}
                  onPrev={() => {
                    if (calMonth === 1) { setCalMonth(12); setCalYear(y => y - 1) }
                    else setCalMonth(m => m - 1)
                  }}
                  onNext={() => {
                    if (calMonth === 12) { setCalMonth(1); setCalYear(y => y + 1) }
                    else setCalMonth(m => m + 1)
                  }}
                />
              )}
            </CardContent>
          </Card>

          {/* Leave Requests */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">My Leave Requests</CardTitle>
                {!showLeaveForm && (
                  <Button
                    size="sm"
                    onClick={() => setShowLeaveForm(true)}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <Plus size={14} /> Request Leave
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              {/* Leave request form */}
              {showLeaveForm && (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">New Leave Request</p>
                    <button onClick={() => { setShowLeaveForm(false); setLeaveError('') }}>
                      <X size={16} className="text-gray-400" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">From</label>
                      <input
                        type="date"
                        value={leaveForm.start_date}
                        onChange={e => setLeaveForm(p => ({ ...p, start_date: e.target.value }))}
                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">To</label>
                      <input
                        type="date"
                        value={leaveForm.end_date}
                        onChange={e => setLeaveForm(p => ({ ...p, end_date: e.target.value }))}
                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                      />
                    </div>
                  </div>
                  {leaveDays > 0 && (
                    <p className="text-xs text-orange-600 font-medium">{leaveDays} day{leaveDays > 1 ? 's' : ''} selected</p>
                  )}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Reason</label>
                    <textarea
                      value={leaveForm.reason}
                      onChange={e => setLeaveForm(p => ({ ...p, reason: e.target.value }))}
                      placeholder="Reason for leave…"
                      rows={2}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                  {leaveError && <p className="text-xs text-red-500">{leaveError}</p>}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => leaveMut.mutate(leaveForm)}
                      disabled={leaveMut.isPending}
                      className="flex items-center gap-1.5"
                    >
                      {leaveMut.isPending ? <Loader2 size={13} className="animate-spin" /> : null}
                      Submit Request
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setShowLeaveForm(false); setLeaveError('') }}>
                      Cancel
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <Info size={11} /> Leave must be requested at least 24 hours in advance.
                  </p>
                </div>
              )}

              {/* Leave table */}
              {leavesQ.isLoading ? (
                <div className="text-center text-gray-400 py-4"><Loader2 className="animate-spin mx-auto" /></div>
              ) : !leavesQ.data?.length ? (
                <p className="text-sm text-gray-400 text-center py-4">No leave requests yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 text-xs text-gray-400 font-medium">Period</th>
                        <th className="text-left py-2 text-xs text-gray-400 font-medium">Days</th>
                        <th className="text-left py-2 text-xs text-gray-400 font-medium">Reason</th>
                        <th className="text-left py-2 text-xs text-gray-400 font-medium">Status</th>
                        <th className="text-left py-2 text-xs text-gray-400 font-medium">Note</th>
                        <th className="py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {leavesQ.data.map(l => (
                        <tr key={l.id} className="hover:bg-gray-50">
                          <td className="py-2.5 text-gray-700 whitespace-nowrap">
                            {fmtDate(l.start_date?.slice?.(0,10) || l.start_date)}
                            {l.start_date !== l.end_date && ` → ${fmtDate(l.end_date?.slice?.(0,10) || l.end_date)}`}
                          </td>
                          <td className="py-2.5 text-gray-600">{l.num_days}d</td>
                          <td className="py-2.5 text-gray-600 max-w-[160px] truncate">{l.reason}</td>
                          <td className="py-2.5">
                            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border',
                              l.status === 'approved' ? 'bg-green-100 text-green-700 border-green-200' :
                              l.status === 'rejected' ? 'bg-red-100 text-red-700 border-red-200' :
                              'bg-yellow-100 text-yellow-700 border-yellow-200'
                            )}>
                              {l.status.charAt(0).toUpperCase() + l.status.slice(1)}
                            </span>
                          </td>
                          <td className="py-2.5 text-gray-500 text-xs max-w-[120px] truncate">{l.review_note || '—'}</td>
                          <td className="py-2.5">
                            {l.status === 'pending' && (
                              <button
                                onClick={() => cancelLeaveMut.mutate(l.id)}
                                disabled={cancelLeaveMut.isPending}
                                className="text-xs text-red-500 hover:text-red-700 hover:underline"
                              >
                                Cancel
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── HOLIDAYS TAB ──────────────────────────────────────────────────── */}
      {tab === 'holidays' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays size={16} /> Company Holidays
              </CardTitle>
              <div className="flex items-center gap-2">
                <button onClick={() => setHolYear(y => y - 1)} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={16} /></button>
                <span className="text-sm font-semibold text-gray-700 w-12 text-center">{holYear}</span>
                <button onClick={() => setHolYear(y => y + 1)} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={16} /></button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {holQ.isLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="animate-spin text-gray-400" /></div>
            ) : !holQ.data?.length ? (
              <p className="text-sm text-gray-400 text-center py-6">No holidays added for {holYear}.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {holQ.data.map(h => (
                  <div key={h.id} className="flex items-center gap-3 py-3">
                    <div className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{h.name}</p>
                      <p className="text-xs text-gray-400">{fmtDate(h.date?.toISOString?.().slice(0,10) || h.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
