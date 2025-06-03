export class ModuleLoader {
    constructor() {
        this.modules = {};
        this.moduleConfigs = {};
        this.discoveryService = null;
    }
    
    async loadModules() {
        try {
            // Get discovery service if available
            if (window.serviceRegistry && window.serviceRegistry.discovery) {
                this.discoveryService = window.serviceRegistry.discovery.instance;
                
                // Run a quick discovery scan to find any new modules
                if (this.discoveryService && typeof this.discoveryService.discoverNewModules === 'function') {
                    console.log('Running module discovery scan to find new modules...');
                    await this.discoveryService.discoverNewModules();
                }
            }
            
            // Discover module configs first
            this.moduleConfigs = await this.discoverModuleConfigs();
            
            // Load modules based on their configs
            for (const moduleName of Object.keys(this.moduleConfigs)) {
                try {
                    console.log(`Loading module: ${moduleName}`);
                    const moduleConfig = this.moduleConfigs[moduleName];
                    
                    // Check if all required services are available
                    if (moduleConfig.requiredServices && Array.isArray(moduleConfig.requiredServices)) {
                        const serviceRegistry = window.serviceRegistry || {};
                        const missingServices = moduleConfig.requiredServices.filter(
                            service => !serviceRegistry[service]
                        );
                        
                        if (missingServices.length > 0) {
                            console.warn(
                                `Module ${moduleName} requires services that are not available:`,
                                missingServices
                            );
                            continue; // Skip this module
                        }
                    }
                    
                    // Load the module
                    const moduleModule = await import(`../modules/${moduleName}/${moduleName}.js`);
                    
                    if (moduleModule.default) {
                        const moduleInstance = new moduleModule.default();
                        
                        // Attach config to the module
                        moduleInstance._config = moduleConfig;
                        
                        // Add standard properties from config if not already defined
                        if (moduleConfig.title && !moduleInstance.title) {
                            moduleInstance.title = moduleConfig.title;
                        }
                        
                        if (moduleConfig.navItem !== undefined && !moduleInstance.hasOwnProperty('navItem')) {
                            moduleInstance.navItem = moduleConfig.navItem;
                        }
                        
                        this.modules[moduleName] = moduleInstance;
                        console.log(`Module '${moduleName}' loaded successfully`);
                        
                        // Register with discovery service
                        if (this.discoveryService && typeof this.discoveryService.addDiscoveredModule === 'function') {
                            this.discoveryService.addDiscoveredModule(moduleName);
                        }
                    }
                } catch (moduleError) {
                    console.error(`Failed to load module '${moduleName}':`, moduleError);
                }
            }
            
            // Update navigation menu
            this.updateNavigation();
            
            return this.modules;
        } catch (error) {
            console.error('Error loading modules:', error);
            return this.modules;
        }
    }
    
    async discoverModuleConfigs() {
        const moduleConfigs = {};
        
        try {
            // Get list of module names to check
            const moduleNames = await this.getModuleNames();
            
            // Try to load configs for each module
            for (const moduleName of moduleNames) {
                try {
                    // Try to load the module.json file
                    const configResponse = await fetch(`./modules/${moduleName}/module.json`, {
                        cache: 'no-store' // Prevent caching to ensure we get the latest version
                    });
                    
                    if (configResponse.ok) {
                        const config = await configResponse.json();
                        moduleConfigs[moduleName] = {
                            name: moduleName,
                            ...config
                        };
                        console.log(`Discovered module with config: ${moduleName}`);
                    } else {
                        // Check if the module files exist to create a default config
                        try {
                            const jsExists = await fetch(`./modules/${moduleName}/${moduleName}.js`, {
                                method: 'HEAD',
                                cache: 'no-store'
                            });
                            
                            const htmlExists = await fetch(`./modules/${moduleName}/${moduleName}.html`, {
                                method: 'HEAD',
                                cache: 'no-store'
                            });
                            
                            if (jsExists.ok && htmlExists.ok) {
                                moduleConfigs[moduleName] = {
                                    name: moduleName,
                                    title: this.capitalizeFirstLetter(moduleName),
                                    version: "1.0.0",
                                    navItem: true,
                                    description: `${this.capitalizeFirstLetter(moduleName)} module`
                                };
                                console.log(`Discovered module without config: ${moduleName}`);
                            }
                        } catch (jsErr) {
                            // Skip this module
                        }
                    }
                } catch (err) {
                    // Skip this module
                }
            }
            
            // If no modules found, use defaults
            if (Object.keys(moduleConfigs).length === 0) {
                console.warn('No modules discovered, using defaults');
                return this.getDefaultModuleConfigs();
            }
            
            return moduleConfigs;
        } catch (error) {
            console.error('Error discovering module configs:', error);
            return this.getDefaultModuleConfigs();
        }
    }
    
    async getModuleNames() {
        // Start with essential modules
        const moduleNames = ['home', 'settings'];
        const discoveredModules = new Set(moduleNames);
        
        try {
            // Try loading from localStorage first if available
            if (window.localStorage) {
                try {
                    const savedModules = localStorage.getItem('app_discoveredModules');
                    if (savedModules) {
                        const parsedModules = JSON.parse(savedModules);
                        parsedModules.forEach(module => discoveredModules.add(module));
                        // If we have stored modules, skip further checks to avoid HTTP errors
                        if (parsedModules.length > 0) {
                            return Array.from(discoveredModules);
                        }
                    }
                } catch (e) {
                    console.warn('Failed to load discovered modules from localStorage');
                }
            }
            
            // If discovery service is available, use it
            if (window.serviceRegistry && window.serviceRegistry.discovery) {
                const discoveryService = window.serviceRegistry.discovery.instance;
                const discoveredModulesList = discoveryService.getDiscoveredModules();
                discoveredModulesList.forEach(module => discoveredModules.add(module));
                
                // If we have modules from the discovery service, use those
                if (discoveredModulesList.length > 0) {
                    return Array.from(discoveredModules);
                }
            }
            
            // Only try to scan for modules if we need to
            // Smart check for modules by looking at HTML/JS code instead of HTTP probing
            try {
                // Check for module links in index.html
                const indexResponse = await fetch('./index.html');
                if (indexResponse.ok) {
                    const htmlContent = await indexResponse.text();
                    const linkRegex = /href=["']#\/([a-zA-Z0-9_-]+)/g;
                    let match;
                    while ((match = linkRegex.exec(htmlContent)) !== null) {
                        const moduleName = match[1];
                        if (moduleName && !moduleName.includes('/')) {
                            discoveredModules.add(moduleName);
                        }
                    }
                }
            } catch (e) {
                console.warn('Failed to check index.html for modules');
            }
            
            // Only try these checks as a last resort and only for a few modules
            if (discoveredModules.size <= 2) {
                // Try checking for a few additional common modules
                const additionalModules = [
                    'about', 'profile', 'dashboard'
                ];
                
                // Create a controller to abort all requests after a timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1000);
                
                try {
                    await Promise.all(additionalModules.map(async (moduleName) => {
                        if (!discoveredModules.has(moduleName)) {
                            try {
                                // Check if module exists with a single HEAD request
                                const response = await fetch(`./modules/${moduleName}/`, {
                                    method: 'HEAD',
                                    signal: controller.signal,
                                    cache: 'force-cache'
                                });
                                
                                if (response.ok) {
                                    discoveredModules.add(moduleName);
                                }
                            } catch (e) {
                                // Module doesn't exist or can't be accessed - silently ignore
                            }
                        }
                    }));
                } finally {
                    clearTimeout(timeoutId);
                }
            }
        } catch (e) {
            console.warn('Error during module discovery:', e);
        }
        
        return Array.from(discoveredModules);
    }
    
    getDefaultModuleConfigs() {
        return {
            home: {
                name: "home",
                title: "Home",
                version: "1.0.0",
                navItem: true,
                description: "Home module"
            },
            settings: {
                name: "settings",
                title: "Settings",
                version: "1.0.0",
                navItem: true,
                description: "Settings module"
            }
        };
    }
    
    updateNavigation() {
        const nav = document.querySelector('.main-nav');
        if (!nav) return;
        
        // Clear existing navigation
        nav.innerHTML = '';
        
        // Create navigation list
        const navList = document.createElement('ul');
        
        // First, collect all modules with navigation information
        const navModules = Object.entries(this.modules)
            .filter(([name, module]) => {
                // Check if module should appear in navigation
                if (module.hasOwnProperty('navItem')) {
                    return module.navItem !== false;
                }
                
                // Check module config
                const config = this.moduleConfigs[name];
                return !config || config.navItem !== false;
            })
            .sort((a, b) => {
                // Sort by order if specified in config
                const orderA = this.moduleConfigs[a[0]]?.navOrder || 999;
                const orderB = this.moduleConfigs[b[0]]?.navOrder || 999;
                
                // Place home first if no explicit order
                if (a[0] === 'home' && !this.moduleConfigs.home?.navOrder) return -1;
                if (b[0] === 'home' && !this.moduleConfigs.home?.navOrder) return 1;
                
                return orderA - orderB;
            });
        
        // Add each module to navigation
        navModules.forEach(([moduleName, module]) => {
            const item = document.createElement('li');
            const link = document.createElement('a');
            
            const config = this.moduleConfigs[moduleName];
            const title = module.title || config?.title || this.capitalizeFirstLetter(moduleName);
            
            link.href = `#/${moduleName}`;
            link.textContent = title;
            
            item.appendChild(link);
            navList.appendChild(item);
        });
        
        nav.appendChild(navList);
    }
    
    capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }
}
