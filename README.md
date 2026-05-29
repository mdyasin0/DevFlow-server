# Team Collaboration SaaS Platform 

## Overview

This is the backend of a full stack team collaboration and project management platform. It provides REST APIs, authentication, real-time communication, and business logic for managing users, projects, tasks, and team workflows.

The system is designed to handle role-based access control, scalable data management, and SaaS-based feature limitations.

## Core Responsibilities

* Authentication and authorization
* Project and task management logic
* Team and invitation system
* Notification system
* Real-time updates using Socket.io
* Payment and subscription handling
* Email and background job processing

## Tech Stack

* Node.js
* Express.js
* MongoDB (Native Driver)
* JSON Web Token (JWT)
* Cookie Parser
* CORS
* Dotenv
* Socket.io
* Stripe
* Nodemailer
* Node-cron


## Architecture

The backend follows a REST API architecture with modular structure:

* Routes
* Controllers
* Services
* Middleware
* Database Layer

## Database Collections

* User
* Projects
* project discussions
* Notifications

## Authentication System


* JWT-based authorization
* Protected routes 
* Blocked user handling

## Role-Based Access Control

* User: Basic interaction and task handling
* Manager: Project and task management
* Admin: System control, user management, project approval

## Project Management Logic

* Project creation with pending status
* Admin approval required for visibility
* Project-level access control

## Task Management System

* Task lifecycle: Todo → Running → Done
* Task assignment by managers
* Deadline and priority control
* Task reopen and edit system

## Invitation System

* Email-based team invitation
* Duplicate prevention
* Status tracking (Pending, Approved, Rejected)

## Notification System

* Role-based notifications
* Read/unread tracking
* Real-time delivery via Socket.io

## Real-time System

Socket.io is used to:

* Send instant notifications
* Sync data across clients
* Enable live collaboration features

## Payment and SaaS Logic

* Stripe integration for subscription
* Free vs Premium feature control
* Subscription expiry management

## File Handling


* Task file attachments (restricted to premium users)

## Email System

* Invitation emails
* Deadline reminders
* Bulk email (admin feature)

## Background Jobs

* Deadline reminder system using cron jobs
* premium experity check
* Active user tracking

## Security

* JWT-based API protection
* Role-based middleware
* Secure data validation and access control

## Installation and Setup

1. Clone the repository
2. Install dependencies:
   npm install
3. Create a .env file and configure:
   MONGO_URI = 
   EMAIL_PASS=
   JWT_SECRET=
   STRIPE_SECRET_KEY=
1. Run the server:
   nodemon index.js


## Notes

* Frontend client must be configured with correct API URL
* Socket connection must match client configuration
* Sensitive credentials should not be exposed

## Purpose

This backend demonstrates the ability to design and build a secure, scalable, and production-ready system with real-time capabilities, SaaS logic, and structured architecture.
