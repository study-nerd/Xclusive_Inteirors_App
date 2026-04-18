import { useState, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import {
  Button, Card, PageHeader, StatusBadge, Spinner,
  Modal, Textarea, Label, Badge, Input
} from '../../components/shared'
import { Edit, Download, CheckCircle, XCircle, Trash2, ClipboardCheck } from 'lucide-react'
import useAuthStore from '../../store/authStore'

export default function PODetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const [rejectModal,    setRejectModal]    = useState(false)
  const [deleteModal,    setDeleteModal]    = useState(false)
  const [rejectComment,  setRejectComment]  = useState('')
  const [receiptItems,   setReceiptItems]   = useState({})   // { [line_item_id]: { received_qty, side_note } }
  const [receiptError,   setReceiptError]   = useState('')
  const [imagePreview,   setImagePreview]   = useState('')
  const [challanFile,    setChallanFile]    = useState(null)
  const [challanError,   setChallanError]   = useState('')

  const { data: po, isLoading, isError, error } = useQuery({
    queryKey: ['po', id],
    queryFn: () => api.get(`/purchase-orders/${id}`).then(r => r.data.data),
  })

  const submitMutation = useMutation({
    mutationFn: () => api.post(`/purchase-orders/${id}/submit`),
    onSuccess: () => qc.invalidateQueries(['po', id]),
  })
  const approveMutation = useMutation({
    mutationFn: () => api.post(`/purchase-orders/${id}/approve`),
    onSuccess: () => qc.invalidateQueries(['po', id]),
    onError: (err) => alert(`Approval failed: ${err.response?.data?.message || err.message}`),
  })
  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/purchase-orders/${id}/reject`, { comment: rejectComment }),
    onSuccess: () => { qc.invalidateQueries(['po', id]); setRejectModal(false) },
  })
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/purchase-orders/${id}`),
    onSuccess: () => { qc.invalidateQueries(['purchase-orders']); navigate('/purchase-orders') },
    onError: (err) => alert(err.response?.data?.message || 'Delete failed'),
  })
  const receiptMutation = useMutation({
    mutationFn: (formData) => api.post(`/purchase-orders/${id}/receipt`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
    onSuccess: () => { qc.invalidateQueries(['po', id]); setReceiptError(''); setChallanFile(null) },
    onError: (err) => setReceiptError(err.response?.data?.message || 'Failed to submit receipt'),
  })
  const verifyReceiptMutation = useMutation({
    mutationFn: (status) => api.post(`/purchase-orders/${id}/verify-receipt`, { status }),
    onSuccess: () => qc.invalidateQueries(['po', id]),
    onError: (err) => alert(err.response?.data?.message || 'Verification failed'),
  })

  const handleDownload = async () => {
    const res = await api.get(`/purchase-orders/${id}/pdf`, { responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = `${po.po_number.replace(/\//g, '-')}.pdf`
    a.click()
  }

  const handleDownloadReceiptPdf = async () => {
    const res = await api.get(`/purchase-orders/${id}/receipt-pdf`, { responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = `${po.po_number.replace(/\//g, '-')}-receipt.pdf`
    a.click()
  }

  const handleSubmitReceipt = () => {
    setReceiptError('')
    setChallanError('')
    if (!challanFile) {
      setChallanError('Challan image is required')
      return
    }
    const items = (po.line_items || []).map(li => ({
      line_item_id: li.id,
      received_qty: receiptItems[li.id]?.received_qty ?? li.received_qty ?? li.quantity,
      side_note:    receiptItems[li.id]?.side_note    ?? li.receipt_note ?? '',
    }))
    const formData = new FormData()
    formData.append('items', JSON.stringify(items))
    formData.append('challan', challanFile)
    receiptMutation.mutate(formData)
  }

  const setReceiptField = (lineItemId, field, value) => {
    setReceiptItems(prev => ({
      ...prev,
      [lineItemId]: { ...prev[lineItemId], [field]: value }
    }))
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
  if (isError) {
    const message = error?.response?.data?.message || error?.message || 'Failed to load PO'
    return <div className="text-center py-16 text-red-600">{message}</div>
  }
  if (!po) return <div className="text-center py-16 text-muted-foreground">PO not found</div>

  const isAdmin    = user?.role === 'admin'
  const isManager  = user?.role === 'manager'
  const isDraft    = po.status === 'draft'
  const isPending  = po.status === 'pending_approval'
  const isApproved = po.status === 'approved'
  const isOwner    = po.created_by === user?.id
  const canEdit    = isDraft || (isAdmin && isPending)

  // Only PO creator can submit receipt; allow resubmission after admin rejection
  const canSubmitReceipt = isApproved && isOwner && (!po.receipt_submitted || po.receipt_status === 'rejected')

  const categoryTotals = {}
  for (const item of po.line_items || []) {
    const cat = item.category_name || 'Other'
    categoryTotals[cat] = (categoryTotals[cat] || 0) + parseFloat(item.total || 0)
  }

  // Check if any received qty differs from PO qty (for highlighting)
  const hasDiscrepancy = (item) => {
    const received = receiptItems[item.id]?.received_qty ?? item.received_qty
    if (received === null || received === undefined || received === '') return false
    return parseFloat(received) !== parseFloat(item.quantity)
  }

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title={po.po_number}
        subtitle={`${po.project_name} · ${po.vendor_name}`}
        action={
          <div className="flex gap-2 flex-wrap">
            {canEdit && (
              <Button variant="outline" onClick={() => navigate(`/purchase-orders/${id}/edit`)}>
                <Edit size={15} className="mr-2" />Edit
              </Button>
            )}
            {isDraft && isOwner && (
              <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
                {submitMutation.isPending && <Spinner className="mr-2" />}Submit for Approval
              </Button>
            )}
            {isAdmin && isPending && (
              <>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                >
                  {approveMutation.isPending
                    ? <><Spinner className="mr-2" />Approving...</>
                    : <><CheckCircle size={15} className="mr-2" />Approve</>}
                </Button>
                <Button variant="destructive" onClick={() => setRejectModal(true)}>
                  <XCircle size={15} className="mr-2" />Reject
                </Button>
              </>
            )}
            {isApproved && (
              <Button onClick={handleDownload}>
                <Download size={15} className="mr-2" />Download PDF
              </Button>
            )}
            {po.receipt_status === 'verified' && (
              <Button variant="outline" onClick={handleDownloadReceiptPdf}>
                <Download size={15} className="mr-2" />Receipt PDF
              </Button>
            )}
            {isAdmin && (
              <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50"
                onClick={() => setDeleteModal(true)}>
                <Trash2 size={15} className="mr-2" />Delete
              </Button>
            )}
          </div>
        }
      />

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <StatusBadge status={po.status} />
        {po.receipt_submitted && po.receipt_status === 'pending'   && <Badge variant="warning"  className="bg-yellow-100 text-yellow-800 border-yellow-300"><ClipboardCheck size={12} className="mr-1" />Receipt pending verification</Badge>}
        {po.receipt_submitted && po.receipt_status === 'verified'  && <Badge variant="success"  className="bg-green-100 text-green-800 border-green-300"><ClipboardCheck size={12} className="mr-1" />Receipt verified</Badge>}
        {po.receipt_submitted && po.receipt_status === 'rejected'  && <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-300"><ClipboardCheck size={12} className="mr-1" />Receipt rejected — resubmit required</Badge>}
        {po.receipt_submitted && !po.receipt_status                && <Badge variant="success"><ClipboardCheck size={12} className="mr-1" />Receipt submitted</Badge>}
        {po.email_sent && <Badge variant="success">✉ Email sent to vendor</Badge>}
        {po.admin_comment && <span className="text-sm text-red-600">Rejection reason: {po.admin_comment}</span>}
        <span className="text-sm text-muted-foreground">Created by: <span className="font-medium text-foreground">{po.created_by_name || '???'}</span></span>
      </div>

      {/* Project + Vendor info */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-2 font-medium">PROJECT</div>
          <div className="font-semibold">{po.project_name}</div>
          <div className="text-sm text-muted-foreground">{po.project_code}</div>
          <div className="text-sm mt-1">{po.site_address}</div>
          <div className="text-xs text-muted-foreground mt-2">
            Work: {po.work_start_date ? new Date(po.work_start_date).toLocaleDateString('en-IN') : '—'}
            {' → '}
            {po.work_end_date ? new Date(po.work_end_date).toLocaleDateString('en-IN') : '—'}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-2 font-medium">VENDOR</div>
          <div className="font-semibold">{po.vendor_name}</div>
          <div className="text-sm">{po.vendor_phone}</div>
          <div className="text-sm">{po.vendor_email}</div>
          <div className="text-sm text-muted-foreground mt-1">{po.vendor_address}</div>
          {po.vendor_gstin && <div className="text-xs text-muted-foreground mt-1">GSTIN: {po.vendor_gstin}</div>}
        </Card>
      </div>

      {/* Category summary */}
      {Object.keys(categoryTotals).length > 0 && (
        <Card className="mb-4 p-4">
          <div className="text-sm font-medium mb-3">Category Summary</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left pb-2 text-xs text-muted-foreground">S.No.</th>
                <th className="text-left pb-2 text-xs text-muted-foreground">Category</th>
                <th className="text-right pb-2 text-xs text-muted-foreground">Amount</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(categoryTotals).map(([cat, amt], i) => (
                <tr key={cat} className="border-b last:border-0">
                  <td className="py-2">{i + 1}</td>
                  <td className="py-2">{cat}</td>
                  <td className="py-2 text-right">₹{parseFloat(amt).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Line Items — with goods receipt columns when approved */}
      <Card className="mb-4">
        <div className="p-4 border-b flex items-center justify-between">
          <span className="font-semibold">Annexure — Line Items</span>
          {isApproved && !po.receipt_submitted && (
            <span className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-1 rounded">
              Goods receipt pending
            </span>
          )}
          {po.receipt_submitted && (
            <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded">
              Receipt submitted by {po.receipt_submitted_by_name}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                {['#','Item','Description','Category','UOM','PO Qty','Rate','GST%','Total',
                  ...(isApproved ? ['Received Qty','Side Note'] : [])
                ].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-xs text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(po.line_items || []).map((item, i) => {
                const currentReceivedQty = receiptItems[item.id]?.received_qty ?? item.received_qty ?? ''
                const currentSideNote    = receiptItems[item.id]?.side_note    ?? item.receipt_note ?? ''
                const disc = hasDiscrepancy(item)
                const colSpan = isApproved ? 11 : 9
                const rawImages = Array.isArray(item.images) ? item.images : []
                const normalizedImages = rawImages
                  .map((img, idx) => {
                    if (!img) return null
                    if (typeof img === 'string') {
                      return { id: `${item.id}-${idx}`, image_url: img }
                    }
                    if (typeof img.image_url === 'string') {
                      return { id: img.id ?? `${item.id}-${idx}`, image_url: img.image_url }
                    }
                    return null
                  })
                  .filter(Boolean)

                return (
                  <Fragment key={item.id}>
                    <tr className={`border-b hover:bg-gray-50 ${disc ? 'bg-yellow-50' : ''}`}>
                      <td className="px-3 py-2">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{item.item_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{item.description}</td>
                      <td className="px-3 py-2">{item.category_name}</td>
                      <td className="px-3 py-2">{item.unit}</td>
                      <td className="px-3 py-2 font-medium">{item.quantity}</td>
                      <td className="px-3 py-2">???{parseFloat(item.rate).toFixed(2)}</td>
                      <td className="px-3 py-2">{item.gst_percent}%</td>
                      <td className="px-3 py-2 font-medium">???{parseFloat(item.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>

                      {isApproved && (
                        <>
                          <td className="px-3 py-2 min-w-[110px]">
                            {canSubmitReceipt && !po.receipt_submitted ? (
                              <Input
                                type="number"
                                min="0"
                                step="0.001"
                                className={`h-8 text-sm ${disc ? 'border-yellow-400 bg-yellow-50' : ''}`}
                                value={currentReceivedQty}
                                placeholder={item.quantity}
                                onChange={e => setReceiptField(item.id, 'received_qty', e.target.value)}
                              />
                            ) : (
                              <span className={`font-medium ${disc ? 'text-yellow-700' : 'text-green-700'}`}>
                                {item.received_qty ?? '???'}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 min-w-[180px]">
                            {canSubmitReceipt && !po.receipt_submitted ? (
                              <Input
                                className={`h-8 text-sm ${disc ? 'border-red-300' : ''}`}
                                value={currentSideNote}
                                placeholder={disc ? 'Required ??? explain discrepancy' : 'Optional note'}
                                onChange={e => setReceiptField(item.id, 'side_note', e.target.value)}
                              />
                            ) : (
                              <span className="text-muted-foreground text-xs">{item.receipt_note || '???'}</span>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                    {normalizedImages.length > 0 && (
                      <tr className="border-b bg-gray-50/40">
                        <td className="px-3 py-2 text-xs text-muted-foreground">Images</td>
                        <td className="px-3 py-2" colSpan={colSpan - 1}>
                          <div className="flex flex-wrap gap-2">
                            {normalizedImages.map(img => (
                              <button
                                type="button"
                                key={img.id}
                                className="border rounded overflow-hidden"
                                onClick={() => setImagePreview(img.image_url)}
                              >
                                <img src={img.image_url} alt="Line item" className="h-16 w-16 object-cover" />
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="p-4 flex justify-end">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>₹{parseFloat(po.subtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">GST</span><span>₹{parseFloat(po.gst_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between text-base font-bold border-t pt-2"><span>Total</span><span>₹{parseFloat(po.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
          </div>
        </div>

        {/* Goods receipt submit section */}
        {canSubmitReceipt && (
          <div className="px-4 pb-4 border-t pt-4 space-y-3">
            {po.receipt_status === 'rejected' && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
                Your previous receipt was rejected by admin. Please review quantities and resubmit with a new challan.
              </div>
            )}
            {receiptError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{receiptError}</div>
            )}
            <div>
              <Label className="text-sm font-medium">Challan Image <span className="text-red-500">*</span></Label>
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="mt-1"
                onChange={e => { setChallanFile(e.target.files[0] || null); setChallanError('') }}
              />
              {challanError && <p className="text-xs text-red-600 mt-1">{challanError}</p>}
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={handleSubmitReceipt}
                disabled={receiptMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {receiptMutation.isPending
                  ? <><Spinner className="mr-2" />Submitting...</>
                  : <><ClipboardCheck size={15} className="mr-2" />Submit Goods Receipt</>}
              </Button>
              <span className="text-xs text-muted-foreground">
                Fill in received quantities above. Side note required where quantities differ.
              </span>
            </div>
          </div>
        )}

        {/* Admin: verify or reject submitted receipt */}
        {isAdmin && po.receipt_submitted && po.receipt_status === 'pending' && (
          <div className="px-4 pb-4 border-t pt-4">
            <div className="text-sm font-medium mb-3">Verify Goods Receipt</div>
            {po.receipt_challan_url && (
              <div className="mb-3">
                <span className="text-xs text-muted-foreground">Challan:</span>
                <a
                  href={po.receipt_challan_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-xs text-blue-600 underline"
                >
                  View challan
                </a>
              </div>
            )}
            <div className="flex gap-3">
              <Button
                className="bg-green-600 hover:bg-green-700"
                onClick={() => verifyReceiptMutation.mutate('verified')}
                disabled={verifyReceiptMutation.isPending}
              >
                {verifyReceiptMutation.isPending ? <Spinner className="mr-2" /> : <CheckCircle size={15} className="mr-2" />}
                Verify Receipt
              </Button>
              <Button
                variant="destructive"
                onClick={() => verifyReceiptMutation.mutate('rejected')}
                disabled={verifyReceiptMutation.isPending}
              >
                <XCircle size={15} className="mr-2" />Reject Receipt
              </Button>
            </div>
          </div>
        )}

        {/* Show verification info once verified */}
        {po.receipt_status === 'verified' && po.receipt_verified_by_name && (
          <div className="px-4 pb-4 border-t pt-3 text-xs text-muted-foreground">
            Verified by <span className="font-medium text-foreground">{po.receipt_verified_by_name}</span>
            {po.receipt_verified_at && ` on ${new Date(po.receipt_verified_at).toLocaleDateString('en-IN')}`}
          </div>
        )}
      </Card>

      {/* Reject Modal */}
      <Modal open={rejectModal} onClose={() => setRejectModal(false)} title="Reject Purchase Order">
        <Label>Reason for rejection</Label>
        <Textarea className="mt-2" rows={3} value={rejectComment} onChange={e => setRejectComment(e.target.value)} placeholder="Explain why this PO is being rejected..." />
        <div className="flex gap-3 mt-4">
          <Button variant="destructive" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}>
            {rejectMutation.isPending && <Spinner className="mr-2" />}Reject PO
          </Button>
          <Button variant="outline" onClick={() => setRejectModal(false)}>Cancel</Button>
        </div>
      </Modal>

      {/* Image Preview */}
      <Modal open={!!imagePreview} onClose={() => setImagePreview('')} title="Image Preview" className="max-w-2xl">
        {imagePreview && (
          <img src={imagePreview} alt="Preview" className="w-full h-auto rounded border" />
        )}
      </Modal>


      {/* Delete Modal */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Delete Purchase Order Permanently">
        <div className="p-4 bg-red-50 border border-red-200 rounded text-sm text-red-800 mb-4">
          <strong>Warning:</strong> Permanently delete <strong>{po.po_number}</strong>? This cannot be undone.
        </div>
        <div className="flex gap-2">
          <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending && <Spinner className="mr-2" />}Delete Permanently
          </Button>
          <Button variant="outline" onClick={() => setDeleteModal(false)}>Cancel</Button>
        </div>
      </Modal>
    </div>
  )
}
