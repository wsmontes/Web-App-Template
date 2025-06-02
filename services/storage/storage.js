class StorageService {
    constructor() {
        this.prefix = 'app_';
        this.memoryCache = new Map();
        this.storageAvailable = this.isStorageAvailable('localStorage');
    }
    
    async init() {
        console.log('Storage Service initialized' + 
            (this.storageAvailable ? '' : ' (using memory-only mode)'));
        return Promise.resolve();
    }
    
    setPrefix(prefix) {
        this.prefix = prefix;
    }
    
    getItem(key) {
        // Check memory cache first
        if (this.memoryCache.has(key)) {
            return this.memoryCache.get(key);
        }
        
        // Then check localStorage if available
        if (this.storageAvailable) {
            const fullKey = this.prefix + key;
            const value = localStorage.getItem(fullKey);
            
            if (value === null) {
                return null;
            }
            
            try {
                // Parse JSON if possible
                const parsedValue = JSON.parse(value);
                // Update memory cache with the parsed value
                this.memoryCache.set(key, parsedValue);
                return parsedValue;
            } catch (e) {
                // Return raw value if not JSON
                this.memoryCache.set(key, value);
                return value;
            }
        }
        
        return null;
    }
    
    setItem(key, value) {
        // Update memory cache
        this.memoryCache.set(key, value);
        
        // Store in localStorage if available
        if (this.storageAvailable) {
            try {
                const fullKey = this.prefix + key;
                // Serialize objects to JSON
                const serializedValue = typeof value === 'object' ? JSON.stringify(value) : value;
                localStorage.setItem(fullKey, serializedValue);
            } catch (e) {
                console.warn(`Failed to save item "${key}" to localStorage:`, e);
                // Still successful since we have memory cache
            }
        }
        
        return true;
    }
    
    removeItem(key) {
        // Remove from memory cache
        this.memoryCache.delete(key);
        
        // Remove from localStorage if available
        if (this.storageAvailable) {
            try {
                const fullKey = this.prefix + key;
                localStorage.removeItem(fullKey);
            } catch (e) {
                console.warn(`Failed to remove item "${key}" from localStorage:`, e);
            }
        }
    }
    
    clear() {
        // Clear memory cache
        this.memoryCache.clear();
        
        // Clear localStorage items if available
        if (this.storageAvailable) {
            try {
                // Only clear items with our prefix
                Object.keys(localStorage).forEach(key => {
                    if (key.startsWith(this.prefix)) {
                        localStorage.removeItem(key);
                    }
                });
            } catch (e) {
                console.warn('Failed to clear localStorage items:', e);
            }
        }
    }
    
    isStorageAvailable(type) {
        try {
            const storage = window[type];
            const testKey = '__storage_test__';
            storage.setItem(testKey, testKey);
            storage.removeItem(testKey);
            return true;
        } catch (e) {
            return false;
        }
    }
}

export default new StorageService();
