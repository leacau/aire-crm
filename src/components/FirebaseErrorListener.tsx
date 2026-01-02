'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import type { FirestorePermissionError } from '@/firebase/errors';

// This is a client component that will listen for the custom event.
export function FirebaseErrorListener() {
  useEffect(() => {
    const handleError = (event: Event) => {
      const customEvent = event as CustomEvent<FirestorePermissionError>;
      // Re-throw the error so Next.js can catch it and display the overlay.
      // The custom error object with its rich context will be serialized and shown.
      throw customEvent.detail;
    };

    errorEmitter.on('permission-error', handleError);

    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, []);

  return null; // This component does not render anything.
}
