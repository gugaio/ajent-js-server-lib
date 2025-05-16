class ResponseSerializer {
    static serializeMessage(message) {
      try {
        if (typeof message === 'object' && !Array.isArray(message)) {
          return this._serializeObjectMessage(message);
        }
        throw new Error('Unsupported message type');
      } catch (error) {
        throw new Error(`Unable to serialize message: ${error.message}`);
      }
    }
    
    static _serializeObjectMessage(message) {
      const content = message.content;
      const result = {
        role: message.role || 'assistant',
        content: content === null || content === undefined ? '' : String(content)
      };
      
      if (message.tool_calls && message.tool_calls.length > 0) {
        result.tool_calls = message.tool_calls.map(toolCall => 
          this._serializeToolCall(toolCall)
        );
      }
      
      if (message.tool_call_id) {
        result.tool_call_id = String(message.tool_call_id);
      }
      
      return result;
    }
    
    static _serializeToolCall(toolCall) {
      try {
        return {
          id: String(toolCall.id || ''),
          type: String(toolCall.type || 'function'),
          function: {
            name: String(toolCall.function?.name || ''),
            arguments: toolCall.function?.arguments || '{}'
          }
        };
      } catch (error) {
        throw new Error(`Invalid tool call format: ${error.message}`);
      }
    }
  }
  
  module.exports = { ResponseSerializer };