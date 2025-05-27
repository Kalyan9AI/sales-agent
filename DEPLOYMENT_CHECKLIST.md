# Azure Deployment Checklist

## Pre-Deployment ✅

- [ ] Azure account with active subscription
- [ ] GitHub repository created
- [ ] All environment variables documented
- [ ] Code tested locally
- [ ] Dependencies updated in package.json

## Azure Setup ✅

- [ ] Resource Group created (`voice-agent-rg`)
- [ ] App Service created (Node 18 LTS, Linux)
- [ ] Environment variables configured in Azure
- [ ] Publish profile downloaded

## GitHub Configuration ✅

- [ ] Code pushed to GitHub main branch
- [ ] GitHub Actions workflow file added (`.github/workflows/azure-deploy.yml`)
- [ ] GitHub secrets configured:
  - [ ] `AZURE_WEBAPP_NAME`
  - [ ] `AZURE_WEBAPP_PUBLISH_PROFILE`

## Environment Variables in Azure ✅

- [ ] `TWILIO_ACCOUNT_SID`
- [ ] `TWILIO_AUTH_TOKEN`
- [ ] `TWILIO_PHONE_NUMBER`
- [ ] `OPENAI_API_KEY`
- [ ] `AZURE_SPEECH_KEY`
- [ ] `AZURE_SPEECH_REGION`
- [ ] `AZURE_CUSTOM_VOICE_NAME`
- [ ] `PORT=8080`
- [ ] `CLIENT_URL` (your Azure app URL)
- [ ] `COMPANY_NAME`
- [ ] `AGENT_NAME`
- [ ] `WEBSITE_NODE_DEFAULT_VERSION=18-lts`

## Deployment ✅

- [ ] GitHub Actions workflow triggered
- [ ] Deployment completed successfully
- [ ] Application accessible at Azure URL
- [ ] No errors in Azure logs

## Post-Deployment ✅

- [ ] Twilio webhook URLs updated to Azure URL
  - [ ] OLD: `https://xxx.ngrok-free.app/api/voice/incoming` → REMOVED
  - [ ] NEW: `https://your-app-name.azurewebsites.net/api/voice/incoming` → ADDED
- [ ] Test call functionality
- [ ] Verify conversation history saving
- [ ] Check audio file generation
- [ ] Monitor application performance
- [ ] Verify webhook URL in logs: `🔗 Using webhook URL: https://your-app-name.azurewebsites.net`

## Webhook URL Verification ✅

- [ ] Azure App Service logs show correct webhook URL
- [ ] No more ngrok URLs in production logs
- [ ] Twilio Console updated with Azure webhook URL
- [ ] Test calls work with new webhook URLs
- [ ] Environment variables correctly set:
  - [ ] `NODE_ENV=production`
  - [ ] `CLIENT_URL=https://your-app-name.azurewebsites.net`
  - [ ] `AZURE_WEBAPP_NAME=your-app-name`

## Optional Enhancements ✅

- [ ] Custom domain configured
- [ ] SSL certificate added
- [ ] Application Insights enabled
- [ ] Auto-scaling configured
- [ ] Backup strategy implemented

## Troubleshooting Resources ✅

- [ ] Azure App Service logs accessible
- [ ] GitHub Actions logs reviewed
- [ ] Twilio webhook logs checked
- [ ] Environment variables verified

---

**Your Azure App URL**: `https://[your-app-name].azurewebsites.net`

**Twilio Webhook URL**: `https://[your-app-name].azurewebsites.net/api/voice/incoming` 