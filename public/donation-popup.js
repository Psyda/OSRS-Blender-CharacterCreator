/**
 * donation-popup.js
 * Handles the donation popup system for the RuneScape Outfit Viewer
 */

class DonationPopup {
    constructor() {
        this.overlay = null;
        this.timer = null;
        this.countdownInterval = null;
        this.storageKey = 'psyda_donation_popup_shown';
        this.isLoaded = false;
    }

    /**
     * Initialize the donation popup system
     */
    async init() {
        try {
            await this.loadPopupHTML();
            this.setupEventListeners();
            this.isLoaded = true;
            
            // Show popup automatically if user hasn't seen it before
            if (!this.hasUserSeenPopup()) {
                this.showPopup(true); // true = show with timer
            }
        } catch (error) {
            console.error('Failed to initialize donation popup:', error);
        }
    }

    /**
     * Load the popup HTML from external file
     */
    async loadPopupHTML() {
        try {
            const response = await fetch('./donation-popup.html');
            if (!response.ok) {
                throw new Error(`Failed to load donation popup: ${response.status}`);
            }
            
            const htmlContent = await response.text();
            
            // Create a temporary container to parse the HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlContent;
            
            // Extract the overlay element
            this.overlay = tempDiv.querySelector('#donationOverlay');
            if (!this.overlay) {
                throw new Error('Donation overlay not found in popup HTML');
            }
            
            // Initially hide the popup
            this.overlay.style.display = 'none';
            
            // Append to body
            document.body.appendChild(this.overlay);
            
        } catch (error) {
            console.error('Error loading donation popup HTML:', error);
            throw error;
        }
    }

    /**
     * Setup event listeners for popup interactions
     */
    setupEventListeners() {
        if (!this.overlay) return;

        const closeBtn = this.overlay.querySelector('#donationCloseBtn');
        const maybeLaterBtn = this.overlay.querySelector('#donationMaybeLater');
        
        // Close button handler
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hidePopup();
                this.markAsShown();
            });
        }

        // Maybe later button handler
        if (maybeLaterBtn) {
            maybeLaterBtn.addEventListener('click', () => {
                this.hidePopup();
                this.markAsShown();
            });
        }

        // Close on overlay click (outside popup)
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                const closeBtn = this.overlay.querySelector('#donationCloseBtn');
                if (closeBtn && !closeBtn.disabled) {
                    this.hidePopup();
                    this.markAsShown();
                }
            }
        });

        // Escape key handler
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible()) {
                const closeBtn = this.overlay.querySelector('#donationCloseBtn');
                if (closeBtn && !closeBtn.disabled) {
                    this.hidePopup();
                    this.markAsShown();
                }
            }
        });
    }

    /**
     * Show the donation popup
     * @param {boolean} withTimer - Whether to show the countdown timer
     */
    showPopup(withTimer = false) {
        if (!this.overlay) {
            console.error('Donation popup not loaded');
            return;
        }

        this.overlay.style.display = 'flex';
        
        if (withTimer) {
            this.startCountdown();
        } else {
            this.enableCloseButtons();
            this.hideTimer();
        }
    }

    /**
     * Hide the donation popup
     */
    hidePopup() {
        if (!this.overlay) return;
        
        this.overlay.style.display = 'none';
        this.clearCountdown();
    }

    /**
     * Check if popup is currently visible
     */
    isVisible() {
        return this.overlay && this.overlay.style.display !== 'none';
    }

    /**
     * Start the 5-second countdown timer
     */
    startCountdown() {
        const closeBtn = this.overlay.querySelector('#donationCloseBtn');
        const maybeLaterBtn = this.overlay.querySelector('#donationMaybeLater');
        const timerElement = this.overlay.querySelector('#donationTimer');
        const countdownElement = this.overlay.querySelector('#donationCountdown');
        
        if (!closeBtn || !timerElement || !countdownElement) return;

        // Disable both buttons and show timer
        closeBtn.disabled = true;
        if (maybeLaterBtn) maybeLaterBtn.disabled = true;
        timerElement.style.display = 'block';
        
        let timeLeft = 5;
        countdownElement.textContent = timeLeft;

        this.countdownInterval = setInterval(() => {
            timeLeft--;
            countdownElement.textContent = timeLeft;
            
            if (timeLeft <= 0) {
                this.enableCloseButtons();
                this.hideTimer();
                this.clearCountdown();
            }
        }, 1000);
    }

    /**
     * Enable the close buttons
     */
    enableCloseButtons() {
        const closeBtn = this.overlay.querySelector('#donationCloseBtn');
        const maybeLaterBtn = this.overlay.querySelector('#donationMaybeLater');
        
        if (closeBtn) {
            closeBtn.disabled = false;
        }
        if (maybeLaterBtn) {
            maybeLaterBtn.disabled = false;
        }
    }

    /**
     * Hide the countdown timer
     */
    hideTimer() {
        const timerElement = this.overlay.querySelector('#donationTimer');
        if (timerElement) {
            timerElement.style.display = 'none';
        }
    }

    /**
     * Clear the countdown interval
     */
    clearCountdown() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
    }

    /**
     * Check if user has already seen the popup
     */
    hasUserSeenPopup() {
        try {
            return localStorage.getItem(this.storageKey) === 'true';
        } catch (error) {
            console.warn('Unable to access localStorage for donation popup flag');
            return false;
        }
    }

    /**
     * Mark the popup as shown for this user
     */
    markAsShown() {
        try {
            localStorage.setItem(this.storageKey, 'true');
        } catch (error) {
            console.warn('Unable to save donation popup flag to localStorage');
        }
    }

    /**
     * Reset the popup flag (for testing purposes)
     */
    resetPopupFlag() {
        try {
            localStorage.removeItem(this.storageKey);
            console.log('Donation popup flag reset');
        } catch (error) {
            console.warn('Unable to remove donation popup flag from localStorage');
        }
    }

    /**
     * Show the popup manually (for About button)
     */
    showAboutPopup() {
        this.showPopup(false); // No timer for manual show
    }

    /**
     * Cleanup method
     */
    destroy() {
        this.clearCountdown();
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
        this.overlay = null;
        this.isLoaded = false;
    }
}

// Global instance
window.donationPopup = new DonationPopup();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.donationPopup.init();
    });
} else {
    window.donationPopup.init();
}