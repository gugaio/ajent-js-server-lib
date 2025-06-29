/* eslint-env jest */


// Mock do logger para testes
const mockLogger = {
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};

// Mock do logger deve ser aplicado antes de importar o LLMClient
jest.mock('../utils/logger', () => mockLogger);

// Mock do ResponseSerializer
jest.mock('./response-serializer', () => {
  return {
    ResponseSerializer: {
      serializeMessage: jest.fn((msg) => ({ serialized: true, ...msg }))
    }
  };
});

// Garante que as globals do Jest estejam disponíveis para o Node
const { describe, test, expect, beforeEach, jest } = require('@jest/globals');
const { LLMClient } = require('./llm-client');
const { ResponseSerializer } = require('./response-serializer');

// Garante reset dos mocks antes de cada teste
beforeEach(() => {
  jest.clearAllMocks();
});

// Implementação de teste da LLMClient
class TestLLMClient extends LLMClient {
  constructor(config) {
    super(config);
    this.sendCallCount = 0;
    this.streamCallCount = 0;
    this.sttCallCount = 0;
    this.shouldFail = false;
    this.failureType = 'generic';
    this.failAfterAttempts = 1;
  }

  validateConfig() {
    if (!this.config.testMode) {
      throw new Error('TestLLMClient requires testMode in config');
    }
  }

  // Simula falhas para testar retry logic
  setFailureMode(shouldFail, failureType = 'generic', failAfterAttempts = 1) {
    this.shouldFail = shouldFail;
    this.failureType = failureType;
    this.failAfterAttempts = failAfterAttempts;
  }

  _simulateError() {
    switch (this.failureType) {
      case 'rate_limit': {
        const error429 = new Error('Rate limit exceeded');
        error429.status = 429;
        throw error429;
      }
      case 'server_error': {
        const error500 = new Error('Internal server error');
        error500.status = 500;
        throw error500;
      }
      case 'timeout': {
        throw new Error('Request timeout');
      }
      case 'non_retryable': {
        const error400 = new Error('Bad request');
        error400.status = 400;
        throw error400;
      }
      default: {
        throw new Error('Generic test error');
      }
    }
  }

  async _sendImplementation(messages, tools, model) {
    this.sendCallCount++;
    
    if (this.shouldFail && this.sendCallCount <= this.failAfterAttempts) {
      this._simulateError();
    }

    // Simula resposta bem-sucedida
    return {
      role: 'assistant',
      content: `Test response for attempt ${this.sendCallCount}`,
      test_metadata: {
        messages_count: messages.length,
        tools_count: tools ? tools.length : 0,
        model: model
      }
    };
  }

  async _streamImplementation(messages, tools, model) {
    this.streamCallCount++;
    
    if (this.shouldFail && this.streamCallCount <= this.failAfterAttempts) {
      this._simulateError();
    }

    // Simula stream bem-sucedido
    const responseText = `Test stream response for attempt ${this.streamCallCount}`;
    const words = responseText.split(' ');

    return {
      [Symbol.asyncIterator]: async function* () {
        let content = '';
        
        for (const word of words) {
          const chunk = word + ' ';
          content += chunk;
          
          yield {
            type: "content",
            content: chunk
          };
          
          // Simula delay mínimo
          await new Promise(resolve => setTimeout(resolve, 1));
        }
        
        yield {
          type: "finish",
          finish_reason: "stop",
          final_content: content.trim(),
          final_tool_calls: null
        };
      }
    };
  }

  async _sttImplementation(audioFilePath) {
    this.sttCallCount++;
    
    if (this.shouldFail && this.sttCallCount <= this.failAfterAttempts) {
      this._simulateError();
    }

    // Simula resposta STT bem-sucedida
    return {
      text: `Transcribed audio from ${audioFilePath} (attempt ${this.sttCallCount})`,
      confidence: 0.95,
      duration: 10.5
    };
  }

  serializeResponse(response) {
    // Garante que o mock do ResponseSerializer seja usado
    return require('./response-serializer').ResponseSerializer.serializeMessage(response);
  }

  // Métodos auxiliares para testes
  resetCounters() {
    this.sendCallCount = 0;
    this.streamCallCount = 0;
    this.sttCallCount = 0;
  }

  getCallCounts() {
    return {
      send: this.sendCallCount,
      stream: this.streamCallCount,
      stt: this.sttCallCount
    };
  }
}

describe('LLMClient Base Class', () => {
  let client;
  
  beforeEach(() => {
    jest.clearAllMocks();
    client = new TestLLMClient({
      testMode: true,
      maxRetries: 3,
      initialRetryDelay: 10, // Delays menores para testes rápidos
      maxRetryDelay: 100,
      backoffMultiplier: 2
    });
  });

  describe('Constructor and Configuration', () => {
    test('should create client with default retry config', () => {
      const defaultClient = new TestLLMClient({ testMode: true });
      expect(defaultClient.retryConfig.maxRetries).toBe(3);
      expect(defaultClient.retryConfig.initialDelay).toBe(1000);
      expect(defaultClient.retryConfig.enableRetry).toBe(true);
    });

    test('should create client with custom retry config', () => {
      const customClient = new TestLLMClient({
        testMode: true,
        maxRetries: 5,
        initialRetryDelay: 2000,
        maxRetryDelay: 60000,
        enableRetry: false
      });
      
      expect(customClient.retryConfig.maxRetries).toBe(5);
      expect(customClient.retryConfig.initialDelay).toBe(2000);
      expect(customClient.retryConfig.maxRetryDelay).toBe(60000);
      expect(customClient.retryConfig.enableRetry).toBe(false);
    });

    test('should add custom retry patterns', () => {
      client.addRetryableErrorPatterns(['custom error', 'special timeout']);
      expect(client._customRetryPatterns).toContain('custom error');
      expect(client._customRetryPatterns).toContain('special timeout');
    });
  });

  describe('Error Detection', () => {
    test('should detect retryable HTTP status codes', () => {
      const error429 = { status: 429 };
      const error500 = { status: 500 };
      const error502 = { status: 502 };
      const error503 = { status: 503 };
      const error504 = { status: 504 };
      const error400 = { status: 400 };

      expect(client._isRetryableError(error429)).toBe(true);
      expect(client._isRetryableError(error500)).toBe(true);
      expect(client._isRetryableError(error502)).toBe(true);
      expect(client._isRetryableError(error503)).toBe(true);
      expect(client._isRetryableError(error504)).toBe(true);
      expect(client._isRetryableError(error400)).toBe(false);
    });

    test('should detect retryable error messages', () => {
      const rateLimitError = { message: 'Rate limit exceeded' };
      const quotaError = { message: 'Quota exceeded for this request' };
      const tooManyError = { message: 'Too many requests' };
      const serverError = { message: 'Internal server error' };
      const authError = { message: 'Authentication failed' };

      expect(client._isRetryableError(rateLimitError)).toBe(true);
      expect(client._isRetryableError(quotaError)).toBe(true);
      expect(client._isRetryableError(tooManyError)).toBe(true);
      expect(client._isRetryableError(serverError)).toBe(true);
      expect(client._isRetryableError(authError)).toBe(false);
    });

    test('should detect custom retry patterns', () => {
      client.addRetryableErrorPatterns(['vertex ai quota', 'gemini timeout']);
      
      const customError1 = { message: 'Vertex AI quota exceeded' };
      const customError2 = { message: 'Gemini timeout occurred' };
      const normalError = { message: 'Invalid API key' };

      expect(client._isRetryableErrorWithCustom(customError1)).toBe(true);
      expect(client._isRetryableErrorWithCustom(customError2)).toBe(true);
      expect(client._isRetryableErrorWithCustom(normalError)).toBe(false);
    });
  });

  describe('Send Method', () => {
    test('should succeed on first attempt', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const tools = [];
      
      const result = await client.send(messages, tools);
      
      expect(result.serialized).toBe(true);
      expect(result.content).toContain('Test response for attempt 1');
      expect(client.getCallCounts().send).toBe(1);
    });

    test('should retry on rate limit error and succeed', async () => {
      client.setFailureMode(true, 'rate_limit', 2); // Falha nas primeiras 2 tentativas
      
      const messages = [{ role: 'user', content: 'Hello' }];
      const result = await client.send(messages);
      
      expect(result.content).toContain('Test response for attempt 3');
      expect(client.getCallCounts().send).toBe(3);
      expect(mockLogger.warn).toHaveBeenCalledTimes(2); // 2 warnings de retry
    });

    test('should return error response after max retries', async () => {
      client.setFailureMode(true, 'rate_limit', 10); // Sempre falha
      
      const messages = [{ role: 'user', content: 'Hello' }];
      const result = await client.send(messages);
      
      expect(result.role).toBe('assistant');
      expect(result.content).toContain('temporariamente sobrecarregado');
      expect(result._error_metadata).toBeDefined();
      expect(result._error_metadata.retryable).toBe(true);
      expect(client.getCallCounts().send).toBe(4); // 1 + 3 retries
    });

    test('should not retry non-retryable errors', async () => {
      client.setFailureMode(true, 'non_retryable');
      
      const messages = [{ role: 'user', content: 'Hello' }];
      const result = await client.send(messages);
      
      expect(result.content).toContain('problema técnico');
      expect(result._error_metadata.retryable).toBe(false);
      expect(client.getCallCounts().send).toBe(1); // Sem retries
    });

    test('should not retry when retry is disabled', async () => {
      const noRetryClient = new TestLLMClient({
        testMode: true,
        enableRetry: false
      });
      noRetryClient.setFailureMode(true, 'rate_limit');
      
      const messages = [{ role: 'user', content: 'Hello' }];
      
      await expect(noRetryClient.send(messages)).rejects.toThrow('Rate limit exceeded');
      expect(noRetryClient.getCallCounts().send).toBe(1);
    });
  });

  describe('Stream Method', () => {
    test('should succeed on first attempt', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      
      const stream = await client.stream(messages);
      const chunks = [];
      
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[chunks.length - 1].type).toBe('finish');
      expect(client.getCallCounts().stream).toBe(1);
    });

    test('should retry stream initialization and succeed', async () => {
      client.setFailureMode(true, 'server_error', 1); // Falha na primeira tentativa
      
      const messages = [{ role: 'user', content: 'Hello' }];
      const stream = await client.stream(messages);
      
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      
      expect(chunks[chunks.length - 1].final_content).toContain('attempt 2');
      expect(client.getCallCounts().stream).toBe(2);
    });

    test('should return error stream after max retries', async () => {
      client.setFailureMode(true, 'rate_limit', 10); // Sempre falha
      
      const messages = [{ role: 'user', content: 'Hello' }];
      const stream = await client.stream(messages);
      
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      
      const finalChunk = chunks[chunks.length - 1];
      expect(finalChunk.type).toBe('finish');
      expect(finalChunk.final_content).toContain('temporariamente sobrecarregado');
      expect(finalChunk._error_metadata).toBeDefined();
    });
  });

  describe('STT Method', () => {
    test('should succeed on first attempt', async () => {
      const result = await client.stt('test-audio.wav');
      
      expect(result.text).toContain('Transcribed audio from test-audio.wav');
      expect(client.getCallCounts().stt).toBe(1);
    });

    test('should retry and succeed', async () => {
      client.setFailureMode(true, 'timeout', 2);
      
      const result = await client.stt('test-audio.wav');
      
      expect(result.text).toContain('attempt 3');
      expect(client.getCallCounts().stt).toBe(3);
    });

    test('should return error response after max retries', async () => {
      client.setFailureMode(true, 'server_error', 10);
      
      const result = await client.stt('test-audio.wav');
      
      expect(result.text).toContain('não foi possível processar o áudio');
      expect(result.error_details).toBeDefined();
      expect(result.error_details.retryable).toBe(true);
    });
  });

  describe('Delay Calculation', () => {
    test('should calculate exponential backoff with jitter', () => {
      const delay1 = client._calculateDelay(0);
      const delay2 = client._calculateDelay(1);
      const delay3 = client._calculateDelay(2);
      
      expect(delay1).toBeGreaterThanOrEqual(8); // 10ms ±20%
      expect(delay1).toBeLessThanOrEqual(12);
      
      expect(delay2).toBeGreaterThanOrEqual(16); // 20ms ±20%
      expect(delay2).toBeLessThanOrEqual(24);
      
      expect(delay3).toBeGreaterThanOrEqual(32); // 40ms ±20%
      expect(delay3).toBeLessThanOrEqual(48);
    });

    test('should respect max delay', () => {
      const delay = client._calculateDelay(10); // Muito alto
      expect(delay).toBeLessThanOrEqual(100); // maxRetryDelay = 100
    });
  });

  describe('Logging', () => {
    test('should log warnings during retries', async () => {
      client.setFailureMode(true, 'rate_limit', 2);
      
      await client.send([{ role: 'user', content: 'test' }]);
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('TestLLMClient send failed (attempt 1/4)')
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('TestLLMClient send failed (attempt 2/4)')
      );
    });

    test('should log final error', async () => {
      client.setFailureMode(true, 'rate_limit', 10);
      
      await client.send([{ role: 'user', content: 'test' }]);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('TestLLMClient send failed after retries')
      );
    });
  });
});

// Teste de integração com múltiplos cenários
describe('LLMClient Integration Tests', () => {
  test('should handle mixed success/failure scenarios', async () => {
    const client = new TestLLMClient({
      testMode: true,
      maxRetries: 2,
      initialRetryDelay: 5
    });

    // 1. Send bem-sucedido
    let result = await client.send([{ role: 'user', content: 'Hello' }]);
    expect(result.content).toContain('attempt 1');

    // 2. Stream com retry
    client.setFailureMode(true, 'rate_limit', 1);
    const stream = await client.stream([{ role: 'user', content: 'Stream test' }]);
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    expect(chunks[chunks.length - 1].final_content).toContain('attempt 2');

    // 3. STT com falha total
    client.setFailureMode(true, 'server_error', 10);
    result = await client.stt('audio.wav');
    expect(result.text).toContain('não foi possível processar');
    
    // Verifica contadores
    const counts = client.getCallCounts();
    expect(counts.send).toBe(1);
    expect(counts.stream).toBe(2); // 1 falha + 1 sucesso
    expect(counts.stt).toBe(3); // 1 + 2 retries
  });
});

module.exports = { TestLLMClient };