/**
 * Biometric Authentication Module
 * Uses WebAuthn API for fingerprint authentication
 */

class BiometricAuth {
    constructor() {
        this.supabase = window.supabaseClient;
        this.isSupported = false;
        this.checkSupport();
    }

    async checkSupport() {
        this.isSupported = window.PublicKeyCredential !== undefined;
        if (!this.isSupported) {
            console.warn('WebAuthn not supported in this browser');
        }
        return this.isSupported;
    }

    async isBiometricAvailable() {
        if (!this.isSupported) return false;
        
        try {
            const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            return available;
        } catch (error) {
            console.error('Error checking biometric availability:', error);
            return false;
        }
    }

    async hasBiometricCredential() {
        const userId = localStorage.getItem('biometric_user_id');
        const userEmail = localStorage.getItem('biometric_user_email');
        
        if (!userId && !userEmail) return false;
        
        try {
            const { data, error } = await this.supabase
                .from('biometric_credentials')
                .select('id')
                .eq('user_id', userId || userEmail)
                .single();
            
            return !error && data !== null;
        } catch (error) {
            return false;
        }
    }

    async register(userEmail, userId) {
        try {
            if (!this.isSupported) {
                throw new Error('WebAuthn not supported in this browser');
            }

            const available = await this.isBiometricAvailable();
            if (!available) {
                throw new Error('Biometric authentication not available on this device');
            }

            // Generate a random user ID for WebAuthn
            const webAuthnUserId = new Uint8Array(16);
            crypto.getRandomValues(webAuthnUserId);

            // Create credential
            const publicKeyCredentialCreationOptions = {
                challenge: new Uint8Array(32),
                rp: {
                    name: 'Springytrack',
                    id: window.location.hostname
                },
                user: {
                    id: webAuthnUserId,
                    name: userEmail,
                    displayName: userEmail
                },
                pubKeyCredParams: [
                    { type: 'public-key', alg: -7 },
                    { type: 'public-key', alg: -257 }
                ],
                authenticatorSelection: {
                    authenticatorAttachment: 'platform',
                    userVerification: 'required',
                    residentKey: 'preferred'
                },
                timeout: 60000,
                attestation: 'none'
            };

            // Generate challenge
            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);
            publicKeyCredentialCreationOptions.challenge = challenge;

            // Create credential
            const credential = await navigator.credentials.create({
                publicKey: publicKeyCredentialCreationOptions
            });

            if (!credential) {
                throw new Error('Failed to create credential');
            }

            // Store credential reference in database
            const { error } = await this.supabase
                .from('biometric_credentials')
                .upsert({
                    user_id: userId,
                    user_email: userEmail,
                    credential_id: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
                    public_key: btoa(String.fromCharCode(...new Uint8Array(credential.response.getPublicKey()))),
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;

            // Store in localStorage
            localStorage.setItem('biometric_user_id', userId);
            localStorage.setItem('biometric_user_email', userEmail);
            localStorage.setItem('biometric_registered', 'true');

            return { success: true };
        } catch (error) {
            console.error('Biometric registration error:', error);
            return { success: false, error: error.message };
        }
    }

    async authenticate() {
        try {
            if (!this.isSupported) {
                throw new Error('WebAuthn not supported in this browser');
            }

            const hasCredential = await this.hasBiometricCredential();
            if (!hasCredential) {
                throw new Error('No biometric credential registered. Please login with password first.');
            }

            // Get credential ID from database
            const userId = localStorage.getItem('biometric_user_id');
            const { data: credentialData, error } = await this.supabase
                .from('biometric_credentials')
                .select('credential_id')
                .eq('user_id', userId)
                .single();

            if (error || !credentialData) {
                throw new Error('Credential not found');
            }

            // Prepare assertion options
            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);

            const allowCredential = {
                id: Uint8Array.from(atob(credentialData.credential_id), c => c.charCodeAt(0)),
                type: 'public-key'
            };

            const publicKeyCredentialRequestOptions = {
                challenge: challenge,
                allowCredentials: [allowCredential],
                timeout: 60000,
                userVerification: 'required',
                rpId: window.location.hostname
            };

            // Get assertion
            const assertion = await navigator.credentials.get({
                publicKey: publicKeyCredentialRequestOptions
            });

            if (!assertion) {
                throw new Error('Authentication failed');
            }

            return { success: true };
        } catch (error) {
            console.error('Biometric authentication error:', error);
            
            if (error.name === 'NotAllowedError') {
                return { success: false, error: 'Authentication cancelled', cancelled: true };
            }
            
            return { success: false, error: error.message };
        }
    }

    async removeCredential(userId) {
        try {
            const { error } = await this.supabase
                .from('biometric_credentials')
                .delete()
                .eq('user_id', userId);

            if (error) throw error;

            localStorage.removeItem('biometric_user_id');
            localStorage.removeItem('biometric_user_email');
            localStorage.removeItem('biometric_registered');

            return { success: true };
        } catch (error) {
            console.error('Error removing biometric credential:', error);
            return { success: false, error: error.message };
        }
    }
}

// Initialize biometric authentication
window.biometricAuth = new BiometricAuth();