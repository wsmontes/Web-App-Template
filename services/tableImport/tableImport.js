import storageService from '../storage/storage.js';

class TableImportService {
    constructor() {
        this.tables = new Map();  // In-memory cache of imported tables
        this.supportedFormats = ['csv', 'xlsx', 'xls'];
        this.storagePrefix = 'table_';
        
        // For Excel parsing we'll use SheetJS (xlsx) library
        this.excelParser = null;
    }
    
    async init() {
        try {
            // Dynamically load the SheetJS library for Excel parsing
            const { default: XLSX } = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
            this.excelParser = XLSX;
            console.log('Table Import Service initialized');
            
            // Load any previously stored tables from storage
            await this.loadTablesFromStorage();
            
            return true;
        } catch (error) {
            console.error('Failed to initialize Table Import Service:', error);
            return false;
        }
    }
    
    /**
     * Import data from a file or data source
     * @param {File|String} source - File object or string content to import
     * @param {Object} options - Import configuration options
     * @returns {Promise<Object>} - The imported table data
     */
    async importTable(source, options = {}) {
        try {
            const defaultOptions = {
                tableId: null,  // If null, will generate a unique ID
                name: null,     // Display name for the table
                hasHeaders: true, // Whether the first row contains headers
                skipRows: 0,    // Number of rows to skip from the start
                maxRows: 10000, // Maximum rows to process (prevent memory issues)
                delimiter: ',', // For CSV imports
                sheetIndex: 0,  // For Excel imports, which sheet to use
                trimValues: true, // Trim whitespace from values
                saveToStorage: true // Whether to save the table to storage
            };
            
            // Merge default options with provided options
            const importOptions = { ...defaultOptions, ...options };
            
            // Generate a table ID if not provided
            if (!importOptions.tableId) {
                importOptions.tableId = this.generateTableId();
            }
            
            // If name not set, use the tableId
            if (!importOptions.name) {
                importOptions.name = `Table ${importOptions.tableId}`;
            }
            
            // Process the source based on type
            let tableData;
            if (source instanceof File) {
                tableData = await this.processFile(source, importOptions);
            } else if (typeof source === 'string') {
                tableData = this.processString(source, importOptions);
            } else {
                throw new Error('Source must be a File or string');
            }
            
            // Create the table object
            const table = {
                id: importOptions.tableId,
                name: importOptions.name,
                importDate: new Date().toISOString(),
                sourceName: source instanceof File ? source.name : 'string data',
                options: importOptions,
                headers: tableData.headers || [],
                data: tableData.data,
                rowCount: tableData.data.length,
                columnCount: tableData.headers ? tableData.headers.length : 
                    (tableData.data[0] ? tableData.data[0].length : 0)
            };
            
            // Save to in-memory cache
            this.tables.set(table.id, table);
            
            // Save to storage if specified
            if (importOptions.saveToStorage) {
                await this.saveTableToStorage(table);
            }
            
            return table;
        } catch (error) {
            console.error('Import error:', error);
            throw new Error(`Failed to import table: ${error.message}`);
        }
    }
    
    /**
     * Process a File object (CSV or Excel)
     */
    async processFile(file, options) {
        const fileExt = this.getFileExtension(file.name).toLowerCase();
        
        if (!this.supportedFormats.includes(fileExt)) {
            throw new Error(`Unsupported file format: ${fileExt}. Supported formats: ${this.supportedFormats.join(', ')}`);
        }
        
        if (fileExt === 'csv') {
            const content = await this.readFileAsText(file);
            return this.processCSV(content, options);
        } else if (['xlsx', 'xls'].includes(fileExt)) {
            return this.processExcel(file, options);
        }
        
        throw new Error(`Unsupported file format: ${fileExt}`);
    }
    
    /**
     * Process a CSV string
     */
    processCSV(content, options) {
        const lines = content.split(/\r\n|\n|\r/).filter(line => line.trim());
        const { hasHeaders, skipRows, maxRows, delimiter, trimValues } = options;
        
        // Skip rows if specified
        let startRow = skipRows;
        
        // Handle headers
        let headers = null;
        if (hasHeaders && lines.length > 0) {
            headers = this.parseCSVLine(lines[startRow], delimiter, trimValues);
            startRow++;
        }
        
        // Parse data rows
        const data = [];
        const endRow = Math.min(lines.length, startRow + maxRows);
        
        for (let i = startRow; i < endRow; i++) {
            const row = this.parseCSVLine(lines[i], delimiter, trimValues);
            
            // Skip empty rows
            if (row.every(cell => cell === '')) continue;
            
            data.push(row);
        }
        
        return { headers, data };
    }
    
    /**
     * Parse a CSV line respecting quoted values
     */
    parseCSVLine(line, delimiter, trimValues) {
        const result = [];
        let currentCell = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                // Check if this is an escaped quote
                if (i + 1 < line.length && line[i + 1] === '"') {
                    currentCell += '"';
                    i++; // Skip the next quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                result.push(trimValues ? currentCell.trim() : currentCell);
                currentCell = '';
            } else {
                currentCell += char;
            }
        }
        
        // Add the last cell
        result.push(trimValues ? currentCell.trim() : currentCell);
        
        return result;
    }
    
    /**
     * Process an Excel file
     */
    async processExcel(file, options) {
        if (!this.excelParser) {
            throw new Error('Excel parser not available. Make sure SheetJS library is loaded.');
        }
        
        const { hasHeaders, skipRows, maxRows, sheetIndex, trimValues } = options;
        
        // Read file as array buffer
        const content = await this.readFileAsArrayBuffer(file);
        
        // Parse workbook
        const workbook = this.excelParser.read(content, { type: 'array' });
        
        // Get sheet
        const sheetNames = workbook.SheetNames;
        if (sheetIndex >= sheetNames.length) {
            throw new Error(`Sheet index ${sheetIndex} out of bounds. Workbook has ${sheetNames.length} sheet(s).`);
        }
        
        const sheetName = sheetNames[sheetIndex];
        const sheet = workbook.Sheets[sheetName];
        
        // Convert to array of arrays
        const rawData = this.excelParser.utils.sheet_to_json(sheet, { 
            header: 1,  // Return array of arrays
            raw: false, // Convert all values to string
            defval: ''  // Default value for empty cells
        });
        
        // Handle headers and data based on options
        let headers = null;
        let data = [];
        
        if (rawData.length > skipRows) {
            // Extract headers if needed
            if (hasHeaders) {
                headers = rawData[skipRows].map(cell => trimValues && typeof cell === 'string' ? cell.trim() : cell);
                skipRows++;
            }
            
            // Extract data
            const endRow = Math.min(rawData.length, skipRows + maxRows);
            for (let i = skipRows; i < endRow; i++) {
                // Skip completely empty rows
                if (!rawData[i] || rawData[i].every(cell => cell === '')) continue;
                
                // Process row data
                const row = rawData[i].map(cell => {
                    if (trimValues && typeof cell === 'string') return cell.trim();
                    return cell;
                });
                
                data.push(row);
            }
        }
        
        return { headers, data };
    }
    
    /**
     * Process a string (assumes CSV format)
     */
    processString(content, options) {
        return this.processCSV(content, options);
    }
    
    /**
     * Read file as text
     */
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }
    
    /**
     * Read file as ArrayBuffer (for Excel files)
     */
    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    }
    
    /**
     * Save table to storage
     */
    async saveTableToStorage(table) {
        try {
            const storageKey = `${this.storagePrefix}${table.id}`;
            
            // Store table metadata in a separate key to avoid loading full data
            const metadata = {
                id: table.id,
                name: table.name,
                importDate: table.importDate,
                sourceName: table.sourceName,
                options: table.options,
                headers: table.headers,
                rowCount: table.rowCount,
                columnCount: table.columnCount
            };
            
            await storageService.setItem(`${storageKey}_meta`, metadata);
            
            // Store the actual data
            await storageService.setItem(storageKey, table.data);
            
            // Store the list of table IDs
            const tableIds = await this.getTableList();
            if (!tableIds.includes(table.id)) {
                tableIds.push(table.id);
                await storageService.setItem(`${this.storagePrefix}list`, tableIds);
            }
            
            return true;
        } catch (error) {
            console.error('Failed to save table to storage:', error);
            return false;
        }
    }
    
    /**
     * Load tables from storage
     */
    async loadTablesFromStorage() {
        try {
            const tableIds = await this.getTableList();
            
            for (const tableId of tableIds) {
                try {
                    await this.loadTableFromStorage(tableId);
                } catch (e) {
                    console.warn(`Failed to load table ${tableId}:`, e);
                }
            }
            
            return true;
        } catch (error) {
            console.error('Failed to load tables from storage:', error);
            return false;
        }
    }
    
    /**
     * Load a specific table from storage
     */
    async loadTableFromStorage(tableId) {
        try {
            const storageKey = `${this.storagePrefix}${tableId}`;
            
            // Get metadata
            const metadata = await storageService.getItem(`${storageKey}_meta`);
            if (!metadata) {
                throw new Error(`Table metadata not found for ID: ${tableId}`);
            }
            
            // Get data
            const data = await storageService.getItem(storageKey);
            if (!data) {
                throw new Error(`Table data not found for ID: ${tableId}`);
            }
            
            // Recreate full table object
            const table = {
                ...metadata,
                data
            };
            
            // Add to in-memory cache
            this.tables.set(tableId, table);
            
            return table;
        } catch (error) {
            console.error(`Failed to load table ${tableId}:`, error);
            throw error;
        }
    }
    
    /**
     * Get list of tables in storage
     */
    async getTableList() {
        const tableIds = await storageService.getItem(`${this.storagePrefix}list`) || [];
        return Array.isArray(tableIds) ? tableIds : [];
    }
    
    /**
     * Get all tables (metadata only by default)
     */
    async getAllTables(includeData = false) {
        try {
            const tableIds = await this.getTableList();
            const tables = [];
            
            for (const tableId of tableIds) {
                try {
                    let table;
                    
                    // Check in-memory cache first
                    if (this.tables.has(tableId)) {
                        table = this.tables.get(tableId);
                    } else {
                        table = await this.loadTableFromStorage(tableId);
                    }
                    
                    // If includeData is false, remove the data property to save memory
                    if (!includeData) {
                        const { data, ...metadata } = table;
                        tables.push(metadata);
                    } else {
                        tables.push(table);
                    }
                } catch (e) {
                    console.warn(`Skipping table ${tableId}:`, e);
                }
            }
            
            return tables;
        } catch (error) {
            console.error('Failed to get tables:', error);
            return [];
        }
    }
    
    /**
     * Get a specific table by ID
     */
    async getTable(tableId) {
        try {
            // Check in-memory cache first
            if (this.tables.has(tableId)) {
                return this.tables.get(tableId);
            }
            
            // Try to load from storage
            return await this.loadTableFromStorage(tableId);
        } catch (error) {
            console.error(`Failed to get table ${tableId}:`, error);
            return null;
        }
    }
    
    /**
     * Delete a table
     */
    async deleteTable(tableId) {
        try {
            const storageKey = `${this.storagePrefix}${tableId}`;
            
            // Remove from storage
            await storageService.removeItem(storageKey);
            await storageService.removeItem(`${storageKey}_meta`);
            
            // Update table list
            const tableIds = await this.getTableList();
            const updatedIds = tableIds.filter(id => id !== tableId);
            await storageService.setItem(`${this.storagePrefix}list`, updatedIds);
            
            // Remove from cache
            this.tables.delete(tableId);
            
            return true;
        } catch (error) {
            console.error(`Failed to delete table ${tableId}:`, error);
            return false;
        }
    }
    
    /**
     * Export table to CSV
     */
    exportTableToCSV(tableId) {
        try {
            const table = this.tables.get(tableId);
            if (!table) {
                throw new Error(`Table not found: ${tableId}`);
            }
            
            let csv = '';
            
            // Add headers if available
            if (table.headers && table.headers.length > 0) {
                csv += this.rowToCSV(table.headers);
                csv += '\n';
            }
            
            // Add data rows
            for (const row of table.data) {
                csv += this.rowToCSV(row);
                csv += '\n';
            }
            
            return csv;
        } catch (error) {
            console.error(`Failed to export table ${tableId} to CSV:`, error);
            throw error;
        }
    }
    
    /**
     * Convert a row of data to CSV format
     */
    rowToCSV(row) {
        return row.map(cell => {
            // Convert to string
            const value = String(cell ?? '');
            
            // Escape quotes and wrap in quotes if needed
            if (value.includes('"') || value.includes(',') || value.includes('\n')) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        }).join(',');
    }
    
    /**
     * Generate a unique table ID
     */
    generateTableId() {
        return 'tbl_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();
    }
    
    /**
     * Get file extension from filename
     */
    getFileExtension(filename) {
        return filename.split('.').pop();
    }
}

export default new TableImportService();
