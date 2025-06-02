export async function initializeServices() {
    const services = {};
    const serviceRegistry = {};
    
    try {
        // First, discover all services by looking for service.json files
        const serviceConfigs = await discoverServiceConfigs();
        
        // Sort services by dependencies to ensure proper initialization order
        const sortedServices = sortServicesByDependencies(serviceConfigs);
        
        // Initialize services in order
        for (const serviceName of sortedServices) {
            const serviceConfig = serviceConfigs[serviceName];
            
            try {
                console.log(`Loading service: ${serviceName}`);
                
                // Import the service module
                const serviceModule = await import(`../services/${serviceName}/${serviceName}.js`);
                
                if (serviceModule.default) {
                    const service = serviceModule.default;
                    services[serviceName] = service;
                    
                    // Store service metadata
                    serviceRegistry[serviceName] = {
                        name: serviceName,
                        ...serviceConfig,
                        instance: service
                    };
                    
                    // Initialize service if it has an init method
                    if (typeof service.init === 'function') {
                        console.log(`Initializing service: ${serviceName}`);
                        await service.init(serviceConfig.config || {});
                    }
                }
            } catch (err) {
                console.warn(`Failed to load service '${serviceName}':`, err);
            }
        }
        
        // Make the registry available on window for inter-service communication
        window.serviceRegistry = serviceRegistry;
        
        return services;
    } catch (error) {
        console.error('Error discovering services:', error);
        return services;
    }
}

async function discoverServiceConfigs() {
    const serviceConfigs = {};
    
    try {
        // Get the list of service names to try loading
        const serviceNames = await getServiceNames();
        
        for (const serviceName of serviceNames) {
            try {
                // Try to load the service.json file
                const configResponse = await fetch(`./services/${serviceName}/service.json`);
                
                if (configResponse.ok) {
                    const config = await configResponse.json();
                    serviceConfigs[serviceName] = {
                        name: serviceName,
                        ...config
                    };
                    console.log(`Discovered service with config: ${serviceName}`);
                } else {
                    // If no config found, create a default one if the JS file exists
                    const jsResponse = await fetch(`./services/${serviceName}/${serviceName}.js`, { method: 'HEAD' });
                    if (jsResponse.ok) {
                        serviceConfigs[serviceName] = {
                            name: serviceName,
                            version: "1.0.0",
                            description: `${serviceName} service`,
                            dependencies: [],
                            api: []
                        };
                        console.log(`Discovered service without config: ${serviceName}`);
                    }
                }
            } catch (err) {
                console.warn(`Failed to check service: ${serviceName}`, err);
            }
        }
        
        // If no services were found, return the default set
        if (Object.keys(serviceConfigs).length === 0) {
            console.warn('No services found, using default set');
            return getDefaultServiceConfigs();
        }
        
        return serviceConfigs;
    } catch (error) {
        console.error('Error discovering service configs:', error);
        return getDefaultServiceConfigs();
    }
}

async function getServiceNames() {
    // Start with a base set of essential services
    // The discovery service MUST be included first if available for bootstrap
    const serviceNames = ['discovery', 'theme', 'storage', 'api', 'jsonImport'];
    const discoveredServices = new Set(serviceNames);
    
    try {
        // Try loading from localStorage first if available
        if (window.localStorage) {
            try {
                const savedServices = localStorage.getItem('app_discoveredServices');
                if (savedServices) {
                    const parsedServices = JSON.parse(savedServices);
                    parsedServices.forEach(service => discoveredServices.add(service));
                    // If we already have saved services, skip probe checks
                    return Array.from(discoveredServices);
                }
            } catch (e) {
                console.warn('Failed to load discovered services from localStorage');
            }
        }
        
        // Check for services by looking at import statements in index.html and app.js
        // to avoid unnecessary HTTP requests
        try {
            // First check app.js for imported services
            const appResponse = await fetch('./app.js');
            if (appResponse.ok) {
                const appContent = await appResponse.text();
                // Look for imported services
                const serviceImportRegex = /(?:from|import).*['"]\.\.\/services\/([a-zA-Z0-9_-]+)/g;
                let match;
                while ((match = serviceImportRegex.exec(appContent)) !== null) {
                    if (match[1] && !discoveredServices.has(match[1])) {
                        discoveredServices.add(match[1]);
                    }
                }
            }
            
            // Next check index.html for script imports
            const indexResponse = await fetch('./index.html');
            if (indexResponse.ok) {
                const indexContent = await indexResponse.text();
                const scriptRegex = /src=["']services\/([a-zA-Z0-9_-]+)/g;
                let match;
                while ((match = scriptRegex.exec(indexContent)) !== null) {
                    if (match[1] && !discoveredServices.has(match[1])) {
                        discoveredServices.add(match[1]);
                    }
                }
            }
        } catch (e) {
            console.warn('Error checking for services in source files:', e);
        }
        
        // Only probe for additional services if we don't have many discovered yet
        // and browser supports AbortController for cleaner requests
        if (discoveredServices.size <= 5 && typeof AbortController !== 'undefined') {
            // Try checking for additional common services (limited list)
            const additionalServices = [
                'auth', 'user', 'config', 'logger'
            ];
            
            // Create a controller to abort all requests after a short timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 500); // 500ms timeout
            
            try {
                await Promise.all(additionalServices.map(async (serviceName) => {
                    if (!discoveredServices.has(serviceName)) {
                        try {
                            // Check if service exists by trying to fetch its main JS file
                            const response = await fetch(`./services/${serviceName}/${serviceName}.js`, {
                                method: 'HEAD',
                                signal: controller.signal,
                                // Cache the result to avoid additional network requests
                                cache: 'force-cache'
                            });
                            
                            if (response.ok) {
                                discoveredServices.add(serviceName);
                            }
                        } catch (e) {
                            // Silently ignore - service doesn't exist or request was aborted
                            if (e.name !== 'AbortError') {
                                // Log only if it's not an abort error (which we expect)
                                console.debug(`Service check for ${serviceName} failed:`, e);
                            }
                        }
                    }
                }));
            } finally {
                clearTimeout(timeoutId);
            }
        }
    } catch (e) {
        console.warn('Error during service discovery:', e);
    }
    
    return Array.from(discoveredServices);
}

function getDefaultServiceConfigs() {
    return {
        theme: {
            name: "theme",
            version: "1.0.0",
            description: "Theme management service",
            dependencies: []
        },
        storage: {
            name: "storage",
            version: "1.0.0",
            description: "Local storage service",
            dependencies: []
        },
        api: {
            name: "api",
            version: "1.0.0",
            description: "API service",
            dependencies: []
        },
        jsonImport: {
            name: "jsonImport",
            version: "1.0.0", 
            description: "JSON import service",
            dependencies: []
        }
    };
}

function sortServicesByDependencies(serviceConfigs) {
    const resolved = [];
    const unresolved = Object.keys(serviceConfigs);
    
    // Place discovery service first if present
    if (unresolved.includes('discovery')) {
        resolved.push('discovery');
        unresolved.splice(unresolved.indexOf('discovery'), 1);
    }
    
    // Simple topological sort
    function resolve(serviceName, ancestors = []) {
        // Check if already resolved
        if (resolved.includes(serviceName)) {
            return;
        }
        
        // Check for circular dependencies
        if (ancestors.includes(serviceName)) {
            console.error(`Circular dependency detected: ${ancestors.join(' -> ')} -> ${serviceName}`);
            return;
        }
        
        // Get config
        const config = serviceConfigs[serviceName];
        
        // If no dependencies, or dependencies array is empty
        if (!config || !config.dependencies || config.dependencies.length === 0) {
            if (!resolved.includes(serviceName)) {
                resolved.push(serviceName);
            }
            return;
        }
        
        // Resolve dependencies first
        const newAncestors = [...ancestors, serviceName];
        for (const dep of config.dependencies) {
            if (serviceConfigs[dep]) {
                resolve(dep, newAncestors);
            } else {
                console.warn(`Service ${serviceName} depends on ${dep}, but it's not available`);
            }
        }
        
        // Then resolve this service
        if (!resolved.includes(serviceName)) {
            resolved.push(serviceName);
        }
    }
    
    // Resolve all services
    while (unresolved.length > 0) {
        resolve(unresolved[0]);
        unresolved.shift();
    }
    
    return resolved;
}
