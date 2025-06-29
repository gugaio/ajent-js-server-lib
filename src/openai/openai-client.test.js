/* eslint-env jest */


// Mocks devem ser aplicados antes de qualquer require do código de produção!
jest.resetModules();
const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../utils/logger', () => mockLogger);

const mockSerializeMessage = jest.fn((msg) => ({ serialized: true, ...msg }));
jest.mock('../llm/response-serializer', () => ({
  ResponseSerializer: { serializeMessage: mockSerializeMessage },
}));

const fs = require('fs');
jest.spyOn(fs, 'createReadStream').mockImplementation((path) => `stream:${path}`);

// Importações do código de produção (após mocks)
const { OpenAIClient } = require('./openai-client');
const { LLMClient } = require('../llm/llm-client');

// Mocks

// Garante que as globals do Jest estejam disponíveis para o Node
const { describe, test, expect, beforeEach, jest } = require('@jest/globals');


const mockCreate = jest.fn();
const mockChat = { completions: { create: mockCreate } };
const mockAudio = { transcriptions: { create: jest.fn() } };

// Mock error classes
class APIError extends Error { constructor(msg) { super(msg); this.name = 'APIError'; } }
class RateLimitError extends Error { constructor(msg) { super(msg); this.name = 'RateLimitError'; } }
class InvalidRequestError extends Error { constructor(msg) { super(msg); this.name = 'InvalidRequestError'; } }
class AuthenticationError extends Error { constructor(msg) { super(msg); this.name = 'AuthenticationError'; } }
class OpenAIError extends Error { constructor(msg) { super(msg); this.name = 'OpenAIError'; } }

const mockOpenAI = jest.fn().mockImplementation(() => ({
  chat: mockChat,
  audio: mockAudio,
}));
// Adiciona as classes de erro como propriedades do construtor
mockOpenAI.APIError = APIError;
mockOpenAI.RateLimitError = RateLimitError;
mockOpenAI.InvalidRequestError = InvalidRequestError;
mockOpenAI.AuthenticationError = AuthenticationError;
mockOpenAI.OpenAIError = OpenAIError;

jest.mock('openai', () => {
  const exported = {
    OpenAI: mockOpenAI,
    APIError,
    RateLimitError,
    InvalidRequestError,
    AuthenticationError,
    OpenAIError,
  };
  // Também adiciona as classes de erro como propriedades do construtor
  Object.assign(exported.OpenAI, {
    APIError,
    RateLimitError,
    InvalidRequestError,
    AuthenticationError,
    OpenAIError,
  });
  return exported;
});



describe('OpenAIClient', () => {
  const config = { llmToken: 'test-token', model: 'gpt-test' };
  let client;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new OpenAIClient(config);
  });

  test('should extend LLMClient', () => {
    expect(client).toBeInstanceOf(LLMClient);
  });

  test('serializeResponse uses ResponseSerializer', () => {
    const resp = { foo: 'bar' };
    const result = client.serializeResponse(resp);
    expect(mockSerializeMessage).toHaveBeenCalledWith(resp);
    expect(result.serialized).toBe(true);
  });

  describe('_sendImplementation', () => {
    beforeEach(() => {
      client.validateConfig();
      // Garante que o mock correto seja usado em todos os testes
      client._client = { chat: { completions: { create: mockCreate } } };
    });

    test('returns serialized response on success', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'ok' } }],
      });
      const result = await client._sendImplementation([{ role: 'user', content: 'hi' }], [], 'gpt-test');
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-test',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [],
      });
      expect(result.serialized).toBe(true);
      expect(result.role).toBe('assistant');
    });

    test('handles OpenAI.APIError', async () => {
      const error = new (require('openai').OpenAI.APIError)('api fail');
      error.message = 'api fail';
      error.code = 500;
      mockCreate.mockRejectedValue(error);
      await expect(client._sendImplementation([], [], 'gpt-test')).rejects.toThrow('OpenAI API error: api fail');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('handles OpenAI.RateLimitError', async () => {
      const error = new (require('openai').OpenAI.RateLimitError)('rate limit');
      error.message = 'rate limit';
      error.code = 429;
      mockCreate.mockRejectedValue(error);
      await expect(client._sendImplementation([], [], 'gpt-test')).rejects.toThrow('Rate limit exceeded: rate limit');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    test('handles OpenAI.InvalidRequestError', async () => {
      const error = new (require('openai').OpenAI.InvalidRequestError)('bad request');
      error.message = 'bad request';
      error.code = 400;
      mockCreate.mockRejectedValue(error);
      await expect(client._sendImplementation([], [], 'gpt-test')).rejects.toThrow('Invalid request: bad request');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('handles OpenAI.AuthenticationError', async () => {
      const error = new (require('openai').OpenAI.AuthenticationError)('auth fail');
      error.message = 'auth fail';
      error.code = 401;
      mockCreate.mockRejectedValue(error);
      await expect(client._sendImplementation([], [], 'gpt-test')).rejects.toThrow('Authentication error: auth fail');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('handles OpenAI.OpenAIError', async () => {
      const error = new (require('openai').OpenAI.OpenAIError)('openai error');
      error.message = 'openai error';
      error.code = 500;
      mockCreate.mockRejectedValue(error);
      await expect(client._sendImplementation([], [], 'gpt-test')).rejects.toThrow('OpenAI error: openai error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('handles unknown error', async () => {
      // Erro simples, não é nenhuma das classes OpenAI
      const error = new Error('unknown');
      error.code = 999;
      mockCreate.mockRejectedValue(error);
      await expect(client._sendImplementation([], [], 'gpt-test')).rejects.toThrow('Unexpected error: unknown');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('stt', () => {
    beforeEach(() => {
      client.validateConfig();
      client._client = { audio: mockAudio };
    });

    test('returns text on success', async () => {
      mockAudio.transcriptions.create.mockResolvedValue({ text: 'audio text' });
      const result = await client.stt('file.wav');
      expect(result).toBe('audio text');
      expect(mockLogger.info).toHaveBeenCalledWith('Audio transcribed successfully');
    });

    test('throws if no text', async () => {
      mockAudio.transcriptions.create.mockResolvedValue({});
      await expect(client.stt('file.wav')).rejects.toThrow('Failed to transcribe audio content');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    test('logs and throws on error', async () => {
      mockAudio.transcriptions.create.mockRejectedValue(new Error('fail'));
      await expect(client.stt('file.wav')).rejects.toThrow('Speech-to-text transcription failed: fail');
      expect(mockLogger.error).toHaveBeenCalled();
    });
      });
});