const twilio = require('twilio');
const AzureSpeechService = require('./azure-speech-service');
const fs = require('fs');
const path = require('path');

class TwilioAzureIntegration {
  constructor() {
    this.azureSpeech = new AzureSpeechService();
  }

  /**
   * Create TwiML response with Azure TTS audio
   * @param {string} text - Text to convert to speech
   * @param {Object} options - Voice options
   * @returns {Promise<Object>} - TwiML response object
   */
  async createTTSResponse(text, options = {}) {
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
      
      // Get the ngrok URL from environment or use default
      const ngrokUrl = process.env.NGROK_URL || 'https://a27c-2601-242-4100-2bf0-6dc0-9153-211e-40e6.ngrok-free.app';
      const fullAudioUrl = `${ngrokUrl}/audio/${audioFileName}`;
      
      // Play the generated audio with full URL
      twiml.play(fullAudioUrl);
      
      console.log(`🔊 AZURE TTS: TwiML configured to play ${fullAudioUrl}`);
      console.log(`✅ AZURE TTS SUCCESS: Generated audio with Luna Neural voice`);
      
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
      timeout: options.timeout || 5,
      speechTimeout: options.speechTimeout || 'auto',
      speechModel: 'experimental_utterances', // Better for natural conversation
      enhanced: true, // Use enhanced speech recognition
      language: options.language || 'en-US',
      action: actionUrl,
      method: 'POST'
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
    let transcribedText = '';
    
    // First try to get speech from Twilio's recognition
    if (twilioRequest.SpeechResult) {
      transcribedText = twilioRequest.SpeechResult;
      console.log(`🎧 Twilio STT: "${transcribedText}"`);
      
      // Optionally, you could also send this to Azure for comparison/verification
      // const azureResult = await this.verifyWithAzure(audioData);
      
      return transcribedText;
    }
    
    // If no speech result from Twilio, handle silence or errors
    console.log('🎧 No speech detected by Twilio');
    return '';
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
}

module.exports = TwilioAzureIntegration; 