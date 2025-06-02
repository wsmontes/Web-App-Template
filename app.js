import { ModuleLoader } from './core/loader.js';
import { Router } from './core/router.js';
import { initializeServices } from './core/service-manager.js';

class App {
    constructor() {
        this.router = new Router();
        this.moduleLoader = new ModuleLoader();
        
        // Initialize event listeners
        this.initEventListeners();
        
        // Set current year in footer
        document.getElementById('current-year').textContent = new Date().getFullYear();
    }

    async init() {
        try {
            // Show loading indicator
            const loader = document.querySelector('.loader');
            if (loader) loader.setAttribute('aria-busy', 'true');
            
            // Initialize all services first
            const services = await initializeServices();
            console.log('Services initialized:', Object.keys(services));
            
            // Load all modules
            const modules = await this.moduleLoader.loadModules();
            console.log('Modules loaded:', Object.keys(modules));
            
            // Initialize router with loaded modules
            this.router.init(modules);
            
            // Remove loading indicator
            if (loader) {
                loader.style.display = 'none';
                loader.setAttribute('aria-busy', 'false');
            }
        } catch (error) {
            console.error('Application initialization failed:', error);
            this.showErrorMessage('Failed to load application. Please try refreshing the page.');
        }
    }
    
    initEventListeners() {
        // Listen for theme changes
        window.addEventListener('themeChanged', (e) => {
            document.body.setAttribute('data-theme', e.detail.theme);
        });
        
        // Toggle mobile menu functionality
        const menuToggle = document.querySelector('.menu-toggle');
        const mainNav = document.querySelector('.main-nav');
        
        if (menuToggle && mainNav) {
            menuToggle.addEventListener('click', () => {
                const isExpanded = mainNav.classList.toggle('active');
                menuToggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
            });
            
            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!menuToggle.contains(e.target) && !mainNav.contains(e.target) && mainNav.classList.contains('active')) {
                    mainNav.classList.remove('active');
                    menuToggle.setAttribute('aria-expanded', 'false');
                }
            });
        }
    }
    
    showErrorMessage(message) {
        const appContainer = document.getElementById('app-container');
        if (appContainer) {
            appContainer.innerHTML = `
                <div class="error-message" role="alert">
                    <h2>Error</h2>
                    <p>${message}</p>
                    <button onclick="window.location.reload()">Retry</button>
                </div>
            `;
        }
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});
