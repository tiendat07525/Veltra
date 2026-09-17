'use client';

import { useRouter } from '@/lib/navigation';
import { AuthView } from '@/components/common/AuthView';

export default function RegisterPage() {
  const router = useRouter();

  return (
    <AuthView
      onLoginSuccess={() => {
        router.push('/chat');
      }}
    />
  );
}
