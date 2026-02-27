/**
 * API client for the LLM Council backend.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001';

export const api = {
  /**
   * List all conversations.
   */
  async listConversations() {
    const response = await fetch(`${API_BASE}/api/conversations`);
    if (!response.ok) {
      throw new Error('Failed to list conversations');
    }
    return response.json();
  },

  /**
   * Create a new conversation.
   */
  async createConversation() {
    const response = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      throw new Error('Failed to create conversation');
    }
    return response.json();
  },

  /**
   * Get a specific conversation.
   */
  async getConversation(conversationId) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}`
    );
    if (!response.ok) {
      throw new Error('Failed to get conversation');
    }
    return response.json();
  },

  /**
   * Send a message in a conversation.
   */
  async sendMessage(conversationId, content, attachments = []) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/message`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content, attachments }),
      }
    );
    if (!response.ok) {
      throw new Error('Failed to send message');
    }
    return response.json();
  },

  /**
   * Send a message and receive streaming updates.
   * @param {string} conversationId - The conversation ID
   * @param {string} content - The message content
   * @param {Array<object>} attachments - Prompt attachments
   * @param {string} synthesisMode - The synthesis mode: 'best' or 'synthesize'
   * @param {function} onEvent - Callback function for each event: (eventType, data) => void
   * @param {AbortSignal} signal - Optional abort signal for stopping an active stream
   * @returns {Promise<void>}
   */
  async sendMessageStream(conversationId, content, attachments, synthesisMode, onEvent, signal, category, rubric) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/message/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal,
        body: JSON.stringify({
          content,
          attachments: attachments || [],
          synthesis_mode: synthesisMode,
          category: category || 'uncategorized',
          rubric: rubric || null,
        }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to send message');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const processSseBlock = (block) => {
      if (!block) return;
      const dataLines = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart());

      if (dataLines.length === 0) return;

      const data = dataLines.join('\n');
      try {
        const event = JSON.parse(data);
        onEvent(event.type, event);
      } catch (e) {
        console.error('Failed to parse SSE event:', e, data);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let delimiterIndex = buffer.indexOf('\n\n');
      while (delimiterIndex !== -1) {
        const block = buffer.slice(0, delimiterIndex);
        buffer = buffer.slice(delimiterIndex + 2);
        processSseBlock(block);
        delimiterIndex = buffer.indexOf('\n\n');
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      processSseBlock(buffer.trim());
    }
  },

  /**
   * Get OpenRouter account balance and spending info.
   */
  async getBalance() {
    const response = await fetch(`${API_BASE}/api/balance`);
    if (!response.ok) {
      throw new Error('Failed to fetch balance');
    }
    return response.json();
  },

  /**
   * Delete a conversation.
   */
  async deleteConversation(conversationId) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}`,
      {
        method: 'DELETE',
      }
    );
    if (!response.ok) {
      throw new Error('Failed to delete conversation');
    }
  },

  /**
   * Clear all messages from a conversation.
   */
  async clearConversationMessages(conversationId) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/clear-messages`,
      {
        method: 'POST',
      }
    );
    if (!response.ok) {
      throw new Error('Failed to clear conversation messages');
    }
    return response.json();
  },

  /**
   * Fetch available models from OpenRouter (cached on backend).
   */
  async getModels() {
    const response = await fetch(`${API_BASE}/api/models`);
    if (!response.ok) {
      throw new Error('Failed to fetch models');
    }
    return response.json();
  },

  /**
   * Get current model configuration.
   */
  async getModelConfig() {
    const response = await fetch(`${API_BASE}/api/config/models`);
    if (!response.ok) {
      throw new Error('Failed to fetch model config');
    }
    return response.json();
  },

  /**
   * Update model configuration.
   */
  async updateModelConfig(councilModels, chairmanModel) {
    const response = await fetch(`${API_BASE}/api/config/models`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        council_models: councilModels,
        chairman_model: chairmanModel,
      }),
    });
    if (!response.ok) {
      throw new Error('Failed to update model config');
    }
    return response.json();
  },

  // -----------------------------------------------------------------------
  // Prompt templates
  // -----------------------------------------------------------------------

  async getPromptTemplates() {
    const response = await fetch(`${API_BASE}/api/prompts/templates`);
    if (!response.ok) throw new Error('Failed to fetch templates');
    return response.json();
  },

  async getPromptTemplate(templateId) {
    const response = await fetch(`${API_BASE}/api/prompts/templates/${templateId}`);
    if (!response.ok) throw new Error('Failed to fetch template');
    return response.json();
  },

  async createPromptTemplate(template) {
    const response = await fetch(`${API_BASE}/api/prompts/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    });
    if (!response.ok) throw new Error('Failed to create template');
    return response.json();
  },

  async updatePromptTemplate(templateId, template) {
    const response = await fetch(`${API_BASE}/api/prompts/templates/${templateId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    });
    if (!response.ok) throw new Error('Failed to update template');
    return response.json();
  },

  async deletePromptTemplate(templateId) {
    const response = await fetch(`${API_BASE}/api/prompts/templates/${templateId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete template');
  },

  async usePromptTemplate(templateId) {
    const response = await fetch(`${API_BASE}/api/prompts/templates/${templateId}/use`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to record template usage');
  },

  async getPromptCategories() {
    const response = await fetch(`${API_BASE}/api/prompts/categories`);
    if (!response.ok) throw new Error('Failed to fetch categories');
    return response.json();
  },

  // -----------------------------------------------------------------------
  // Prompt history
  // -----------------------------------------------------------------------

  async getPromptHistory(limit = 20) {
    const response = await fetch(`${API_BASE}/api/prompts/history?limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch prompt history');
    return response.json();
  },

  async addPromptHistory(content, templateId = null, attachments = []) {
    const response = await fetch(`${API_BASE}/api/prompts/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        template_id: templateId,
        attachments: attachments || [],
      }),
    });
    if (!response.ok) throw new Error('Failed to add to prompt history');
    return response.json();
  },

  async clearPromptHistory() {
    const response = await fetch(`${API_BASE}/api/prompts/history`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to clear prompt history');
  },

  // -----------------------------------------------------------------------
  // Evaluation rubrics
  // -----------------------------------------------------------------------

  async getRubrics() {
    const response = await fetch(`${API_BASE}/api/rubrics`);
    if (!response.ok) throw new Error('Failed to fetch rubrics');
    return response.json();
  },

  async createRubric(rubric) {
    const response = await fetch(`${API_BASE}/api/rubrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rubric),
    });
    if (!response.ok) throw new Error('Failed to create rubric');
    return response.json();
  },

  async updateRubric(rubricId, rubric) {
    const response = await fetch(`${API_BASE}/api/rubrics/${rubricId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rubric),
    });
    if (!response.ok) throw new Error('Failed to update rubric');
    return response.json();
  },

  async deleteRubric(rubricId) {
    const response = await fetch(`${API_BASE}/api/rubrics/${rubricId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete rubric');
  },

  // -----------------------------------------------------------------------
  // Analytics
  // -----------------------------------------------------------------------

  async getAnalytics(category = null, days = null) {
    const params = new URLSearchParams();
    if (category && category !== 'all') params.append('category', category);
    if (days) params.append('days', String(days));
    const qs = params.toString();
    const url = `${API_BASE}/api/analytics${qs ? `?${qs}` : ''}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch analytics');
    return response.json();
  },

  async getAnalyticsSummary() {
    const response = await fetch(`${API_BASE}/api/analytics/summary`);
    if (!response.ok) throw new Error('Failed to fetch analytics summary');
    return response.json();
  },
};
