// Authentication functions
class AuthManager {
    constructor() {
        this.supabase = window.supabaseClient;
        this.currentUser = null;
        this.init();
    }

    async init() {
        try {
            console.log('AuthManager initializing...');
            
            // Check current session
            const { data: { session }, error } = await this.supabase.auth.getSession();
            
            if (error) {
                console.error('Session error:', error);
                return;
            }
            
            if (session) {
                console.log('Active session found for:', session.user.email);
                this.currentUser = session.user;
                await this.loadUserProfile();
            } else {
                console.log('No active session');
            }

            // Listen for auth changes
            this.supabase.auth.onAuthStateChange((event, session) => {
                console.log('Auth state changed:', event);
                
                if (event === 'SIGNED_IN') {
                    console.log('User signed in:', session?.user?.email);
                    this.currentUser = session.user;
                    this.loadUserProfile();
                    window.location.href = 'dashboard.html';
                } else if (event === 'SIGNED_OUT') {
                    console.log('User signed out');
                    this.currentUser = null;
                    window.location.href = 'index.html';
                }
            });
        } catch (error) {
            console.error('Init error:', error);
        }
    }

    async loadUserProfile() {
        if (!this.currentUser) return;

        try {
            const { data: profile, error } = await this.supabase
                .from('users')
                .select(`
                    *,
                    departments (
                        name,
                        head_of_department
                    )
                `)
                .eq('id', this.currentUser.id)
                .single();

            if (error) {
                console.error('Error loading profile:', error);
                return;
            }

            if (profile) {
                console.log('User profile loaded:', profile);
                this.currentUser.profile = profile;
                this.updateUIBasedOnRole(profile.role);
            }
        } catch (error) {
            console.error('Profile load error:', error);
        }
    }

    async login(email, password) {
        try {
            console.log('Login attempt for:', email);
            
            if (!this.supabase) {
                throw new Error('Supabase client not initialized');
            }

            const { data, error } = await this.supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) {
                console.error('Login error:', error.message);
                throw error;
            }

            console.log('Login successful:', data);
            
            // Log activity
            await this.logActivity('LOGIN', { email });
            
            return { success: true, data };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: error.message };
        }
    }

    async logout() {
        try {
            await this.logActivity('LOGOUT', {});
            await this.supabase.auth.signOut();
            console.log('Logout successful');
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    async register(userData) {
        try {
            const { data: authData, error: authError } = await this.supabase.auth.signUp({
                email: userData.email,
                password: userData.password,
                options: {
                    data: {
                        full_name: userData.fullName,
                        role: userData.role || 'staff'
                    }
                }
            });

            if (authError) throw authError;

            return { success: true, data: authData };
        } catch (error) {
            console.error('Registration error:', error);
            return { success: false, error: error.message };
        }
    }

    async logActivity(action, details = {}) {
        if (!this.currentUser || !this.supabase) return;

        try {
            await this.supabase
                .from('activity_logs')
                .insert([{
                    user_id: this.currentUser.id,
                    action: action,
                    details: details,
                    ip_address: await this.getIPAddress(),
                    created_at: new Date().toISOString()
                }]);
            console.log('Activity logged:', action);
        } catch (error) {
            console.error('Error logging activity:', error);
        }
    }

    async getIPAddress() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch {
            return 'unknown';
        }
    }

    updateUIBasedOnRole(role) {
        document.querySelectorAll('[data-role]').forEach(element => {
            const requiredRole = element.dataset.role;
            if (!hasRole(role, requiredRole)) {
                element.style.display = 'none';
            } else {
                element.style.display = '';
            }
        });
    }
}

// Initialize auth manager
window.auth = new AuthManager();