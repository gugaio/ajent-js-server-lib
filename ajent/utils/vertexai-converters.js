function convertTools(tools) {
  if (!tools || tools.length === 0) return [];

  console.log('Converting tools for Vertex AI:', tools);

  return [{
    function_declarations: tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    }))
  }];
}

function convertMessages(messages) {
  return messages.map(msg => {
    const parts = [];

    if (msg.function_call) {
      parts.push({
        functionCall: {
          name: msg.function_call.name,
          args: msg.function_call.arguments,
        },
      });
    } else if (msg.tool_calls) {
      parts.push(...msg.tool_calls.map(tc => ({
        functionCall: {
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments),
        },
      })));
    } else if (msg.content) {
      parts.push({ text: msg.content });
    }

    return {
      role: msg.role.toLowerCase() === 'assistant' ? 'model' : 'user',
      parts,
    };
  });
}

module.exports = { convertTools, convertMessages };