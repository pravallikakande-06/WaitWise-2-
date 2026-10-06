# WaitWise: Smart Hospital Queue & Wait-Time Predictor

WaitWise tells patients not just where they are in the queue, but approximately when they will be seen.

## Features
Patient: register/login, join a queue (department, doctor, appointment type, priority), live token status with wait range + confidence, leave-queue-temporarily / return / cancel, notifications, profile, visit history. Staff/admin/doctor: overview, appointments (check-in issues a token), patients list, doctors and departments management (admin edits, staff read-only), live queue board (call next, start, complete, skip, cancel, notify, mark doctor delayed), emergency cases, analytics (Recharts). Light/dark mode, responsive layouts (bottom nav on mobile, tables become cards), toasts, skeleton/error/empty states. Live updates arrive over Socket.IO (the server tells clients to refresh after any change and pushes personal notifications as toasts), with polling kept as a fallback. Settings page: theme, saved notification preferences, change password.

## Security
bcrypt + JWT, role-based middleware, express-validator on write endpoints, rate limiting (stricter on login/register), helmet, CORS limited to `CLIENT_ORIGIN`, authenticated Socket.IO connections.

## Tests
`cd backend && npm install && npm test` runs API tests (auth, roles, queue flow, prediction, leave policy, emergencies, preferences) against an in-memory MongoDB. The first run downloads a MongoDB binary, so it needs internet.

## Run
```bash
cp .env.example .env        # fill in JWT_SECRET and seed passwords
cd backend && npm install
npm run seed                # DEMO data only
npm run dev                 # API on http://localhost:5000
# in a second terminal:
cd frontend && npm install && npm run dev   # http://localhost:5173
```
Needs a running MongoDB (local or Atlas). Demo logins: `admin@waitwise.demo`, `staff@waitwise.demo`, `doctor@waitwise.demo` (SEED_ADMIN_PASSWORD), `patient@waitwise.demo` (SEED_PATIENT_PASSWORD).

## Prediction
`wait = patientsAhead x avgConsultation x typeFactor + remaining current consult + doctor delay + recent-emergency delay`, shown as a range. Confidence depends on how many real consultations (last 7 days) the doctor has. It is an estimate, not a medical claim.

## Leave-queue policy
Only when estimated wait is 30+ min, absence capped at 30 min, 2 times per visit. Returning late sends you to the back of the line.

## API
Auth: `POST /api/auth/register|login|logout`, `GET/PUT /api/auth/me`, `PUT /api/auth/password`. Public: `GET /api/departments|doctors`. Patient: `POST /api/queue/join|leave|return|cancel`, `GET /api/queue/my-status|history`, `GET /api/notifications`, `POST /api/notifications/read`.
Staff/admin: `GET /api/admin/queues|dashboard`, `GET /api/analytics`, `POST /api/admin/queue/call-next|start|complete|skip|cancel|notify|emergency`, `POST /api/admin/doctor/delay`. Management: `GET /api/admin/patients|departments|appointments`, `POST/PUT /api/admin/doctors|departments|appointments` (doctors and departments: admin only).

## Not yet done
Heatmap view of peak hours (bar chart is used), frontend component tests, per-doctor Socket.IO rooms (updates are broadcast to everyone and clients re-fetch), email/SMS delivery. Neither the frontend build nor the test suite has been executed in the authoring environment: run `npm run build` and `npm test` first and report any errors.
