import { useCallback, useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { APT_ID } from './deepLink';

// Lets a dashboard react to a notification link such as /student-dashboard?page=requests&apt=<id>:
//  - ?page=  switches to that page (only names the dashboard lists in `validPages`)
//  - ?apt=   gives the appointment id whose details drawer should be open (24 hex characters, else ignored)
// It runs again on every navigation (location.key), so clicking a second notification while already on the
// dashboard still switches page, even when the URL text did not change.
export function useDeepLink<P extends string>(validPages: readonly P[], setActivePage: (page: P) => void) {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const page = params.get('page');
  const apt = params.get('apt');

  useEffect(() => {
    if (page && (validPages as readonly string[]).includes(page)) setActivePage(page as P);
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const aptId = apt && APT_ID.test(apt) ? apt : null;

  // Closing the drawer also clears ?page= so a later refresh does not jump back to an old page.
  const closeApt = useCallback(() => {
    setParams(() => new URLSearchParams(), { replace: true });
  }, [setParams]);

  return { aptId, closeApt };
}
