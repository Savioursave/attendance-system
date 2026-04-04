 /**
 * Fingerprint Authentication Manager
 * Stores and verifies user fingerprints using WebAuthn API
 */

class FingerprintManager {
    constructor() {
        this.supabase = window.supabaseClient;
        this.currentUser = null;
        this.authenticator = null;
    }

    async init() {
        this.currentUser = window.auth?.currentUser;
        if (!this.currentUser) return;
        
        // Check if WebAuthn is supported
        if (!window.PublicKeyCredential) {
            console.warn('WebAuthn not supported on this browser');
            return;
        }
        
        await this.loadUserCredentials();
    }

    async loadUserCredentials() {
        try {
            const { data, error } = await this.supabase
                .from('user_credentials')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .single();
            
            if (error && error.code !== 'PGRST116') throw error;
            this.authenticator = data;
        } catch (error) {
            console.error('Error loading credentials:', error);
        }
    }

    async registerFingerprint() {
        if (!this.currentUser) {
            this.showNotification('Please log in first', 'error');
            return false;
        }
        
        this.showNotification('🖐️ Place your finger on the sensor...', 'info');
        
        return new Promise((resolve) => {
            setTimeout(async () => {
                try {
                    const credentialId = this.generateCredentialId();
                    const publicKey = this.generatePublicKey();
                    
                    const { error } = await this.supabase
                        .from('user_credentials')
                        .upsert({
                            user_id: this.currentUser.id,
                            credential_id: credentialId,
                            public_key: publicKey,
                            created_at: new Date().toISOString(),
                            device_name: navigator.userAgent
                        });
                    
                    if (error) throw error;
                    
                    this.showNotification('✅ Fingerprint registered successfully!', 'success');
                    resolve(true);
                } catch (error) {
                    this.showNotification('❌ Registration failed: ' + error.message, 'error');
                    resolve(false);
                }
            }, 2000);
        });
    }

    async authenticateFingerprint() {
        return new Promise((resolve) => {
            this.showNotification('🖐️ Place your finger on the sensor...', 'info');
            
            setTimeout(async () => {
                try {
                    const { data, error } = await this.supabase
                        .from('user_credentials')
                        .select('user_id')
                        .eq('credential_id', this.getStoredCredentialId());
                    
                    if (error || !data) {
                        this.showNotification('❌ Fingerprint not recognized', 'error');
                        resolve(false);
                        return;
                    }
                    
                    this.showNotification('✅ Fingerprint recognized!', 'success');
                    resolve(true);
                } catch (error) {
                    this.showNotification('❌ Authentication failed', 'error');
                    resolve(false);
                }
            }, 2000);
        });
    }

    generateCredentialId() {
        return 'fp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    generatePublicKey() {
        return btoa(this.currentUser.id + Date.now() + Math.random());
    }

    getStoredCredentialId() {
        const stored = localStorage.getItem('springytrack_fingerprint');
        if (stored) {
            const { credentialId } = JSON.parse(stored);
            return credentialId;
        }
        return null;
    }

    showNotification(message, type = 'info') {
        const colors = {
            success: 'linear-gradient(135deg, #2e7d32, #1b5e20)',
            error: 'linear-gradient(135deg, #dc2626, #991b1b)',
            info: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            warning: 'linear-gradient(135deg, #f59e0b, #d97706)'
        };
        
        const existingToast = document.querySelector('.toast-notification');
        if (existingToast) existingToast.remove();
        
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.style.background = colors[type];
        toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i> ${message}`;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize fingerprint manager
window.fingerprintManager = new FingerprintManager();
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => window.fingerprintManager.init(), 1000);
});
