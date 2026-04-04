// ============================================
// SUPABASE CONFIGURATION
// ============================================

// Supabase configuration
const SUPABASE_CONFIG = {
    url: 'https://hesxkxbtreqfxmhrdwml.supabase.co',
    anonKey: 'sb_publishable_jTsJmSF195H4U6Og7oOdSA_2VI1_xnd'
};

// Initialize Supabase client
try {
    window.supabaseClient = window.supabase.createClient(
        SUPABASE_CONFIG.url,
        SUPABASE_CONFIG.anonKey
    );
    console.log('✅ Supabase client initialized successfully');
} catch (error) {
    console.error('❌ Failed to initialize Supabase client:', error);
}

// ============================================
// ORGANIZATION LOCATION SETTINGS
// ============================================

const ORGANIZATION_SETTINGS = {
    // Organization coordinates - UPDATE WITH YOUR ACTUAL ORGANIZATION LOCATION
    latitude: 6.6018,
    longitude: 3.3515,
    radius: 100,
    
    // Method to check if user is within organization premises
    isWithinPremises: function(userLatitude, userLongitude) {
        const distance = this.calculateDistance(userLatitude, userLongitude);
        console.log(`📍 Distance from organization: ${distance.toFixed(2)} meters`);
        return distance <= this.radius;
    },
    
    // Calculate distance between two coordinates using Haversine formula
    calculateDistance: function(lat2, lon2) {
        const lat1 = this.latitude;
        const lon1 = this.longitude;
        
        const R = 6371e3;
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;
        
        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        
        return R * c;
    },
    
    // Method to update organization location
    updateLocation: function(latitude, longitude, radius = 100) {
        this.latitude = latitude;
        this.longitude = longitude;
        this.radius = radius;
        console.log('📍 Organization location updated:', { latitude, longitude, radius });
    }
};

// ============================================
// API ENDPOINTS - PRODUCTION URLs
// ============================================

// Backend API URL (Vercel deployment)
const API_URL = 'https://attendify-backend-api.vercel.app/api';

// Frontend URL (Netlify deployment) - Auto-detected
const FRONTEND_URL = window.location.origin;

// ============================================
// ROLE-BASED ACCESS CONTROL
// ============================================

const ROLES = {
    ADMIN: 'admin',
    STAFF: 'staff',
    STUDENT: 'student',
    SUPERVISOR: 'supervisor'
};

// Check if user has required role
function hasRole(userRole, requiredRole) {
    const roleHierarchy = {
        'admin': 4,
        'supervisor': 3,
        'staff': 2,
        'student': 1
    };
    return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// Format date to local string
function formatDate(date) {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Format time to local string
function formatTime(time) {
    if (!time) return '-';
    return new Date(time).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// Format datetime to local string
function formatDateTime(datetime) {
    if (!datetime) return '-';
    return `${formatDate(datetime)} ${formatTime(datetime)}`;
}

// Show notification
function showNotification(message, type = 'info') {
    const colors = {
        success: '#4caf50',
        error: '#f44336',
        warning: '#ff9800',
        info: '#2196f3'
    };
    
    const existingNotification = document.querySelector('.custom-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = 'custom-notification';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${colors[type] || colors.info};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        max-width: 300px;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add animation styles if not already added
if (!document.querySelector('#notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

// ============================================
// EXPORTS
// ============================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        supabase: window.supabaseClient, 
        API_URL, 
        FRONTEND_URL,
        ROLES, 
        hasRole, 
        ORGANIZATION_SETTINGS,
        formatDate,
        formatTime,
        formatDateTime,
        showNotification
    };
}