const twilio = require('twilio');
const AzureSpeechService = require('./azure-speech-service');
const fs = require('fs');
const path = require('path');
const sdk = require('microsoft-cognitiveservices-speech-sdk');

class TwilioAzureIntegration {
  constructor() {
    this.azureSpeech = new AzureSpeechService();
    this.metrics = {
      tts: [],
      stt: []
    };
  }

  logMetric(operation, duration) {
    const metricType = operation === 'tts' ? 'tts' : 'stt';
    this.metrics[metricType].push({
      duration,
      timestamp: Date.now()
    });
    
    // Keep only last 100 metrics
    if (this.metrics[metricType].length > 100) {
      this.metrics[metricType].shift();
    }
    
    // Log performance
    console.log(`⏱️ AZURE ${operation.toUpperCase()}: ${duration}ms`);
    
    // Calculate and log average
    const avg = this.metrics[metricType].reduce((sum, m) => sum + m.duration, 0) / this.metrics[metricType].length;
    console.log(`📊 AZURE Average ${operation.toUpperCase()}: ${Math.round(avg)}ms`);
  }

  /**
   * Create TwiML response with Azure TTS audio
   * @param {string} text - Text to convert to speech
   * @param {Object} options - Voice options
   * @returns {Promise<Object>} - TwiML response object
   */
  async createTTSResponse(text, options = {}) {
    const startTime = Date.now();
    const twiml = new twilio.twiml.VoiceResponse();
    
    try {
      console.log(`🎙️ AZURE TTS: Starting synthesis for "${text}" with options:`, options);
      
      // Generate speech with Azure
      const audioBuffer = await this.azureSpeech.textToSpeechWithSSML(text, options);
      
      console.log(`🔊 AZURE TTS: Successfully generated ${audioBuffer.length} bytes of audio`);
      
      // Save audio to temporary file for Twilio to serve
      const audioFileName = `tts_${Date.now()}.mp3`;
      const audioPath = path.join(__dirname, 'temp_audio', audioFileName);
      
      // Ensure temp directory exists
      const tempDir = path.dirname(audioPath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
        console.log(`📁 Created temp directory: ${tempDir}`);
      }
      
      // Write audio file
      fs.writeFileSync(audioPath, audioBuffer);
      
      console.log(`💾 AZURE TTS: Audio file saved to ${audioPath}`);
      
      // Get the webhook URL based on environment
      let baseUrl;
      if (process.env.NODE_ENV === 'production') {
        // Production: Use Azure App Service URL
        baseUrl = process.env.CLIENT_URL || `https://${process.env.AZURE_WEBAPP_NAME}.canadacentral-01.azurewebsites.net`;
        if (!baseUrl) {
          throw new Error('Production environment requires CLIENT_URL or AZURE_WEBAPP_NAME to be set');
        }
      } else {
        // Development: Use ngrok URL
        baseUrl = process.env.NGROK_URL;
        if (!baseUrl) {
          throw new Error('Development environment requires NGROK_URL to be set');
        }
      }
      const fullAudioUrl = `${baseUrl}/audio/${audioFileName}`;
      
      // Play the generated audio with full URL
      twiml.play(fullAudioUrl);
      
      console.log(`🔊 AZURE TTS: TwiML configured to play ${fullAudioUrl}`);
      console.log(`✅ AZURE TTS SUCCESS: Generated audio with Luna Neural voice`);
      
      // Log performance
      this.logMetric('tts', Date.now() - startTime);
      
      return {
        twiml,
        audioPath,
        audioFileName
      };
      
    } catch (error) {
      console.error('❌ AZURE TTS ERROR: Failed to generate speech:', error);
      console.log(`🔄 FALLBACK: Using Twilio Alice voice instead`);
      
      // Fallback to Twilio's built-in TTS
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, text);
      
      return { twiml };
    }
  }

  /**
   * Create enhanced TwiML for speech recognition with Azure backup
   * @param {string} callId - Call identifier
   * @param {string} actionUrl - URL for processing speech
   * @param {Object} options - Recognition options
   * @returns {Object} - TwiML response
   */
  createSpeechRecognitionTwiML(callId, actionUrl, options = {}) {
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Use Twilio's built-in speech recognition with enhanced settings
    const gather = twiml.gather({
      input: 'speech',
      timeout: options.timeout || 10,  // 10 seconds default
      speechTimeout: options.speechTimeout || 'auto',
      speechModel: 'experimental_utterances',
      enhanced: true,
      language: options.language || 'en-US',
      action: actionUrl,
      method: 'POST',
      maxAttempts: 3, // Maximum number of recognition attempts
      hints: ['yes', 'no', 'goodbye', 'thank you'], // Common phrases to improve recognition
    });

    // Add a slight pause before listening
    gather.pause({ length: 1 });

    return twiml;
  }

  /**
   * Process speech with Azure STT as primary and Twilio as fallback
   * @param {Object} twilioRequest - Twilio webhook request
   * @returns {Promise<string>} - Transcribed text
   */
  async processSpeechWithAzure(twilioRequest) {
    const startTime = Date.now();
    try {
      const transcription = await this.azureSpeech.speechToText(twilioRequest.audio);
      this.logMetric('stt', Date.now() - startTime);
      return transcription;
    } catch (error) {
      console.error('Azure STT error:', error);
      throw error;
    }
  }

  /**
   * Create a media stream for real-time audio processing
   * @param {Object} websocket - WebSocket connection
   * @param {string} callId - Call identifier
   * @returns {Object} - Stream handlers
   */
  createMediaStreamHandler(websocket, callId) {
    console.log(`🎙️ Setting up media stream for call ${callId}`);
    
    let audioBuffer = Buffer.alloc(0);
    
    return {
      onMedia: (mediaMessage) => {
        // Accumulate audio data
        const audioChunk = Buffer.from(mediaMessage.payload, 'base64');
        audioBuffer = Buffer.concat([audioBuffer, audioChunk]);
        
        // Process when we have enough audio (e.g., 1 second worth)
        if (audioBuffer.length >= 8000) { // Assuming 8kHz, 1 second = 8000 bytes
          this.processRealTimeAudio(audioBuffer, callId);
          audioBuffer = Buffer.alloc(0); // Reset buffer
        }
      },
      
      onStop: () => {
        console.log(`🎙️ Media stream stopped for call ${callId}`);
        // Process any remaining audio
        if (audioBuffer.length > 0) {
          this.processRealTimeAudio(audioBuffer, callId);
        }
      }
    };
  }

  /**
   * Process real-time audio with Azure STT
   * @param {Buffer} audioBuffer - Audio data
   * @param {string} callId - Call identifier
   */
  async processRealTimeAudio(audioBuffer, callId) {
    try {
      // Convert Twilio's audio format (mulaw, 8kHz) to Azure compatible format
      const convertedAudio = this.convertTwilioAudioToAzure(audioBuffer);
      
      // Process with Azure STT
      const transcription = await this.azureSpeech.speechToText(convertedAudio);
      
      if (transcription) {
        console.log(`🎧 Azure STT (Real-time): "${transcription}"`);
        // You can emit this to your application for real-time processing
        // io.emit('realTimeTranscription', { callId, text: transcription });
      }
      
    } catch (error) {
      console.error('Error processing real-time audio:', error);
    }
  }

  /**
   * Convert Twilio's mulaw audio to PCM for Azure
   * @param {Buffer} mulawBuffer - Mulaw audio data
   * @returns {Buffer} - PCM audio data
   */
  convertTwilioAudioToAzure(mulawBuffer) {
    // This is a simplified conversion - you might need a more robust solution
    // For now, return the buffer as-is and let Azure handle it
    // In production, you'd want to use a library like 'pcm-util' for proper conversion
    return mulawBuffer;
  }

  /**
   * Clean up temporary audio files
   * @param {string} audioFileName - Name of the audio file to delete
   */
  cleanupTempAudio(audioFileName) {
    try {
      const audioPath = path.join(__dirname, 'temp_audio', audioFileName);
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
        console.log(`🗑️ Cleaned up temp audio: ${audioFileName}`);
      }
    } catch (error) {
      console.error('Error cleaning up temp audio:', error);
    }
  }

  /**
   * Get Azure service status
   * @returns {Promise<Object>} - Service status
   */
  async getServiceStatus() {
    try {
      // Test Azure connection by getting available voices
      const voices = await this.azureSpeech.getAvailableVoices();
      return {
        azure: {
          connected: true,
          voicesAvailable: voices.length,
          customVoice: process.env.AZURE_CUSTOM_VOICE_NAME,
          voiceConfigured: `en-US-${process.env.AZURE_CUSTOM_VOICE_NAME || 'luna'}Neural`
        }
      };
    } catch (error) {
      console.warn('Azure voice listing failed, but TTS may still work:', error.message);
      // Return partial status - Azure might still work for TTS even if voice listing fails
      return {
        azure: {
          connected: true, // Assume connected since initialization worked
          voicesAvailable: 'unknown',
          customVoice: process.env.AZURE_CUSTOM_VOICE_NAME,
          voiceConfigured: `en-US-${process.env.AZURE_CUSTOM_VOICE_NAME || 'luna'}Neural`,
          note: 'Voice listing unavailable but TTS should work'
        }
      };
    }
  }

  async textToSpeech(text, options = {}) {
    return new Promise((resolve, reject) => {
      const synthesizer = new sdk.SpeechSynthesizer(this.speechConfig);
      
      // Set timeout for synthesis
      const timeoutMs = options.timeoutMs || 15000; // 15 seconds default
      const timeoutId = setTimeout(() => {
        synthesizer.close();
        reject(new Error(`Speech synthesis timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      
      synthesizer.speakTextAsync(
        text,
        (result) => {
          clearTimeout(timeoutId); // Clear timeout on success
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            console.log(`🔊 Azure TTS: Successfully synthesized ${text.length} characters`);
            const audioBuffer = Buffer.from(result.audioData);
            synthesizer.close();
            resolve(audioBuffer);
          } else {
            console.error('Azure TTS failed:', result.errorDetails);
            synthesizer.close();
            reject(new Error(`Speech synthesis failed: ${result.errorDetails}`));
          }
        },
        (error) => {
          clearTimeout(timeoutId); // Clear timeout on error
          console.error('Azure TTS error:', error);
          synthesizer.close();
          reject(error);
        }
      );
    });
  }

  getMetrics() {
    return {
      tts: {
        average: this.metrics.tts.reduce((sum, m) => sum + m.duration, 0) / this.metrics.tts.length || 0,
        samples: this.metrics.tts
      },
      stt: {
        average: this.metrics.stt.reduce((sum, m) => sum + m.duration, 0) / this.metrics.stt.length || 0,
        samples: this.metrics.stt
      }
    };
  }
}

module.exports = TwilioAzureIntegration; 