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
        // Get list of service directories
        const response = await fetch('./services/');
        const directoryText = await response.text();
        
        // Extract directory names from HTML listing
        const dirRegex = /<a[^>]*href="([^"\/]+)\/"[^>]*>/g;
        let match;
        
        // For each potential service directory
        while ((match = dirRegex.exec(directoryText)) !== null) {
            const serviceName = match[1];
            if (serviceName.startsWith('.')) continue; // Skip hidden directories
            
            try {
                // Try to load the service.json file
                const configResponse = await fetch(`./services/${serviceName}/service.json`);
                
                if (configResponse.ok) {
                    const config = await configResponse.json();
                    serviceConfigs[serviceName] = {
                        name: serviceName,
                        ...config
                    };
                }
            } catch (err) {
                console.warn(`No service.json found for ${serviceName}`);
            }
        }
        
        // Fallback for direct loading of known services if directory listing fails
        if (Object.keys(serviceConfigs).length === 0) {
            const knownServices = ['theme', 'storage', 'api', 'jsonImport'];
            
            for (const serviceName of knownServices) {
                try {
                    const configResponse = await fetch(`./services/${serviceName}/service.json`);
                    if (configResponse.ok) {
                        const config = await configResponse.json();
                        serviceConfigs[serviceName] = {
                            name: serviceName,
                            ...config
                        };
                    }
                } catch (err) {
                    // Create default configs if not found
                    serviceConfigs[serviceName] = {
                        name: serviceName,
                        version: "1.0.0",
                        description: `${serviceName} service`,
                        dependencies: [],
                        api: []
                    };
                }
            }
        }
        
        return serviceConfigs;
    } catch (error) {
        console.error('Error loading service configs:', error);
        
        // Return minimal default configs to allow the app to function
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
}

function sortServicesByDependencies(serviceConfigs) {
    const resolved = [];
    const unresolved = Object.keys(serviceConfigs);
    
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
