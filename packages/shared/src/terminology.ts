// Swaps the handful of user-visible booking labels based on the org's
// `terminology` preference. Kept tiny on purpose — callers destructure the
// field they need at the call site rather than building sentences here.

export type Terminology = 'appointment' | 'visit';

export interface TerminologyCopy {
  noun: string;
  nounPlural: string;
  Noun: string;
  NounPlural: string;
  verb: string;
}

export function terminologyCopy(t: Terminology): TerminologyCopy {
  return t === 'appointment'
    ? {
        noun: 'appointment',
        nounPlural: 'appointments',
        Noun: 'Appointment',
        NounPlural: 'Appointments',
        verb: 'book',
      }
    : {
        noun: 'visit',
        nounPlural: 'visits',
        Noun: 'Visit',
        NounPlural: 'Visits',
        verb: 'add',
      };
}
