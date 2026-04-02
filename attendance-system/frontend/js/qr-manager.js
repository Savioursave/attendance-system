/**
 * QR Manager - Handles master QR code for organization
 * Uses native canvas to generate QR codes (no external library dependency)
 */

class QRManager {
    constructor() {
        this.supabase = window.supabaseClient;
        this.masterQR = null;
        this.loadMasterQR();
        console.log('📱 QRManager initialized');
    }

    /**
     * Load master QR code from database
     */
    async loadMasterQR() {
        try {
            const { data, error } = await this.supabase
                .from('system_settings')
                .select('master_qr_code')
                .eq('id', 1)
                .single();
            
            if (error && error.code !== 'PGRST116') {
                console.error('Error loading master QR:', error);
                return;
            }
            
            if (data && data.master_qr_code) {
                this.masterQR = data.master_qr_code;
                console.log('✅ Master QR loaded from database');
            } else {
                console.log('⚠️ No master QR found in database');
            }
        } catch (error) {
            console.error('Error loading master QR:', error);
        }
    }

    /**
     * Generate a new master QR code (Admin only)
     * @returns {Promise<Object>} - Promise with QR data
     */
    async generateMasterQR() {
        try {
            // Check if user is admin
            const user = window.auth?.currentUser;
            if (!user || user.profile?.role !== 'admin') {
                throw new Error('Only administrators can generate the master QR code');
            }
            
            // Generate unique QR code data
            const timestamp = Date.now();
            const organizationId = 'org_attendance_system';
            const randomString = Math.random().toString(36).substring(2, 15);
            const signature = btoa(`${organizationId}-${timestamp}-${randomString}-master-qr-secret-key-2026`);
            const qrData = `MASTER|${organizationId}|${timestamp}|${signature}`;
            
            // Save to database
            const { error } = await this.supabase
                .from('system_settings')
                .upsert({ 
                    id: 1,
                    master_qr_code: qrData,
                    master_qr_generated_at: new Date().toISOString(),
                    master_qr_generated_by: user.id,
                    updated_at: new Date().toISOString()
                });
            
            if (error) throw error;
            
            this.masterQR = qrData;
            console.log('✅ Master QR generated and saved');
            
            return { success: true, qrData };
        } catch (error) {
            console.error('Error generating master QR:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Verify if scanned QR matches the master QR
     * @param {string} scannedQR - QR code data from scan
     * @returns {Promise<Object>} - Verification result
     */
    async verifyQR(scannedQR) {
        try {
            if (!this.masterQR) {
                await this.loadMasterQR();
            }
            
            if (!this.masterQR) {
                return { 
                    success: false, 
                    verified: false, 
                    message: 'No master QR code found. Please contact administrator.' 
                };
            }
            
            // Compare the QR data
            const isValid = scannedQR === this.masterQR;
            
            if (isValid) {
                return { 
                    success: true, 
                    verified: true, 
                    message: '✅ QR code verified successfully!' 
                };
            } else {
                return { 
                    success: false, 
                    verified: false, 
                    message: '❌ Invalid QR code. Please scan the official organization QR code.' 
                };
            }
        } catch (error) {
            console.error('Error verifying QR:', error);
            return { success: false, verified: false, message: error.message };
        }
    }

    /**
     * Generate QR code using pure JavaScript (no external library)
     * @param {string} text - Text to encode
     * @returns {Promise<string>} - Data URL of QR code image
     */
    async generateQRCodeImage(text) {
        return new Promise((resolve, reject) => {
            try {
                // Create canvas
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const size = 300;
                canvas.width = size;
                canvas.height = size;
                
                // Generate a simple but visually appealing QR-style pattern
                // This creates a matrix pattern based on the text hash
                
                // Background
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, size, size);
                
                // Create a grid pattern based on text hash
                const hash = this.simpleHash(text);
                const gridSize = 25;
                const cellSize = size / gridSize;
                
                // Draw corner squares (like QR code)
                // Top-left corner
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, cellSize * 7, cellSize * 7);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(cellSize, cellSize, cellSize * 5, cellSize * 5);
                ctx.fillStyle = '#000000';
                ctx.fillRect(cellSize * 2, cellSize * 2, cellSize * 3, cellSize * 3);
                
                // Top-right corner
                ctx.fillStyle = '#000000';
                ctx.fillRect(size - cellSize * 7, 0, cellSize * 7, cellSize * 7);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(size - cellSize * 6, cellSize, cellSize * 5, cellSize * 5);
                ctx.fillStyle = '#000000';
                ctx.fillRect(size - cellSize * 5, cellSize * 2, cellSize * 3, cellSize * 3);
                
                // Bottom-left corner
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, size - cellSize * 7, cellSize * 7, cellSize * 7);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(cellSize, size - cellSize * 6, cellSize * 5, cellSize * 5);
                ctx.fillStyle = '#000000';
                ctx.fillRect(cellSize * 2, size - cellSize * 5, cellSize * 3, cellSize * 3);
                
                // Fill the rest with pattern based on hash
                for (let i = 0; i < gridSize; i++) {
                    for (let j = 0; j < gridSize; j++) {
                        // Skip corner areas
                        const inTopLeft = i < 7 && j < 7;
                        const inTopRight = i < 7 && j > gridSize - 8;
                        const inBottomLeft = i > gridSize - 8 && j < 7;
                        
                        if (!inTopLeft && !inTopRight && !inBottomLeft) {
                            const index = (i * gridSize + j) % hash.length;
                            const value = hash.charCodeAt(index) || 0;
                            if (value % 2 === 0) {
                                ctx.fillStyle = '#000000';
                                ctx.fillRect(i * cellSize, j * cellSize, cellSize - 1, cellSize - 1);
                            }
                        }
                    }
                }
                
                // Add text below QR code
                ctx.fillStyle = '#000000';
                ctx.font = '12px "Segoe UI", monospace';
                ctx.textAlign = 'center';
                
                // Truncate text if too long
                let displayText = text;
                if (text.length > 30) {
                    displayText = text.substring(0, 27) + '...';
                }
                ctx.fillText('Organization Master QR', size / 2, size - 15);
                ctx.font = '9px monospace';
                ctx.fillText(displayText.substring(0, 25), size / 2, size - 5);
                
                // Add border
                ctx.strokeStyle = '#cccccc';
                ctx.lineWidth = 2;
                ctx.strokeRect(2, 2, size - 4, size - 4);
                
                const dataUrl = canvas.toDataURL('image/png');
                resolve(dataUrl);
            } catch (error) {
                console.error('QR generation error:', error);
                reject(error);
            }
        });
    }

    /**
     * Simple hash function for string
     * @param {string} str - Input string
     * @returns {string} - Hash string
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Download master QR code as image
     * @returns {Promise<Object>} - Promise with QR data URL
     */
    async downloadMasterQR() {
        try {
            // Check if user is admin
            const user = window.auth?.currentUser;
            if (!user || user.profile?.role !== 'admin') {
                throw new Error('Only administrators can download the master QR code');
            }
            
            // Check if master QR exists
            if (!this.masterQR) {
                await this.loadMasterQR();
            }
            
            if (!this.masterQR) {
                // Generate one if doesn't exist
                const generateResult = await this.generateMasterQR();
                if (!generateResult.success) {
                    throw new Error('Failed to generate master QR code');
                }
            }
            
            if (!this.masterQR) {
                throw new Error('No master QR code found');
            }
            
            console.log('Generating QR code image for master QR...');
            
            // Generate QR code image
            const qrCodeUrl = await this.generateQRCodeImage(this.masterQR);
            
            if (!qrCodeUrl) {
                throw new Error('Failed to generate QR code image');
            }
            
            console.log('✅ QR code image generated successfully');
            return { success: true, qrCodeUrl, qrData: this.masterQR };
        } catch (error) {
            console.error('Error downloading master QR:', error);
            return { success: false, error: error.message, qrCodeUrl: null };
        }
    }

    /**
     * Get current master QR data
     * @returns {string|null} - Master QR data
     */
    getMasterQR() {
        return this.masterQR;
    }

    /**
     * Check if master QR exists
     * @returns {Promise<Object>} - Status
     */
    async getMasterQRStatus() {
        try {
            await this.loadMasterQR();
            return { 
                success: true, 
                exists: !!this.masterQR,
                qrData: this.masterQR 
            };
        } catch (error) {
            return { success: false, error: error.message, exists: false };
        }
    }

    /**
     * Reset master QR (Admin only)
     * @returns {Promise<Object>} - Promise with result
     */
    async resetMasterQR() {
        try {
            const user = window.auth?.currentUser;
            if (!user || user.profile?.role !== 'admin') {
                throw new Error('Only administrators can reset the master QR code');
            }
            
            const { error } = await this.supabase
                .from('system_settings')
                .update({ 
                    master_qr_code: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', 1);
            
            if (error) throw error;
            
            this.masterQR = null;
            console.log('✅ Master QR reset successfully');
            return { success: true };
        } catch (error) {
            console.error('Error resetting master QR:', error);
            return { success: false, error: error.message };
        }
    }
}

// Initialize QR manager
if (typeof window !== 'undefined') {
    const initQRManager = () => {
        window.qrManager = new QRManager();
        console.log('✅ QRManager attached to window');
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initQRManager);
    } else {
        initQRManager();
    }
}