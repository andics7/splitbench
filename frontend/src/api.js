/**
 * API client for the LLM Council backend.
 */

const API_BASE = import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:8001'
    : '');

function getProfileId() {
  return localStorage.getItem('splitbench.profileId') || '';
}

function authHeaders() {
  const profileId = getProfileId();
  return profileId ? { 'X-Profile-Id': profileId } : {};
}

export const api = {
  // -----------------------------------------------------------------------
  // Profile management (no auth required)
  // -----------------------------------------------------------------------

  async listProfiles() {
    const response = await fetch(`${API_BASE}/api/profiles`);
    if (!response.ok) throw new Error('Failed to list profiles');
    return response.json();
  },

  async createProfile(name, apiKey, mgmtKey = null) {
    const response = await fetch(`${API_BASE}/api/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        openrouter_api_key: apiKey,
        openrouter_mgmt_key: mgmtKey,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create profile');
    }
    return response.json();
  },

  async getProfile(profileId) {
    const response = await fetch(`${API_BASE}/api/profiles/${profileId}`);
    if (!response.ok) throw new Error('Failed to get profile');
    return response.json();
  },

  async updateProfile(profileId, updates) {
    const response = await fetch(`${API_BASE}/api/profiles/${profileId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to update profile');
    }
    return response.json();
  },

  async deleteProfile(profileId) {
    const response = await fetch(`${API_BASE}/api/profiles/${profileId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to delete profile');
    }
  },

  async verifyPin(profileId, pin) {
    const response = await fetch(`${API_BASE}/api/profiles/${profileId}/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Incorrect PIN');
    }
    return response.json();
  },

  async setPin(profileId, pin) {
    const response = await fetch(`${API_BASE}/api/profiles/${profileId}/pin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to set PIN');
    }
    return response.json();
  },

  async validateProfileKey(profileId) {
    const response = await fetch(`${API_BASE}/api/profiles/${profileId}/validate-key`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to validate key');
    return response.json();
  },

  // -----------------------------------------------------------------------
  // Conversations (auth required)
  // -----------------------------------------------------------------------

  async listConversations() {
    const response = await fetch(`${API_BASE}/api/conversations`, {
      headers: { ...authHeaders() },
    });
    if (!response.ok) throw new Error('Failed to list conversations');
    return response.json();
  },

  async createConversation() {
    const response = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({}),
    });
    if (!response.ok) throw new Error('Failed to create conversation');
    return response.json();
  },

  async getConversation(conversationId) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}`,
      { headers: { ...authHeaders() } }
    );
    if (!response.ok) throw new Error('Failed to get conversation');
    return response.json();
  },

  async sendMessage(conversationId, content, attachments = []) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/message`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({ content, attachments }),
      }
    );
    if (!response.ok) throw new Error('Failed to send message');
    return response.json();
  },

  async sendMessageStream(conversationId, content, attachments, synthesisMode, onEvent, signal, category, rubric) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/message/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
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

    if (!response.ok) throw new Error('Failed to send message');

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

  async getBalance() {
    const response = await fetch(`${API_BASE}/api/balance`, {
      headers: { ...authHeaders() },
    });
    if (!response.ok) throw new Error('Failed to fetch balance');
    return response.json();
  },

  async deleteConversation(conversationId) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}`,
      {
        method: 'DELETE',
        headers: { ...authHeaders() },
      }
    );
    if (!response.ok) throw new Error('Failed to delete conversation');
  },

  async clearConversationMessages(conversationId) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/clear-messages`,
      {
        method: 'POST',
        headers: { ...authHeaders() },
      }
    );
    if (!response.ok) throw new Error('Failed to clear conversation messages');
    return response.json();
  },

  async getModels() {
    const response = await fetch(`${API_BASE}/api/models`, {
      headers: { ...authHeaders() },
    });
    if (!response.ok) throw new Error('Failed to fetch models');
    return response.json();
  },

  async getModelConfig() {
    const response = await fetch(`${API_BASE}/api/config/models`, {
      headers: { ...authHeaders() },
    });
    if (!response.ok) throw new Error('Failed to fetch model config');
    return response.json();
  },

  async updateModelConfig(councilModels, chairmanModel) {
    const response = await fetch(`${API_BASE}/api/config/models`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({
        council_models: councilModels,
        chairman_model: chairmanModel,
      }),
    });
    if (!response.ok) throw new Error('Failed to update model config');
    return response.json();
  },

  // -----------------------------------------------------------------------
  // Prompt templates (auth required)
  // -----------------------------------------------------------------------

  async getPromptTemplates() {
    const response = await fetch(`${API_BASE}/api/prompts/templates`, {
      headers: { ...authHeaders() },
    });
    if (!response.ok) throw new Error('Failed to fetch templates');
    return response.json();
  },

  async getPromptTemplate(templateId) {
    const response = await fetch(`${API_BASE}/api/prompts/templates/${templateId}`, {
      headers: { ...authHeaders() },
    });
    if (!response.ok) throw new Error('Failed to fetch template');
    return response.json();
  },

  async createPromptTemplate(template) {
    const response = await fetch(`${API_BASE}/api/prompts/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify(template),
    });
    if (!response.ok) throw new Error('Failed to create template');
    return response.json();
  },

  async updatePromptTemplate(templateId, template) {
    const response = await fetch(`${API_BASE}/api/prompts/templates/${templateId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify(template),
    });
    if (!response.ok) throw new Error('Failed to update template');
    return response.json();
  },

  async deletePromptTemplate(templateId) {
    const response = await fetch(`${API_BASE}/api/prompts/templates/${templateId}`, {
      method: 'DELETE',
      headers: { ...authHeaders() },
    });
    if (!response.ok) throw new Error('Failed to delete template');
  },

  async usePromptTemplate(templateId) {
    const response = await fetch(`${API_BASE}/api/prompts/templates/${templateId}/use`, {
      method: 'POST',
      headers: { ...authHeaders() },
    });
    if (!response.ok) throw new Error('Failed to record template usage');
  },

  async getPromptCategories() {
    const response = await fetch(`${API_BASE}/api/prompts/categories`);
    if (!response.ok) throw new Error('Failed to fetch categories');
    return response.json();
  },

  // -----------------------------------------------------------------------
  // Prompt history (auth required)
  // -----------------------------------------------------------------------

  async getPromptHistory(limit = 20) {
    const response = await fetch(`${API_BASE}/api/prompts/history?limit=${limit}`, {
      headers: { ...authHeaders() },
    });
    if (!response.ok) throw new Error('Failed to fetch prompt history');
    return response.json();
  },

  async addPromptHistory(content, templateId = null, attachments = []) {
    const response = await fetch(`${API_BASE}/api/prompts/history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
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
      headers: { ...authHeaders() },
    });
    if (!response.ok) throw new Error('Failed to clear prompt history');
  },

  // -----------------------------------------------------------------------
  // Evaluation rubrics (auth required)
  // -----------------------------------------------------------------------

  async getRubrics() {
    const response = await fetch(`${API_BASE}/api/rubrics`, {
      headers: { ...authHeaders() },
    });
    if (!response.ok) throw new Error('Failed to fetch rubrics');
    return response.json();
  },

  async createRubric(rubric) {
    const response = await fetch(`${API_BASE}/api/rubrics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify(rubric),
    });
    if (!response.ok) throw new Error('Failed to create rubric');
    return response.json();
  },

  async updateRubric(rubricId, rubric) {
    const response = await fetch(`${API_BASE}/api/rubrics/${rubricId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify(rubric),
    });
    if (!response.ok) throw new Error('Failed to update rubric');
    return response.json();
  },

  async deleteRubric(rubricId) {
    const response = await fetch(`${API_BASE}/api/rubrics/${rubricId}`, {
      method: 'DELETE',
      headers: { ...authHeaders() },
    });
    if (!response.ok) throw new Error('Failed to delete rubric');
  },

  // -----------------------------------------------------------------------
  // Analytics (auth required)
  // -----------------------------------------------------------------------

  async getAnalytics(category = null, days = null) {
    const params = new URLSearchParams();
    if (category && category !== 'all') params.append('category', category);
    if (days) params.append('days', String(days));
    const qs = params.toString();
    const url = `${API_BASE}/api/analytics${qs ? `?${qs}` : ''}`;
    const response = await fetch(url, {
      headers: { ...authHeaders() },
    });
    if (!response.ok) throw new Error('Failed to fetch analytics');
    return response.json();
  },

  async getAnalyticsSummary() {
    const response = await fetch(`${API_BASE}/api/analytics/summary`, {
      headers: { ...authHeaders() },
    });
    if (!response.ok) throw new Error('Failed to fetch analytics summary');
    return response.json();
  },
};
