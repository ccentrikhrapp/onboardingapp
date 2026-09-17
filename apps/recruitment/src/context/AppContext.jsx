import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { listAllJobs, createJob as createJobApi, deleteJob as deleteJobApi } from '../api/jobs.js';
import { jobFromDb } from '../api/mappers.js';

/**
 * Thin app-wide state: role/profile come straight from real auth, jobs come
 * from the database. There is no offline/demo data — if a backend isn't
 * configured yet, pages show that plainly instead of falling back to fake data.
 */
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const auth = useAuth();

  const [liveJobs, setLiveJobs] = useState(null);
  const reloadJobs = useCallback(() => {
    if (!auth.configured) return Promise.resolve();
    return listAllJobs()
      .then((rows) => setLiveJobs((rows || []).map(jobFromDb)))
      .catch(() => setLiveJobs([]));
  }, [auth.configured]);

  useEffect(() => {
    let cancelled = false;
    if (auth.configured) {
      listAllJobs()
        .then((rows) => !cancelled && setLiveJobs((rows || []).map(jobFromDb)))
        .catch(() => !cancelled && setLiveJobs([]));
    }
    return () => {
      cancelled = true;
    };
  }, [auth.configured, auth.role]);

  const createJob = useCallback(
    async (payload) => {
      const row = await createJobApi(payload);
      const job = jobFromDb(row);
      setLiveJobs((prev) => [job, ...(prev || [])]);
      return job;
    },
    []
  );

  const deleteJob = useCallback(async (id) => {
    await deleteJobApi(id);
    setLiveJobs((prev) => (prev || []).filter((j) => j.id !== id));
  }, []);

  const selectors = useMemo(() => {
    const allJobs = liveJobs || [];
    return {
      jobs: allJobs,
      publishedJobs: allJobs.filter((j) => !j.status || j.status === 'published'),
      jobsLoading: auth.configured && liveJobs === null,
      getJob: (id) => allJobs.find((j) => j.id === id || j.code === id) || null,
    };
  }, [auth.configured, liveJobs]);

  const value = useMemo(
    () => ({
      role: auth.role,
      profile: auth.profile,
      authConfigured: auth.configured,
      authLoading: auth.loading,
      signOut: auth.signOut,
      reloadJobs,
      createJob,
      deleteJob,
      ...selectors,
    }),
    [auth.role, auth.profile, auth.configured, auth.loading, auth.signOut, reloadJobs, createJob, deleteJob, selectors]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
