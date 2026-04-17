'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost, ApiError } from '../../../../lib/api';

export default function NewOrg() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [zip, setZip] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiPost('/api/v1/orgs', { name, address, zip, timezone });
      router.push('/app');
    } catch (err) {
      setError(err instanceof ApiError ? err.problem.detail ?? err.problem.title : 'Failed to create org.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">New organization</h1>
      <label className="block">
        <span className="text-sm font-medium">Name</span>
        <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Address</span>
        <input className="input mt-1" value={address} onChange={(e) => setAddress(e.target.value)} required />
      </label>
      <label className="block">
        <span className="text-sm font-medium">ZIP</span>
        <input className="input mt-1" value={zip} onChange={(e) => setZip(e.target.value)} required />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Timezone (IANA)</span>
        <input className="input mt-1" value={timezone} onChange={(e) => setTimezone(e.target.value)} required />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button className="btn">Create</button>
    </form>
  );
}
