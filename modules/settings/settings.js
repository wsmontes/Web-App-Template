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
        
        // Set up module and service discovery UI
        this.setupDiscoveryUI(container);
    }
    
    setupDiscoveryUI(container) {
        // Get references to the refresh buttons
        const refreshModulesBtn = container.querySelector('#refresh-modules');
        const refreshServicesBtn = container.querySelector('#refresh-services');
        const quietModeToggle = container.querySelector('#quiet-mode-toggle');
        
        // Get reference to the discovery service if available
        const discoveryService = window.serviceRegistry?.discovery?.instance;
        
        // If discovery service is available, setup the UI
        if (discoveryService) {
            // Display current discovery counts
            const modulesCount = container.querySelector('#modules-count');
            const servicesCount = container.querySelector('#services-count');
            const modulesList = container.querySelector('#modules-list');
            const servicesList = container.querySelector('#services-list');
            
            if (modulesCount) {
                const discoveredModules = discoveryService.getDiscoveredModules();
                modulesCount.textContent = discoveredModules.length;
                
                // Display modules list
                if (modulesList) {
                    this.renderDiscoveredItems(modulesList, discoveredModules, 'modules');
                }
            }
            
            if (servicesCount) {
                const discoveredServices = discoveryService.getDiscoveredServices();
                servicesCount.textContent = discoveredServices.length;
                
                // Display services list
                if (servicesList) {
                    this.renderDiscoveredItems(servicesList, discoveredServices, 'services');
                }
            }
            
            // Setup quiet mode toggle
            if (quietModeToggle) {
                // Set initial state
                quietModeToggle.checked = discoveryService.getQuietMode();
                
                // Add event listener
                quietModeToggle.addEventListener('change', () => {
                    const quietMode = quietModeToggle.checked;
                    discoveryService.setQuietMode(quietMode);
                    
                    // Apply or remove console filter
                    if (quietMode) {
                        discoveryService.installConsoleFilter();
                        this.showMessage('Quiet mode enabled - 404 errors will be hidden');
                    } else {
                        discoveryService.removeConsoleFilter();
                        this.showMessage('Quiet mode disabled - all console messages will be shown');
                    }
                });
            }
            
            // Setup refresh modules button
            if (refreshModulesBtn) {
                refreshModulesBtn.addEventListener('click', async () => {
                    refreshModulesBtn.disabled = true;
                    refreshModulesBtn.textContent = 'Scanning...';
                    
                    try {
                        console.log('Starting module discovery...');
                        const result = await discoveryService.discoverNewModules();
                        console.log('Discovery result:', result);
                        
                        if (modulesCount) {
                            modulesCount.textContent = result.total;
                        }
                        
                        // Update modules list display
                        if (modulesList) {
                            const discoveredModules = discoveryService.getDiscoveredModules();
                            console.log('All discovered modules:', discoveredModules);
                            this.renderDiscoveredItems(modulesList, discoveredModules, 'modules');
                        }
                        
                        this.showMessage(`Module discovery complete. Found ${result.new} new module(s).`);
                    } catch (e) {
                        console.error('Error refreshing modules:', e);
                        this.showMessage('Error refreshing modules', 'error');
                    } finally {
                        refreshModulesBtn.disabled = false;
                        refreshModulesBtn.textContent = 'Refresh Modules';
                    }
                });
            }
            
            // Setup refresh services button
            if (refreshServicesBtn) {
                refreshServicesBtn.addEventListener('click', async () => {
                    refreshServicesBtn.disabled = true;
                    refreshServicesBtn.textContent = 'Scanning...';
                    
                    try {
                        const result = await discoveryService.discoverNewServices();
                        
                        if (servicesCount) {
                            servicesCount.textContent = result.total;
                        }
                        
                        // Update services list display
                        if (servicesList) {
                            const discoveredServices = discoveryService.getDiscoveredServices();
                            this.renderDiscoveredItems(servicesList, discoveredServices, 'services');
                        }
                        
                        this.showMessage(`Service discovery complete. Found ${result.new} new service(s).`);
                    } catch (e) {
                        console.error('Error refreshing services:', e);
                        this.showMessage('Error refreshing services', 'error');
                    } finally {
                        refreshServicesBtn.disabled = false;
                        refreshServicesBtn.textContent = 'Refresh Services';
                    }
                });
            }
            
            // Add reload app button functionality
            const reloadAppBtn = container.querySelector('#reload-app');
            if (reloadAppBtn) {
                reloadAppBtn.addEventListener('click', () => {
                    if (confirm('Reload the application to apply discovered modules and services?')) {
                        window.location.reload();
                    }
                });
            }
            
            // Add code for the cleanup button inside the if (discoveryService) block
            const cleanupBtn = container.querySelector('#cleanup-discoveries');
            if (cleanupBtn) {
                cleanupBtn.addEventListener('click', async () => {
                    cleanupBtn.disabled = true;
                    cleanupBtn.textContent = 'Cleaning...';
                    
                    try {
                        const result = await discoveryService.cleanupInvalidDiscoveries();
                        
                        // Update counts and lists
                        if (modulesCount) {
                            modulesCount.textContent = result.modules;
                        }
                        
                        if (servicesCount) {
                            servicesCount.textContent = result.services;
                        }
                        
                        // Update the lists
                        if (modulesList) {
                            const discoveredModules = discoveryService.getDiscoveredModules();
                            this.renderDiscoveredItems(modulesList, discoveredModules, 'modules');
                        }
                        
                        if (servicesList) {
                            const discoveredServices = discoveryService.getDiscoveredServices();
                            this.renderDiscoveredItems(servicesList, discoveredServices, 'services');
                        }
                        
                        this.showMessage('Invalid discoveries removed successfully');
                    } catch (e) {
                        console.error('Error cleaning up discoveries:', e);
                        this.showMessage('Error cleaning up discoveries', 'error');
                    } finally {
                        cleanupBtn.disabled = false;
                        cleanupBtn.textContent = 'Remove Invalid Items';
                    }
                });
            }
        } else {
            // Discovery service not available - hide the discovery section or show error
            const discoverySection = container.querySelector('.discovery-settings');
            if (discoverySection) {
                discoverySection.innerHTML = `
                    <div class="setting-item">
                        <p class="error-message">Discovery service not available</p>
                    </div>
                `;
            }
        }
    }
    
    /**
     * Renders a list of discovered items (modules or services) and checks if they exist
     */
    async renderDiscoveredItems(container, items, type) {
        container.innerHTML = '';
        
        if (items.length === 0) {
            container.innerHTML = '<em>None discovered yet</em>';
            return;
        }
        
        // Sort items alphabetically
        const sortedItems = [...items].sort();
        
        for (const item of sortedItems) {
            const itemEl = document.createElement('span');
            itemEl.className = 'item';
            itemEl.textContent = item;
            
            // Check if the item actually exists by trying to fetch its main file
            try {
                const path = type === 'modules' 
                    ? `./modules/${item}/${item}.js` 
                    : `./services/${item}/${item}.js`;
                
                const response = await fetch(path, { method: 'HEAD' });
                if (response.ok) {
                    itemEl.classList.add('valid');
                } else {
                    itemEl.classList.add('invalid');
                }
            } catch (e) {
                itemEl.classList.add('invalid');
            }
            
            container.appendChild(itemEl);
        }
    }
    
    onUnmount() {
        console.log('Settings module unmounted');
        // Clean up any event listeners or resources
    }
    
    showMessage(message, type = 'success') {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type}`;
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
