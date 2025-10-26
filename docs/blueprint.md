# **App Name**: MediaSales CRM

## Core Features:

- Opportunity Kanban: Visually track sales opportunities through different stages using a Kanban board, allowing drag-and-drop functionality for easy updates.
- Sales Forecasting: AI tool which analyzes the sales pipeline to predict revenue based on deal size and close probability. Forecast considers historical trends.
- Client 360 View: Comprehensive view of each client, including contact information, interactions, and associated opportunities.
- Automated Reminders: Automated reminders and notifications for upcoming tasks and deadlines using Cloud Functions scheduled alerts.
- Activity Timeline: Chronological timeline of all interactions and activities related to each account or opportunity.
- Role-Based Access Control: Secure access to the application and its features based on user roles (e.g., advisor, manager, admin).
- Data Export: Enable users to export CRM data (clients, opportunities, orders) in CSV format for offline analysis and reporting.

## Style Guidelines:

- Primary color: #eb1c24 to represent trust and communication.
- Background color: #fffffd, creating a clean, professional look.
- Accent color: #3f2d5f for highlights and calls to action.
- Body and headline font: 'Inter' (sans-serif) for a modern, neutral, and readable design.
- Use clean and professional icons to represent different actions and entities.
- Prioritize a clear and intuitive layout, ensuring key information is easily accessible.
- Subtle animations on data updates.

## Firebase Admin Configuration

- Generate a Firebase service account key in the [Firebase console](https://console.firebase.google.com/): go to *Project Settings* → *Service Accounts* → *Firebase Admin SDK* and click **Generate new private key**.
- Store the downloaded JSON file securely. Copy the following values into your environment variables:
  - `FIREBASE_ADMIN_PROJECT_ID`: the `project_id` from the JSON.
  - `FIREBASE_ADMIN_CLIENT_EMAIL`: the `client_email` field.
  - `FIREBASE_ADMIN_PRIVATE_KEY`: the `private_key` field. Replace escaped `\n` sequences with real newlines when storing locally.
- These variables allow the backend helpers in `src/server/firebase-admin.ts` and `src/server/auth.ts` to access Firestore securely and validate Firebase Authentication ID tokens.
- Client-side Firebase configuration continues to use the existing `NEXT_PUBLIC_FIREBASE_*` variables defined in `.env.example`.
