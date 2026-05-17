# GoalSync - In-House Goal Setting & Tracking Portal

GoalSync is a simple full-stack web application for employee goal setting, manager approvals, quarterly check-ins, analytics, and governance tracking. It is designed to be beginner-friendly, easy to explain during a hackathon, and built only with HTML, CSS, vanilla JavaScript, Node.js, Express.js, MongoDB, and Mongoose.

## Folder Structure

```text
goal-portal/
├── server/
│   ├── models/
│   ├── routes/
│   ├── middleware/
│   ├── controllers/
│   ├── utils/
│   ├── config/
│   └── app.js
├── public/
│   ├── css/
│   ├── js/
│   ├── pages/
│   └── images/
├── .env.example
├── DEPLOYMENT.md
├── package.json
└── README.md
```

## Core Features

- Employee, Manager, and Admin roles
- Shared profile page for all roles
- JWT authentication with bcrypt password hashing
- Demo Microsoft Entra ID SSO route
- Goal drafting, editing, deletion, and bulk submission
- Validation for goal count, weightage minimum, and exact 100% submission total
- Field limits so weightage stays within `0-100` and numeric values do not go below `0`
- Manager approval workflow with approve, reject, and rework actions
- Shared goal assignment for multiple employees
- Quarterly check-in workflow with score calculation
- Audit trail stored in MongoDB
- Weekly escalation checks using `node-cron`
- Email notifications using Nodemailer
- Microsoft Teams webhook notifications
- Reports with CSV and Excel export
- Dashboard analytics using Chart.js

## Tech Stack

- Frontend: HTML, CSS, Vanilla JavaScript, Fetch API, Chart.js CDN
- Backend: Node.js, Express.js
- Database: MongoDB Atlas with Mongoose
- Auth: JWT and bcryptjs

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Update the `.env` file with MongoDB, JWT, email, Teams, and Microsoft values.

### 3. Start the app

```bash
npm run dev
```

Visit [http://localhost:5000](http://localhost:5000).

## API Overview

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/sso`
- `GET /api/auth/me`

### Goals

- `GET /api/goals`
- `POST /api/goals`
- `PUT /api/goals/:id`
- `DELETE /api/goals/:id`
- `POST /api/goals/submit-all`
- `POST /api/goals/:id/approve`
- `POST /api/goals/:id/reject`
- `POST /api/goals/:id/unlock`
- `POST /api/goals/:id/actuals`
- `POST /api/goals/:id/checkin`
- `POST /api/goals/shared/push`

### Manager

- `GET /api/manager/team-goals`

### Admin

- `GET /api/admin/dashboard`
- `GET /api/admin/audit-logs`
- `GET /api/admin/reports`
- `GET /api/admin/escalations`

## Validation Rules Implemented

- Max 8 goals per employee
- Minimum 10% weightage per goal
- Draft and rework goals must total exactly 100% before submission
- Approved goals are locked
- Employees can only edit their own unlocked goals
- Managers can only view and act on their own department team data
- Shared goals keep title and target controlled by manager or admin
- Quarterly check-ins only work during active windows

## Quarterly Window Logic

- Goal Setting: May and June
- Q1 check-in: July
- Q2 check-in: October
- Q3 check-in: January
- Q4 check-in: March and April

## Progress Score Rules

- Numeric/Percentage Min: `achievement / target`
- Numeric/Percentage Max: `target / achievement`
- Timeline: 100% if completed on time, otherwise 60%
- Zero-based: 100% only when achievement is 0

## Demo Flow

1. Register an Admin and Manager account.
2. Register an Employee with the Manager selected.
3. Login as Employee and create goals.
4. Ensure draft goals total 100%, then submit all.
5. Login as Manager and approve or return goals.
6. Login as Employee and submit actuals/check-ins during an active window.
7. Login as Admin to see reports, analytics, audit logs, and escalations.

## Notes for Hackathon Presentation

- The app is intentionally modular and easy to explain.
- Microsoft SSO is implemented as a lightweight Graph-based flow through `/api/auth/sso`.
- Teams notifications are webhook-based for a fast demo setup.
- Excel export uses an HTML table with Excel MIME type to stay dependency-light.

## Deployment

Detailed deployment steps are available in [DEPLOYMENT.md](/Users/bhavyanigam/Documents/GoalSync/goal-portal/DEPLOYMENT.md).
