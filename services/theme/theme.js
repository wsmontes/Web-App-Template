class ThemeService {
    constructor() {
        this.currentTheme = 'light';
        this.storageAvailable = this.isStorageAvailable('localStorage');
    }
    
    init() {
        // Try to load saved theme from localStorage if available
        let savedTheme = null;
        
        if (this.storageAvailable) {
            savedTheme = localStorage.getItem('theme');
        }
        
        // Check for system preference if no saved theme
        if (!savedTheme) {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            this.currentTheme = prefersDark ? 'dark' : 'light';
        } else {
            this.currentTheme = savedTheme;
        }
        
        // Apply initial theme
        this.applyTheme(this.currentTheme);
        
        // Listen for system theme changes
        const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        
        // Use the appropriate event listener method based on browser support
        if (darkModeMediaQuery.addEventListener) {
            darkModeMediaQuery.addEventListener('change', e => this.handleSystemThemeChange(e));
        } else if (darkModeMediaQuery.addListener) {
            // For older browsers
            darkModeMediaQuery.addListener(e => this.handleSystemThemeChange(e));
        }
        
        console.log('Theme service initialized with theme:', this.currentTheme);
        return Promise.resolve();
    }
    
    handleSystemThemeChange(e) {
        if (!this.storageAvailable || !localStorage.getItem('theme')) {
            // Only auto-switch if user hasn't manually set a theme
            const newTheme = e.matches ? 'dark' : 'light';
            this.setTheme(newTheme);
        }
    }
    
    applyTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        // Update meta theme-color for mobile browsers
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', 
                theme === 'dark' ? '#111827' : '#ffffff');
        }
    }
    
    setTheme(theme) {
        this.currentTheme = theme;
        this.applyTheme(theme);
        
        if (this.storageAvailable) {
            try {
                localStorage.setItem('theme', theme);
            } catch (e) {
                console.warn('Failed to save theme preference:', e);
            }
        }
        
        // Dispatch theme change event
        window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
    }
    
    toggleTheme() {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
        return newTheme;
    }
    
    getCurrentTheme() {
        return this.currentTheme;
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

export default new ThemeService();
