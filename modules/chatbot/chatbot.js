import apiService from '../../services/api/api.js';
import storageService from '../../services/storage/storage.js';

export default class ChatbotModule {
    constructor() {
        this.title = 'AI Chat';
        this.apiKey = null;
        this.conversation = [];
        this.isProcessing = false;
        
        // Chat settings with defaults
        this.settings = {
            model: 'gpt-3.5-turbo',
            temperature: 0.7,
            maxTokens: 150
        };
    }
    
    async onMount(container) {
        console.log('Chatbot module mounted');
        
        // Store DOM references
        this.container = container;
        this.chatMessages = container.querySelector('#chat-messages');
        this.userInput = container.querySelector('#user-input');
        this.sendButton = container.querySelector('#send-message');
        this.apiKeyInput = container.querySelector('#api-key-input');
        this.saveKeyButton = container.querySelector('#save-api-key');
        this.clearChatButton = container.querySelector('#clear-chat');
        this.modelSelect = container.querySelector('#model-select');
        this.temperatureSlider = container.querySelector('#temperature-slider');
        this.temperatureValue = container.querySelector('#temperature-value');
        this.maxTokensInput = container.querySelector('#max-tokens');
        
        // Load saved API key and chat history
        await this.loadSavedData();
        
        // Initialize UI values
        this.updateSettingsUI();
        
        // Add event listeners
        this.setupEventListeners();
        
        // Focus the input field if API key exists
        if (this.apiKey) {
            this.userInput.focus();
        } else {
            this.apiKeyInput.focus();
        }
    }
    
    async loadSavedData() {
        // Load API key
        this.apiKey = await storageService.getItem('openai_api_key');
        if (this.apiKey) {
            this.apiKeyInput.value = '••••••••••••••••••••••••••';
        }
        
        // Load settings
        const savedSettings = await storageService.getItem('openai_chat_settings');
        if (savedSettings) {
            this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
        } else if (this._config && this._config.config) {
            // Use settings from module config if available
            this.settings = { 
                ...this.settings,
                model: this._config.config.model || this.settings.model,
                maxTokens: this._config.config.maxTokens || this.settings.maxTokens,
                temperature: this._config.config.temperature || this.settings.temperature
            };
        }
        
        // Load conversation history
        const savedConversation = await storageService.getItem('openai_conversation');
        if (savedConversation) {
            this.conversation = JSON.parse(savedConversation);
            this.renderConversation();
        }
    }
    
    updateSettingsUI() {
        if (this.modelSelect) {
            this.modelSelect.value = this.settings.model;
        }
        
        if (this.temperatureSlider) {
            this.temperatureSlider.value = this.settings.temperature;
            this.temperatureValue.textContent = this.settings.temperature;
        }
        
        if (this.maxTokensInput) {
            this.maxTokensInput.value = this.settings.maxTokens;
        }
    }
    
    setupEventListeners() {
        // Send message on button click
        this.sendButton.addEventListener('click', () => this.sendMessage());
        
        // Send message on Enter key (but allow Shift+Enter for new line)
        this.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Save API key
        this.saveKeyButton.addEventListener('click', () => this.saveApiKey());
        
        // Clear chat
        this.clearChatButton.addEventListener('click', () => this.clearConversation());
        
        // Settings changes
        this.modelSelect.addEventListener('change', () => {
            this.settings.model = this.modelSelect.value;
            this.saveSettings();
        });
        
        this.temperatureSlider.addEventListener('input', () => {
            this.settings.temperature = parseFloat(this.temperatureSlider.value);
            this.temperatureValue.textContent = this.settings.temperature;
            this.saveSettings();
        });
        
        this.maxTokensInput.addEventListener('change', () => {
            this.settings.maxTokens = parseInt(this.maxTokensInput.value, 10);
            this.saveSettings();
        });
    }
    
    async saveApiKey() {
        const keyValue = this.apiKeyInput.value.trim();
        if (!keyValue || keyValue === '••••••••••••••••••••••••••') {
            this.showNotification('Please enter a valid API key', 'error');
            return;
        }
        
        // Test the API key with a simple request
        try {
            this.setLoading(true);
            const isValid = await this.testApiKey(keyValue);
            
            if (isValid) {
                this.apiKey = keyValue;
                await storageService.setItem('openai_api_key', keyValue);
                this.apiKeyInput.value = '••••••••••••••••••••••••••';
                this.showNotification('API key saved successfully', 'success');
                this.userInput.focus();
            } else {
                this.showNotification('Invalid API key. Please check and try again.', 'error');
            }
        } catch (error) {
            console.error('Error saving API key:', error);
            this.showNotification('Error saving API key: ' + (error.message || 'Unknown error'), 'error');
        } finally {
            this.setLoading(false);
        }
    }
    
    async testApiKey(key) {
        try {
            // Configure API service for the request
            const originalHeaders = { ...apiService.headers };
            apiService.setHeader('Authorization', `Bearer ${key}`);
            apiService.setHeader('Content-Type', 'application/json');
            
            // Make a minimal request to validate the key
            const response = await apiService.post('https://api.openai.com/v1/models', {});
            
            // Restore original headers
            apiService.headers = originalHeaders;
            
            return true;
        } catch (error) {
            console.error('API key validation failed:', error);
            
            // Restore original headers
            apiService.headers = { ...apiService.headers };
            
            // Check if the error is due to invalid key
            if (error.status === 401) {
                return false;
            }
            
            // If it's a different error (like network issue), assume the key might be valid
            // to avoid blocking users due to temporary API issues
            return true;
        }
    }
    
    async sendMessage() {
        const message = this.userInput.value.trim();
        if (!message || this.isProcessing) return;
        
        if (!this.apiKey) {
            this.showNotification('Please enter your OpenAI API key first', 'error');
            return;
        }
        
        try {
            this.isProcessing = true;
            this.setLoading(true);
            
            // Clear input
            this.userInput.value = '';
            
            // Add user message to conversation and UI
            this.addMessage('user', message);
            
            // Get AI response
            const aiResponse = await this.getAIResponse(message);
            
            // Add AI response to conversation and UI
            this.addMessage('assistant', aiResponse);
            
            // Save conversation
            await this.saveConversation();
        } catch (error) {
            console.error('Error in chat:', error);
            this.showNotification('Error: ' + (error.message || 'Failed to get response'), 'error');
        } finally {
            this.isProcessing = false;
            this.setLoading(false);
        }
    }
    
    async getAIResponse(message) {
        // Add the new message to the conversation history
        const currentConversation = this.buildConversationHistory(message);
        
        // Configure API service for the request
        apiService.setHeader('Authorization', `Bearer ${this.apiKey}`);
        apiService.setHeader('Content-Type', 'application/json');
        
        const requestBody = {
            model: this.settings.model,
            messages: currentConversation,
            max_tokens: this.settings.maxTokens,
            temperature: this.settings.temperature,
        };
        
        try {
            const response = await apiService.post('https://api.openai.com/v1/chat/completions', requestBody);
            
            if (response && response.choices && response.choices[0]) {
                const assistantResponse = response.choices[0].message.content.trim();
                return assistantResponse;
            } else {
                throw new Error('Invalid response from API');
            }
        } catch (error) {
            console.error('API Error:', error);
            
            // Enhanced error message
            if (error.status === 401) {
                throw new Error('Invalid API key. Please update your API key in settings.');
            } else if (error.data && error.data.error) {
                throw new Error(`API Error: ${error.data.error.message || 'Unknown error'}`);
            } else {
                throw new Error('Failed to get response from OpenAI API');
            }
        }
    }
    
    buildConversationHistory(newMessage) {
        // Format conversation for the API
        const history = [];
        
        // Start with system message
        history.push({
            role: 'system',
            content: 'You are a helpful assistant. Provide concise and accurate responses.'
        });
        
        // Add conversation history (limited to last 10 messages to avoid token limits)
        const recentConversation = this.conversation.slice(-10);
        recentConversation.forEach(msg => {
            history.push({
                role: msg.role,
                content: msg.content
            });
        });
        
        // Add the new user message
        history.push({
            role: 'user',
            content: newMessage
        });
        
        return history;
    }
    
    addMessage(role, content) {
        // Add to conversation array
        this.conversation.push({ role, content });
        
        // Add to UI
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        // Format message content with line breaks
        const formattedContent = content.replace(/\n/g, '<br>');
        messageContent.innerHTML = `<p>${formattedContent}</p>`;
        
        messageDiv.appendChild(messageContent);
        this.chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }
    
    renderConversation() {
        // Clear current messages
        this.chatMessages.innerHTML = '';
        
        // Render all messages from conversation history
        this.conversation.forEach(msg => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${msg.role}`;
            
            const messageContent = document.createElement('div');
            messageContent.className = 'message-content';
            
            // Format message content with line breaks
            const formattedContent = msg.content.replace(/\n/g, '<br>');
            messageContent.innerHTML = `<p>${formattedContent}</p>`;
            
            messageDiv.appendChild(messageContent);
            this.chatMessages.appendChild(messageDiv);
        });
        
        // Scroll to bottom
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }
    
    async clearConversation() {
        if (confirm('Are you sure you want to clear the conversation?')) {
            this.conversation = [];
            await storageService.removeItem('openai_conversation');
            
            // Add initial system message
            this.chatMessages.innerHTML = `
                <div class="message system">
                    <div class="message-content">
                        <p>Hello! I'm your AI assistant. How can I help you today?</p>
                    </div>
                </div>
            `;
        }
    }
    
    async saveConversation() {
        await storageService.setItem('openai_conversation', JSON.stringify(this.conversation));
    }
    
    async saveSettings() {
        await storageService.setItem('openai_chat_settings', JSON.stringify(this.settings));
    }
    
    setLoading(isLoading) {
        const sendText = this.sendButton.querySelector('.send-text');
        const loadingIndicator = this.sendButton.querySelector('.loading-indicator');
        
        if (isLoading) {
            sendText.classList.add('hidden');
            loadingIndicator.classList.remove('hidden');
            this.sendButton.disabled = true;
            this.userInput.disabled = true;
        } else {
            sendText.classList.remove('hidden');
            loadingIndicator.classList.add('hidden');
            this.sendButton.disabled = false;
            this.userInput.disabled = false;
        }
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        this.container.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    onUnmount() {
        console.log('Chatbot module unmounted');
        // Clean up event listeners if needed
    }
}
