'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthed } from '@/lib/auth';

export default function StartGate() {
  const router = useRouter();
  useEffect(() => {
    if (isAuthed()) router.replace('/app');   // masuk ke App Home (create/join)
    else router.replace('/login');            // belum login ➜ ke login
  }, [router]);
  return <main className="p-6 text-center">Checking session…</main>;
}
