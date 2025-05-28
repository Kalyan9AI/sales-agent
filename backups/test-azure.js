const AzureSpeechService = require('./azure-speech-service');
const fs = require('fs');
require('dotenv').config();

async function testAzureSpeech() {
  try {
    console.log('🧪 Testing Azure Speech Services...');
    console.log(`🔑 Azure Key: ${process.env.AZURE_SPEECH_KEY ? 'Set' : 'Not Set'}`);
    console.log(`🌍 Azure Region: ${process.env.AZURE_SPEECH_REGION || 'Not Set'}`);
    console.log(`🎙️ Custom Voice: ${process.env.AZURE_CUSTOM_VOICE_NAME || 'luna'}`);
    
    // Initialize Azure Speech Service
    const azureSpeech = new AzureSpeechService();
    console.log('✅ Azure Speech Service initialized');
    
    // Test 1: Get available voices
    console.log('\n📋 Testing: Get Available Voices');
    const voices = await azureSpeech.getAvailableVoices();
    console.log(`Found ${voices.length} voices`);
    
    // Show English voices
    const englishVoices = voices.filter(voice => voice.locale.startsWith('en-US'));
    console.log(`English (US) voices: ${englishVoices.length}`);
    englishVoices.slice(0, 5).forEach(voice => {
      console.log(`  - ${voice.name} (${voice.gender})`);
    });
    
    // Test 2: Text-to-Speech
    console.log('\n🔊 Testing: Text-to-Speech');
    const testText = 'Hello! This is a test of Azure Text-to-Speech with the Luna voice. How does this sound?';
    
    const audioBuffer = await azureSpeech.textToSpeech(testText);
    console.log(`Generated audio: ${audioBuffer.length} bytes`);
    
    // Save test audio
    const testAudioPath = 'test_azure_tts.wav';
    fs.writeFileSync(testAudioPath, audioBuffer);
    console.log(`✅ Test audio saved to: ${testAudioPath}`);
    
    // Test 3: Text-to-Speech with SSML
    console.log('\n🎭 Testing: Text-to-Speech with SSML');
    const ssmlText = 'Welcome to our hotel breakfast service! We have amazing fresh pastries today.';
    const ssmlOptions = {
      rate: 'medium',
      pitch: 'medium',
      volume: 'medium'
    };
    
    const ssmlAudioBuffer = await azureSpeech.textToSpeechWithSSML(ssmlText, ssmlOptions);
    console.log(`Generated SSML audio: ${ssmlAudioBuffer.length} bytes`);
    
    // Save SSML test audio
    const ssmlAudioPath = 'test_azure_ssml.wav';
    fs.writeFileSync(ssmlAudioPath, ssmlAudioBuffer);
    console.log(`✅ SSML test audio saved to: ${ssmlAudioPath}`);
    
    console.log('\n🎉 All Azure Speech tests completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Make sure your .env file has the Azure credentials');
    console.log('2. Start the server with: npm start');
    console.log('3. Test the /api/azure/status endpoint');
    console.log('4. Make a test call to hear Azure TTS in action');
    
  } catch (error) {
    console.error('❌ Azure Speech test failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check your Azure Speech key and region in .env file');
    console.log('2. Ensure your Azure Speech Service is active');
    console.log('3. Verify network connectivity to Azure services');
  }
}

// Run the test
if (require.main === module) {
  testAzureSpeech();
}

module.exports = testAzureSpeech; 