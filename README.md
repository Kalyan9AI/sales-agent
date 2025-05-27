# Voice Agent - Sales Assistant

A sophisticated AI-powered voice agent for hotel food supply sales calls.

## Features
- Real-time voice conversations with AI
- Azure Speech Services integration
- Twilio phone system integration
- Conversation history and analysis
- Order processing workflow

## Deployment Status
🚀 Ready for Azure deployment - Environment variables configured
🔧 Publish profile updated - Deployment in progress

## Live URL
https://sales-agent-c3f5ecevdefjcafc.canadacentral-01.azurewebsites.net

## Last Updated
January 27, 2025 - Publish profile secret updated

## Technology Stack

### Backend
- Node.js & Express
- Twilio Voice API
- OpenAI GPT-4
- Socket.io for real-time communication

### Frontend
- React 18
- Tailwind CSS
- Socket.io Client
- Lucide React Icons

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
# Install server dependencies
npm run install-all

# Or install manually
npm install
cd client && npm install
```

### 2. Environment Configuration

Copy the content from `env-template.txt` to a new `.env` file in the root directory:

```bash
cp env-template.txt .env
```

Then edit the `.env` file with your credentials:

```env
# Twilio Credentials (Get from https://console.twilio.com)
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
TWILIO_PHONE_NUMBER=your_twilio_phone_number_here

# OpenAI API Key (Get from https://platform.openai.com)
OPENAI_API_KEY=your_openai_api_key_here

# Server Configuration
PORT=3001
CLIENT_URL=http://localhost:3000

# Your company details for context
COMPANY_NAME=Hotel Breakfast Supplies Co.
AGENT_NAME=Sarah
```

### 3. Twilio Setup

1. Create a Twilio account at [https://console.twilio.com](https://console.twilio.com)
2. Get a phone number capable of making voice calls
3. Copy your Account SID, Auth Token, and Phone Number to the `.env` file

### 4. OpenAI Setup

1. Create an OpenAI account at [https://platform.openai.com](https://platform.openai.com)
2. Generate an API key
3. Add the API key to your `.env` file

### 5. Run the Application

```bash
# Development mode (runs both server and client)
npm run dev

# Or run separately
npm run server  # Backend on port 3001
npm run client  # Frontend on port 3000
```

### 6. Production Build

```bash
npm run build
npm start
```

## How It Works

### Call Flow

1. **Initiate Call**: Enter a US phone number and click "Start Call"
2. **Twilio Connection**: System uses Twilio to make the call
3. **AI Greeting**: OpenAI generates a natural greeting when call connects
4. **Speech Recognition**: Twilio converts customer speech to text
5. **AI Processing**: OpenAI processes the conversation and generates responses
6. **Text-to-Speech**: Twilio converts AI responses back to speech
7. **Real-time Updates**: Frontend shows live conversation via Socket.io

### AI Context

The AI agent is configured with specific context for hotel breakfast supplies:

- Professional sales representative role
- Focus on breakfast products (pastries, cereals, coffee, fruits, yogurt)
- Goals: sales, reorders, recommendations
- Natural conversation flow without hardcoded scripts
- Handles objections professionally

## API Endpoints

- `POST /api/make-call` - Initiate a new call
- `POST /api/voice/incoming` - Twilio webhook for call handling
- `POST /api/voice/process-speech` - Process customer speech
- `POST /api/voice/status` - Call status updates
- `GET /api/conversation/:callId` - Get conversation history
- `GET /api/calls` - Get active calls
- `GET /api/health` - Health check

## Socket Events

- `callUpdate` - Call status changes
- `conversationUpdate` - New messages in conversation

## Development Notes

### Twilio Webhooks

For development, you'll need to expose your local server to the internet for Twilio webhooks. Use tools like:

- [ngrok](https://ngrok.com/) (recommended)
- [localtunnel](https://localtunnel.github.io/www/)

Example with ngrok:
```bash
ngrok http 3001
```

Then update your Twilio webhook URLs to use the ngrok URL.

### Testing

- Use your own phone number for initial testing
- Monitor the console logs for debugging
- Check the live conversation panel for real-time updates

## Customization

### Modify AI Context

Edit the `SYSTEM_CONTEXT` variable in `server.js` to customize the AI agent's behavior, personality, and sales focus.

### UI Customization

The frontend uses Tailwind CSS. Modify colors, layout, and components in:
- `client/src/App.js` - Main component
- `client/tailwind.config.js` - Theme configuration
- `client/src/index.css` - Custom styles

### Add Features

Potential enhancements:
- Call recording and playback
- Conversation analytics
- CRM integration
- Multi-language support
- Call scheduling

## Troubleshooting

### Common Issues

1. **Twilio webhook errors**: Ensure your server is publicly accessible
2. **OpenAI API errors**: Check your API key and credits
3. **Socket connection issues**: Verify port 3001 is available
4. **Call quality issues**: Check internet connection and Twilio status

### Debug Mode

Set environment variable for verbose logging:
```bash
DEBUG=* npm run dev
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support or questions:
1. Check the troubleshooting section
2. Review Twilio and OpenAI documentation
3. Create an issue in the repository

---

**Note**: This application makes real phone calls and uses paid APIs (Twilio and OpenAI). Monitor your usage to avoid unexpected charges. # Trigger deployment with startup command
# Force redeploy with all files
# redeploy
# redeploy
# redeploy
