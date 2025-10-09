# LabMate360 Backend API

Backend API for LabMate360 - AI-Powered Smart Clinical Laboratory Software

## 🚀 Features

- **User Authentication**: Registration and login with JWT tokens
- **MongoDB Integration**: Secure user data storage
- **Role-Based Access**: Support for user, staff, and admin roles
- **Password Security**: Bcrypt password hashing
- **CORS Support**: Frontend integration ready
- **Error Handling**: Comprehensive error management
- **Email Notifications**: Staff welcome emails with credentials

## 🛠️ Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM for MongoDB
- **JWT** - Authentication tokens
- **Bcrypt** - Password hashing
- **CORS** - Cross-origin resource sharing
- **Nodemailer** - Email notifications

## 📁 Project Structure

```
backend/
├── config/
│   └── database.js          # MongoDB connection
├── middleware/
│   └── auth.js              # Authentication middleware
├── models/
│   └── User.js              # User schema
├── routes/
│   └── auth.js              # Authentication routes
├── services/
│   └── emailService.js      # Email notification service
├── .env                     # Environment variables
├── package.json             # Dependencies
└── server.js                # Main server file
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- MongoDB Atlas account (or local MongoDB)
- npm or yarn

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Environment Setup**
   - Create a `.env` file in the backend directory
   - Configure MongoDB connection
   - Set JWT secret for development
   - Configure email settings for staff notifications (see Email Configuration section)

3. **Start Development Server**
   ```bash
   npm run dev
   ```

4. **Start Production Server**
   ```bash
   npm start
   ```

## 📡 API Endpoints

### Authentication Routes (`/api/auth`)

#### POST `/api/auth/register`
Register a new user (patient only)

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "1234567890",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "user_id",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phone": "1234567890",
      "role": "user",
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "token": "jwt_token_here"
  }
}
```

#### POST `/api/auth/login`
Login user with email and password

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "user_id",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phone": "1234567890",
      "role": "user",
      "lastLogin": "2024-01-01T00:00:00.000Z"
    },
    "token": "jwt_token_here"
  }
}
```

#### GET `/api/auth/me`
Get current user profile (requires authentication)

**Headers:**
```
Authorization: Bearer jwt_token_here
```

#### POST `/api/auth/logout`
Logout user (client-side token removal)

### Health Check

#### GET `/api/health`
Check API status

**Response:**
```json
{
  "success": true,
  "message": "LabMate360 Backend API is running",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "environment": "development"
}
```

## 🔐 Security Features

- **Password Hashing**: Bcrypt with salt rounds
- **JWT Tokens**: Secure authentication tokens
- **Input Validation**: Mongoose schema validation
- **CORS Protection**: Configured for frontend domain
- **Error Handling**: No sensitive data exposure

## 🗄️ Database Schema

### User Model

```javascript
{
  firstName: String (required, max 50 chars),
  lastName: String (required, max 50 chars),
  email: String (required, unique, validated),
  phone: String (required, validated),
  password: String (required, min 6 chars, hashed),
  role: String (enum: ['user', 'staff', 'admin'], default: 'user'),
  isActive: Boolean (default: true),
  lastLogin: Date,
  createdAt: Date (auto),
  updatedAt: Date (auto)
}
```

## 🌍 Environment Variables

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database
JWT_SECRET=your_jwt_secret_key
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Email Configuration (Required for staff notifications)
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
```

### 📧 Email Configuration

The system sends welcome emails to staff members when they are created. To enable email notifications:

1. **Gmail Setup (Recommended)**:
   - Use a Gmail account
   - Enable 2-Factor Authentication
   - Generate an App Password (not your regular password)
   - Set `EMAIL_USER` to your Gmail address
   - Set `EMAIL_PASSWORD` to your App Password

2. **Alternative Email Providers**:
   - Modify `emailService.js` to use other providers (Outlook, Yahoo, etc.)
   - Update the transporter configuration accordingly

3. **Email Features**:
   - Staff welcome emails with login credentials
   - Professional HTML templates
   - Security notices and instructions
   - Role-specific information

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server
- `npm test` - Run tests (not implemented yet)

### API Testing

You can test the API using:

1. **Frontend Integration**: The frontend is already connected
2. **Postman**: Import the API endpoints
3. **cURL**: Command line testing
4. **Browser**: Visit `/api/health` for status check

## 📱 Frontend Integration

The frontend is already configured to work with this backend:

- **API Base URL**: `http://localhost:5000/api`
- **Authentication**: JWT tokens stored in localStorage
- **CORS**: Configured for `http://localhost:5173`

## 🚀 Deployment

For production deployment:

1. Update environment variables
2. Set `NODE_ENV=production`
3. Configure production MongoDB URI
4. Set secure JWT secret
5. Update CORS settings for production domain

## 📄 License

This project is part of LabMate360 - AI-Powered Smart Clinical Laboratory Software.

---

**LabMate360 Backend** - Secure, scalable API for laboratory management.
