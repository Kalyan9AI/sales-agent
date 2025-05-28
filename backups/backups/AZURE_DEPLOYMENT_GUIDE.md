# Azure Deployment Guide for Voice Agent

This guide will walk you through deploying your Voice Agent application to Azure using GitHub Actions.

## Prerequisites

1. **Azure Account**: You need an active Azure subscription
2. **GitHub Account**: Your code should be in a GitHub repository
3. **Domain/Subdomain** (optional): For custom domain setup

## Step-by-Step Deployment Process

### 1. Create Azure App Service

1. **Login to Azure Portal**
   - Go to [portal.azure.com](https://portal.azure.com)
   - Sign in with your Azure account

2. **Create a Resource Group**
   - Click "Resource groups" → "Create"
   - Name: `voice-agent-rg`
   - Region: Choose your preferred region (e.g., East US)
   - Click "Review + create" → "Create"

3. **Create App Service**
   - Click "Create a resource" → "Web App"
   - **Basics:**
     - Subscription: Your subscription
     - Resource Group: `voice-agent-rg`
     - Name: `voice-agent-app` (must be globally unique)
     - Publish: Code
     - Runtime stack: Node 18 LTS
     - Operating System: Linux
     - Region: Same as resource group
   - **App Service Plan:**
     - Create new plan
     - Name: `voice-agent-plan`
     - Pricing tier: B1 (Basic) or higher
   - Click "Review + create" → "Create"

### 2. Configure Environment Variables in Azure

1. **Go to your App Service**
   - Navigate to your created App Service
   - Go to "Configuration" → "Application settings"

2. **Add Environment Variables**
   Click "New application setting" for each:
   ```
   TWILIO_ACCOUNT_SID=your_twilio_account_sid
   TWILIO_AUTH_TOKEN=your_twilio_auth_token
   TWILIO_PHONE_NUMBER=your_twilio_phone_number
   OPENAI_API_KEY=your_openai_api_key
   AZURE_SPEECH_KEY=your_azure_speech_key
   AZURE_SPEECH_REGION=your_azure_speech_region
   AZURE_CUSTOM_VOICE_NAME=luna
   PORT=8080
   CLIENT_URL=https://your-app-name.azurewebsites.net
   COMPANY_NAME=Hotel Breakfast Supplies Co.
   AGENT_NAME=Sarah
   WEBSITE_NODE_DEFAULT_VERSION=18-lts
   ```

3. **Save Configuration**
   - Click "Save" at the top
   - Wait for the restart to complete

### 3. Set Up GitHub Repository

1. **Push Your Code to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit for Azure deployment"
   git branch -M main
   git remote add origin https://github.com/yourusername/voice-agent.git
   git push -u origin main
   ```

### 4. Configure GitHub Actions Secrets

1. **Get Azure Publish Profile**
   - In Azure Portal, go to your App Service
   - Click "Get publish profile" (download button)
   - Open the downloaded file and copy its contents

2. **Set GitHub Secrets**
   - Go to your GitHub repository
   - Settings → Secrets and variables → Actions
   - Click "New repository secret"
   
   Add these secrets:
   ```
   AZURE_WEBAPP_NAME: your-app-name (from step 1)
   AZURE_WEBAPP_PUBLISH_PROFILE: [paste the publish profile content]
   ```

### 5. Deploy Using GitHub Actions

1. **Trigger Deployment**
   - Push any change to the `main` branch
   - Or go to Actions tab → "Deploy Voice Agent to Azure" → "Run workflow"

2. **Monitor Deployment**
   - Go to GitHub Actions tab
   - Watch the deployment progress
   - Check for any errors in the logs

### 6. Configure Twilio Webhook URLs

**IMPORTANT**: After deployment, you MUST update your Twilio webhook URLs from ngrok to Azure.

1. **Update Twilio Console**
   - Go to [Twilio Console](https://console.twilio.com)
   - Phone Numbers → Manage → Active numbers
   - Click your phone number
   - **OLD URL**: `https://your-ngrok-url.ngrok-free.app/api/voice/incoming`
   - **NEW URL**: `https://your-app-name.azurewebsites.net/api/voice/incoming`
   - Save the changes

2. **Test the Application**
   - Visit: `https://your-app-name.azurewebsites.net`
   - Test making calls through the interface
   - Verify calls now use Azure URLs instead of ngrok

### 7. Verify Webhook URL Changes

After deployment, check your Azure App Service logs to confirm:
- ✅ `🔗 Using webhook URL: https://your-app-name.azurewebsites.net`
- ❌ NOT: `🔗 Using webhook URL: https://xxx.ngrok-free.app`

**Environment Variables for Webhook URLs:**
```
NODE_ENV=production                                    # Automatically set by Azure
CLIENT_URL=https://your-app-name.azurewebsites.net   # Set this in Azure configuration
AZURE_WEBAPP_NAME=your-app-name                      # Set this in GitHub secrets
```

## Post-Deployment Configuration

### Custom Domain (Optional)

1. **Add Custom Domain**
   - In App Service → Custom domains
   - Click "Add custom domain"
   - Follow the verification steps

2. **SSL Certificate**
   - App Service → TLS/SSL settings
   - Add managed certificate for your domain

### Monitoring and Logging

1. **Enable Application Insights**
   - App Service → Application Insights
   - Turn on Application Insights
   - Configure monitoring

2. **View Logs**
   - App Service → Log stream
   - Or use Application Insights for detailed analytics

### Scaling (If Needed)

1. **Scale Up (Vertical)**
   - App Service → Scale up (App Service plan)
   - Choose higher tier for more CPU/memory

2. **Scale Out (Horizontal)**
   - App Service → Scale out (App Service plan)
   - Configure auto-scaling rules

## Troubleshooting

### Common Issues

1. **Environment Variables Not Loading**
   - Check Configuration → Application settings
   - Ensure all variables are set correctly
   - Restart the app service

2. **Build Failures**
   - Check GitHub Actions logs
   - Verify Node.js version compatibility
   - Check package.json dependencies

3. **Twilio Webhook Issues**
   - Verify webhook URLs in Twilio console
   - Check Azure App Service logs
   - Ensure HTTPS is used for webhooks

4. **Audio File Issues**
   - Azure App Service has limited local storage
   - Consider using Azure Blob Storage for audio files

### Useful Commands

```bash
# View Azure CLI apps
az webapp list --output table

# Stream logs
az webapp log tail --name your-app-name --resource-group voice-agent-rg

# Restart app
az webapp restart --name your-app-name --resource-group voice-agent-rg
```

## Security Considerations

1. **Environment Variables**: Never commit sensitive data to GitHub
2. **HTTPS Only**: Enable HTTPS-only in App Service settings
3. **Access Restrictions**: Configure IP restrictions if needed
4. **Authentication**: Consider adding Azure AD authentication

## Cost Optimization

1. **App Service Plan**: Start with B1, scale as needed
2. **Auto-shutdown**: Configure for development environments
3. **Monitoring**: Use Azure Cost Management to track expenses

## Support

- **Azure Documentation**: [docs.microsoft.com](https://docs.microsoft.com/azure)
- **GitHub Actions**: [docs.github.com/actions](https://docs.github.com/actions)
- **Twilio Docs**: [twilio.com/docs](https://twilio.com/docs)

---

**Note**: Replace `your-app-name`, `yourusername`, and other placeholders with your actual values. 