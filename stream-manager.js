import { MuLawToPcm } from './audio-converter.js';
import { StreamingBuffer } from './streaming-buffer.js';
import { EventEmitter } from 'events';

/**
 * Manages parallel streams between Twilio, Azure, and GPT
 */
export class StreamManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.azureClient = options.azureClient;
    this.openaiClient = options.openaiClient;
    this.audioBuffer = new StreamingBuffer({
      onData: this.processAudioChunk.bind(this),
      onError: this.handleError.bind(this)
    });
    
    this.transcriptionBuffer = [];
    this.isProcessing = false;
    this.currentStreamId = null;
    
    // Cache for responses
    this.responseCache = new Map();
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    this.MAX_CACHE_SIZE = 100;
  }

  /**
   * Start a new streaming session
   * @param {string} streamId - Unique identifier for this stream
   */
  startStream(streamId) {
    this.currentStreamId = streamId;
    this.isProcessing = true;
    this.transcriptionBuffer = [];
    
    // Start Azure speech recognition
    this.azureClient.startContinuousRecognition();
    
    this.emit('streamStarted', { streamId });
  }

  /**
   * Process incoming audio chunk
   * @param {Buffer} chunk - Audio data chunk
   */
  async processAudioChunk(chunk) {
    try {
      if (!this.isProcessing) return;

      // Convert μ-law to PCM for Azure
      const pcmData = MuLawToPcm.toAzureFormat(chunk);
      
      // Send to Azure for transcription
      await this.azureClient.sendAudio(pcmData);
      
    } catch (error) {
      this.handleError('Error processing audio chunk:', error);
    }
  }

  /**
   * Handle transcription results from Azure
   * @param {string} text - Transcribed text
   * @param {boolean} isFinal - Whether this is a final transcription
   */
  async handleTranscription(text, isFinal) {
    try {
      if (!text || !this.isProcessing) return;

      this.transcriptionBuffer.push(text);
      
      if (isFinal || this.transcriptionBuffer.length >= 3) {
        const transcription = this.transcriptionBuffer.join(' ');
        this.transcriptionBuffer = [];
        
        // Check cache first
        const cachedResponse = this.getFromCache(transcription);
        if (cachedResponse) {
          this.emit('response', { 
            streamId: this.currentStreamId, 
            text: cachedResponse,
            fromCache: true 
          });
          return;
        }

        // Get GPT response with streaming
        const completion = await this.openaiClient.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: transcription }],
          stream: true,
          temperature: 0.3,
          max_tokens: 100
        });

        // Process streaming response with parallel TTS
        let responseText = '';
        let pendingTTS = [];  // Track pending TTS operations
        
        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            responseText += content;
            
            // Only process meaningful chunks (complete words or phrases)
            if (content.trim().length > 0 && (content.includes(' ') || content.includes('.'))) {
              // Start TTS conversion without waiting
              const ttsPromise = this.azureClient.createTTSResponse(content, {
                rate: '0%',
                pitch: '+5%',
                volume: 'medium',
                style: 'conversation'
              }).then(audioBuffer => {
                // Emit audio chunk as soon as it's ready
                this.emit('audioChunk', {
                  streamId: this.currentStreamId,
                  audio: audioBuffer,
                  text: content
                });
              }).catch(error => {
                console.error('TTS chunk processing error:', error);
              });
              
              pendingTTS.push(ttsPromise);
              
              // Emit text chunk for immediate display
              this.emit('responseChunk', {
                streamId: this.currentStreamId,
                text: content
              });
            }
          }
        }

        // Wait for all TTS operations to complete
        await Promise.all(pendingTTS);

        // Cache the full response
        this.addToCache(transcription, responseText);
        
        // Emit full response
        this.emit('response', {
          streamId: this.currentStreamId,
          text: responseText
        });
      }
    } catch (error) {
      this.handleError('Error handling transcription:', error);
    }
  }

  /**
   * Add response to cache
   * @param {string} key - Cache key (transcription)
   * @param {string} value - Cache value (response)
   */
  addToCache(key, value) {
    // Remove oldest entry if cache is full
    if (this.responseCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.responseCache.keys().next().value;
      this.responseCache.delete(oldestKey);
      console.log(`🗑️ Cache full, removed oldest entry: ${oldestKey.substring(0, 30)}...`);
    }
    
    this.responseCache.set(key, {
      value,
      timestamp: Date.now()
    });
    
    console.log(`💾 Added to cache: ${key.substring(0, 30)}... (size: ${this.responseCache.size}/${this.MAX_CACHE_SIZE})`);
  }

  /**
   * Get response from cache
   * @param {string} key - Cache key (transcription)
   * @returns {string|null} Cached response or null
   */
  getFromCache(key) {
    const cached = this.responseCache.get(key);
    if (!cached) return null;
    
    // Check if cache entry is still valid
    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.responseCache.delete(key);
      return null;
    }
    
    return cached.value;
  }

  /**
   * Stop the current stream
   */
  async stopStream() {
    try {
      this.isProcessing = false;
      
      // Stop Azure recognition
      await this.azureClient.stopContinuousRecognition();
      
      // Clear buffers
      this.audioBuffer.clear();
      this.transcriptionBuffer = [];
      
      this.emit('streamStopped', { streamId: this.currentStreamId });
      this.currentStreamId = null;
    } catch (error) {
      this.handleError('Error stopping stream:', error);
    }
  }

  /**
   * Handle errors
   * @param {string} message - Error message
   * @param {Error} error - Error object
   */
  handleError(message, error) {
    console.error(message, error);
    this.emit('error', { message, error });
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    await this.stopStream();
    this.removeAllListeners();
    this.responseCache.clear();
  }
} 