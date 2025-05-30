/**
 * Audio conversion utilities for Voice Agent
 * Handles conversion between different audio formats
 */

export class MuLawToPcm {
  // Mapping table for μ-law to 16-bit PCM conversion
  static #mulawTable = new Int16Array([
    32124, 31100, 30076, 29052, 28028, 27004, 25980, 24956,
    23932, 22908, 21884, 20860, 19836, 18812, 17788, 16764,
    15996, 15484, 14972, 14460, 13948, 13436, 12924, 12412,
    11900, 11388, 10876, 10364, 9852, 9340, 8828, 8316,
    7932, 7676, 7420, 7164, 6908, 6652, 6396, 6140,
    5884, 5628, 5372, 5116, 4860, 4604, 4348, 4092,
    3900, 3772, 3644, 3516, 3388, 3260, 3132, 3004,
    2876, 2748, 2620, 2492, 2364, 2236, 2108, 1980,
    1884, 1820, 1756, 1692, 1628, 1564, 1500, 1436,
    1372, 1308, 1244, 1180, 1116, 1052, 988, 924,
    876, 844, 812, 780, 748, 716, 684, 652,
    620, 588, 556, 524, 492, 460, 428, 396,
    372, 356, 340, 324, 308, 292, 276, 260,
    244, 228, 212, 196, 180, 164, 148, 132,
    120, 112, 104, 96, 88, 80, 72, 64,
    56, 48, 40, 32, 24, 16, 8, 0,
    -32124, -31100, -30076, -29052, -28028, -27004, -25980, -24956,
    -23932, -22908, -21884, -20860, -19836, -18812, -17788, -16764,
    -15996, -15484, -14972, -14460, -13948, -13436, -12924, -12412,
    -11900, -11388, -10876, -10364, -9852, -9340, -8828, -8316,
    -7932, -7676, -7420, -7164, -6908, -6652, -6396, -6140,
    -5884, -5628, -5372, -5116, -4860, -4604, -4348, -4092,
    -3900, -3772, -3644, -3516, -3388, -3260, -3132, -3004,
    -2876, -2748, -2620, -2492, -2364, -2236, -2108, -1980,
    -1884, -1820, -1756, -1692, -1628, -1564, -1500, -1436,
    -1372, -1308, -1244, -1180, -1116, -1052, -988, -924,
    -876, -844, -812, -780, -748, -716, -684, -652,
    -620, -588, -556, -524, -492, -460, -428, -396,
    -372, -356, -340, -324, -308, -292, -276, -260,
    -244, -228, -212, -196, -180, -164, -148, -132,
    -120, -112, -104, -96, -88, -80, -72, -64,
    -56, -48, -40, -32, -24, -16, -8, 0
  ]);

  /**
   * Validates audio format and parameters
   * @param {Buffer} buffer - Audio buffer to validate
   * @throws {Error} If validation fails
   */
  static validateAudioFormat(buffer) {
    if (!buffer || !(buffer instanceof Buffer)) {
      throw new Error('Invalid input: Expected Buffer type');
    }

    if (buffer.length === 0) {
      throw new Error('Invalid input: Empty buffer');
    }

    if (buffer.length % 2 !== 0) {
      throw new Error('Invalid buffer length: Must be even number of bytes');
    }

    // Check for valid μ-law range (0-255)
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] < 0 || buffer[i] > 255) {
        throw new Error(`Invalid μ-law value at position ${i}: ${buffer[i]}`);
      }
    }
  }

  /**
   * Converts a Buffer of μ-law encoded audio data to PCM encoded.
   * @param {Buffer} buffer - Buffer of 8-bit μ-law values
   * @returns {Uint8Array} - Array of 16-bit PCM values
   */
  static transcode(buffer) {
    // Validate input format
    this.validateAudioFormat(buffer);

    // Convert Buffer to Uint8Array
    const mulawBytes = new Uint8Array(buffer);
    // Output array is twice as long since each μ-law byte becomes two PCM bytes
    const output = new Uint8Array(mulawBytes.length * 2);

    try {
      for (let i = 0; i < mulawBytes.length; i++) {
        // Add 128 because μ-law values are signed and array indices start from 0
        const pcmValue = this.#mulawTable[mulawBytes[i] + 128];

        // Write as little-endian (least significant byte first)
        output[2 * i] = pcmValue & 0xff;
        output[2 * i + 1] = (pcmValue >> 8) & 0xff;
      }
    } catch (error) {
      throw new Error(`PCM conversion failed: ${error.message}`);
    }

    return output;
  }

  /**
   * Creates an audio buffer suitable for Azure Speech Services
   * @param {Buffer} mulawBuffer - Buffer containing μ-law audio
   * @returns {ArrayBuffer} - PCM audio buffer ready for Azure
   */
  static toAzureFormat(mulawBuffer) {
    try {
      const pcmData = this.transcode(mulawBuffer);
      return pcmData.buffer;
    } catch (error) {
      console.error('❌ Audio conversion failed:', error);
      throw new Error(`Azure format conversion failed: ${error.message}`);
    }
  }
} 