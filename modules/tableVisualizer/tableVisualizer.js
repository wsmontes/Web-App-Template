import tableImportService from '../../services/tableImport/tableImport.js';

export default class TableVisualizerModule {
    constructor() {
        this.title = 'Table Visualizer';
        this.currentTable = null;
        this.sortColumn = null;
        this.sortDirection = 'asc';
        this.currentPage = 1;
        this.rowsPerPage = 25;
        this.searchTerm = '';
        this.filteredData = [];
    }
    
    async onMount(container) {
        console.log('Table Visualizer module mounted');
        this.container = container;
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Initialize UI
        await this.refreshTablesList();
        
        // Show message if no tables
        if (this.tableList.length === 0) {
            this.showNotification('No tables found. Import a table to get started.', 'info');
        }
    }
    
    setupEventListeners() {
        // File import section
        const fileInput = this.container.querySelector('#table-file-input');
        const importButton = this.container.querySelector('#import-table-btn');
        const hasHeadersCheckbox = this.container.querySelector('#has-headers');
        
        importButton.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => this.handleFileImport(fileInput, hasHeadersCheckbox.checked));
        
        // Table selector
        const tableSelect = this.container.querySelector('#table-select');
        tableSelect.addEventListener('change', () => this.loadSelectedTable());
        
        // Delete table button
        const deleteTableBtn = this.container.querySelector('#delete-table-btn');
        deleteTableBtn.addEventListener('click', () => this.handleDeleteTable());
        
        // Export table button
        const exportTableBtn = this.container.querySelector('#export-table-btn');
        exportTableBtn.addEventListener('click', () => this.handleExportTable());
        
        // Search input
        const searchInput = this.container.querySelector('#table-search');
        searchInput.addEventListener('input', (e) => {
            this.searchTerm = e.target.value;
            this.filterAndDisplayTable();
        });
        
        // Rows per page selector
        const rowsPerPageSelect = this.container.querySelector('#rows-per-page');
        rowsPerPageSelect.addEventListener('change', (e) => {
            this.rowsPerPage = parseInt(e.target.value, 10);
            this.currentPage = 1; // Reset to first page
            this.filterAndDisplayTable();
        });
    }
    
    async handleFileImport(fileInput, hasHeaders) {
        if (!fileInput.files || fileInput.files.length === 0) {
            return;
        }
        
        const file = fileInput.files[0];
        
        try {
            // Show loading state
            this.setLoading(true, 'Importing table...');
            
            // Import the table
            const table = await tableImportService.importTable(file, {
                name: file.name.replace(/\.[^/.]+$/, ""), // Remove extension
                hasHeaders: hasHeaders
            });
            
            // Reset file input
            fileInput.value = '';
            
            // Refresh tables list and show the new table
            await this.refreshTablesList();
            this.selectTable(table.id);
            
            this.showNotification(`Table "${table.name}" imported successfully.`, 'success');
        } catch (error) {
            console.error('Import error:', error);
            this.showNotification(`Import failed: ${error.message}`, 'error');
        } finally {
            this.setLoading(false);
        }
    }
    
    async refreshTablesList() {
        try {
            // Get all tables (metadata only)
            this.tableList = await tableImportService.getAllTables();
            
            // Sort by import date (newest first)
            this.tableList.sort((a, b) => new Date(b.importDate) - new Date(a.importDate));
            
            // Update the table selector
            const tableSelect = this.container.querySelector('#table-select');
            tableSelect.innerHTML = '';
            
            // Add default option
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = this.tableList.length > 0 ? '-- Select a table --' : 'No tables available';
            tableSelect.appendChild(defaultOption);
            
            // Add options for each table
            this.tableList.forEach(table => {
                const option = document.createElement('option');
                option.value = table.id;
                option.textContent = `${table.name} (${table.rowCount} rows, ${table.columnCount} columns)`;
                tableSelect.appendChild(option);
            });
            
            // Update button states
            this.updateButtonStates(false);
        } catch (error) {
            console.error('Error refreshing tables list:', error);
            this.showNotification('Failed to load tables list', 'error');
        }
    }
    
    async loadSelectedTable() {
        const tableSelect = this.container.querySelector('#table-select');
        const tableId = tableSelect.value;
        
        if (!tableId) {
            this.currentTable = null;
            this.clearTableDisplay();
            this.updateButtonStates(false);
            return;
        }
        
        try {
            this.setLoading(true, 'Loading table...');
            
            // Load the selected table
            this.currentTable = await tableImportService.getTable(tableId);
            
            if (!this.currentTable) {
                throw new Error(`Table not found: ${tableId}`);
            }
            
            // Reset sort and filter
            this.sortColumn = null;
            this.sortDirection = 'asc';
            this.currentPage = 1;
            this.searchTerm = '';
            
            // Clear search box
            const searchInput = this.container.querySelector('#table-search');
            searchInput.value = '';
            
            // Display the table
            this.filterAndDisplayTable();
            
            // Update button states
            this.updateButtonStates(true);
        } catch (error) {
            console.error('Error loading table:', error);
            this.showNotification(`Failed to load table: ${error.message}`, 'error');
            this.clearTableDisplay();
            this.updateButtonStates(false);
        } finally {
            this.setLoading(false);
        }
    }
    
    selectTable(tableId) {
        const tableSelect = this.container.querySelector('#table-select');
        tableSelect.value = tableId;
        this.loadSelectedTable();
    }
    
    filterAndDisplayTable() {
        if (!this.currentTable) {
            this.clearTableDisplay();
            return;
        }
        
        // Filter data based on search term
        this.filteredData = this.currentTable.data;
        
        if (this.searchTerm) {
            const searchLower = this.searchTerm.toLowerCase();
            this.filteredData = this.currentTable.data.filter(row => 
                row.some(cell => 
                    String(cell).toLowerCase().includes(searchLower)
                )
            );
        }
        
        // Sort data if sort column is set
        if (this.sortColumn !== null) {
            const columnIndex = this.sortColumn;
            this.filteredData = [...this.filteredData].sort((a, b) => {
                const valueA = a[columnIndex] ?? '';
                const valueB = b[columnIndex] ?? '';
                
                if (this.sortDirection === 'asc') {
                    return String(valueA).localeCompare(String(valueB));
                } else {
                    return String(valueB).localeCompare(String(valueA));
                }
            });
        }
        
        // Calculate pagination
        const totalRows = this.filteredData.length;
        const totalPages = Math.ceil(totalRows / this.rowsPerPage);
        
        // Adjust current page if needed
        if (this.currentPage > totalPages) {
            this.currentPage = Math.max(1, totalPages);
        }
        
        // Calculate slice for current page
        const startIndex = (this.currentPage - 1) * this.rowsPerPage;
        const endIndex = Math.min(startIndex + this.rowsPerPage, totalRows);
        
        // Get data for current page
        const pageData = this.filteredData.slice(startIndex, endIndex);
        
        // Update table display
        this.displayTable(pageData, totalRows, totalPages);
    }
    
    displayTable(pageData, totalRows, totalPages) {
        const tableContainer = this.container.querySelector('#table-container');
        const tableInfo = this.container.querySelector('#table-info');
        const pagination = this.container.querySelector('#pagination');
        
        // If no data, show message
        if (!this.currentTable || pageData.length === 0) {
            tableContainer.innerHTML = '<div class="empty-state">No data to display</div>';
            tableInfo.innerHTML = '';
            pagination.innerHTML = '';
            return;
        }
        
        // Build table HTML
        let tableHtml = '<table class="table-data">';
        
        // Add headers
        if (this.currentTable.headers && this.currentTable.headers.length > 0) {
            tableHtml += '<thead><tr>';
            this.currentTable.headers.forEach((header, index) => {
                const isSorted = this.sortColumn === index;
                const sortClass = isSorted ? `sorted ${this.sortDirection}` : '';
                tableHtml += `<th class="${sortClass}" data-column="${index}">${this.escapeHtml(header)}</th>`;
            });
            tableHtml += '</tr></thead>';
        }
        
        // Add data rows
        tableHtml += '<tbody>';
        pageData.forEach(row => {
            tableHtml += '<tr>';
            row.forEach(cell => {
                tableHtml += `<td>${this.escapeHtml(cell ?? '')}</td>`;
            });
            tableHtml += '</tr>';
        });
        tableHtml += '</tbody></table>';
        
        // Update table container
        tableContainer.innerHTML = tableHtml;
        
        // Update table info
        const startIndex = (this.currentPage - 1) * this.rowsPerPage + 1;
        const endIndex = Math.min(startIndex + pageData.length - 1, totalRows);
        tableInfo.innerHTML = `Showing rows ${startIndex}-${endIndex} of ${totalRows}${
            this.searchTerm ? ` (filtered from ${this.currentTable.data.length} total rows)` : ''
        }`;
        
        // Update pagination
        this.updatePagination(totalPages);
        
        // Add click handlers for headers (sorting)
        const headers = tableContainer.querySelectorAll('th');
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const column = parseInt(header.getAttribute('data-column'), 10);
                this.handleHeaderClick(column);
            });
        });
    }
    
    updatePagination(totalPages) {
        const pagination = this.container.querySelector('#pagination');
        pagination.innerHTML = '';
        
        if (totalPages <= 1) {
            return;
        }
        
        // Previous button
        const prevButton = document.createElement('button');
        prevButton.innerHTML = '&laquo;';
        prevButton.disabled = this.currentPage === 1;
        prevButton.addEventListener('click', () => {
            this.currentPage = Math.max(1, this.currentPage - 1);
            this.filterAndDisplayTable();
        });
        pagination.appendChild(prevButton);
        
        // Page numbers
        const maxButtons = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxButtons - 1);
        
        // Adjust if we're near the end
        if (endPage - startPage + 1 < maxButtons) {
            startPage = Math.max(1, endPage - maxButtons + 1);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const pageButton = document.createElement('button');
            pageButton.textContent = i;
            pageButton.className = i === this.currentPage ? 'active' : '';
            pageButton.addEventListener('click', () => {
                this.currentPage = i;
                this.filterAndDisplayTable();
            });
            pagination.appendChild(pageButton);
        }
        
        // Next button
        const nextButton = document.createElement('button');
        nextButton.innerHTML = '&raquo;';
        nextButton.disabled = this.currentPage === totalPages;
        nextButton.addEventListener('click', () => {
            this.currentPage = Math.min(totalPages, this.currentPage + 1);
            this.filterAndDisplayTable();
        });
        pagination.appendChild(nextButton);
    }
    
    handleHeaderClick(column) {
        // If clicking the already sorted column, toggle direction
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            // Sort new column in ascending order
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }
        
        this.filterAndDisplayTable();
    }
    
    async handleDeleteTable() {
        if (!this.currentTable) {
            return;
        }
        
        const confirmed = confirm(`Are you sure you want to delete the table "${this.currentTable.name}"?`);
        if (!confirmed) {
            return;
        }
        
        try {
            this.setLoading(true, 'Deleting table...');
            
            // Delete the table
            await tableImportService.deleteTable(this.currentTable.id);
            
            // Clear current table
            this.currentTable = null;
            this.clearTableDisplay();
            
            // Refresh tables list
            await this.refreshTablesList();
            
            this.showNotification('Table deleted successfully', 'success');
        } catch (error) {
            console.error('Error deleting table:', error);
            this.showNotification(`Failed to delete table: ${error.message}`, 'error');
        } finally {
            this.setLoading(false);
        }
    }
    
    async handleExportTable() {
        if (!this.currentTable) {
            return;
        }
        
        try {
            this.setLoading(true, 'Exporting table...');
            
            // Export table to CSV
            const csv = await tableImportService.exportTableToCSV(this.currentTable.id);
            
            // Create download link
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `${this.currentTable.name}.csv`;
            
            document.body.appendChild(a);
            a.click();
            
            // Cleanup
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
            
            this.showNotification('Table exported successfully', 'success');
        } catch (error) {
            console.error('Error exporting table:', error);
            this.showNotification(`Failed to export table: ${error.message}`, 'error');
        } finally {
            this.setLoading(false);
        }
    }
    
    clearTableDisplay() {
        const tableContainer = this.container.querySelector('#table-container');
        const tableInfo = this.container.querySelector('#table-info');
        const pagination = this.container.querySelector('#pagination');
        
        tableContainer.innerHTML = '<div class="empty-state">No table selected</div>';
        tableInfo.innerHTML = '';
        pagination.innerHTML = '';
    }
    
    updateButtonStates(tableLoaded) {
        const deleteTableBtn = this.container.querySelector('#delete-table-btn');
        const exportTableBtn = this.container.querySelector('#export-table-btn');
        const searchInput = this.container.querySelector('#table-search');
        const rowsPerPageSelect = this.container.querySelector('#rows-per-page');
        
        deleteTableBtn.disabled = !tableLoaded;
        exportTableBtn.disabled = !tableLoaded;
        searchInput.disabled = !tableLoaded;
        rowsPerPageSelect.disabled = !tableLoaded;
    }
    
    setLoading(isLoading, message = 'Loading...') {
        const loadingElement = this.container.querySelector('.loading-overlay');
        const loadingMessage = this.container.querySelector('.loading-message');
        
        if (isLoading) {
            if (!loadingElement) {
                // Create loading overlay
                const overlay = document.createElement('div');
                overlay.className = 'loading-overlay';
                
                const spinner = document.createElement('div');
                spinner.className = 'loading-spinner';
                
                const msg = document.createElement('div');
                msg.className = 'loading-message';
                msg.textContent = message;
                
                overlay.appendChild(spinner);
                overlay.appendChild(msg);
                this.container.appendChild(overlay);
            } else {
                loadingElement.style.display = 'flex';
                if (loadingMessage) {
                    loadingMessage.textContent = message;
                }
            }
        } else if (loadingElement) {
            loadingElement.style.display = 'none';
        }
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        this.container.appendChild(notification);
        
        // Remove after 5 seconds
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 500);
        }, 5000);
    }
    
    escapeHtml(unsafe) {
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    
    onUnmount() {
        console.log('Table Visualizer module unmounted');
        // Clean up any resources
    }
}
