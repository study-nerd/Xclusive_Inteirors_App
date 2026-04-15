import { create } from 'zustand'
import api from '../lib/api'

const useInvoiceStore = create((set, get) => ({
  invoices: [],
  loading: false,
  error: null,

  fetchInvoices: async (filters = {}) => {
    set({ loading: true, error: null })
    try {
      const q = new URLSearchParams(
        Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
      )
      const { data } = await api.get(`/invoices?${q}`)
      set({ invoices: data.data, loading: false })
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load', loading: false })
    }
  },

  createInvoice: async (formData) => {
    const { data } = await api.post('/invoices', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    set(s => ({ invoices: [data.data, ...s.invoices] }))
    return data.data
  },

  updateInvoiceStatus: async (id, payload) => {
    const { data } = await api.put(`/invoices/${id}`, payload)
    set(s => ({
      invoices: s.invoices.map(inv => inv.id === id ? data.data : inv),
    }))
    return data.data
  },

  deleteInvoice: async (id) => {
    await api.delete(`/invoices/${id}`)
    set(s => ({ invoices: s.invoices.filter(inv => inv.id !== id) }))
  },

  addFiles: async (id, formData) => {
    const { data } = await api.post(`/invoices/${id}/files`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    set(s => ({
      invoices: s.invoices.map(inv => inv.id === id ? data.data : inv),
    }))
    return data.data
  },

  deleteFile: async (fileId, invoiceId) => {
    await api.delete(`/invoices/files/${fileId}`)
    set(s => ({
      invoices: s.invoices.map(inv =>
        inv.id === invoiceId
          ? { ...inv, files: inv.files.filter(f => f.id !== fileId) }
          : inv
      ),
    }))
  },
}))

export default useInvoiceStore
