# GitHub Workflow Environment Variables Setup

To enable the scheduled news pipeline workflow, you need to configure the following secrets in your GitHub repository settings:

## Required Repository Secrets

### 1. Supabase Configuration
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous public key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for server operations)
- `SUPABASE_STORAGE_BUCKET` - Storage bucket name for files

### 2. Google Gemini AI
- `GOOGLE_GEMINI_API_KEY` - API key for Google Gemini AI service

### 3. Email Configuration
- `EMAIL_HOST` - SMTP server hostname (e.g., smtp.gmail.com)
- `EMAIL_PORT` - SMTP port (usually 587 or 465)
- `EMAIL_USER` - Email account username
- `EMAIL_PASSWORD` - Email account password or app password

### 4. GitHub Workflow
- `GITHUB_TOKEN` - GitHub personal access token with workflow permissions
- `GITHUB_REPOSITORY` - Repository name in format "username/repo-name" (optional, defaults to current repo)
- `PIPELINE_API_KEY` - API key for pipeline authentication (optional)

### 5. Application
- `NEXT_PUBLIC_APP_URL` - Your deployed application URL (for API calls from workflow)

## How to Add Secrets

1. Go to your GitHub repository
2. Click on **Settings** tab
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Add each secret with its corresponding value

## Workflow Features

The GitHub workflow (`news-pipeline.yml`) supports:

- **Manual Trigger**: Run immediately with custom parameters
- **Scheduled Runs**: Predefined times (6 AM, 12 PM, 6 PM UTC)
- **Custom Scheduling**: User-defined date and time
- **Multiple Languages**: Support for various languages
- **News Categories**: All major news categories
- **State/Location**: Regional news and weather

## Usage

### From the UI:
1. Go to the "Schedule Later" tab in the app
2. Configure your preferences
3. Choose timing (now or schedule for later)
4. Submit - the workflow will be triggered automatically

### Manual GitHub Trigger:
1. Go to **Actions** tab in your repository
2. Click on **News Pipeline Scheduler** workflow
3. Click **Run workflow**
4. Fill in the required parameters
5. Click **Run workflow**

## Troubleshooting

- Check that all required secrets are properly configured
- Ensure your GitHub token has `workflow` and `repo` permissions
- Verify your application URL is accessible from GitHub runners
- Check workflow logs for detailed error messages

## Security Notes

- Never commit secrets to your repository
- Use environment-specific secrets for different deployments
- Regularly rotate your API keys and tokens
- Use the principle of least privilege for permissions