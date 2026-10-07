import { callFn } from './client.js';

/** Recent emails the system has queued, across this app and HR's integration
 * calls — so a failed send is something staff can actually see, not a row
 * nobody looks at. `status`: 'all' | 'queued' | 'sent' | 'failed'. */
export const listEmailLog = (status = 'all', limit = 100) => callFn('email-log', { body: { status, limit } });
