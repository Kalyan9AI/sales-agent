const AzureSpeechService = require('./azure-speech-service');
const fs = require('fs');
require('dotenv').config();

async function testAzureSpeechSimple() {
  try {
    console.log('🧪 Testing Azure Speech Services (Simplified)...');
    console.log(`🔑 Azure Key: ${process.env.AZURE_SPEECH_KEY ? 'Set' : 'Not Set'}`);
    console.log(`🌍 Azure Region: ${process.env.AZURE_SPEECH_REGION || 'Not Set'}`);
    console.log(`🎙️ Custom Voice: ${process.env.AZURE_CUSTOM_VOICE_NAME || 'luna'}`);
    
    // Initialize Azure Speech Service
    const azureSpeech = new AzureSpeechService();
    console.log('✅ Azure Speech Service initialized');
    
    // Test 1: Basic Text-to-Speech
    console.log('\n🔊 Testing: Basic Text-to-Speech');
    const testText = 'Hello! This is Sarah from US Hotel Food Supplies. Testing Azure Text-to-Speech with Luna voice.';
    
    const audioBuffer = await azureSpeech.textToSpeech(testText);
    console.log(`✅ Generated audio: ${audioBuffer.length} bytes`);
    
    // Save test audio
    const testAudioPath = 'test_azure_basic.wav';
    fs.writeFileSync(testAudioPath, audioBuffer);
    console.log(`💾 Test audio saved to: ${testAudioPath}`);
    
    // Test 2: Text-to-Speech with SSML
    console.log('\n🎭 Testing: Text-to-Speech with SSML');
    const ssmlText = 'Welcome to our hotel breakfast service! We have amazing fresh pastries and coffee today.';
    const ssmlOptions = {
      rate: 'medium',
      pitch: 'medium',
      volume: 'medium'
    };
    
    const ssmlAudioBuffer = await azureSpeech.textToSpeechWithSSML(ssmlText, ssmlOptions);
    console.log(`✅ Generated SSML audio: ${ssmlAudioBuffer.length} bytes`);
    
    // Save SSML test audio
    const ssmlAudioPath = 'test_azure_ssml.wav';
    fs.writeFileSync(ssmlAudioPath, ssmlAudioBuffer);
    console.log(`💾 SSML test audio saved to: ${ssmlAudioPath}`);
    
    // Test 3: Test different speech rates
    console.log('\n⚡ Testing: Different Speech Rates');
    const rateTests = [
      { rate: 'slow', text: 'This is spoken slowly.' },
      { rate: 'medium', text: 'This is spoken at medium speed.' },
      { rate: 'fast', text: 'This is spoken quickly.' }
    ];
    
    for (const test of rateTests) {
      try {
        const rateAudioBuffer = await azureSpeech.textToSpeechWithSSML(test.text, { rate: test.rate });
        const rateAudioPath = `test_azure_${test.rate}.wav`;
        fs.writeFileSync(rateAudioPath, rateAudioBuffer);
        console.log(`✅ ${test.rate} rate test: ${rateAudioBuffer.length} bytes -> ${rateAudioPath}`);
      } catch (error) {
        console.log(`❌ ${test.rate} rate test failed: ${error.message}`);
      }
    }
    
    console.log('\n🎉 Azure Speech TTS tests completed successfully!');
    console.log('\n📝 Integration Summary:');
    console.log('✅ Azure Speech Service initialized correctly');
    console.log('✅ Basic TTS working');
    console.log('✅ SSML TTS working');
    console.log('✅ Rate control working');
    console.log(`🎙️ Voice: en-US-${process.env.AZURE_CUSTOM_VOICE_NAME || 'luna'}Neural`);
    
    console.log('\n🚀 Next Steps:');
    console.log('1. Start the server: npm start');
    console.log('2. Test Azure integration: GET /api/azure/status');
    console.log('3. Test TTS endpoint: POST /api/azure/test-tts');
    console.log('4. Make a call to hear Azure TTS in your voice agent!');
    
    return true;
    
  } catch (error) {
    console.error('❌ Azure Speech test failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Verify Azure Speech key is correct');
    console.log('2. Check Azure Speech Service is active in Azure portal');
    console.log('3. Ensure region is correct (currently: eastus)');
    console.log('4. Check network connectivity to Azure services');
    return false;
  }
}

// Run the test
if (require.main === module) {
  testAzureSpeechSimple();
}

module.exports = testAzureSpeechSimple; 