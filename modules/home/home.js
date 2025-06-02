import themeService from '../../services/theme/theme.js';

export default class HomeModule {
    constructor() {
        this.title = 'Home';
    }
    
    onMount(container) {
        console.log('Home module mounted');
        
        // Get references to DOM elements
        const themeToggle = container.querySelector('.theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', this.toggleTheme);
        }
        
        // Add any other event listeners specific to this module
        const featureCards = container.querySelectorAll('.feature-card');
        featureCards.forEach(card => {
            card.addEventListener('click', () => {
                card.classList.toggle('active');
            });
        });
    }
    
    onUnmount() {
        console.log('Home module unmounted');
        // Clean up any event listeners or resources
    }
    
    toggleTheme() {
        // Use the theme service instead of direct DOM manipulation
        themeService.toggleTheme();
    }
}
