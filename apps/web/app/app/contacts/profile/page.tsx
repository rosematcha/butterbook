import { Suspense } from 'react';
import ContactProfilePage from './profile-client';
import { SkeletonBlock } from '../../../components/skeleton-rows';

export default function Page() {
  return (
    <Suspense fallback={<SkeletonBlock className="h-48 w-full" />}>
      <ContactProfilePage />
    </Suspense>
  );
}
