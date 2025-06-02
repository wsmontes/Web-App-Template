export class Router {
    constructor() {
        this.routes = {};
        this.currentModule = null;
        this.container = null;
        this.defaultRoute = '/home';
        this.redirects = {};
    }

    init(modules) {
        this.container = document.getElementById('app-container');
        this.modules = modules;
        
        // Register modules as routes and process module configs
        Object.keys(modules).forEach(moduleName => {
            const module = modules[moduleName];
            this.routes[moduleName] = module;
            
            // Add module redirects and defaults from config if available
            if (module._config && module._config.routes) {
                module._config.routes.forEach(route => {
                    if (route.redirectTo) {
                        this.redirects[route.path] = route.redirectTo;
                    }
                    
                    if (route.default) {
                        this.defaultRoute = route.path || `/${moduleName}`;
                    }
                });
            }
        });
        
        // Listen for hash changes
        window.addEventListener('hashchange', () => this.handleRouteChange());
        
        // Initial route handling
        this.handleRouteChange();
    }

    handleRouteChange() {
        // Get the current hash without the # symbol
        const hash = window.location.hash.substring(1) || '/';
        
        // Check for redirects
        if (this.redirects[hash]) {
            window.location.hash = this.redirects[hash];
            return;
        }
        
        const path = hash.substring(hash.indexOf('/') + 1) || 'home';
        const moduleName = path.split('/')[0];
        
        if (this.routes[moduleName]) {
            this.loadModule(moduleName);
        } else {
            // Try using the default route
            const defaultModule = this.defaultRoute.substring(this.defaultRoute.indexOf('/') + 1) || 'home';
            this.loadModule(defaultModule) || this.showNotFound();
        }
    }

    async loadModule(moduleName) {
        if (!this.modules[moduleName]) {
            return false;
        }
        
        try {
            // Unload current module if exists
            if (this.currentModule && this.currentModule.onUnmount) {
                this.currentModule.onUnmount();
            }
            
            // Clear container
            this.container.innerHTML = '<div class="module-loading">Loading...</div>';
            
            // Load new module
            const module = this.modules[moduleName];
            this.currentModule = module;
            
            // Fetch module template
            const response = await fetch(`modules/${moduleName}/${moduleName}.html`);
            if (!response.ok) {
                throw new Error(`Failed to load ${moduleName} template`);
            }
            
            const html = await response.text();
            this.container.innerHTML = html;
            
            // Initialize module
            if (module.onMount) {
                module.onMount(this.container);
            }
            
            // Update active navigation item
            this.updateActiveNavItem(moduleName);
            
            return true;
        } catch (error) {
            console.error(`Error loading module '${moduleName}':`, error);
            return false;
        }
    }

    updateActiveNavItem(moduleName) {
        // Remove active class from all nav items
        const navLinks = document.querySelectorAll('.main-nav a');
        navLinks.forEach(link => {
            link.classList.remove('active');
        });
        
        // Add active class to current nav item
        const currentLink = document.querySelector(`.main-nav a[href="#/${moduleName}"]`);
        if (currentLink) {
            currentLink.classList.add('active');
        }
    }

    showNotFound() {
        this.container.innerHTML = `
            <div class="not-found">
                <h1>404</h1>
                <p>Page not found</p>
                <a href="#/home">Go to Home</a>
            </div>
        `;
    }
}
