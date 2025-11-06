
'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import type { FirestorePermissionError } from '@/firebase/errors';

// This is a client component that will listen for the custom event.
export function FirebaseErrorListener() {
  useEffect(() => {
    const handleError = (event: Event) => {
      const customEvent = event as CustomEvent<FirestorePermissionError>;
      // Re-throw the error so Next.js can catch it and display the overlay in dev.
      // In production, this will be caught by the global error handler.
      // We log it here for visibility in the browser console.
      console.error("A Firestore permission error was caught by the global listener:", customEvent.detail);
      
      // Avoid re-throwing in production to prevent crashing the app.
      if (process.env.NODE_ENV === 'development') {
         throw customEvent.detail;
      }
    };

    errorEmitter.on('permission-error', handleError);

    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, []);

  return null; // This component does not render anything.
}
