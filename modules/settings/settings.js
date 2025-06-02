import themeService from '../../services/theme/theme.js';
import storageService from '../../services/storage/storage.js';

export default class SettingsModule {
    constructor() {
        this.title = 'Settings';
    }
    
    onMount(container) {
        console.log('Settings module mounted');
        
        // Get reference to theme toggle
        const themeToggle = container.querySelector('#theme-toggle');
        if (themeToggle) {
            // Set initial state
            themeToggle.checked = themeService.getCurrentTheme() === 'dark';
            
            // Add event listener
            themeToggle.addEventListener('change', () => {
                themeService.setTheme(themeToggle.checked ? 'dark' : 'light');
            });
        }
        
        // Storage prefix setting
        const prefixInput = container.querySelector('#storage-prefix');
        const savePrefixBtn = container.querySelector('#save-prefix');
        
        if (prefixInput && savePrefixBtn) {
            // Set initial value
            prefixInput.value = storageService.prefix;
            
            // Save prefix on button click
            savePrefixBtn.addEventListener('click', () => {
                const newPrefix = prefixInput.value.trim();
                if (newPrefix) {
                    storageService.setPrefix(newPrefix);
                    this.showMessage('Storage prefix updated successfully');
                }
            });
        }
        
        // Clear storage button
        const clearStorageBtn = container.querySelector('#clear-storage');
        if (clearStorageBtn) {
            clearStorageBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear all stored data?')) {
                    storageService.clear();
                    this.showMessage('Storage cleared successfully');
                }
            });
        }
    }
    
    onUnmount() {
        console.log('Settings module unmounted');
        // Clean up any event listeners or resources
    }
    
    showMessage(message) {
        const messageEl = document.createElement('div');
        messageEl.className = 'message success';
        messageEl.textContent = message;
        
        const container = document.querySelector('.settings-module');
        if (container) {
            container.appendChild(messageEl);
            
            // Remove after 3 seconds
            setTimeout(() => {
                messageEl.remove();
            }, 3000);
        }
    }
}
