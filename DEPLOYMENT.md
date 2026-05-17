# GoalSync Deployment Guide

## 1. Prerequisites

- Node.js 18 or later
- MongoDB Atlas database
- SMTP email credentials
- Optional Microsoft Teams webhook
- Optional Microsoft Entra app registration

## 2. Install dependencies

```bash
npm install
```

## 3. Configure environment

Copy `.env.example` to `.env` and update these values:

- `MONGO_URI`
- `JWT_SECRET`
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`
- `TEAMS_WEBHOOK_URL`
- `APP_URL`
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_SECRET`

## 4. Run locally

```bash
npm run dev
```

Open [http://localhost:5000](http://localhost:5000).

## 5. MongoDB Atlas setup

1. Create a cluster.
2. Add a database user.
3. Add your IP address to the network access list.
4. Copy the connection string into `MONGO_URI`.

## 6. Email setup

Use a real SMTP account. For Gmail, create an app password and use:

- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=587`

## 7. Teams setup

1. Create an incoming webhook in the Teams channel.
2. Paste the webhook into `TEAMS_WEBHOOK_URL`.
3. The app sends simple MessageCard notifications with deep links.

## 8. Microsoft Entra ID setup

1. Register an app in Azure Portal.
2. Add Microsoft Graph delegated permission for `User.Read`.
3. Generate a client secret.
4. Use the app to obtain an access token on the frontend or from Postman.
5. Send that token to `POST /api/auth/sso`.

## 9. Production deployment

You can deploy this app on:

- Render
- Railway
- Cyclic
- Azure App Service

Deployment steps:

1. Push the code to GitHub.
2. Create a new Node.js web service.
3. Set all environment variables.
4. Set the start command to `npm start`.
5. Point the service to the project root `goal-portal`.

## 10. Post-deployment checks

- Confirm login and registration work.
- Create goals and submit them.
- Approve a goal as a manager.
- Submit a quarterly check-in.
- Verify CSV and Excel exports.
- Confirm cron-based escalations are being created weekly.
