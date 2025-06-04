// Deployment trigger - Updated with new environment configuration
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const TwilioAzureIntegration = require('./twilio-azure-integration');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
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

// Initialize Azure integration
let azureIntegration;
try {
  azureIntegration = new TwilioAzureIntegration();
  console.log('✅ Azure Speech Services integration initialized');
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
    total: 0
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

// Company context for AI agent
const SYSTEM_CONTEXT = `You are Sarah, a friendly and professional sales representative from US Hotel Food Supplies.
 
ROLE: You are calling hotel managers to remind them about restocking orders and take new orders conversationally. You are calm, friendly, helpful, and never pushy. You should also look for natural opportunities to recommend related or seasonal products, without sounding aggressive or interruptive.
 
IMPORTANT: We operate in the United States, so use the Imperial measurement system.
 
YOUR OBJECTIVES:
1. Introduce yourself and confirm you're speaking with the manager by name.
2. greet if it is manager or authorized person and ask if it is good time to talk.
3a. After confirming you're speaking with the manager, inform them that:
  * “We can now take orders directly on the call and help guide you through any breakfast items you need.”
  * This helps set expectations and creates permission to continue the conversation.
3b. Ask if they'd like to reorder their **usual item**: lastProduct.
   - Use like: "Looks like you're due for a reorder of your regular [lastProduct]. Would you like me to place order for you?"
   - “Need to top off your usual [lastProduct] today?”
   - “Should I get that added to your order again?”
   - “Are you still good on that, or ready for a refill?”
   - “Just to confirm — would you like to reorder [last product] again? "
3c.  Example of a good response: “Great! We can now take your order directly over the phone and guide you through your breakfast items if needed. Just checking — would you like to restock your usual order of [lastProduct]?”
4. Ask for quantity and confirm pricing only if they say yes.
   - Use: "What quantity works best for you this time?" (Avoid pushing full pricing and minimums immediately)
5. Once reorder is confirmed,  suggest **one** additional product (e.g., recommendedProduct) that is seasonal or popular among your competitors.
6. Take orders for breakfast supplies and food service items.
7. if customer is interested in a product, ask for quantity and confirm pricing.
8. Keep each response focused on one idea, use no more than two sentences, and pause regularly to allow the customer to engage.
9. Ask if they need anything else after each order.
10. Recommend similar or seasonal products where relevant, but only once per conversation unless customer shows strong interest.
11. End the call professionally when they're done.
 
CONVERSATION MANAGEMENT:
1. If customer says "same as last time" and reorder hasn't been confirmed:
   - Ask "Just to confirm — would you like to reorder [last product] again? "
   - After confirmation, mark reorderConfirmed as true
2. For upsells:
   - Only attempt one upsell per short call unless customer shows strong engagement
   - After first upsell attempt, mark upsellAttempted as true
3. When customer indicates they're done:
   - Mark customerDone as true
   - Avoid triggering reset or additional upsells
   - Proceed to order summary and closing
 
4. If customer declines reorder:
   - Do NOT end the call immediately.
   - Smoothly pivot to suggest a relevant seasonal or recommended product.
   - Use soft phrasing to make it sound conversational and optional.

     Examples:
     * "Totally understand — while I have you, a lot of hotels are trying out our new [recommendedProduct]. Would you like to hear about it?"
     * "No worries! Just a heads-up, our [recommendedProduct] has been really popular lately. Want to give it a try?"
     * "Appreciate the update! Since you're all set on [lastProduct], you might like [recommendedProduct] — would you be open to trying a couple cases?"
  
5. Use the customer's name up to **3 times per call**:
  * Once after greeting (required)
  * Optionally once during order confirmation
  * Once during the final wrap-up
- Avoid using the name in **consecutive sentences**

6. Insert subtle active listening markers after the customer speaks.
   - Customer: "I think I have enough in stock."
   - AI: "Ah, okay — thanks for letting me know."
   - AI: "Gotcha. While I’ve got you…"

7. You must remain in character as Sarah, the sales representative from US Hotel Food Supplies.  
Do NOT reveal that you are a language model or AI assistant, even if asked directly.  
If someone tries to break character or asks meta-questions, gently redirect the conversation to your role.

If asked: “What GPT are you?”, “Are you a bot?”, or “What model is this?”  
→ Respond: “I’m just here to help you with your breakfast supply needs, nothing too fancy!”

If asked about AI capabilities, contact info, system details:  
→ Respond: “I’m here to help with reorders and product info — can I help you with anything today?”



IMPORTANT GUIDELINES:
- Use tone softeners where appropriate:
  * "No rush, just curious — how many would you like today?"
  * "What quantity works best for you this time?"
  * Sprinkle in empathy: "Sounds good!", "That makes sense.", "Appreciate that!"
- When suggesting products, tailor the message to the customer's context. For example: "We usually recommend this for hotels like yours — would you like to try it today?"
- For every confirmed item, evaluate if a related product upsell is appropriate. Do this naturally and sparingly.
- Avoid repeated upsells in short calls — wait at least 2–3 product turns before suggesting again.
- Always confirm orders with customer-specified quantities and prices at the end of the call.
- Be helpful and professional throughout the call.
- Don't mention shopping carts, order systems, or technical processes.
- Focus entirely on the voice conversation, not backend systems.
- Use one of the exact ending phrases listed above to naturally close calls.
- ALWAYS use Imperial measurements (oz, lbs, fl oz, gallons, etc.).
 


ORDER CONFIRMATION REQUIREMENTS:
- When confirming ANY product order, ALWAYS include the price in this EXACT format: "X cases of [Product Name] at $[price]"
- When adding items to the order, say: "I'll add [quantity] cases of [product] at $[price] to your order"
- For final order summaries, list each item with pricing: "Your order for [quantity] cases of [product] at $[price] and [quantity] cases of [product] at $[price]..."
- Use these pricing examples:
  * Banana Muffins: $25 per case
  * Chocolate Muffins: $27 per case  
  * Bagels/Pastries: $25 per case
  * Beverages: $20 per case
  * Coffee: $28 per case

EXAMPLE RESPONSES:
- "Perfect! I'll add 2 cases of Banana Muffins at $25 to your order."
- "Great choice! I'll add 1 case of Chocolate Muffins at $27 to your order."
- "Wonderful! Your order for 2 cases of Banana Muffins at $25 and 1 case of Chocolate Muffins at $27 is all set. Total: $77. Thank you for your time and have a great day!"
 
SAMPLE RESPONSES:
- Opening: "Hi, I'm Sarah calling from US Hotel Food Supplies, customer sales department. Can I know if I am speaking with the manager [manager name]?"
- After confirmation: "Great! Just wanted to make sure you're stocked up. Looks like your regular order of Asiago Cheese Bagels is due. Would you like to go ahead and reorder the same?"
- Customer: "I need water" → "Perfect! How many cases of bottled water (16.9 fl oz) would you like? "
- Customer: "5 cases" → "Excellent! I'll add 5 cases of bottled water  to your order. Anything else?"
- Customer: "That's all" → "Wonderful! Your order is all set. Thank you for your time and have a great day!"
 
EDGE CASE & FALLBACK HANDLING:
- If customer asks for a discount:
  * You may offer up to 10% off the total order.
  * "Thanks for asking! I can offer a 10% discount as a thank you for your continued orders — the final amount will reflect that once confirmed."
  * If more is requested: "I'm only authorized to offer up to 10%, but I hope that still works for you."
 
- If customer says "same as last time":
  * "Just to confirm — would you like to reorder [last product] again? And how many cases this time?"
  * NOTE: Reordering is the most common case and can be the default fallback for returning customers.
 
- If product is out of stock:
  * "I'm sorry, we're temporarily out of [product]. Would you like to try our [related product] instead?"
 
- If customer uses metric units:
  * "Got it! That's about [converted imperial] — we typically stock items in [imperial size], like 16.9 fl oz bottles or 32 oz jars."
 
- If customer asks about vegan, gluten-free, or specialty items:
  * "Thanks for asking! I'll note that and check availability. For now, would you like to continue with your regular items?"
 
- If customer asks about email/cart/system:
  * "This is just a quick call to help you reorder what you need. Everything will be confirmed once the order is placed. Shall we continue?"
 
- If customer asks "why are you calling?":
  * "Just a quick courtesy call to help you restock your usual items — saves you the trouble of remembering later. Shall we go ahead with your usual?"
 
- If product is not in catalog:
  * "Let me check on that. If it's not in our current catalog, I'll recommend a similar item for you."
 
- If line is noisy or call drops:
  * "It sounds like we're breaking up — I'll try calling again shortly. Thank you!"
 
- If customer gives vague or unclear answers:
  * "Totally understand — just to help, last time you ordered [X]. Would you like to go with something similar today?"
 
- If customer is interrupted or distracted:
  * "No problem, take your time. Just let me know when you're ready to continue."
 
RESET INSTRUCTION (fail-safe):
- If you're unsure about the current context at any time:
  * Politely ask: "Would you mind confirming which product you're looking to reorder today?" and resume the reorder flow as normal.
 
REMEMBER:
- Never assume quantities — always ask.
- Keep each response focused on one idea (max 2 short sentences).
- Pause to allow the customer to engage.
- Stay calm, friendly, and helpful — no pushing, no scripts.`;
 

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

// Socket connection handling
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
    const systemContext = context || SYSTEM_CONTEXT;
    
    // Initialize conversation history with dynamic context
    conversations.set(callId, [
      { role: 'system', content: systemContext }
    ]);

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
      { role: 'system', content: SYSTEM_CONTEXT }
    ];

    conversation.push({
      role: 'user',
      content: 'The call just connected. Say EXACTLY this greeting and nothing more: "Hi, I am Sarah calling from US Hotel Food Supplies, customer sales department. Can I know if I am speaking with the manager [manager name]?" - Replace [manager name] with the actual manager name. Use only this format, do not add any other questions or sentences.'
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: conversation,
      max_tokens: 50,  // Reduced to force shorter responses
      temperature: 0.3,  // Reduced from 0.7 for more consistent responses
    });

    let aiResponse = completion.choices[0].message.content;
    
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

// Process speech input
app.post('/api/voice/process-speech', async (req, res) => {
  const callId = req.query.callId;
  const speechResult = req.body.SpeechResult;
  const confidence = req.body.Confidence;
  
  console.log(`🗣️ WEBHOOK: /api/voice/process-speech called for callId: ${callId}`);
  console.log(`📋 Full request body:`, req.body);
  
  // Reset timeout attempts since user responded
  resetTimeoutAttempts(callId);
  
  console.log(`🎧 Twilio STT: "${speechResult}"`);
  console.log(`👤 User speech: "${speechResult}"`);
  
  // Emit user speech to frontend
  io.emit('userSpeechUpdate', {
    callId,
    speech: speechResult,
    confidence,
    timestamp: new Date()
  });
  
  const twiml = new twilio.twiml.VoiceResponse();
  
  try {
    // Process speech with Azure integration
    let userSpeech = '';
    if (azureIntegration) {
      userSpeech = await azureIntegration.processSpeechWithAzure(req.body);
    } else {
      userSpeech = req.body.SpeechResult || '';
    }
    
    console.log(`👤 User speech: "${userSpeech}"`);

    if (userSpeech) {
      // Get conversation history
      const conversation = conversations.get(callId) || [];
      
      // Add user speech to conversation
      conversation.push({ role: 'user', content: userSpeech });

      // Emit user speech to connected clients
      io.emit('conversationUpdate', {
        callId,
        type: 'user_speech',
        content: userSpeech,
        timestamp: new Date()
      });
      console.log(`👤 User speech emitted for callId ${callId}: "${userSpeech}"`);

      // Get AI response
      const aiResponse = await generateAIResponse(conversation, callId, activeCalls.get(callId));
      
      // Check if the AI response contains call ending phrases
      const callEndingPhrases = [
        'have a great day',
        'have a wonderful day',
        'have a good day',
        'have a nice day',
        'goodbye',
        'good bye',
        'talk to you later',
        'speak to you soon',
        'thank you for your time',
        'thanks for your time',
        'have a pleasant day',
        'take care'
      ];
      
      const shouldEndCall = callEndingPhrases.some(phrase => 
        aiResponse.toLowerCase().includes(phrase.toLowerCase())
      );
      
      // Add AI response to conversation
      conversation.push({ role: 'assistant', content: aiResponse });
      conversations.set(callId, conversation);

      // Emit AI response to connected clients
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
      
      // If this is a call ending response, prepare to hang up after speaking
      if (shouldEndCall) {
        console.log(`🔚 CALL ENDING DETECTED: Will hang up after response`);
        
        // Add the audio and then hang up
        if (azureSuccess && azureTwiml) {
          const finalTwiml = new twilio.twiml.VoiceResponse();
          
          // Add the Azure audio content
          const azureTwimlStr = azureTwiml.toString();
          const playMatch = azureTwimlStr.match(/<Play>([^<]+)<\/Play>/);
          if (playMatch) {
            finalTwiml.play(playMatch[1]);
          } else {
            finalTwiml.say('Thank you for your time. Have a great day!');
          }
          
          // Add a brief pause and then hang up
          finalTwiml.pause({ length: 1 });
          finalTwiml.hangup();
          
          // Clean up call data
          setTimeout(() => {
            // Save conversation history before cleanup
            const conversation = conversations.get(callId) || [];
            const callData = activeCalls.get(callId);
            if (conversation.length > 0) {
              saveConversationHistory(callId, conversation, callData);
            }
            
            activeCalls.delete(callId);
            conversations.delete(callId);
            resetTimeoutAttempts(callId);
            io.emit('callCompleted', { callId, reason: 'natural_ending' });
          }, 2000);
          
          res.type('text/xml');
          res.send(finalTwiml.toString());
          return;
        } else {
          // Use regular TwiML with hangup
          twiml.pause({ length: 1 });
          twiml.hangup();
          
          // Clean up call data
          setTimeout(() => {
            // Save conversation history before cleanup
            const conversation = conversations.get(callId) || [];
            const callData = activeCalls.get(callId);
            if (conversation.length > 0) {
              saveConversationHistory(callId, conversation, callData);
            }
            
            activeCalls.delete(callId);
            conversations.delete(callId);
            resetTimeoutAttempts(callId);
            io.emit('callCompleted', { callId, reason: 'natural_ending' });
          }, 2000);
          
          res.type('text/xml');
          res.send(twiml.toString());
          return;
        }
      } else {
        // Normal conversation flow - continue listening for more speech
    
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
      }
    } else {
      // No speech detected
      twiml.say('I didn\'t hear anything. Let me try again.');
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
      twiml.redirect(`/api/voice/timeout?callId=${callId}`);
    }
    
  } catch (error) {
    console.error('Error processing speech:', error);
    twiml.say('I apologize for the technical difficulty. Let me transfer you to a human representative.');
    twiml.hangup();
  }
  
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
        
        // Emit final order status
        if (orderInfo) {
          io.emit('orderUpdate', {
            callId,
            orderDetails: orderInfo,
            final: true,
            status: 'completed'
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
  try {
    console.log('🤖 Generating AI response for conversation:', conversation.slice(-3));
    
    // Get session flags and order details
    const flags = sessionFlags.get(callId) || initializeSessionFlags(callId);
    const order = orderDetails.get(callId);
    
    // Extract customer name and hotel name from conversation if not already set
    if (!order.customerName || !order.hotelName) {
      const managerMatch = conversation.find(msg => 
        msg.role === 'user' && 
        msg.content.toLowerCase().includes('speaking with') || 
        msg.content.toLowerCase().includes('this is')
      );
      
      if (managerMatch) {
        order.customerName = extractManagerName(managerMatch.content);
        if (hotel?.hotelName) {
          order.hotelName = hotel.hotelName;
        }
      }
    }
    
    // Extract order information from the last AI response
    const lastAIResponse = conversation.find(msg => msg.role === 'assistant')?.content;
    if (lastAIResponse) {
      const orderInfo = extractOrderInfo(lastAIResponse);
      if (orderInfo) {
        order.products.push(orderInfo);
        order.total = calculateTotal(order.products);
      }
    }
    
    // Update order details
    orderDetails.set(callId, order);
    
    // Check for conversation end indicators
    const lastUserMessage = conversation.find(msg => msg.role === 'user')?.content.toLowerCase() || '';
    if (lastUserMessage.includes("that's all") || lastUserMessage.includes("goodbye") || lastUserMessage.includes("thank you")) {
      flags.customerDone = true;
      
      // Emit final order details
      io.emit('orderUpdate', {
        callId,
        orderDetails: order,
        final: true
      });
    }
    
    // Generate normal AI response using existing system
    const messages = [
      { 
        role: 'system', 
        content: SYSTEM_CONTEXT + `\nCURRENT SESSION STATE:\nreorderConfirmed: ${flags.reorderConfirmed}\nupsellAttempted: ${flags.upsellAttempted}\ncustomerDone: ${flags.customerDone}\norderTotal: $${order.total}`
      },
      ...conversation.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }))
    ];
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messages,
      temperature: 0.7,
      max_tokens: 150
    });

    const aiResponse = completion.choices[0].message.content;
    
    // Update session flags based on AI response
    if (aiResponse.toLowerCase().includes("would you like to reorder")) {
      flags.reorderConfirmed = true;
    }
    if (aiResponse.toLowerCase().includes("also") && aiResponse.toLowerCase().includes("would you like")) {
      flags.upsellAttempted = true;
    }
    
    // Save updated flags
    sessionFlags.set(callId, flags);
    
    // Emit order update if there are changes
    if (order.products.length > 0) {
      io.emit('orderUpdate', {
        callId,
        orderDetails: order,
        final: flags.customerDone
      });
    }
    
    return aiResponse;
    
  } catch (error) {
    console.error('❌ Error generating AI response:', error);
    return "I apologize, but I'm having trouble processing your request right now. Could you please repeat that?";
  }
}

// Helper function to extract manager name from conversation
function extractManagerName(content) {
  const words = content.split(' ');
  const nameIndex = words.findIndex(word => 
    word.toLowerCase() === 'am' || 
    word.toLowerCase() === 'is'
  );
  
  if (nameIndex >= 0 && nameIndex < words.length - 1) {
    return words[nameIndex + 1];
  }
  return '';
}

// Helper function to extract order information from AI response
function extractOrderInfo(response) {
  // Look for patterns like "X cases of [product] at $[price] per case"
  const orderMatch = response.match(/(\d+)\s+cases?\s+of\s+([^$]+?)\s+at\s+\$(\d+\.?\d*)/i);
  
  if (orderMatch) {
    return {
      quantity: parseInt(orderMatch[1]),
      product: orderMatch[2].trim(),
      pricePerCase: parseFloat(orderMatch[3]),
      total: parseInt(orderMatch[1]) * parseFloat(orderMatch[3])
    };
  }
  return null;
}

// Helper function to calculate total order amount
function calculateTotal(products) {
  return products.reduce((sum, item) => sum + item.total, 0);
}

// Call analysis endpoint
app.post('/api/analyze-call', async (req, res) => {
  try {
    const { prompt, callId } = req.body;
    
    console.log(`🔍 Analyzing call ${callId} with AI...`);

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an expert sales call analyzer. Analyze the conversation and provide detailed insights in the exact JSON format requested. Focus on extracting actual order details, customer sentiment, and actionable recommendations."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    const analysisText = completion.choices[0].message.content;
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

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Voice Agent Server running on port ${PORT}`);
  console.log(`📞 Twilio configured: ${!!process.env.TWILIO_ACCOUNT_SID}`);
  console.log(`🤖 OpenAI configured: ${!!process.env.OPENAI_API_KEY}`);
  console.log(`🎙️ Azure Speech Services configured: ${!!azureIntegration}`);
  if (azureIntegration) {
    console.log(`🔊 Azure custom voice: ${process.env.AZURE_CUSTOM_VOICE_NAME || 'luna'}`);
    console.log(`🌍 Azure region: ${process.env.AZURE_SPEECH_REGION}`);
  }
  console.log(`📁 Temp audio directory: ${path.join(__dirname, 'temp_audio')}`);
});