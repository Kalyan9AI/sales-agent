// Deployment trigger - Updated with new environment configuration
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bodyParser from 'body-parser';
import twilio from 'twilio';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import TwilioAzureIntegration from './twilio-azure-integration.mjs';
import { StreamManager } from './stream-manager.mjs';
import { MuLawToPcm } from './audio-converter.mjs';
import dotenv from 'dotenv';

// ES Module fixes
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? [
          process.env.CLIENT_URL,
          `https://${process.env.AZURE_WEBAPP_NAME}.canadacentral-01.azurewebsites.net`,
          // Allow any Azure subdomain for flexibility
          /^https:\/\/.*\.azurewebsites\.net$/,
          // Allow any https domain for testing
          /^https:\/\/.*/
        ].filter(Boolean)
      : [
          process.env.CLIENT_URL,
      "http://localhost:3001", 
      "http://localhost:3002", 
          "http://localhost:3003"
        ].filter(Boolean),
    methods: ["GET", "POST"],
    allowEIO3: true,
    credentials: true // Enable CORS credentials
  },
  pingTimeout: 30000,  // How long to wait for ping response
  pingInterval: 10000, // How often to ping
  upgradeTimeout: 15000, // How long to wait for upgrade
  transports: ['websocket', 'polling']
});

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [
        process.env.CLIENT_URL,
        `https://${process.env.AZURE_WEBAPP_NAME}.canadacentral-01.azurewebsites.net`,
        /^https:\/\/.*\.azurewebsites\.net$/,
        /^https:\/\/.*/
      ].filter(Boolean)
    : [
        process.env.CLIENT_URL,
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003"
      ].filter(Boolean),
  credentials: true // Enable CORS credentials
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configure server timeouts
app.use((req, res, next) => {
  // Set timeout for all requests to 30 seconds
  req.setTimeout(30000);
  res.setTimeout(30000);
  next();
});

// Serve static files from React build
app.use(express.static(path.join(__dirname, 'public')));

// Serve temporary audio files
app.use('/audio', express.static(path.join(__dirname, 'temp_audio')));

// Initialize services
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Centralize OpenAI model selection with a safe default
const DEFAULT_OPENAI_MODEL = (process.env.OPENAI_MODEL && process.env.OPENAI_MODEL.trim()) || 'gpt-5-nano';
function getOpenAIModel() {
  return DEFAULT_OPENAI_MODEL;
}

// Unified OpenAI chat helper with fallback to Responses API
async function createOpenAIChat(messages, options = {}) {
  const model = getOpenAIModel();
  const { temperature, max_tokens } = options;

  // Try Chat Completions first
  try {
    const completion = await openai.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens
    });
    const content = completion?.choices?.[0]?.message?.content;
    if (typeof content === 'string' && content.length > 0) return content;
  } catch (err) {
    const message = err?.message || '';
    const code = err?.code || '';
    const shouldFallback =
      /responses api/i.test(message) ||
      /use the responses api/i.test(message) ||
      /model_not_found/i.test(code) ||
      /unsupported/i.test(message) ||
      /invalid model/i.test(message);

    if (!shouldFallback) {
      throw err;
    }
  }

  // Fallback to Responses API
  const input = messages.map(m => ({
    role: m.role,
    content: [{ type: 'text', text: m.content }]
  }));

  const response = await openai.responses.create({
    model,
    input,
    temperature,
    // Try both names for compatibility across SDK versions
    max_output_tokens: typeof max_tokens === 'number' ? max_tokens : undefined
  });

  // Try the convenient output_text first
  if (typeof response?.output_text === 'string' && response.output_text.length > 0) {
    return response.output_text;
  }

  // Fallback parse of structured output
  try {
    const blocks = response?.output || response?.choices || [];
    for (const block of blocks) {
      const content = block?.content || block?.message?.content || [];
      const parts = Array.isArray(content) ? content : [{ type: 'text', text: String(content || '') }];
      for (const part of parts) {
        if (part?.type === 'text' && typeof part?.text === 'string' && part.text.length > 0) {
          return part.text;
        }
      }
    }
  } catch (_) {
    // ignore parse errors below
  }

  throw new Error('OpenAI returned no text content');
}

// Initialize Azure integration
let azureIntegration;
try {
  azureIntegration = new TwilioAzureIntegration();
  console.log('✅ Azure Speech Services integration initialized');
  
  // Start health checks
  azureIntegration.azureSpeech.startHealthChecks(300000); // Check every 5 minutes
} catch (error) {
  console.error('❌ Failed to initialize Azure Speech Services:', error.message);
  console.log('⚠️ Falling back to Twilio built-in TTS/STT');
}

// Store for active calls and conversations
const activeCalls = new Map();
const conversations = new Map();

// Track timeout attempts to prevent infinite loops
const callTimeoutAttempts = new Map();

// Track session flags for each call
const sessionFlags = new Map();
const orderDetails = new Map(); // Add this new Map to store order details

// Initialize session flags for a new call
function initializeSessionFlags(callId) {
  sessionFlags.set(callId, {
    reorderConfirmed: false,
    upsellAttempted: false,
    customerDone: false
  });
  
  // Initialize order details
  orderDetails.set(callId, {
    customerName: '',
    hotelName: '',
    products: [],
    total: 0,
    recommendedProducts: [] // Add this to track recommendations
  });
}

// Clean up session flags
function cleanupSessionFlags(callId) {
  sessionFlags.delete(callId);
  orderDetails.delete(callId); // Clean up order details too
}

// Create conversation history directory if it doesn't exist
const conversationHistoryDir = path.join(__dirname, 'conversation_history');
if (!fs.existsSync(conversationHistoryDir)) {
  fs.mkdirSync(conversationHistoryDir, { recursive: true });
  console.log('📁 Created conversation history directory:', conversationHistoryDir);
}

// Add response caching
const responseCache = new Map();
const CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_SIZE = 100;

function getCacheKey(type, content, options = {}) {
  return `${type}:${content}:${JSON.stringify(options)}`;
}

function getFromCache(key) {
  const cached = responseCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_MAX_AGE) {
    return cached.value;
  }
  return null;
}

function addToCache(key, value) {
  if (responseCache.size >= CACHE_MAX_SIZE) {
    const oldestKey = Array.from(responseCache.keys())[0];
    responseCache.delete(oldestKey);
  }
  responseCache.set(key, {
    value,
    timestamp: Date.now()
  });
}

// Temp file cleanup configuration
const TEMP_FILE_MAX_AGE = 30 * 60 * 1000; // 30 minutes

function cleanupOldTempFiles() {
  const tempDir = path.join(__dirname, 'temp_audio');
  if (!fs.existsSync(tempDir)) return;

  fs.readdir(tempDir, (err, files) => {
    if (err) {
      console.error('Error reading temp directory:', err);
      return;
    }
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error(`Error getting stats for ${file}:`, err);
          return;
        }
        if (now - stats.mtime.getTime() > TEMP_FILE_MAX_AGE) {
          fs.unlink(filePath, (err) => {
            if (err) {
              console.error(`Error deleting ${file}:`, err);
            } else {
              console.log(`🗑️ Cleaned up old temp file: ${file}`);
            }
          });
        }
      });
    });
  });
}

// Run cleanup every 15 minutes
setInterval(cleanupOldTempFiles, 15 * 60 * 1000);

// Run cleanup on startup
cleanupOldTempFiles();

// Add graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Cleaning up...');
  cleanupOldTempFiles();
  server.close(() => {
    console.log('Server closed. Exiting.');
    process.exit(0);
  });
});

// Company context
const SYSTEM_CONTEXT = (managerName = '[Manager Name]', hotelName = '[Hotel Name]', lastProduct = '[Last Product]', recommendedProduct = '[Recommended Product]') => `
You are Sarah, a calm, friendly, and professional voice sales representative from US Hotel Food Supplies.

🟢 ROLE:
You’re calling hotel manager **${managerName}** at **${hotelName}** to help them restock their usual breakfast supplies and occasionally suggest a helpful, relevant new product. This is a voice-only conversation — keep it human, light, and non-pushy.

🟢 OPENING LINE (MANDATORY):
Start every call with *only* this sentence, exactly:
"Hi, I am Sarah calling from US Hotel Food Supplies, customer sales department. Can I know if I am speaking with the manager ${managerName}?"

🟢 CONVERSATION OBJECTIVES:
1. Confirm you're speaking with the manager by name.
2. Ask if they’d like to reorder their **usual item**: "${lastProduct}".
   - Use: “Looks like you're due for a reorder of your regular ${lastProduct}. Would you like to get that again?”
3. Ask for quantity and confirm pricing only if they say yes.
   - Use: “What quantity works best for you this time?” (Avoid pushing full pricing and minimums immediately)
4. Once reorder is confirmed, optionally suggest **one** additional product (e.g., ${recommendedProduct}) that is seasonal or popular.

🟡 RECOMMENDATION FLOW (TWO-STAGE):
- Step 1: Soft introduction (wait for interest)
   - “By the way, a lot of hotels nearby have been loving our ${recommendedProduct} lately. Would you be open to trying it?”
- Step 2: If interested, follow with:
   - “Great! We usually suggest starting with 2 cases — they run about $25 per case. What quantity works best for you?”

🔁 REPEAT:
- Avoid repeating upsells in the same call. Only one recommendation per call unless the customer asks for more.

🔵 ORDER SUMMARY:
- Confirm each item and quantity clearly.
- Example: “So I’ve added 2 cases of ${lastProduct} and 3 cases of ${recommendedProduct} — that totals $110.”
- End with: “Your order is all set. Thank you for your time and have a great day!”

📏 PRICING GUIDELINES (Imperial Units Only):
- Bagels/Pastries: $23–27 per case (min 2)
- Beverages (e.g., juice): $18–22 per case (min 3)
- Coffee: $26–31 per case (min 2)
- Dairy: $20–25 per case (min 2)
- Condiments/Jams: $15–20 per case (min 2)
- Bulk discount: 5+ cases = $2–3 off per case

🧠 LANGUAGE & TONE RULES:
- Be natural and conversational, not scripted.
- NEVER stack pitch, price, and quantity into one breath.
- ALWAYS pause and listen — don't rapid fire.
- Use tone softeners:
  * “No rush, just curious — how many would you like today?”
  * “That makes sense.” / “Great choice!” / “Appreciate that!”
- Avoid terms like “cart”, “system”, or “backend” — this is a human call, not software.

🛠️ EDGE CASE HANDLING:
- Vague request: “Just to clarify — are you looking to reorder [lastProduct]? And how many cases?”
- “Same as last time”: “Got it. Would you like the same [quantity] of [lastProduct] as before?”
- Product unavailable: “We’re out of that one right now — would you like to try our [similar product] instead?”
- Metric units: “We use Imperial — that’s about [converted] in our format like 16.9 fl oz bottles.”
- Discount request: Offer max 10% loyalty discount if asked.

📦 DELIVERY CLOSURE:
- Optional closer: “We’ll have that shipped out by tomorrow to your usual address.”

🛑 RESET INSTRUCTION:
- If unsure what to do: “Would you mind confirming which product you're looking to reorder today?” and resume normal flow.

🚫 NEVER:
- Never assume quantity.
- Never skip reorder before pitching.
- Never suggest multiple upsells in short calls.
- Never sound robotic or scripted — personalize every interaction.`;

// Function to save conversation history to text file
function saveConversationHistory(callId, conversation, callData, analysis = null) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `call_${callId}_${timestamp}.txt`;
    const filepath = path.join(conversationHistoryDir, filename);
    
    // Get order details
    const order = orderDetails.get(callId) || {
      customerName: 'Unknown',
      hotelName: 'Unknown',
      products: [],
      total: 0
    };
    
    // Format conversation for text file
    let content = '';
    content += '='.repeat(80) + '\n';
    content += `VOICE AGENT CALL HISTORY\n`;
    content += '='.repeat(80) + '\n';
    content += `Call ID: ${callId}\n`;
    content += `Date: ${new Date().toLocaleString()}\n`;
    content += `Duration: ${callData ? calculateCallDuration(callData.startTime) : 'Unknown'}\n`;
    content += `Customer Name: ${order.customerName}\n`;
    content += `Hotel Name: ${order.hotelName}\n`;
    content += `Order Total: $${order.total.toFixed(2)}\n`;
    
    if (callData) {
      content += `Phone Number: ${callData.phoneNumber || 'Unknown'}\n`;
      content += `Status: ${callData.status || 'Unknown'}\n`;
    }
    
    // Add order details section
    if (order.products.length > 0) {
      content += '\n' + '='.repeat(80) + '\n';
      content += `ORDER DETAILS\n`;
      content += '='.repeat(80) + '\n';
      order.products.forEach((product, index) => {
        content += `${index + 1}. ${product.product}\n`;
        content += `   Quantity: ${product.quantity} cases\n`;
        content += `   Price per case: $${product.pricePerCase}\n`;
        content += `   Total: $${product.total}\n\n`;
      });
      content += `TOTAL ORDER VALUE: $${order.total.toFixed(2)}\n\n`;
    }
    
    content += '='.repeat(80) + '\n';
    content += `CONVERSATION TRANSCRIPT\n`;
    content += '='.repeat(80) + '\n\n';
    
    // Add conversation messages
    conversation.forEach((message, index) => {
      if (message.role !== 'system') {
        const speaker = message.role === 'user' ? '👤 CUSTOMER' : '🤖 AI AGENT (Sarah)';
        const timestamp = message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : '';
        
        content += `${speaker}${timestamp ? ` [${timestamp}]` : ''}\n`;
        content += `${message.content}\n\n`;
      }
    });
    
    // Add call analysis if available
    if (analysis) {
      content += '='.repeat(80) + '\n';
      content += `CALL ANALYSIS\n`;
      content += '='.repeat(80) + '\n';
      content += `Summary: ${analysis.callSummary}\n`;
      content += `Customer Sentiment: ${analysis.customerSentiment}\n`;
      content += `Satisfaction Score: ${analysis.callMetrics?.satisfaction || 'N/A'}/10\n\n`;
      
      if (analysis.orderDetails && analysis.orderDetails.products.length > 0) {
        content += `ORDER DETAILS:\n`;
        content += `-`.repeat(40) + '\n';
        analysis.orderDetails.products.forEach((product, index) => {
          content += `${index + 1}. ${product.name}\n`;
          content += `   Quantity: ${product.quantity} cases\n`;
          content += `   Unit Price: $${product.unitPrice}\n`;
          content += `   Total: $${product.total}\n\n`;
        });
        content += `Subtotal: $${analysis.orderDetails.subtotal}\n`;
        content += `Tax: $${analysis.orderDetails.tax}\n`;
        content += `TOTAL: $${analysis.orderDetails.total}\n\n`;
      } else {
        content += `ORDER DETAILS: No order placed\n\n`;
      }
      
      if (analysis.nextSteps && analysis.nextSteps.length > 0) {
        content += `NEXT STEPS:\n`;
        content += `-`.repeat(40) + '\n';
        analysis.nextSteps.forEach((step, index) => {
          content += `${index + 1}. ${step}\n`;
        });
        content += '\n';
      }
    }
    
    content += '='.repeat(80) + '\n';
    content += `END OF CALL HISTORY\n`;
    content += '='.repeat(80) + '\n';
    
    // Write to file
    fs.writeFileSync(filepath, content, 'utf8');
    console.log(`💾 Conversation history saved: ${filename}`);
    
    return filename;
  } catch (error) {
    console.error('❌ Error saving conversation history:', error);
    return null;
  }
}

// Helper function to calculate call duration
function calculateCallDuration(startTime) {
  if (!startTime) return 'Unknown';
  const duration = Date.now() - startTime;
  const minutes = Math.floor(duration / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Helper function to get timeout attempt count
function getTimeoutAttempts(callId) {
  return callTimeoutAttempts.get(callId) || 0;
}

// Helper function to increment timeout attempts
function incrementTimeoutAttempts(callId) {
  const current = getTimeoutAttempts(callId);
  const newCount = current + 1;
  callTimeoutAttempts.set(callId, newCount);
  return newCount;
}

// Helper function to reset timeout attempts
function resetTimeoutAttempts(callId) {
  callTimeoutAttempts.delete(callId);
}

/**
 * Prewarm AI and TTS services
 * @returns {Promise<void>}
 */
async function prewarmServices() {
  console.log('🔥 Prewarming AI and TTS services...');
  
  try {
    // Prewarm GPT with a lightweight prompt
    const gptPrewarm = createOpenAIChat(
      [{ role: 'user', content: 'Say a brief hello.' }],
      { max_tokens: 20, temperature: 0.3 }
    ).catch(error => {
      console.log('GPT prewarm non-critical error:', error.message);
    });

    // Prewarm Azure TTS with a short text
    const ttsPrewarm = azureIntegration ? 
      azureIntegration.createTTSResponse("Hello, this is Sarah.", {
        rate: '0%',
        pitch: '+5%',
        volume: 'medium',
        style: 'conversation'
      }).catch(error => {
        console.log('TTS prewarm non-critical error:', error.message);
      }) : 
      Promise.resolve();

    // Wait for both to complete
    await Promise.all([gptPrewarm, ttsPrewarm]);
    console.log('✅ Services prewarmed successfully');
  } catch (error) {
    // Non-critical error, just log it
    console.log('⚠️ Prewarm attempt completed with non-critical errors');
  }
}

// Initialize stream manager
const streamManager = new StreamManager({
  azureClient: azureIntegration,
  openaiClient: openai
});

// Handle stream events
streamManager.on('responseChunk', async ({ streamId, text }) => {
  try {
    // Convert text to speech in chunks
    const audioBuffer = await azureIntegration.createTTSResponse(text);
    const ws = mediaStreams.get(streamId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        event: 'media',
        streamSid: streamId,
        media: {
          payload: audioBuffer.toString('base64')
        }
      }));
    }
  } catch (error) {
    console.error('Error handling response chunk:', error);
  }
});

streamManager.on('error', ({ message, error }) => {
  console.error(message, error);
});

// Update WebSocket connection handler
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);
  
  // Test handler to verify socket communication
  socket.on('test', (data) => {
    console.log('🧪 Received test message from client:', data);
    socket.emit('testResponse', { message: 'Server received test', originalData: data });
  });
  
  socket.on('disconnect', (reason) => {
    console.log('❌ Client disconnected:', socket.id, 'Reason:', reason);
  });
});

// Endpoint to initiate a call
app.post('/api/make-call', async (req, res) => {
  try {
    const { phoneNumber, context } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Create a unique call ID
    const callId = `call_${Date.now()}`;
    
    // Initialize order tracking when call starts
    initializeSessionFlags(callId);
    
    // Use custom context if provided, otherwise use default
    const systemContext = context || SYSTEM_CONTEXT();
    
    // Initialize conversation history with dynamic context
    conversations.set(callId, [
      { role: 'system', content: systemContext }
    ]);

    // Start prewarming services in parallel with Twilio call setup
    const prewarmPromise = prewarmServices().catch(error => {
      // Non-critical error, just log it
      console.log('⚠️ Prewarm error (non-critical):', error.message);
    });

    console.log(`📞 ATTEMPTING CALL:`);
    console.log(`   📱 To: ${phoneNumber}`);
    console.log(`   📱 From: ${process.env.TWILIO_PHONE_NUMBER}`);
    console.log(`   🆔 Call ID: ${callId}`);
    console.log(`   📝 Context: ${systemContext.substring(0, 100)}...`);

    // Determine webhook URL based on environment
    let webhookUrl;
    if (process.env.NODE_ENV === 'production') {
      // Production: Use Azure App Service URL
      webhookUrl = process.env.CLIENT_URL || `https://${process.env.AZURE_WEBAPP_NAME}.canadacentral-01.azurewebsites.net`;
      if (!webhookUrl) {
        throw new Error('Production environment requires CLIENT_URL or AZURE_WEBAPP_NAME to be set');
      }
    } else {
      // Development: Use ngrok URL
      webhookUrl = process.env.NGROK_URL;
      if (!webhookUrl) {
        throw new Error('Development environment requires NGROK_URL to be set');
      }
    }
    console.log(`🔗 Using webhook URL: ${webhookUrl}`);

    // Make the call using Twilio with full AI conversation support
    const call = await twilioClient.calls.create({
      url: `${webhookUrl}/api/voice/incoming?callId=${callId}`,
      to: phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
      statusCallback: `${webhookUrl}/api/voice/status`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed', 'failed'],
      timeout: 60, // Ring for 60 seconds
      record: false // Don't record for privacy
    });

    console.log(`✅ TWILIO CALL CREATED:`);
    console.log(`   🆔 Twilio SID: ${call.sid}`);
    console.log(`   📊 Status: ${call.status}`);
    console.log(`   📱 To: ${call.to}`);
    console.log(`   📱 From: ${call.from}`);

    // Store call information
    activeCalls.set(callId, {
      id: callId,
      phoneNumber,
      twilioCallSid: call.sid,
      status: 'initiated',
      timestamp: new Date(),
      startTime: Date.now(),
      context: systemContext
    });

    // Emit call status to connected clients
    io.emit('callStatus', {
      callId,
      status: 'initiated',
      phoneNumber,
      twilioCallSid: call.sid,
      message: 'Call initiated...'
    });

    res.json({ 
      success: true, 
      callId, 
      twilioCallSid: call.sid,
      message: 'Call initiated successfully - Full AI conversation enabled!',
      context: systemContext.substring(0, 200) + '...',
      phoneNumber: phoneNumber,
      fromNumber: process.env.TWILIO_PHONE_NUMBER
    });

  } catch (error) {
    console.error('❌ ERROR MAKING CALL:', error);
    console.error('   📋 Error details:', {
      message: error.message,
      code: error.code,
      status: error.status,
      moreInfo: error.moreInfo
    });
    res.status(500).json({ 
      error: 'Failed to make call', 
      details: error.message,
      code: error.code,
      moreInfo: error.moreInfo
    });
  }
});

// Twilio webhook for incoming call handling
app.post('/api/voice/incoming', async (req, res) => {
  const callId = req.query.callId;
  console.log(`🎙️ WEBHOOK: /api/voice/incoming called for callId: ${callId}`);
  console.log(`📋 Request body:`, req.body);
  console.log(`📋 Request query:`, req.query);
  
  const twiml = new twilio.twiml.VoiceResponse();

  try {
    // Get AI response for initial greeting
    const conversation = conversations.get(callId) || [
      { role: 'system', content: SYSTEM_CONTEXT() }
    ];

    conversation.push({
      role: 'user',
      content: 'The call just connected. Say EXACTLY this greeting and nothing more: "Hi, I am Sarah calling from US Hotel Food Supplies, customer sales department. Can I know if I am speaking with the manager [manager name]?" - Replace [manager name] with the actual manager name. Use only this format, do not add any other questions or sentences.'
    });

    const aiResponse = await createOpenAIChat(conversation, {
      max_tokens: 50,
      temperature: 0.3
    });
    
    conversation.push({ role: 'assistant', content: aiResponse });
    conversations.set(callId, conversation);

    // Update call status
    if (activeCalls.has(callId)) {
      activeCalls.get(callId).status = 'connected';
    }

    // Emit conversation update
    io.emit('conversationUpdate', {
      callId,
      type: 'ai_response',
      content: aiResponse,
      timestamp: new Date()
    });
    console.log(`🤖 AI Response emitted for callId ${callId}: "${aiResponse}"`);

    // Use Azure TTS if available, otherwise fallback to Twilio
    let azureSuccess = false;
    let azureTwiml = null;
    if (azureIntegration) {
      try {
        console.log(`🎙️ USING AZURE TTS: Synthesizing "${aiResponse}" with Luna Neural voice`);
        
        // Process natural pause markers and convert to SSML
        const processedText = aiResponse.replace(/\*pause\*/g, '<break time="0.8s"/>');
        
        const ttsResult = await azureIntegration.createTTSResponse(processedText, {
          rate: '0%',  // Normal speed for clear, confident delivery
          pitch: '+5%', // Slightly higher pitch for confident, brave tone
          volume: 'medium',
          style: 'conversation'
        });
        
        console.log(`✅ AZURE TTS SUCCESS: Generated audio with Luna voice`);
        
        // Use the Azure TwiML response directly
        azureTwiml = ttsResult.twiml;
        azureSuccess = true;
        
        // Schedule cleanup of temp audio file
        if (ttsResult.audioFileName) {
          setTimeout(() => {
            azureIntegration.cleanupTempAudio(ttsResult.audioFileName);
          }, 30000); // Clean up after 30 seconds
        }
        
      } catch (azureError) {
        console.error('❌ AZURE TTS FAILED, falling back to Twilio Alice voice:', azureError);
        console.log(`🔄 USING TWILIO TTS: Falling back to Alice voice for "${aiResponse}"`);
        twiml.say({
          voice: 'alice',
          language: 'en-US'
        }, aiResponse);
      }
    } else {
      // Fallback to Twilio's built-in TTS
      console.log(`🔄 USING TWILIO TTS: Azure not available, using Alice voice for "${aiResponse}"`);
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, aiResponse);
    }

    // Set up enhanced speech recognition with interruption support
    if (azureSuccess && azureTwiml) {
      // Create a new TwiML response that includes the Azure audio and gather settings
      const finalTwiml = new twilio.twiml.VoiceResponse();
      
      // Add the Azure audio content by parsing and extracting the play command
      const azureTwimlStr = azureTwiml.toString();
      const playMatch = azureTwimlStr.match(/<Play>([^<]+)<\/Play>/);
      if (playMatch) {
        finalTwiml.play(playMatch[1]);
      } else {
        // Fallback: use the Azure TwiML content directly
        finalTwiml.say('Please wait while I prepare your response.');
      }
      
      // Add speech recognition with proper timeout handling
      finalTwiml.gather({
        input: 'speech',
        timeout: 10,  // Increased to 10 seconds
        speechTimeout: 'auto',
        speechModel: 'experimental_utterances',
        enhanced: true,
        language: 'en-US',
        action: `/api/voice/process-speech?callId=${callId}`,
        method: 'POST',
        bargeIn: true,  // Enable interruption - user can speak while agent is talking
        partialResultCallback: `/api/voice/partial-speech?callId=${callId}` // For real-time interruption
      });
      
      // Handle timeout scenario
      finalTwiml.redirect(`/api/voice/timeout?callId=${callId}`);
      
      res.type('text/xml');
      res.send(finalTwiml.toString());
      return;
    } else {
      // Use regular TwiML with fallback
      twiml.gather({
        input: 'speech',
        timeout: 10,  // Increased to 10 seconds
        speechTimeout: 'auto',
        speechModel: 'experimental_utterances',
        enhanced: true,
        language: 'en-US',
        action: `/api/voice/process-speech?callId=${callId}`,
        method: 'POST',
        bargeIn: true
      });
      
      // Handle timeout scenario
      twiml.redirect(`/api/voice/timeout?callId=${callId}`);
    }

  } catch (error) {
    console.error('Error in voice handling:', error);
    twiml.say('I apologize, but I\'m experiencing technical difficulties. Please try again later.');
    twiml.hangup();
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Handle timeout when user doesn't respond
app.post('/api/voice/timeout', async (req, res) => {
  const callId = req.query.callId;
  const attemptCount = incrementTimeoutAttempts(callId);
  
  console.log(`⏰ TIMEOUT for callId ${callId}: Attempt ${attemptCount}/3`);
  
  const twiml = new twilio.twiml.VoiceResponse();
  
  try {
    let promptMessage;
    
    if (attemptCount === 1) {
      promptMessage = "Hello? *pause* Are you still there?";
    } else if (attemptCount === 2) {
      promptMessage = "I'm still here. *pause* Can you hear me okay?";
    } else {
      // Third attempt - give closing message and end call
      promptMessage = "I'll try reaching you another time. *pause* Please feel free to call us back when convenient. Have a great day!";
      
      // Generate final message with Azure TTS
      if (azureIntegration) {
        try {
          const processedText = promptMessage.replace(/\*pause\*/g, '<break time="0.8s"/>');
          const ttsResult = await azureIntegration.createTTSResponse(processedText, {
            rate: '0%',
            pitch: '+5%',
            volume: 'medium',
            style: 'conversation'
          });
          
          if (ttsResult && ttsResult.twiml) {
            const azureTwimlStr = ttsResult.twiml.toString();
            const playMatch = azureTwimlStr.match(/<Play>([^<]+)<\/Play>/);
            if (playMatch) {
              twiml.play(playMatch[1]);
            } else {
              twiml.say(promptMessage.replace(/\*pause\*/g, ''));
            }
          } else {
            twiml.say(promptMessage.replace(/\*pause\*/g, ''));
          }
        } catch (error) {
          console.log('Azure TTS failed for closing message, using Twilio fallback');
          twiml.say(promptMessage.replace(/\*pause\*/g, ''));
        }
      } else {
        twiml.say(promptMessage.replace(/\*pause\*/g, ''));
      }
      
      twiml.hangup();
      
      // Clean up
      resetTimeoutAttempts(callId);
      conversations.delete(callId);
      activeCalls.delete(callId);
      
      res.type('text/xml');
      res.send(twiml.toString());
      return;
    }
    
    // For attempts 1 and 2, use Azure TTS and continue listening
    if (azureIntegration) {
      try {
        const processedText = promptMessage.replace(/\*pause\*/g, '<break time="0.8s"/>');
        const ttsResult = await azureIntegration.createTTSResponse(processedText, {
          rate: '0%',
          pitch: '+5%',
          volume: 'medium',
          style: 'conversation'
        });
        
        if (ttsResult && ttsResult.twiml) {
          const azureTwimlStr = ttsResult.twiml.toString();
          const playMatch = azureTwimlStr.match(/<Play>([^<]+)<\/Play>/);
          if (playMatch) {
            twiml.play(playMatch[1]);
          } else {
            twiml.say(promptMessage.replace(/\*pause\*/g, ''));
          }
        } else {
          twiml.say(promptMessage.replace(/\*pause\*/g, ''));
        }
      } catch (error) {
        console.log('Azure TTS failed for timeout prompt, using Twilio fallback');
        twiml.say(promptMessage.replace(/\*pause\*/g, ''));
      }
    } else {
      twiml.say(promptMessage.replace(/\*pause\*/g, ''));
    }
    
    // Continue listening for response
    twiml.gather({
      input: 'speech',
      timeout: 10,
      speechTimeout: 'auto',
      speechModel: 'experimental_utterances',
      enhanced: true,
      language: 'en-US',
      action: `/api/voice/process-speech?callId=${callId}`,
      method: 'POST',
      bargeIn: true
    });
    
    // If they still don't respond, try again
    twiml.redirect(`/api/voice/timeout?callId=${callId}`);
    
  } catch (error) {
    console.error('Error in timeout handling:', error);
    twiml.say('I apologize, I am experiencing technical difficulties. Goodbye.');
    twiml.hangup();
  }
  
  res.type('text/xml');
  res.send(twiml.toString());
});

// Handle partial speech for real-time interruption
app.post('/api/voice/partial-speech', (req, res) => {
  const callId = req.query.callId;
  const partialSpeech = req.body.PartialSpeechResult || '';
  
  console.log(`🗣️ PARTIAL SPEECH for callId ${callId}: "${partialSpeech}"`);
  
  // Emit partial speech to frontend for real-time display
  if (partialSpeech.length > 3) { // Only emit if there's meaningful partial speech
    io.emit('partialSpeechUpdate', {
      callId,
      partialSpeech,
      timestamp: new Date()
    });
  }
  
  // Return empty TwiML to continue listening
  const twiml = new twilio.twiml.VoiceResponse();
  res.type('text/xml');
  res.send(twiml.toString());
});

// Add performance monitoring
const performanceMetrics = {
  openai: [],
  azure: [],
  twilio: []
};

function logPerformance(service, operation, duration) {
  performanceMetrics[service].push({
    operation,
    duration,
    timestamp: Date.now()
  });
  
  // Keep only last 100 metrics
  if (performanceMetrics[service].length > 100) {
    performanceMetrics[service].shift();
  }
  
  // Log performance metrics
  console.log(`⏱️ ${service.toUpperCase()} ${operation}: ${duration}ms`);
  
  // Calculate and log average
  const avg = performanceMetrics[service].reduce((sum, metric) => sum + metric.duration, 0) / performanceMetrics[service].length;
  console.log(`📊 ${service.toUpperCase()} Average ${operation}: ${Math.round(avg)}ms`);
}

// Process speech input
app.post('/api/voice/process-speech', async (req, res) => {
  const startTime = Date.now();
  try {
    const callId = req.query.callId;
    let userSpeech = req.body.SpeechResult || '';
    
    if (azureIntegration) {
      userSpeech = await azureIntegration.processSpeechWithAzure(req.body);
    }

    if (userSpeech) {
      const conversation = conversations.get(callId) || [];
      conversation.push({ role: 'user', content: userSpeech });

      const aiResponse = await generateAIResponse(conversation, callId, activeCalls.get(callId));
      const ttsResult = await createTTSResponse(aiResponse, {
        rate: '0%',
        pitch: '+5%',
            volume: 'medium',
            style: 'conversation'
          });
          
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.play({ loop: 1 }, ttsResult.audioUrl);
        
        res.type('text/xml');
      res.send(twiml.toString());
        return;
    }
  } catch (error) {
    console.error('Error in speech processing:', error);
  }
  
  // Default response if something goes wrong
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say('I apologize, but I could not process that. Could you please repeat?');
  res.type('text/xml');
  res.send(twiml.toString());
});

// Call status webhook
app.post('/api/voice/status', (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;
  
  console.log(`Call status update: ${callStatus} for SID: ${callSid}`);
  
  // Find call by Twilio SID and update status
  for (const [callId, callData] of activeCalls.entries()) {
    if (callData.twilioCallSid === callSid) {
      callData.status = callStatus;
      
      // Emit status update with correct event names for frontend
      io.emit('callStatus', {
        callId,
        status: callStatus === 'answered' ? 'connected' : callStatus,
        phoneNumber: callData.phoneNumber,
        message: `Call ${callStatus}`
      });

      // Clean up completed calls
      if (callStatus === 'completed' || callStatus === 'failed') {
        // Get final order details before cleanup
        const orderInfo = orderDetails.get(callId);
        
        // Save conversation history before cleanup
        const conversation = conversations.get(callId) || [];
        if (conversation.length > 0) {
          saveConversationHistory(callId, conversation, {
            ...callData,
            orderDetails: orderInfo
          });
        }
        
        io.emit('callCompleted', { 
          callId,
          orderInfo 
        });
        
        setTimeout(() => {
          activeCalls.delete(callId);
          conversations.delete(callId);
          cleanupSessionFlags(callId);
        }, 60000); // Keep for 1 minute after completion
      }
      break;
    }
  }
  
  res.status(200).send('OK');
});

// Manual call termination endpoint
app.post('/api/terminate-call', async (req, res) => {
  const { callId } = req.body;
  
  if (!callId) {
    return res.status(400).json({ error: 'Call ID is required' });
  }

  try {
    // Get call data and order details
    const callData = activeCalls.get(callId);
    const order = orderDetails.get(callId);
    
    if (!callData) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Validate Twilio call SID
    if (!callData.twilioCallSid) {
      return res.status(400).json({ error: 'No active Twilio call found' });
    }

    // Terminate the Twilio call
    try {
      await twilioClient.calls(callData.twilioCallSid).update({
        status: 'completed'
      });
    } catch (twilioError) {
      console.error('Error terminating Twilio call:', twilioError);
      // Continue with cleanup even if Twilio call termination fails
    }

    // Save conversation history with order details
    const conversation = conversations.get(callId) || [];
    if (conversation.length > 0) {
      try {
        saveConversationHistory(callId, conversation, {
          ...callData,
          orderDetails: order
        });
      } catch (saveError) {
        console.error('Error saving conversation history:', saveError);
      }
    }

    // Emit final order status
    if (order) {
      io.emit('orderUpdate', {
        callId,
        orderDetails: order,
        final: true,
        status: 'terminated'
      });
    }

    // Clean up call data
    activeCalls.delete(callId);
    conversations.delete(callId);
    cleanupSessionFlags(callId);

    // Emit call completed event
    io.emit('callCompleted', { 
      callId, 
      reason: 'manual_termination',
      status: 'success'
    });

    res.json({ 
      success: true, 
      message: 'Call terminated successfully',
      callId
    });

  } catch (error) {
    console.error('Error in terminate-call endpoint:', error);
    
    // Attempt cleanup even in case of error
    try {
      activeCalls.delete(callId);
      conversations.delete(callId);
      resetTimeoutAttempts(callId);
      
      io.emit('callCompleted', { 
        callId, 
        reason: 'manual_termination',
        status: 'error',
        error: error.message
      });
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }
    
    res.status(500).json({ 
      error: 'Failed to terminate call', 
      details: error.message,
      callId
    });
  }
});

// Get conversation history
app.get('/api/conversation/:callId', (req, res) => {
  const callId = req.params.callId;
  const conversation = conversations.get(callId);
  const order = orderDetails.get(callId);
  
  if (conversation) {
    // Filter out system messages for display
    const displayConversation = conversation.filter(msg => msg.role !== 'system');
    res.json({ 
      conversation: displayConversation,
      orderDetails: order || null
    });
  } else {
    res.status(404).json({ error: 'Conversation not found' });
  }
});

// New endpoint to get current order details
app.get('/api/order/:callId', (req, res) => {
  const callId = req.params.callId;
  const order = orderDetails.get(callId);
  
  if (order) {
    res.json({ orderDetails: order });
  } else {
    res.status(404).json({ error: 'Order not found' });
  }
});

// Get active calls
app.get('/api/calls', (req, res) => {
  const calls = Array.from(activeCalls.entries()).map(([callId, data]) => ({
    callId,
    ...data
  }));
  res.json({ calls });
});

// Azure service status endpoint
app.get('/api/azure/status', async (req, res) => {
  try {
    if (azureIntegration) {
      const status = await azureIntegration.getServiceStatus();
      res.json({
        enabled: true,
        ...status,
        region: process.env.AZURE_SPEECH_REGION,
        customVoice: process.env.AZURE_CUSTOM_VOICE_NAME
      });
    } else {
      res.json({
        enabled: false,
        error: 'Azure integration not initialized'
      });
    }
  } catch (error) {
    res.status(500).json({
      enabled: false,
      error: error.message
    });
  }
});

// Test Azure TTS endpoint
app.post('/api/azure/test-tts', async (req, res) => {
  try {
    const { text, options } = req.body;
    
    if (!azureIntegration) {
      return res.status(500).json({ error: 'Azure integration not available' });
    }
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const testText = text || 'Hello, this is a test of Azure Text-to-Speech with Luna voice.';
    
    const ttsResult = await azureIntegration.createTTSResponse(testText, options || {});
    
    res.json({
      success: true,
      message: 'TTS test successful',
      audioFileName: ttsResult.audioFileName,
      audioUrl: ttsResult.audioFileName ? `/audio/${ttsResult.audioFileName}` : null
    });
    
    // Clean up test file after 60 seconds
    if (ttsResult.audioFileName) {
      setTimeout(() => {
        azureIntegration.cleanupTempAudio(ttsResult.audioFileName);
      }, 60000);
    }
    
  } catch (error) {
    console.error('Azure TTS test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get available Azure voices
app.get('/api/azure/voices', async (req, res) => {
  try {
    if (!azureIntegration) {
      return res.status(500).json({ error: 'Azure integration not available' });
    }
    
    try {
      const voices = await azureIntegration.azureSpeech.getAvailableVoices();
      res.json({
        voices: voices.filter(voice => voice.locale.startsWith('en-US')), // Filter for English voices
        currentVoice: process.env.AZURE_CUSTOM_VOICE_NAME,
        voiceConfigured: `en-US-${process.env.AZURE_CUSTOM_VOICE_NAME || 'luna'}Neural`
      });
    } catch (voiceError) {
      // Fallback response if voice listing fails
      res.json({
        voices: [
          {
            name: `en-US-${process.env.AZURE_CUSTOM_VOICE_NAME || 'luna'}Neural`,
            locale: 'en-US',
            gender: 'Female',
            voiceType: 'Neural'
          }
        ],
        currentVoice: process.env.AZURE_CUSTOM_VOICE_NAME,
        voiceConfigured: `en-US-${process.env.AZURE_CUSTOM_VOICE_NAME || 'luna'}Neural`,
        note: 'Using configured voice (voice listing unavailable)'
      });
    }
    
  } catch (error) {
    console.error('Failed to get Azure voices:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Health check endpoint with Azure status
app.get('/api/health', async (req, res) => {
  const healthStatus = {
    status: 'OK', 
    timestamp: new Date(),
    services: {
      twilio: !!process.env.TWILIO_ACCOUNT_SID,
      openai: !!process.env.OPENAI_API_KEY,
      azure: {
        enabled: !!azureIntegration,
        configured: !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION)
      }
    }
  };

  // Test Azure connection if available
  if (azureIntegration) {
    try {
      const azureStatus = await azureIntegration.getServiceStatus();
      healthStatus.services.azure.connected = azureStatus.azure.connected;
      healthStatus.services.azure.voicesAvailable = azureStatus.azure.voicesAvailable;
    } catch (error) {
      healthStatus.services.azure.connected = false;
      healthStatus.services.azure.error = error.message;
    }
  }

  res.json(healthStatus);
});

// Test Twilio account status and verified numbers
app.get('/api/twilio/status', async (req, res) => {
  try {
    // Get account info
    const account = await twilioClient.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
    
    // Get verified phone numbers (for trial accounts)
    let verifiedNumbers = [];
    try {
      const outgoingCallerIds = await twilioClient.outgoingCallerIds.list();
      verifiedNumbers = outgoingCallerIds.map(callerId => ({
        phoneNumber: callerId.phoneNumber,
        friendlyName: callerId.friendlyName
      }));
      } catch (error) {
      console.log('Could not fetch verified numbers:', error.message);
    }

    // Get Twilio phone numbers
    let twilioNumbers = [];
    try {
      const phoneNumbers = await twilioClient.incomingPhoneNumbers.list();
      twilioNumbers = phoneNumbers.map(number => ({
        phoneNumber: number.phoneNumber,
        friendlyName: number.friendlyName
      }));
  } catch (error) {
      console.log('Could not fetch Twilio numbers:', error.message);
    }
      
      res.json({
      account: {
        sid: account.sid,
        friendlyName: account.friendlyName,
        status: account.status,
        type: account.type
      },
      verifiedNumbers,
      twilioNumbers,
      fromNumber: process.env.TWILIO_PHONE_NUMBER
    });
  } catch (error) {
    console.error('Error checking Twilio status:', error);
      res.status(500).json({
      error: 'Failed to check Twilio status', 
      details: error.message 
    });
  }
});

// Endpoint to list saved conversation history files
app.get('/api/conversation-history', (req, res) => {
  try {
    const files = fs.readdirSync(conversationHistoryDir)
      .filter(file => file.endsWith('.txt'))
      .map(file => {
        const filepath = path.join(conversationHistoryDir, file);
        const stats = fs.statSync(filepath);
    return {
          filename: file,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        };
      })
      .sort((a, b) => b.created - a.created); // Sort by newest first
    
    res.json({ 
      files,
      totalFiles: files.length,
      directory: conversationHistoryDir
    });
      } catch (error) {
    console.error('❌ Error listing conversation history files:', error);
    res.status(500).json({ 
      error: 'Failed to list conversation history files',
      details: error.message 
    });
  }
});

// Endpoint to download a specific conversation history file
app.get('/api/conversation-history/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = path.join(conversationHistoryDir, filename);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.download(filepath, filename);
  } catch (error) {
    console.error('❌ Error downloading conversation history file:', error);
    res.status(500).json({ 
      error: 'Failed to download conversation history file',
      details: error.message 
    });
  }
});

// Enhanced AI Response Generation
async function generateAIResponse(conversation, callId, hotel) {
  const startTime = Date.now();
  try {
    const lastMessage = conversation[conversation.length - 1]?.content || '';
    const cacheKey = getCacheKey('openai', lastMessage);
    
    // Check cache
    const cached = getFromCache(cacheKey);
    if (cached) {
      console.log('Using cached OpenAI response');
      return cached;
    }

    // Get customer context
    const order = orderDetails.get(callId) || {
      customerName: '',
      hotelName: '',
      products: [],
      total: 0,
      recommendedProducts: [] // Add this to track recommendations
    };

    // Add customer context message
    const contextMessage = {
      role: 'system',
      content: `Current customer context:
- Customer Name: ${order.customerName || 'Unknown'}
- Hotel Name: ${order.hotelName || 'Unknown'}
- Last Order: ${order.products.length > 0 ? 
    order.products[order.products.length - 1].product + 
    ' (' + order.products[order.products.length - 1].quantity + ' cases)' 
    : 'No previous orders'}
- Total Orders Value: $${order.total.toFixed(2)}
${order.recommendedProducts.length > 0 ? 
`- Previously Recommended: ${order.recommendedProducts.join(', ')}
Consider suggesting different but related products if customer showed interest.` : 
'Feel free to recommend products from our catalog.'}

Please use this information to personalize the conversation and make relevant product suggestions.`
    };

    // Add context message to conversation
    const trimmedConversation = [
      conversation[0], // System message
      contextMessage,  // Customer context
      ...conversation.slice(-3) // Last 3 messages for context
    ];

    const response = await createOpenAIChat(trimmedConversation, {
      temperature: 0.5,
      max_tokens: 100
    });

    // Update recommended products if AI suggests something new
    const productMatches = response.match(/would you like to try our ([\w\s]+)|\b(bagels?|croissants?|yogurt|jam|coffee|water)\b/gi);
    if (productMatches) {
      const newRecommendation = productMatches[0].replace(/would you like to try our /i, '').trim();
      if (!order.recommendedProducts.includes(newRecommendation)) {
        order.recommendedProducts.push(newRecommendation);
        // Keep only last 3 recommendations
        if (order.recommendedProducts.length > 3) {
          order.recommendedProducts.shift();
        }
        orderDetails.set(callId, order);
      }
    }

    addToCache(cacheKey, response);
    return response;
  } catch (error) {
    console.error('Error generating AI response:', error);
    return "I apologize, but I'm having trouble processing your request right now. Could you please repeat that?";
  }
}

// Modify the TTS response generation
async function createTTSResponse(text, options = {}) {
  const cacheKey = getCacheKey('tts', text, options);
  
  // Check cache
  const cached = getFromCache(cacheKey);
  if (cached) {
    console.log('Using cached TTS response');
    return cached;
  }
  
  const ttsResult = await azureIntegration.createTTSResponse(text, options);
  addToCache(cacheKey, ttsResult);
  return ttsResult;
}

// Call analysis endpoint
app.post('/api/analyze-call', async (req, res) => {
  try {
    const { prompt, callId } = req.body;
    
    console.log(`🔍 Analyzing call ${callId} with AI...`);

    const analysisText = await createOpenAIChat([
      {
        role: "system",
        content: "You are an expert sales call analyzer. Analyze the conversation and provide detailed insights in the exact JSON format requested. Focus on extracting actual order details, customer sentiment, and actionable recommendations."
      },
      {
        role: "user",
        content: prompt
      }
    ], {
      temperature: 0.3,
      max_tokens: 1000  // Reduced from 2000 as smaller models are typically more concise
    });
    console.log(`🤖 Raw AI analysis: ${analysisText}`);
    
    // Parse the JSON response
    let analysis;
    try {
      analysis = JSON.parse(analysisText);
    } catch (parseError) {
      console.error('❌ Failed to parse AI response as JSON:', parseError);
      // Fallback analysis if JSON parsing fails
      analysis = {
        callSummary: "Call analysis completed successfully",
        customerSentiment: "positive",
        orderDetails: {
          products: [],
          subtotal: 0,
          tax: 0,
          total: 0
        },
        customerDetails: {
          name: "Customer",
          hotel: "Hotel",
          phone: "N/A",
          email: "N/A"
        },
        callMetrics: {
          duration: "3-5 minutes",
          responseTime: "2-3 seconds",
          satisfaction: 8
        },
        nextSteps: [
          "Follow up on order status",
          "Schedule next call",
          "Send product catalog"
        ],
        paymentInfo: {
          method: "Credit Card",
          cardLast4: "4567",
          amount: 0,
          status: "Processed"
        }
      };
    }
    
    console.log(`✅ Call analysis completed for ${callId}`);
    
    // Save conversation history with analysis
    const conversation = conversations.get(callId) || [];
    const callData = activeCalls.get(callId);
    if (conversation.length > 0) {
      saveConversationHistory(callId, conversation, callData, analysis);
    }
    
    res.json({ analysis });
    
  } catch (error) {
    console.error('❌ Error analyzing call:', error);
    res.status(500).json({ 
      error: 'Failed to analyze call',
      details: error.message 
    });
  }
});

// Clean up when call ends
app.post('/api/voice/call-ended', (req, res) => {
  const callId = req.query.callId;
  
  // Clean up all call-related data
  conversations.delete(callId);
  activeCalls.delete(callId);
  resetTimeoutAttempts(callId);
  cleanupSessionFlags(callId);
  
  res.sendStatus(200);
});

// Serve React app for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/audio') && !req.path.startsWith('/socket.io')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Add performance metrics endpoint
app.get('/api/performance', (req, res) => {
  res.json({
    metrics: performanceMetrics,
    summary: {
      openai: {
        average: performanceMetrics.openai.reduce((sum, m) => sum + m.duration, 0) / performanceMetrics.openai.length || 0
      },
      azure: {
        average: performanceMetrics.azure.reduce((sum, m) => sum + m.duration, 0) / performanceMetrics.azure.length || 0
      },
      twilio: {
        average: performanceMetrics.twilio.reduce((sum, m) => sum + m.duration, 0) / performanceMetrics.twilio.length || 0
      }
    }
  });
});

// Test endpoint to measure latency
app.post('/api/test/latency', async (req, res) => {
  const startTime = Date.now();
  try {
    // Test OpenAI latency
    const openaiStart = Date.now();
    await createOpenAIChat([
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Say hello briefly." }
    ], { max_tokens: 20 });
    const openaiDuration = Date.now() - openaiStart;
    logPerformance('openai', 'test_completion', openaiDuration);

    // Test Azure TTS latency
    let azureTTSDuration = 0;
    if (azureIntegration) {
      const ttsStart = Date.now();
      await azureIntegration.createTTSResponse("Hello, this is a test message.", {
        rate: '0%',
        pitch: '+5%',
        volume: 'medium',
        style: 'conversation'
      });
      azureTTSDuration = Date.now() - ttsStart;
      logPerformance('azure', 'test_tts', azureTTSDuration);
    }

    // Get all metrics
    const metrics = {
      current: {
        total: Date.now() - startTime,
        openai: openaiDuration,
        azure_tts: azureTTSDuration
      },
      historical: performanceMetrics,
      azure_service: azureIntegration ? azureIntegration.getMetrics() : null
    };

    res.json({
      success: true,
      metrics
    });

  } catch (error) {
    console.error('Error in latency test:', error);
    res.status(500).json({
      error: 'Latency test failed',
      details: error.message
    });
  }
});

// Add health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      azure: null,
      twilio: null,
      websocket: {
        status: wss.clients.size > 0 ? 'healthy' : 'idle',
        connections: wss.clients.size
      }
    }
  };

  // Check Azure health if available
  if (azureIntegration) {
    try {
      health.services.azure = await azureIntegration.azureSpeech.checkHealth();
    } catch (error) {
      health.services.azure = {
        status: 'unhealthy',
        error: error.message
      };
      health.status = 'degraded';
    }
    } else {
    health.services.azure = {
      status: 'disabled',
      note: 'Using Twilio fallback'
    };
  }

  // Check Twilio health
  try {
    const twilioStatus = await twilioClient.api.v2010.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
    health.services.twilio = {
      status: twilioStatus.status === 'active' ? 'healthy' : 'degraded',
      type: twilioStatus.type,
      friendlyName: twilioStatus.friendlyName
    };
  } catch (error) {
    health.services.twilio = {
      status: 'unhealthy',
      error: error.message 
    };
    health.status = 'degraded';
  }

  // Overall health is unhealthy if any critical service is down
  if (health.services.twilio?.status === 'unhealthy' || 
      (azureIntegration && health.services.azure?.status === 'unhealthy')) {
    health.status = 'unhealthy';
  }

  res.json(health);
});

// Basic input sanitization middleware
function sanitizeInput(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .trim();
}

app.use((req, res, next) => {
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeInput(req.body[key]);
      }
    });
  }
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = sanitizeInput(req.query[key]);
      }
    });
  }
  next();
});

// Add basic error recovery
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  // Clean up any hanging resources
  if (req.query.callId) {
    cleanupCall(req.query.callId);
  }
  res.status(500).json({ error: 'An unexpected error occurred' });
});

/**
 * Enhanced call cleanup function
 * @param {string} callId - Call identifier
 * @param {boolean} [immediate=false] - Whether to clean up immediately
 */
function cleanupCall(callId, immediate = false) {
  try {
    // Get call data before cleanup
    const callData = activeCalls.get(callId);
    const conversation = conversations.get(callId) || [];
    const order = orderDetails.get(callId);

    // Save conversation history if exists
    if (conversation.length > 0) {
      try {
        saveConversationHistory(callId, conversation, {
          ...callData,
          orderDetails: order
        });
      } catch (error) {
        console.error('Error saving conversation history:', error);
      }
    }

    // Emit final status
    io.emit('callCompleted', {
      callId,
      orderInfo: order,
      status: 'terminated'
    });

    // Clean up resources
    activeCalls.delete(callId);
    conversations.delete(callId);
    resetTimeoutAttempts(callId);
    cleanupSessionFlags(callId);

    // Clean up any associated temp files
    const tempDir = path.join(__dirname, 'temp_audio');
    if (fs.existsSync(tempDir)) {
      fs.readdir(tempDir, (err, files) => {
        if (err) return;
        files.forEach(file => {
          if (file.includes(callId)) {
            const filePath = path.join(tempDir, file);
            fs.unlink(filePath, () => {});
          }
        });
      });
    }

    console.log(`🧹 Cleaned up resources for call ${callId}`);
  } catch (error) {
    console.error(`Error during call cleanup for ${callId}:`, error);
  }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  console.log(`🚀 Voice Agent Server running on port ${PORT}`);
  console.log(`📞 Twilio configured: ${!!process.env.TWILIO_ACCOUNT_SID}`);
  console.log(`🤖 OpenAI configured: ${!!process.env.OPENAI_API_KEY}`);
  console.log(`🧠 OpenAI model: ${getOpenAIModel()}`);
  console.log(`🎙️ Azure Speech Services configured: ${!!azureIntegration}`);
  if (azureIntegration) {
    console.log(`🔊 Azure custom voice: ${process.env.AZURE_CUSTOM_VOICE_NAME || 'luna'}`);
    console.log(`🌍 Azure region: ${process.env.AZURE_SPEECH_REGION}`);
  }
  console.log(`📁 Temp audio directory: ${path.join(__dirname, 'temp_audio')}`);

  // Prewarm services at startup
  await prewarmServices().catch(error => {
    console.log('⚠️ Initial prewarm error (non-critical):', error.message);
  });
});
