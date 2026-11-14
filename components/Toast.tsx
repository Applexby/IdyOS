'use client';

// Compatibilidad: las pantallas antiguas usan useToast() + <Toast />.
// Ahora los avisos se muestran con el sistema común (components/ui/Feedback),
// así todos tienen el mismo aspecto y se apilan en vez de pisarse.
import { useNotify } from '@/components/ui/Feedback';

export type ToastType = 'success' | 'error';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
}

/** @deprecated El aviso ya se muestra desde useToast().showToast; no renderiza nada. */
export function Toast(_props: ToastProps) {
  return null;
}

export function useToast() {
  const notify = useNotify();
  const showToast = (message: string, type: ToastType = 'success') => {
    if (type === 'error') notify.error(message); else notify.success(message);
  };
  return { toast: null as { message: string; type: ToastType } | null, showToast, hideToast: () => {} };
}
