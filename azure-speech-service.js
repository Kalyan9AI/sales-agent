const sdk = require('microsoft-cognitiveservices-speech-sdk');
const fs = require('fs');
const { Readable } = require('stream');

class AzureSpeechService {
  constructor() {
    this.speechKey = process.env.AZURE_SPEECH_KEY;
    this.speechRegion = process.env.AZURE_SPEECH_REGION;
    this.customVoiceName = process.env.AZURE_CUSTOM_VOICE_NAME || 'luna';
    
    if (!this.speechKey || !this.speechRegion) {
      throw new Error('Azure Speech key and region must be set in environment variables');
    }
    
    this.speechConfig = sdk.SpeechConfig.fromSubscription(this.speechKey, this.speechRegion);
    this.speechConfig.speechSynthesisVoiceName = `en-US-${this.customVoiceName}Neural`;
    
    // Set optimal audio format for Luna voice (Audio16Khz32KBitRateMonoMp3)
    this.speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
    
    // Configure timeouts and retries
    this.speechConfig.setProperty("SpeechServiceConnection_InitialSilenceTimeoutMs", "10000"); // 10 seconds
    this.speechConfig.setProperty("SpeechServiceConnection_EndSilenceTimeoutMs", "5000"); // 5 seconds
    this.speechConfig.setProperty("SpeechServiceConnection_ReconnectionBackoffMs", "1000"); // 1 second
    this.speechConfig.setProperty("SpeechServiceConnection_MaxRetryTimeMs", "15000"); // 15 seconds max retry
    
    console.log(`🎙️ Azure Speech Service initialized with voice: ${this.speechConfig.speechSynthesisVoiceName}`);
    console.log(`🔊 Audio format: Audio16Khz32KBitRateMonoMp3 for optimal Luna voice quality`);
    console.log(`⚙️ Configured timeouts: Initial=10s, End=5s, MaxRetry=15s`);
  }

  /**
   * Convert text to speech and return audio buffer
   * @param {string} text - Text to convert to speech
   * @returns {Promise<Buffer>} - Audio buffer
   */
  async textToSpeech(text) {
    return new Promise((resolve, reject) => {
      const synthesizer = new sdk.SpeechSynthesizer(this.speechConfig);
      
      synthesizer.speakTextAsync(
        text,
        (result) => {
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
          console.error('Azure TTS error:', error);
          synthesizer.close();
          reject(error);
        }
      );
    });
  }

  /**
   * Convert text to speech with SSML for more control
   * @param {string} text - Text to convert to speech
   * @param {Object} options - Voice options (rate, pitch, etc.)
   * @returns {Promise<Buffer>} - Audio buffer
   */
  async textToSpeechWithSSML(text, options = {}) {
    const rate = options.rate || 'medium';
    const pitch = options.pitch || 'medium';
    const volume = options.volume || 'medium';
    const style = options.style || 'conversation'; // Default to conversation style for Luna
    const voiceName = options.voiceName || this.customVoiceName;
    
    // Build SSML with conversation style for Luna voice
    const ssml = `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
        <voice name="en-US-${voiceName}Neural">
          <mstts:express-as style="${style}">
            <prosody rate="${rate}" pitch="${pitch}" volume="${volume}">
              ${text}
            </prosody>
          </mstts:express-as>
        </voice>
      </speak>
    `;

    return new Promise((resolve, reject) => {
      const synthesizer = new sdk.SpeechSynthesizer(this.speechConfig);
      
      synthesizer.speakSsmlAsync(
        ssml,
        (result) => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            console.log(`🔊 Azure TTS (SSML): Successfully synthesized ${text.length} characters with ${voiceName}Neural voice`);
            const audioBuffer = Buffer.from(result.audioData);
            synthesizer.close();
            resolve(audioBuffer);
          } else {
            console.error('Azure TTS (SSML) failed:', result.errorDetails);
            synthesizer.close();
            reject(new Error(`Speech synthesis failed: ${result.errorDetails}`));
          }
        },
        (error) => {
          console.error('Azure TTS (SSML) error:', error);
          synthesizer.close();
          reject(error);
        }
      );
    });
  }

  /**
   * Convert speech to text from audio buffer
   * @param {Buffer} audioBuffer - Audio data
   * @returns {Promise<string>} - Transcribed text
   */
  async speechToText(audioBuffer) {
    return new Promise((resolve, reject) => {
      // Create audio config from buffer
      const pushStream = sdk.AudioInputStream.createPushStream();
      pushStream.write(audioBuffer);
      pushStream.close();
      
      const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
      const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);

      recognizer.recognizeOnceAsync(
        (result) => {
          if (result.reason === sdk.ResultReason.RecognizedSpeech) {
            console.log(`🎧 Azure STT: Recognized "${result.text}"`);
            recognizer.close();
            resolve(result.text);
          } else if (result.reason === sdk.ResultReason.NoMatch) {
            console.log('🎧 Azure STT: No speech could be recognized');
            recognizer.close();
            resolve('');
          } else {
            console.error('Azure STT failed:', result.errorDetails);
            recognizer.close();
            reject(new Error(`Speech recognition failed: ${result.errorDetails}`));
          }
        },
        (error) => {
          console.error('Azure STT error:', error);
          recognizer.close();
          reject(error);
        }
      );
    });
  }

  /**
   * Create a continuous speech recognizer for real-time transcription
   * @param {Function} onRecognized - Callback for recognized speech
   * @param {Function} onRecognizing - Callback for partial recognition (optional)
   * @returns {Object} - Recognizer object with start/stop methods
   */
  createContinuousRecognizer(onRecognized, onRecognizing = null) {
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);

    recognizer.recognized = (s, e) => {
      if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
        console.log(`🎧 Azure STT (Continuous): "${e.result.text}"`);
        onRecognized(e.result.text);
      }
    };

    if (onRecognizing) {
      recognizer.recognizing = (s, e) => {
        if (e.result.reason === sdk.ResultReason.RecognizingSpeech) {
          onRecognizing(e.result.text);
        }
      };
    }

    recognizer.canceled = (s, e) => {
      console.log(`🎧 Azure STT (Continuous): Recognition canceled: ${e.reason}`);
      if (e.reason === sdk.CancellationReason.Error) {
        console.error(`Azure STT Error: ${e.errorDetails}`);
      }
    };

    return {
      start: () => {
        console.log('🎧 Starting continuous speech recognition...');
        recognizer.startContinuousRecognitionAsync();
      },
      stop: () => {
        console.log('🎧 Stopping continuous speech recognition...');
        recognizer.stopContinuousRecognitionAsync(() => {
          recognizer.close();
        });
      }
    };
  }

  /**
   * Get available voices
   * @returns {Promise<Array>} - Array of available voices
   */
  async getAvailableVoices() {
    try {
      // Return a simplified voice list to avoid the locale error in Azure SDK
      // The getVoicesAsync method has a bug with locale.toLowerCase()
      const fallbackVoices = [
        {
          name: `en-US-${this.customVoiceName}Neural`,
          locale: 'en-US',
          gender: 'Female',
          voiceType: 'Neural'
        },
        {
          name: 'en-US-AriaNeural',
          locale: 'en-US',
          gender: 'Female',
          voiceType: 'Neural'
        },
        {
          name: 'en-US-JennyNeural',
          locale: 'en-US',
          gender: 'Female',
          voiceType: 'Neural'
        },
        {
          name: 'en-US-GuyNeural',
          locale: 'en-US',
          gender: 'Male',
          voiceType: 'Neural'
        }
      ];
      
      console.log('🎙️ Using fallback voice list to avoid Azure SDK locale bug');
      return fallbackVoices;
      
    } catch (error) {
      // If there's an issue, return a fallback list
      console.warn('Azure getVoices failed, using fallback voice list:', error.message);
      return [
        {
          name: `en-US-${this.customVoiceName}Neural`,
          locale: 'en-US',
          gender: 'Female',
          voiceType: 'Neural'
        }
      ];
    }
  }
}

module.exports = AzureSpeechService; 