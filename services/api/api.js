class ApiService {
    constructor() {
        this.baseUrl = '';
        this.headers = {
            'Content-Type': 'application/json'
        };
        this.defaultTimeout = 30000; // 30 seconds default timeout
    }
    
    async init(config = {}) {
        try {
            // Use the config passed from service-manager.js which loads from service.json
            if (config) {
                // Apply configuration from service.json
                if (config.baseUrl) this.baseUrl = config.baseUrl;
                if (config.defaultTimeout) this.defaultTimeout = config.defaultTimeout;
                
                // Apply any custom headers
                if (config.headers && typeof config.headers === 'object') {
                    this.headers = { ...this.headers, ...config.headers };
                }
            }
            
            console.log('API Service initialized successfully');
            return Promise.resolve();
        } catch (e) {
            console.warn('API Service initialization warning:', e);
            return Promise.resolve(); // Still resolve to not block app startup
        }
    }
    
    setBaseUrl(url) {
        this.baseUrl = url;
    }
    
    setHeader(key, value) {
        this.headers[key] = value;
    }
    
    setDefaultTimeout(timeout) {
        this.defaultTimeout = timeout;
    }
    
    async get(endpoint, params = {}, options = {}) {
        const url = new URL(this.baseUrl + endpoint);
        
        // Add query parameters
        Object.keys(params).forEach(key => {
            url.searchParams.append(key, params[key]);
        });
        
        return this.fetchWithTimeout(url, {
            method: 'GET',
            headers: this.headers,
            ...options
        });
    }
    
    async post(endpoint, data, options = {}) {
        return this.fetchWithTimeout(this.baseUrl + endpoint, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(data),
            ...options
        });
    }
    
    async put(endpoint, data, options = {}) {
        return this.fetchWithTimeout(this.baseUrl + endpoint, {
            method: 'PUT',
            headers: this.headers,
            body: JSON.stringify(data),
            ...options
        });
    }
    
    async delete(endpoint, options = {}) {
        return this.fetchWithTimeout(this.baseUrl + endpoint, {
            method: 'DELETE',
            headers: this.headers,
            ...options
        });
    }
    
    async fetchWithTimeout(resource, options = {}) {
        const { timeout = this.defaultTimeout } = options;
        
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(resource, {
                ...options,
                signal: controller.signal
            });
            
            clearTimeout(id);
            return this.handleResponse(response);
        } catch (error) {
            clearTimeout(id);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
    }
    
    async handleResponse(response) {
        const contentType = response.headers.get('content-type');
        
        let data;
        // Check if response is JSON
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            // Handle non-JSON responses
            data = {
                status: response.status,
                statusText: response.statusText,
                text: await response.text()
            };
        }
        
        if (!response.ok) {
            const error = new Error(data.message || `API request failed with status ${response.status}`);
            error.status = response.status;
            error.data = data;
            throw error;
        }
        
        return data;
    }
}

export default new ApiService();
