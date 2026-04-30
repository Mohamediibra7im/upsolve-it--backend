# [ UPSOLVE.it ] — Intelligence Engine

> **Backend Protocol: NEXUS-CORE**
> The scalable intelligence engine powering the Upsolve.it tactical platform.

---

## 🛠️ Core Infrastructure

- **Framework**: NestJS (Node.js)
- **Database**: MongoDB (via Mongoose)
- **Authentication**: JWT (JSON Web Tokens) with Passport strategy
- **Communication**: Nodemailer (SMTP) for Signal Support processing

### 🛰️ Key Modules

#### 📖 API Documentation (Swagger)
The full API specification is available via Swagger. When the backend is running, you can access the interactive documentation directly at:
- **Direct**: `https://api.hnuicpc.tech/` (Root access)

### 1. Contact & Signal Support
Handles incoming support signals, generates premium HTML email templates, and routes transmissions to the HNU ICPC intelligence center.
- **Endpoints**: `POST /api/contact`
- **Logic**: Automated user receipts and admin notifications with dynamic headers.

### 2. Audit Logging
Real-time tracking of administrative actions and system anomalies for high-fidelity security monitoring.

### 3. Notification Engine
Tactical broadcast system for community announcements and maintenance alerts.

## 🚀 Deployment Protocol

1. **Environment Setup**:
   Create `.env`:
   ```env
   PORT=5000
   MONGODB_URI=your_mongodb_uri
   JWT_SECRET=your_secret
   SMTP_EMAIL=fcsithnucommunty@gmail.com
   SMTP_PASSWORD=your_app_password
   FRONTEND_ORIGIN=http://localhost:3000
   ```

2. **Initialization**:
   ```bash
   npm install
   npm run start:dev
   ```

## 📂 API Structure

All routes are prefixed with `/api` as per global configuration.
- `/api/auth`: Identity management
- `/api/contact`: Signal Support processing
- `/api/notifications`: Community broadcasts
- `/api/admin`: Intelligence oversight

---

<div align="center">
  <p>Standardizing Competitive Excellence • 2026</p>
</div>
