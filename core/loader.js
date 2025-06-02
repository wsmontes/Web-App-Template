export class ModuleLoader {
    constructor() {
        this.modules = {};
        this.moduleConfigs = {};
    }
    
    async loadModules() {
        try {
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
            // Try directory listing approach
            const response = await fetch('./modules/');
            const directoryText = await response.text();
            
            // Extract directory names from HTML listing
            const dirRegex = /<a[^>]*href="([^"\/]+)\/"[^>]*>/g;
            let match;
            
            // For each potential module directory
            while ((match = dirRegex.exec(directoryText)) !== null) {
                const moduleName = match[1];
                if (moduleName.startsWith('.')) continue; // Skip hidden directories
                
                try {
                    // Try to load the module.json file
                    const configResponse = await fetch(`./modules/${moduleName}/module.json`);
                    
                    if (configResponse.ok) {
                        const config = await configResponse.json();
                        moduleConfigs[moduleName] = {
                            name: moduleName,
                            ...config
                        };
                    }
                } catch (err) {
                    console.warn(`No module.json found for ${moduleName}, trying to load anyway`);
                    
                    // Try to see if the module JS file exists
                    try {
                        const jsExists = await fetch(`./modules/${moduleName}/${moduleName}.js`, {
                            method: 'HEAD'
                        });
                        
                        if (jsExists.ok) {
                            moduleConfigs[moduleName] = {
                                name: moduleName,
                                title: this.capitalizeFirstLetter(moduleName),
                                version: "1.0.0",
                                description: `${this.capitalizeFirstLetter(moduleName)} module`
                            };
                        }
                    } catch (jsErr) {
                        // Skip this module
                    }
                }
            }
            
            // Fallback to known modules if directory listing fails
            if (Object.keys(moduleConfigs).length === 0) {
                const knownModules = ['home', 'settings'];
                
                for (const moduleName of knownModules) {
                    try {
                        const configResponse = await fetch(`./modules/${moduleName}/module.json`);
                        
                        if (configResponse.ok) {
                            const config = await configResponse.json();
                            moduleConfigs[moduleName] = {
                                name: moduleName,
                                ...config
                            };
                        } else {
                            // Add default config
                            moduleConfigs[moduleName] = {
                                name: moduleName,
                                title: this.capitalizeFirstLetter(moduleName),
                                version: "1.0.0",
                                navItem: true,
                                description: `${this.capitalizeFirstLetter(moduleName)} module`
                            };
                        }
                    } catch (err) {
                        // Add default config
                        moduleConfigs[moduleName] = {
                            name: moduleName,
                            title: this.capitalizeFirstLetter(moduleName),
                            version: "1.0.0",
                            navItem: true,
                            description: `${this.capitalizeFirstLetter(moduleName)} module`
                        };
                    }
                }
            }
            
            return moduleConfigs;
        } catch (error) {
            console.error('Error discovering module configs:', error);
            
            // Return minimal defaults
            return {
                home: {
                    name: "home",
                    title: "Home",
                    version: "1.0.0",
                    navItem: true,
                    description: "Home module"
                }
            };
        }
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
