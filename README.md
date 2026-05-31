# VibeConnect — Social Media Platform

A full-featured mini social media platform built with Express.js, PostgreSQL (Neon), and vanilla HTML/CSS/JS.

## Features

- **Authentication** — Register, login with JWT sessions
- **User Profiles** — Avatars, bio, follower/following stats
- **Posts & Comments** — Text posts, images, video uploads (max 50MB)
- **Like / Follow** — Toggle likes on posts, follow/unfollow users
- **Admin Panel** — Manage users (suspend/activate/delete), manage posts, create admins
- **Dark / Light Mode** — Toggle with persistence
- **Responsive** — Mobile-friendly sidebar

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express.js |
| Database | PostgreSQL (Neon) |
| Auth | JWT + bcrypt |
| File Uploads | Multer |
| Frontend | HTML5, CSS3, Vanilla JS |

## Setup

```bash
cd backend
npm install
npm run dev
```

Then open `http://localhost:5000`

## Environment Variables

Create `backend/.env`:

```
DATABASE_URL=your_neon_connection_string
JWT_SECRET=your_jwt_secret
PORT=5000
```

## Project Structure

```
├── backend/
│   ├── server.js
│   ├── db/index.js
│   ├── routes/ (auth, users, posts, admin)
│   └── middleware/auth.js
└── frontend/
    ├── index.html     (Login/Register)
    ├── feed.html      (Main feed)
    ├── profile.html   (User profiles)
    ├── admin.html     (Admin panel)
    ├── css/style.css
    └── js/ (app.js, feed.js, profile.js, admin.js)
```
