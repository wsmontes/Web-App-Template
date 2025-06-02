class JsonImportService {
  constructor() {
    this.schemas = new Map();
    this.transformers = new Map();
    this.ajv = null;
  }

  async init() {
    try {
      // Dynamically import Ajv (JSON Schema validator) only when needed
      const { default: Ajv } = await import('https://cdn.skypack.dev/ajv@8.11.0');
      const { default: addFormats } = await import('https://cdn.skypack.dev/ajv-formats@2.1.1');
      
      // Initialize Ajv with options
      this.ajv = new Ajv({
        allErrors: true,
        removeAdditional: 'all',
        useDefaults: true,
        coerceTypes: true
      });
      
      // Add string formats like email, date, etc.
      addFormats(this.ajv);
      
      console.log('JSON Import Service initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize JSON Import Service:', error);
      return false;
    }
  }

  /**
   * Register a schema for a specific data type
   * @param {string} type - Schema identifier
   * @param {object} schema - JSON Schema object
   * @param {function} [transformer] - Optional transformation function
   * @returns {boolean} Success status
   */
  registerSchema(type, schema, transformer = null) {
    try {
      if (!this.ajv) {
        console.error('JSON Import Service not initialized');
        return false;
      }
      
      // Compile the schema
      const validate = this.ajv.compile(schema);
      this.schemas.set(type, validate);
      
      // Register transformer if provided
      if (transformer && typeof transformer === 'function') {
        this.transformers.set(type, transformer);
      }
      
      console.log(`Schema for "${type}" registered successfully`);
      return true;
    } catch (error) {
      console.error(`Failed to register schema for "${type}":`, error);
      return false;
    }
  }

  /**
   * Import JSON data from a file or URL
   * @param {string} type - Schema identifier to use for validation
   * @param {string|object} source - URL or file path to JSON data, or direct JSON object
   * @param {object} options - Import options
   * @returns {Promise<object>} Validated and transformed data
   */
  async importData(type, source, options = {}) {
    try {
      if (!this.schemas.has(type)) {
        throw new Error(`No schema registered for type "${type}"`);
      }
      
      const validate = this.schemas.get(type);
      let data;
      
      // Handle different source types
      if (typeof source === 'string') {
        // Source is URL or file path
        const response = await fetch(source);
        if (!response.ok) {
          throw new Error(`Failed to fetch JSON from "${source}": ${response.statusText}`);
        }
        data = await response.json();
      } else if (typeof source === 'object') {
        // Source is direct JSON object
        data = source;
      } else {
        throw new Error('Source must be a URL, file path, or JSON object');
      }
      
      // Validate data against schema
      const valid = validate(data);
      
      if (!valid) {
        const errors = validate.errors.map(err => {
          return `${err.instancePath} ${err.message}`;
        }).join('; ');
        
        // Handle validation failure based on options
        if (options.throwOnError !== false) {
          throw new Error(`JSON validation failed: ${errors}`);
        } else {
          console.error(`JSON validation failed: ${errors}`);
          return { valid: false, errors: validate.errors, data: null };
        }
      }
      
      // Apply custom transformer if registered
      const transformer = this.transformers.get(type);
      const transformedData = transformer ? transformer(data, options) : data;
      
      return {
        valid: true,
        data: transformedData,
        errors: null
      };
    } catch (error) {
      if (options.throwOnError !== false) {
        throw error;
      }
      return {
        valid: false,
        data: null,
        errors: [error.message]
      };
    }
  }

  /**
   * Unregister a schema
   * @param {string} type - Schema identifier to remove
   */
  unregisterSchema(type) {
    this.schemas.delete(type);
    this.transformers.delete(type);
    console.log(`Schema for "${type}" unregistered`);
  }

  /**
   * Get all registered schema types
   * @returns {Array<string>} Array of schema type identifiers 
   */
  getRegisteredTypes() {
    return Array.from(this.schemas.keys());
  }
}

// Export a singleton instance
export default new JsonImportService();
