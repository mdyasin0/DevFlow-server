# Team Collaboration SaaS Platform — Server

## Overview

The backend of a full-stack Team Collaboration and Project Management SaaS Platform.

It provides REST APIs and server-side business logic for managing users, projects, tasks, team collaboration, authentication, notifications, and subscription-based features.

The server is responsible for processing application requests, managing data, enforcing access permissions, and coordinating real-time communication between connected clients.

## Core Responsibilities

- Authentication and authorization
- Role-based access control
- Project and task management logic
- Project approval workflows
- Team invitation and management
- Discussion and collaboration data management
- Notification management and real-time delivery
- Subscription and premium feature management
- File upload handling
- Email processing and scheduled tasks

## Tech Stack

### Backend
- Node.js
- Express.js

### Database
- MongoDB (Native Driver)

### Authentication & Security
- JSON Web Token (JWT)
- Cookie Parser
- CORS
- Dotenv

### Real-Time Communication
- Socket.io

### Payment Integration
- Stripe

### Email & Background Processing
- Nodemailer
- Node-cron

## Architecture

The backend follows a REST API architecture with a modular structure.

Main application layers include:

- **Routes:** Define API endpoints.
- **Controllers:** Handle incoming requests and responses.
- **Services:** Manage application business logic.
- **Middleware:** Handle authentication, authorization, and request processing.
- **Database Layer:** Manage communication with MongoDB.

## Database Management

MongoDB is used to store and manage application data.

The documented data collections include:

- Users
- Projects
- Project Discussions
- Notifications

## Authentication & Authorization

- JWT-based authentication and authorization.
- Protected API routes.
- Token-based access control.
- Authentication and authorization middleware.

## Role-Based Access Control

The server enforces permissions based on user roles.

- **User:** Access to permitted application features and task-related workflows.
- **Manager:** Project and task management permissions.
- **Admin:** Administrative permissions, user management, and project approval.

## Project Management

- Handle project creation and management requests.
- Manage project approval workflows.
- Support admin approval before projects become visible.
- Enforce project-level access permissions.

## Task Management

- Manage task creation, assignment, and updates.
- Handle task status transitions:
  - Todo
  - Running
  - Done
- Support task management workflows and progress tracking.

## Team & Invitation Management

- Handle team invitation workflows.
- Process invitation-related requests.
- Manage team collaboration data.

## Discussion & Real-Time Communication

Socket.io is used to support real-time communication between the server and connected clients.

Server-side responsibilities include:

- Delivering real-time notifications.
- Sending task-related updates.
- Synchronizing relevant updates across connected clients.
- Supporting real-time collaboration features.

## Notification System

- Manage application notifications.
- Support role-based notification workflows.
- Handle notification read/unread status.
- Deliver notifications through Socket.io.

## Payment & Subscription Management

Stripe is integrated to support subscription-related operations.

- Handle subscription-related payment workflows.
- Support Free and Premium subscription plans.
- Enforce subscription-based feature restrictions.
- Manage premium feature access.

## File Handling

- Handle file upload requests.
- Support task-related file attachments.
- Apply premium subscription restrictions to file upload functionality.

## Email System

Nodemailer is used for server-side email processing.

Email-related functionality supports application workflows such as:

- Team invitation emails.
- Application email notifications.
- Scheduled email-related tasks.

## Background Jobs & Automation

Node-cron is used to schedule and execute background tasks.

It supports automated application workflows and scheduled operations.

## Installation & Setup

### Prerequisites

- Node.js
- npm
- MongoDB connection
- Required service credentials

### 1. Clone the repository

```bash
git clone YOUR_SERVER_REPOSITORY_URL
cd YOUR_SERVER_REPOSITORY_FOLDER
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root:

```env
MONGO_URI=YOUR_MONGODB_CONNECTION_STRING
EMAIL_PASS=YOUR_EMAIL_PASSWORD
JWT_SECRET=YOUR_JWT_SECRET
STRIPE_SECRET_KEY=YOUR_STRIPE_SECRET_KEY
```

Make sure all required environment variables are configured according to the server source code. Never commit real credentials or secret values to the repository.

### 4. Start the server

```bash
nodemon index.js
```

## Important Notes

- The frontend client must use the correct backend API URL.
- Socket.io client and server configurations must be compatible.
- MongoDB must be accessible for database-dependent features.
- Firebase and other external service configurations must be valid where required.
- Sensitive credentials must be stored in environment variables and never exposed publicly.

## Project Purpose

This project demonstrates practical backend development through REST API design, database management, authentication, role-based authorization, real-time communication, payment integration, and server-side business logic for a team collaboration SaaS application.
