/**
 * Manages streaming audio buffers with proper timing and chunking
 */

export class StreamingBuffer {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || 1024; // Default chunk size
    this.maxBufferSize = options.maxBufferSize || 16384; // Max buffer size before applying backpressure
    this.buffer = [];
    this.totalSize = 0;
    this.isProcessing = false;
    this.onData = options.onData || (() => {});
    this.onError = options.onError || console.error;
  }

  /**
   * Add audio data to the buffer
   * @param {Buffer|Uint8Array} data - Audio data to add
   */
  async push(data) {
    try {
      // Add to buffer
      this.buffer.push(data);
      this.totalSize += data.length;

      // Apply backpressure if buffer is too large
      if (this.totalSize > this.maxBufferSize) {
        console.warn('Buffer size exceeds limit, applying backpressure');
        await this.flush();
      }

      // Start processing if not already running
      if (!this.isProcessing) {
        this.isProcessing = true;
        this.processBuffer();
      }
    } catch (error) {
      this.onError('Error pushing data to buffer:', error);
    }
  }

  /**
   * Process buffered data in chunks
   */
  async processBuffer() {
    try {
      while (this.buffer.length > 0) {
        const chunk = this.buffer.shift();
        const chunkSize = chunk.length;
        this.totalSize -= chunkSize;

        // Process in smaller chunks if needed
        for (let i = 0; i < chunkSize; i += this.chunkSize) {
          const subChunk = chunk.slice(i, i + this.chunkSize);
          await this.onData(subChunk);
        }
      }
    } catch (error) {
      this.onError('Error processing buffer:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Flush the buffer immediately
   */
  async flush() {
    await this.processBuffer();
  }

  /**
   * Clear the buffer without processing
   */
  clear() {
    this.buffer = [];
    this.totalSize = 0;
    this.isProcessing = false;
  }

  /**
   * Get current buffer size
   */
  get size() {
    return this.totalSize;
  }
} 