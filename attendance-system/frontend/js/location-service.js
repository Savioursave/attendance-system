/**
 * Location Service - Handles geolocation for attendance
 */

class LocationService {
    constructor() {
        this.currentPosition = null;
        this.isWithinPremises = false;
        this.lastCheckTime = null;
        console.log('📍 LocationService initialized');
    }

    /**
     * Get user's current location
     * @returns {Promise<Object>} - Promise with location data
     */
    async getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by your browser'));
                return;
            }

            const options = {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            };

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.currentPosition = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: new Date().toISOString()
                    };
                    console.log('📍 Location obtained:', this.currentPosition);
                    
                    // Check if within premises
                    this.isWithinPremises = ORGANIZATION_SETTINGS.isWithinPremises(
                        this.currentPosition.latitude,
                        this.currentPosition.longitude
                    );
                    this.lastCheckTime = new Date();
                    
                    resolve(this.currentPosition);
                },
                (error) => {
                    console.error('📍 Geolocation error:', error);
                    let errorMessage = 'Unable to get location';
                    switch(error.code) {
                        case error.PERMISSION_DENIED:
                            errorMessage = 'Location permission denied. Please enable location access.';
                            break;
                        case error.POSITION_UNAVAILABLE:
                            errorMessage = 'Location information unavailable';
                            break;
                        case error.TIMEOUT:
                            errorMessage = 'Location request timed out';
                            break;
                    }
                    reject(new Error(errorMessage));
                },
                options
            );
        });
    }

    /**
     * Check if user is within organization premises
     * @returns {Promise<Object>} - Promise with check result
     */
    async checkLocation() {
        try {
            const location = await this.getCurrentLocation();
            const isWithin = ORGANIZATION_SETTINGS.isWithinPremises(location.latitude, location.longitude);
            
            return {
                success: true,
                isWithin: isWithin,
                location: location,
                distance: ORGANIZATION_SETTINGS.calculateDistance(location.latitude, location.longitude),
                message: isWithin ? 'You are within organization premises' : 'You are outside organization premises'
            };
        } catch (error) {
            return {
                success: false,
                isWithin: false,
                error: error.message,
                message: error.message
            };
        }
    }

    /**
     * Get distance from organization
     * @returns {Promise<number>} - Distance in meters
     */
    async getDistanceFromOrganization() {
        try {
            const location = await this.getCurrentLocation();
            return ORGANIZATION_SETTINGS.calculateDistance(location.latitude, location.longitude);
        } catch (error) {
            console.error('Error getting distance:', error);
            return -1;
        }
    }

    /**
     * Show location status message
     * @param {Object} result - Location check result
     * @returns {string} - Formatted message
     */
    getLocationMessage(result) {
        if (!result.success) {
            return `❌ ${result.message}`;
        }
        
        if (result.isWithin) {
            return `✅ You are within organization premises (${result.distance.toFixed(0)} meters away)`;
        } else {
            return `❌ You are ${result.distance.toFixed(0)} meters away from organization premises. Please move within ${ORGANIZATION_SETTINGS.radius} meters to check in/out.`;
        }
    }
}

// Initialize location service
window.locationService = new LocationService();