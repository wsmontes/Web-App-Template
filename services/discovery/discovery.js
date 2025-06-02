class DiscoveryService {
    constructor() {
        this.discoveredModules = new Set();
        this.discoveredServices = new Set();
        this.storageAvailable = this.isStorageAvailable('localStorage');
        this.quietMode = true; // Default to quiet mode to hide 404 errors
    }

    setQuietMode(quiet) {
        this.quietMode = quiet;
        if (this.storageAvailable) {
            localStorage.setItem('app_discoveryQuietMode', quiet ? 'true' : 'false');
        }
    }

    getQuietMode() {
        return this.quietMode;
    }

    async init() {
        // Load previously discovered items from localStorage
        this.loadDiscoveredItems();
        
        // Load quiet mode setting
        if (this.storageAvailable) {
            const quietMode = localStorage.getItem('app_discoveryQuietMode');
            if (quietMode !== null) {
                this.quietMode = quietMode === 'true';
            }
        }
        
        // Install console filter if in quiet mode
        if (this.quietMode) {
            this.installConsoleFilter();
        }
        
        // Validate discovered modules and services to remove false positives
        await this.validateDiscoveredItems();
        
        console.log('Discovery Service initialized');
        return Promise.resolve();
    }

    async validateDiscoveredItems() {
        console.log('Validating discovered modules and services...');
        
        // Check modules
        const validModules = new Set();
        for (const moduleName of this.discoveredModules) {
            try {
                const response = await fetch(`./modules/${moduleName}/${moduleName}.js`, {
                    method: 'HEAD',
                    cache: 'force-cache'
                });
                
                if (response.ok) {
                    validModules.add(moduleName);
                } else {
                    console.log(`Removing invalid module: ${moduleName}`);
                }
            } catch (e) {
                console.log(`Removing inaccessible module: ${moduleName}`);
            }
        }
        
        // Check services
        const validServices = new Set();
        for (const serviceName of this.discoveredServices) {
            try {
                const response = await fetch(`./services/${serviceName}/${serviceName}.js`, {
                    method: 'HEAD',
                    cache: 'force-cache'
                });
                
                if (response.ok) {
                    validServices.add(serviceName);
                } else {
                    console.log(`Removing invalid service: ${serviceName}`);
                }
            } catch (e) {
                console.log(`Removing inaccessible service: ${serviceName}`);
            }
        }
        
        // Update sets
        this.discoveredModules = validModules;
        this.discoveredServices = validServices;
        
        // Save updated sets
        this.saveDiscoveredItems();
        
        console.log(`Validation complete. Valid modules: ${validModules.size}, valid services: ${validServices.size}`);
    }

    installConsoleFilter() {
        if (!console.originalError) {
            // Save original console methods
            console.originalError = console.error;
            console.originalWarn = console.warn;
            
            // Filter out 404 errors for service/module discovery
            console.error = (...args) => {
                if (args.length > 0) {
                    const errorString = args.join(' ');
                    if (errorString.includes('services/') || errorString.includes('modules/')) {
                        if (errorString.includes('404') || errorString.includes('Not Found')) {
                            // This is a 404 error from service/module discovery - suppress it
                            return;
                        }
                    }
                }
                console.originalError.apply(console, args);
            };
            
            console.warn = (...args) => {
                if (args.length > 0) {
                    const warnString = args.join(' ');
                    if (warnString.includes('Failed to check service')) {
                        // Suppress service check warnings
                        return;
                    }
                }
                console.originalWarn.apply(console, args);
            };
        }
    }

    removeConsoleFilter() {
        if (console.originalError) {
            console.error = console.originalError;
            delete console.originalError;
        }
        
        if (console.originalWarn) {
            console.warn = console.originalWarn;
            delete console.originalWarn;
        }
    }

    loadDiscoveredItems() {
        if (!this.storageAvailable) return;

        try {
            // Load discovered modules
            const savedModules = localStorage.getItem('app_discoveredModules');
            if (savedModules) {
                const moduleArray = JSON.parse(savedModules);
                moduleArray.forEach(module => this.discoveredModules.add(module));
                console.log(`Loaded ${this.discoveredModules.size} previously discovered modules`);
            }

            // Load discovered services
            const savedServices = localStorage.getItem('app_discoveredServices');
            if (savedServices) {
                const serviceArray = JSON.parse(savedServices);
                serviceArray.forEach(service => this.discoveredServices.add(service));
                console.log(`Loaded ${this.discoveredServices.size} previously discovered services`);
            }
        } catch (e) {
            console.warn('Failed to load discovered items from storage:', e);
        }
    }

    saveDiscoveredItems() {
        if (!this.storageAvailable) return;

        try {
            // Save discovered modules
            localStorage.setItem('app_discoveredModules', 
                JSON.stringify(Array.from(this.discoveredModules)));
            
            // Save discovered services
            localStorage.setItem('app_discoveredServices', 
                JSON.stringify(Array.from(this.discoveredServices)));
        } catch (e) {
            console.warn('Failed to save discovered items to storage:', e);
        }
    }

    addDiscoveredModule(moduleName) {
        if (!this.discoveredModules.has(moduleName)) {
            this.discoveredModules.add(moduleName);
            this.saveDiscoveredItems();
            return true;
        }
        return false;
    }

    addDiscoveredService(serviceName) {
        if (!this.discoveredServices.has(serviceName)) {
            this.discoveredServices.add(serviceName);
            this.saveDiscoveredItems();
            return true;
        }
        return false;
    }

    getDiscoveredModules() {
        return Array.from(this.discoveredModules);
    }

    getDiscoveredServices() {
        return Array.from(this.discoveredServices);
    }

    clearDiscoveredItems() {
        this.discoveredModules.clear();
        this.discoveredServices.clear();
        if (this.storageAvailable) {
            localStorage.removeItem('app_discoveredModules');
            localStorage.removeItem('app_discoveredServices');
        }
    }

    async discoverNewModules() {
        const newDiscoveredModules = await this.scanForModules();
        let addedCount = 0;

        newDiscoveredModules.forEach(module => {
            if (this.addDiscoveredModule(module)) {
                addedCount++;
            }
        });

        return {
            total: this.discoveredModules.size,
            new: addedCount
        };
    }

    async discoverNewServices() {
        const newDiscoveredServices = await this.scanForServices();
        let addedCount = 0;

        newDiscoveredServices.forEach(service => {
            if (this.addDiscoveredService(service)) {
                addedCount++;
            }
        });

        return {
            total: this.discoveredServices.size,
            new: addedCount
        };
    }

    async scanForModules() {
        // Start with a more limited set of potential modules to reduce false positives
        const potentialModules = new Set([
            'home', 'settings', 'about', 'dashboard'
        ]);

        const discoveredModules = new Set();

        // First, add any previously discovered modules
        this.discoveredModules.forEach(module => discoveredModules.add(module));

        // Check index.html for hash routes
        try {
            const indexResponse = await fetch('./index.html');
            if (indexResponse.ok) {
                const html = await indexResponse.text();
                const hashRegex = /href=["']#\/([^\/'"]+)/g;
                let match;
                while ((match = hashRegex.exec(html)) !== null) {
                    discoveredModules.add(match[1]);
                }
            }
        } catch (e) {
            console.warn('Unable to scan index.html for modules');
        }

        // Create a controller to abort all requests after a timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        try {
            // Check each module to see if it actually exists
            for (const moduleName of [...discoveredModules, ...potentialModules]) {
                try {
                    // Try to fetch the module's JS file
                    const jsResponse = await fetch(`./modules/${moduleName}/${moduleName}.js`, {
                        method: 'HEAD',
                        signal: controller.signal,
                        cache: 'force-cache'
                    });
                    
                    if (jsResponse.ok) {
                        // If JS exists, check HTML too
                        const htmlResponse = await fetch(`./modules/${moduleName}/${moduleName}.html`, {
                            method: 'HEAD',
                            signal: controller.signal,
                            cache: 'force-cache'
                        });
                        
                        if (htmlResponse.ok) {
                            discoveredModules.add(moduleName);
                        }
                    }
                } catch (e) {
                    // Skip this module - file doesn't exist or request was aborted
                }
            }
        } finally {
            clearTimeout(timeoutId);
        }

        return Array.from(discoveredModules);
    }

    async scanForServices() {
        const potentialServices = new Set([
            'theme', 'storage', 'api', 'jsonImport', 'discovery',
            'auth', 'user', 'data', 'config', 'logger'
            // Reduced list to minimize unnecessary requests
        ]);

        const discoveredServices = new Set();

        // First, add any previously discovered services
        this.discoveredServices.forEach(service => discoveredServices.add(service));

        // Check app.js for service imports
        try {
            const appResponse = await fetch('./app.js');
            if (appResponse.ok) {
                const appContent = await appResponse.text();
                const serviceRegex = /(?:\/|["'])services\/([a-zA-Z0-9_-]+)/g;
                let match;
                while ((match = serviceRegex.exec(appContent)) !== null) {
                    discoveredServices.add(match[1]);
                }
            }
        } catch (e) {
            console.warn('Unable to scan app.js for services');
        }

        // Check module files for service imports
        for (const moduleName of this.discoveredModules) {
            try {
                const moduleResponse = await fetch(`./modules/${moduleName}/${moduleName}.js`);
                if (moduleResponse.ok) {
                    const moduleContent = await moduleResponse.text();
                    const serviceRegex = /(?:\/|["'])services\/([a-zA-Z0-9_-]+)/g;
                    let match;
                    while ((match = serviceRegex.exec(moduleContent)) !== null) {
                        discoveredServices.add(match[1]);
                    }
                }
            } catch (e) {
                // Skip this module
            }
        }

        // Only check for services that we have reason to believe might exist
        // based on imports or previous discovery
        const servicesToCheck = new Set();
        
        // Include essential ones
        ['theme', 'storage', 'api', 'jsonImport', 'discovery'].forEach(s => 
            servicesToCheck.add(s));
        
        // Include ones found in code
        discoveredServices.forEach(s => servicesToCheck.add(s));
        
        // Add any previously discovered services
        this.discoveredServices.forEach(s => servicesToCheck.add(s));
        
        // Create a controller to abort all requests after a timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        try {
            // Try checking each potential service directly - but only the ones that
            // we have good reason to think might exist
            await Promise.all(Array.from(servicesToCheck).map(async (serviceName) => {
                try {
                    // Try to fetch the service's main JS file
                    const jsResponse = await fetch(`./services/${serviceName}/${serviceName}.js`, {
                        method: 'HEAD',
                        signal: controller.signal,
                        cache: 'force-cache'
                    });
                    if (jsResponse.ok) {
                        discoveredServices.add(serviceName);
                    }
                } catch (e) {
                    // Skip this service - either doesn't exist or request was aborted
                }
            }));
        } finally {
            clearTimeout(timeoutId);
        }

        return Array.from(discoveredServices);
    }

    /**
     * Clears invalid modules and services that don't actually exist
     */
    async cleanupInvalidDiscoveries() {
        await this.validateDiscoveredItems();
        return {
            modules: this.discoveredModules.size,
            services: this.discoveredServices.size
        };
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

export default new DiscoveryService();
