import { create } from 'zustand';
import { persist } from 'zustand/middleware'; // optional – but very useful

type User = {
  id?: string;
  email?: string;
  role: 'reader' | 'author' | null;
display_name?: string;
avatar_url?: string;
};

type AuthState = {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (data: { token: string; user: User }) => void;
  logOut: () => void;
  // optional helper
  isAuthor: () => boolean;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      setAuth: (data) =>
        set({
          user: data.user,
          token: data.token,
          isAuthenticated: true,
        }),

      logOut: () =>
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        }),

      isAuthor: () => get().user?.role === 'author',
    }),
    {
      name: 'auth-storage', // key in localStorage
      // You can also use partialize to save only some fields
      partialize: (state) => ({
        user: state.user,
        token: state.token,
      }),
    }
  )
);