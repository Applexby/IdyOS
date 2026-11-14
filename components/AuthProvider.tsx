'use client';
import { SessionProvider } from 'next-auth/react';
import { FeedbackProvider } from '@/components/ui/Feedback';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <FeedbackProvider>{children}</FeedbackProvider>
    </SessionProvider>
  );
}
