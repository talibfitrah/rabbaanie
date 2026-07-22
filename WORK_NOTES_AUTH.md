# Auth Migration Notes

## Problem
The published APK uses `opvoedapp-hdluuky8.manus.space` (old Manus server) for Google OAuth.
The URL is: `https://opvoedapp-hdluuky8.manus.space/auth/google/redirect?redirect_uri=manusapk%3A%2F%2F%2Foauth%2Fcallback`

## Root Cause
- `getApiBaseUrl()` in `constants/oauth.ts` was checking `API_BASE_URL` env var first
- The published build had `EXPO_PUBLIC_API_BASE_URL` set to the old Manus sandbox URL
- On native, it should ALWAYS use `https://api.rabbaanie.com`

## Fix Applied
- Reordered `getApiBaseUrl()`: native platform check FIRST (always returns `https://api.rabbaanie.com`)
- Web dev: derives from hostname or uses env var
- Fallback: always `https://api.rabbaanie.com`

## Backend (VM: api.rabbaanie.com)
- `/auth/login` (POST) - email/password → returns `{ success, sessionToken, user }`
- `/auth/register` (POST) - name, email, password, language → returns same
- `/auth/google/redirect` (GET) - redirects to Google OAuth (needs GOOGLE_CLIENT_ID env var)
- `/auth/google/callback` (GET) - handles Google callback, creates/finds user, redirects back with token+user

## Still Needed
- GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars on VM
- User needs to re-publish the APK after this fix

## Key Files
- `/home/ubuntu/opvoedadvies_apk/constants/oauth.ts` - getApiBaseUrl()
- `/home/ubuntu/opvoedadvies_apk/app/login.tsx` - login screen
- `/home/ubuntu/opvoedadvies_apk/app/register.tsx` - register screen
- `/home/ubuntu/opvoedadvies_apk/lib/auth-context.tsx` - auth provider
- `/home/ubuntu/opvoedadvies_apk/lib/_core/api.ts` - API calls (uses getApiBaseUrl)
- VM: `/home/murabbie/rabbaanie-api/server/web-auth.ts` - backend auth routes
