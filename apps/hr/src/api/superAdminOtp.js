import { callFn } from './client.js';

/** Super Admin only — the server resolves the target email itself; the
    client never supplies one. See AuthContext's otpRequired gate. */
export const sendSuperAdminOtp = () => callFn('send-super-admin-otp', { body: {} });

export const verifySuperAdminOtp = (code) => callFn('verify-super-admin-otp', { body: { code } });
