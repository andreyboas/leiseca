import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import firebaseConfig from '@/firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
auth.languageCode = 'pt-BR';

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error(
        'Não foi possível conectar ao Firebase. Verifique a configuração em firebase-applet-config.json.'
      );
    }
  }
}

if (typeof window !== 'undefined') {
  void testConnection();
}

export interface PerfilUsuarioFirestore {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  provider: 'google' | 'password';
  emailVerified: boolean;
}

function detectarProvedor(user: User): 'google' | 'password' {
  const usaGoogle = user.providerData.some(
    (p) => p.providerId === 'google.com'
  );
  return usaGoogle ? 'google' : 'password';
}

function sanitizarTexto(valor: string | null | undefined, max: number): string {
  return (valor || '').trim().slice(0, max);
}

export async function sincronizarPerfilUsuario(
  user: User
): Promise<PerfilUsuarioFirestore | null> {
  if (!user.emailVerified || !user.email) {
    return null;
  }

  const userPath = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  const displayNameBruto =
    user.displayName || user.email.split('@')[0] || 'Estudante';
  const displayName = sanitizarTexto(displayNameBruto, 120) || 'Estudante';
  const email = sanitizarTexto(user.email, 320);
  const photoURL = sanitizarTexto(user.photoURL, 500);
  const provider = detectarProvedor(user);

  let existente = false;
  try {
    const snap = await getDoc(ref);
    existente = snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  if (!existente) {
    const payload: Record<string, unknown> = {
      uid: user.uid,
      email,
      displayName,
      provider,
      emailVerified: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (photoURL) {
      payload.photoURL = photoURL;
    }

    try {
      await setDoc(ref, payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, userPath);
    }
  } else {
    const payloadAtualizacao: Record<string, unknown> = {
      displayName,
      emailVerified: true,
      updatedAt: serverTimestamp(),
    };
    if (photoURL) {
      payloadAtualizacao.photoURL = photoURL;
    }

    try {
      await updateDoc(ref, payloadAtualizacao);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, userPath);
    }
  }

  return {
    uid: user.uid,
    email,
    displayName,
    ...(photoURL ? { photoURL } : {}),
    provider,
    emailVerified: true,
  };
}

export function traduzirErroAuth(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: string }).code)
      : '';

  switch (code) {
    case 'auth/email-already-in-use':
      return 'Este e-mail já está cadastrado. Tente entrar na aba "Entrar" ou recuperar sua senha.';
    case 'auth/invalid-email':
      return 'Informe um endereço de e-mail válido.';
    case 'auth/weak-password':
      return 'A senha deve ter pelo menos 6 caracteres.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou senha incorretos.';
    case 'auth/user-disabled':
      return 'Esta conta foi desativada.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas em sequência. Aguarde alguns instantes e tente novamente.';
    case 'auth/popup-closed-by-user':
      return 'A janela de login do Google foi fechada antes da conclusão.';
    case 'auth/popup-blocked':
      return 'O navegador bloqueou a janela do Google. Permita pop-ups para este site e tente novamente.';
    case 'auth/cancelled-popup-request':
      return 'Login cancelado. Tente novamente.';
    case 'auth/network-request-failed':
      return 'Sem conexão com a internet para autenticar. Verifique sua rede e tente novamente.';
    case 'auth/operation-not-allowed':
      return 'O método E-mail/Senha ainda não foi ativado no Console do Firebase (Authentication → Sign-in method).';
    case 'auth/unauthorized-domain':
      return 'Este domínio precisa ser autorizado no Console do Firebase (Authentication → Settings → Authorized domains).';
    default:
      return error instanceof Error && error.message
        ? `Não foi possível concluir a autenticação (${code || 'erro inesperado'}).`
        : 'Não foi possível concluir a autenticação. Tente novamente.';
  }
}
