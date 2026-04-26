'use client';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../lib/api';
import { useSession } from '../../lib/session';

interface Location {
  id: string;
  name: string;
  isPrimary: boolean;
}

export function LocationFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (locationId: string) => void;
}) {
  const { activeOrgId } = useSession();

  const locations = useQuery({
    queryKey: ['locations', activeOrgId],
    queryFn: () => apiGet<{ data: Location[] }>(`/api/v1/orgs/${activeOrgId}/locations`),
    enabled: !!activeOrgId,
    staleTime: 5 * 60_000,
  });

  const list = locations.data?.data ?? [];
  if (list.length <= 1) return null;

  return (
    <select
      className="input py-1 text-xs"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">All locations</option>
      {list.map((l) => (
        <option key={l.id} value={l.id}>{l.name}</option>
      ))}
    </select>
  );
}
