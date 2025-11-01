# News Agent

A comprehensive news aggregation and digest system that generates personalized news reports with PDF, audio, and email delivery.

## Features

- 📰 Multi-source news collection
- 🤖 AI-powered sentiment analysis  
- 📊 Advanced analytics with charts and visualizations
- 🌤️ Weather integration
- 📧 Email delivery with PDF and audio attachments
- 🗣️ Audio generation in multiple languages
- 🌍 Multi-language support (Hindi & English)

## Setup

### Environment Variables

Copy `.env.example` to `.env` and configure the following:

#### SMTP Email Configuration (Nodemailer)

For Gmail:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM_EMAIL=your_email@gmail.com
```

**How to Get Gmail SMTP Credentials:**

**Step 1: Get SMTP_HOST, SMTP_PORT, SMTP_SECURE**
- `SMTP_HOST=smtp.gmail.com` (Gmail's SMTP server - always this)
- `SMTP_PORT=587` (Gmail's standard port - always this)
- `SMTP_SECURE=false` (Use TLS encryption - always false for port 587)

**Step 2: Get SMTP_USER and SMTP_FROM_EMAIL**
- `SMTP_USER=your_email@gmail.com` (Your Gmail email address)
- `SMTP_FROM_EMAIL=your_email@gmail.com` (Same as SMTP_USER)

**Step 3: Get SMTP_PASS (App Password)**
This is the most important step:

1. **Enable 2-Factor Authentication** (required for App Passwords):
   - Go to [myaccount.google.com](https://myaccount.google.com)
   - Click "Security" in the left sidebar
   - Under "How you sign in to Google", click "2-Step Verification"
   - Follow the setup process if not already enabled

2. **Generate App Password**:
   - Still in Security settings, click "2-Step Verification"
   - Scroll down and click "App passwords"
   - You might need to sign in again
   - Select "Mail" from the dropdown
   - Click "Generate"
   - **Copy the 16-character password** (example: `abcd efgh ijkl mnop`)
   - Use this as your `SMTP_PASS` value

**Example .env file:**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=john.doe@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
SMTP_FROM_EMAIL=john.doe@gmail.com
```

**⚠️ Security Notes:**
- Never use your regular Gmail password for `SMTP_PASS`
- Always use the generated App Password
- Keep your `.env` file private and never commit it to git

For other providers:
- **Outlook/Hotmail:** `smtp-mail.outlook.com`, port 587
- **Yahoo:** `smtp.mail.yahoo.com`, port 587
- **Custom SMTP:** Use your provider's SMTP settings

#### Other Required Variables

```env
# Database
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# AI
GOOGLE_API_KEY=your_google_api_key

# Weather
OPENWEATHER_API_KEY=your_openweather_api_key
```

### Installation

```bash
npm install
npm run dev
```

### Usage

1. Visit the app at `http://localhost:3000`
2. Select language (Hindi/English)
3. Choose news categories
4. Generate your personalized digest
5. Receive email with PDF and audio attachments

## Migration from Resend

This app now uses Nodemailer instead of Resend for better SMTP flexibility. Update your environment variables from:

```env
# Old (Resend)
RESEND_API_KEY=your_resend_key
RESEND_FROM_EMAIL=your_email
```

To:

```env
# New (Nodemailer SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM_EMAIL=your_email@gmail.com
```

## Troubleshooting

### Email Issues
- **"Authentication failed"**: Make sure you're using an App Password, not your regular Gmail password
- **"Connection refused"**: Check your SMTP settings and firewall
- **"Less secure app access"**: This is outdated - use App Passwords instead

### Common Mistakes
- Using regular password instead of App Password
- Forgetting to enable 2-Factor Authentication
- Wrong SMTP host or port settings