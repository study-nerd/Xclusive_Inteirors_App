import { create } from 'zustand'
import api from '../lib/api' // since you already have api.js

const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  loading: true,
  authChecked: false,

  login: async (email, password) => {
    set({ loading: true })
    try {
      const res = await api.post('/auth/login', { email, password })
      const user = res.data?.user || null
      set({ user, isAuthenticated: !!user, loading: false, authChecked: true })
      return user
    } catch (err) {
      set({ user: null, isAuthenticated: false, loading: false, authChecked: true })
      throw err
    }
  },

  fetchMe: async () => {
    try {
      set({ loading: true })
      const res = await api.get('/auth/me') // adjust if needed
      const user = res.data?.user || null
      set({ user, isAuthenticated: !!user, loading: false, authChecked: true })
      return user
    } catch (err) {
      set({ user: null, isAuthenticated: false, loading: false, authChecked: true })
      return null
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } catch (err) {}
    set({ user: null, isAuthenticated: false, loading: false, authChecked: true })
    window.location.href = '/login'
  }
}))

export default useAuthStore
