import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  auth,
  googleProvider,
  type PerfilUsuarioFirestore,
  sincronizarPerfilUsuario,
} from '@/src/firebase';

interface AuthContextValue {
  user: User | null;
  perfil: PerfilUsuarioFirestore | null;
  authReady: boolean;
  emailVerificado: boolean;
  entrarComGoogle: () => Promise<void>;
  entrarComEmail: (email: string, senha: string) => Promise<User>;
  criarContaComEmail: (nome: string, email: string, senha: string) => Promise<User>;
  reenviarEmailVerificacao: () => Promise<void>;
  verificarStatusEmail: () => Promise<boolean>;
  enviarRecuperacaoSenha: (email: string) => Promise<void>;
  sair: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [emailVerificado, setEmailVerificado] = useState(false);
  const [perfil, setPerfil] = useState<PerfilUsuarioFirestore | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const sincronizarSeVerificado = useCallback(async (u: User | null) => {
    if (!u || !u.emailVerified) {
      setPerfil(null);
      return;
    }
    try {
      const p = await sincronizarPerfilUsuario(u);
      setPerfil(p);
    } catch (err) {
      console.warn('Falha ao sincronizar perfil no Firestore:', err);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (usuario) => {
      setUser(usuario);
      const verificado = Boolean(usuario?.emailVerified);
      setEmailVerificado(verificado);
      if (usuario && verificado) {
        await sincronizarSeVerificado(usuario);
      } else {
        setPerfil(null);
      }
      setAuthReady(true);
    });

    return () => unsub();
  }, [sincronizarSeVerificado]);

  const entrarComGoogle = useCallback(async () => {
    const cred = await signInWithPopup(auth, googleProvider);
    setUser(cred.user);
    setEmailVerificado(Boolean(cred.user.emailVerified));
    await sincronizarSeVerificado(cred.user);
  }, [sincronizarSeVerificado]);

  const entrarComEmail = useCallback(
    async (email: string, senha: string) => {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), senha);
      if (!cred.user.emailVerified) {
        await cred.user.reload();
      }
      const atualizado = auth.currentUser ?? cred.user;
      setUser(atualizado);
      setEmailVerificado(Boolean(atualizado.emailVerified));
      if (atualizado.emailVerified) {
        await atualizado.getIdToken(true);
        await sincronizarSeVerificado(atualizado);
      }
      return atualizado;
    },
    [sincronizarSeVerificado]
  );

  const criarContaComEmail = useCallback(
    async (nome: string, email: string, senha: string) => {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), senha);
      const nomeLimpo = nome.trim();
      if (nomeLimpo) {
        await updateProfile(cred.user, { displayName: nomeLimpo });
      }
      await sendEmailVerification(cred.user, {
        url: window.location.origin,
      });
      const atualizado = auth.currentUser ?? cred.user;
      setUser(atualizado);
      setEmailVerificado(Boolean(atualizado.emailVerified));
      return atualizado;
    },
    []
  );

  const reenviarEmailVerificacao = useCallback(async () => {
    const atual = auth.currentUser;
    if (!atual) {
      throw new Error('Nenhuma sessão ativa encontrada.');
    }
    await sendEmailVerification(atual, {
      url: window.location.origin,
    });
  }, []);

  const verificarStatusEmail = useCallback(async (): Promise<boolean> => {
    const atual = auth.currentUser;
    if (!atual) return false;
    await atual.reload();
    const recarregado = auth.currentUser;
    if (recarregado?.emailVerified) {
      await recarregado.getIdToken(true);
      setUser(recarregado);
      setEmailVerificado(true);
      await sincronizarSeVerificado(recarregado);
      return true;
    }
    setEmailVerificado(false);
    return false;
  }, [sincronizarSeVerificado]);

  const enviarRecuperacaoSenha = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim(), {
      url: window.location.origin,
    });
  }, []);

  const sair = useCallback(async () => {
    await signOut(auth);
    setUser(null);
    setEmailVerificado(false);
    setPerfil(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        perfil,
        authReady,
        emailVerificado,
        entrarComGoogle,
        entrarComEmail,
        criarContaComEmail,
        reenviarEmailVerificacao,
        verificarStatusEmail,
        enviarRecuperacaoSenha,
        sair,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser utilizado dentro de AuthProvider.');
  }
  return ctx;
}
