class AttendanceManager {
    constructor() {
        this.supabase = window.supabaseClient;
        this.currentLocation = null;
        this.isOnline = navigator.onLine;
        this.initRealtimeSubscription();
        this.initOfflineListener();
        console.log('✅ AttendanceManager initialized');
    }

    initOfflineListener() {
        window.addEventListener('online', async () => {
            console.log('Back online - checking pending attendance records');
            this.isOnline = true;
            await this.syncOfflineAttendance();
        });
        
        window.addEventListener('offline', () => {
            console.log('Offline mode activated');
            this.isOnline = false;
            this.showNotification('You are offline. Attendance will be saved locally and synced when back online.', 'warning');
        });
    }

    async syncOfflineAttendance() {
        if (!window.offlineSync) {
            console.log('Offline sync not available');
            return;
        }
        
        const syncResult = await window.offlineSync.syncPendingRecords();
        if (syncResult) {
            this.showNotification('✅ Offline attendance records synced successfully!', 'success');
            window.dispatchEvent(new CustomEvent('attendance-updated'));
        }
    }

    showNotification(message, type = 'info') {
        const colors = {
            success: '#4caf50',
            error: '#f44336',
            warning: '#ff9800',
            info: '#2196f3'
        };
        
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${colors[type]};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            max-width: 350px;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    async checkIn(method = 'manual', targetUserId = null) {
        try {
            console.log(`🔄 Attempting to check in with method: ${method}`);
            
            // Check if user is authenticated
            const currentUser = window.auth?.currentUser;
            if (!currentUser) {
                console.error('❌ Not authenticated');
                this.showNotification('You must be logged in to check in', 'error');
                return { success: false, error: 'Not authenticated' };
            }

            // If offline, save locally and return
            if (!this.isOnline) {
                return await this.saveOfflineCheckIn(method, targetUserId, currentUser);
            }

            // Determine who is checking in (self or helping someone)
            const isHelping = targetUserId && targetUserId !== currentUser.id;
            const checkInUserId = targetUserId || currentUser.id;
            
            if (isHelping) {
                if (currentUser.profile?.role !== 'admin' && currentUser.profile?.role !== 'supervisor') {
                    this.showNotification('Only admins and supervisors can check in on behalf of others', 'error');
                    return { success: false, error: 'Insufficient permissions' };
                }
                console.log(`👥 Helping user: ${targetUserId}`);
            }

            // STEP 1: Check geolocation - User must be within organization premises
            console.log('📍 Checking location...');
            
            try {
                const locationResult = await window.locationService.checkLocation();
                console.log('Location check result:', locationResult);
                
                if (!locationResult.success || !locationResult.isWithin) {
                    const message = window.locationService.getLocationMessage(locationResult);
                    this.showNotification(message, 'error');
                    return { success: false, error: 'Location check failed', locationResult };
                }
                
                this.currentLocation = locationResult.location;
                console.log('✅ Location verified - within premises');
            } catch (locationError) {
                console.error('Location error:', locationError);
                this.showNotification(`Location check failed: ${locationError.message}. Please enable location services.`, 'error');
                return { success: false, error: locationError.message };
            }

            // STEP 2: Show QR scanner for master QR verification
            return new Promise((resolve) => {
                this.showQRScannerForCheckIn(async (qrData) => {
                    if (!qrData) {
                        resolve({ success: false, error: 'QR scan cancelled' });
                        return;
                    }
                    
                    // STEP 3: Verify QR matches master QR
                    const qrVerification = await window.qrManager.verifyQR(qrData);
                    
                    if (!qrVerification.verified) {
                        this.showNotification(qrVerification.message, 'error');
                        resolve({ success: false, error: qrVerification.message });
                        return;
                    }
                    
                    // STEP 4: Process the check-in
                    const result = await this.processCheckIn(checkInUserId, method, this.currentLocation);
                    resolve(result);
                });
            });
            
        } catch (error) {
            console.error('❌ Check-in error:', error);
            this.showNotification('Check-in failed: ' + error.message, 'error');
            return { success: false, error: error.message };
        }
    }

    async saveOfflineCheckIn(method, targetUserId, currentUser) {
        try {
            console.log('📱 Offline mode: Saving check-in locally');
            
            const isHelping = targetUserId && targetUserId !== currentUser.id;
            const checkInUserId = targetUserId || currentUser.id;
            const today = new Date().toISOString().split('T')[0];
            const checkInTime = new Date().toISOString();
            
            // Determine status based on time
            const cutoffTime = new Date();
            cutoffTime.setHours(9, 0, 0, 0);
            let status = 'present';
            if (new Date(checkInTime) > cutoffTime) {
                status = 'late';
            }
            
            // Get user details for display
            let userFullName = currentUser.profile?.full_name || currentUser.email;
            if (isHelping) {
                const { data: userData } = await this.supabase
                    .from('users')
                    .select('full_name')
                    .eq('id', targetUserId)
                    .single();
                if (userData) {
                    userFullName = userData.full_name;
                }
            }
            
            const checkinData = {
                userId: checkInUserId,
                date: today,
                check_in_time: checkInTime,
                method: method,
                status: status,
                location: null,
                helpedBy: isHelping ? currentUser.id : null,
                userFullName: userFullName
            };
            
            if (window.offlineSync) {
                await window.offlineSync.savePendingCheckin(checkinData);
            } else {
                // Fallback to localStorage if offlineSync not available
                const offlineQueue = JSON.parse(localStorage.getItem('offline_attendance_queue') || '[]');
                offlineQueue.push(checkinData);
                localStorage.setItem('offline_attendance_queue', JSON.stringify(offlineQueue));
            }
            
            this.showNotification(`✅ Check-in saved locally (Offline Mode)\n${userFullName} checked in at ${new Date().toLocaleTimeString()}\nStatus: ${status}\n\nThis will sync when back online.`, 'success');
            
            return { success: true, offline: true, data: checkinData };
        } catch (error) {
            console.error('Offline save error:', error);
            this.showNotification('Failed to save check-in offline: ' + error.message, 'error');
            return { success: false, error: error.message };
        }
    }

    async processCheckIn(userId, method, location) {
        try {
            const user = window.auth?.currentUser;
            if (!user) throw new Error('Not authenticated');

            const today = new Date().toISOString().split('T')[0];

            // Check if already checked in today
            const { data: existing, error: checkError } = await this.supabase
                .from('attendance')
                .select('*')
                .eq('user_id', userId)
                .eq('date', today)
                .maybeSingle();

            if (checkError && checkError.code !== 'PGRST116') {
                throw checkError;
            }

            if (existing && existing.check_in_time) {
                this.showNotification('Already checked in today', 'warning');
                return { 
                    success: false, 
                    error: 'Already checked in today',
                    data: existing
                };
            }

            // Determine status based on time
            const checkInTime = new Date();
            const cutoffTime = new Date();
            cutoffTime.setHours(9, 0, 0, 0);
            
            let status = 'present';
            if (checkInTime > cutoffTime) {
                status = 'late';
            }

            // Get user details for display
            const { data: userData } = await this.supabase
                .from('users')
                .select('full_name')
                .eq('id', userId)
                .single();

            const attendanceData = {
                user_id: userId,
                date: today,
                check_in_time: checkInTime.toISOString(),
                check_in_method: method,
                location: location,
                status: status,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            let result;
            if (existing) {
                result = await this.supabase
                    .from('attendance')
                    .update(attendanceData)
                    .eq('id', existing.id)
                    .select();
            } else {
                result = await this.supabase
                    .from('attendance')
                    .insert([attendanceData])
                    .select();
            }

            if (result.error) throw result.error;

            // Log activity
            await window.auth.logActivity('CHECK_IN', { 
                method, 
                time: attendanceData.check_in_time,
                date: today,
                status: status,
                user: userData?.full_name
            });

            this.showNotification(`✅ Check-in successful for ${userData?.full_name || 'user'} at ${new Date().toLocaleTimeString()}\nStatus: ${status}`, 'success');

            window.dispatchEvent(new CustomEvent('attendance-updated'));

            return { success: true, data: result.data[0] };
        } catch (error) {
            console.error('❌ Process check-in error:', error);
            return { success: false, error: error.message };
        }
    }

    async checkOut(targetUserId = null) {
        try {
            console.log('🔄 Attempting to check out...');
            
            const currentUser = window.auth?.currentUser;
            if (!currentUser) {
                this.showNotification('You must be logged in to check out', 'error');
                return { success: false, error: 'Not authenticated' };
            }

            // If offline, save locally
            if (!this.isOnline) {
                return await this.saveOfflineCheckOut(targetUserId, currentUser);
            }

            const isHelping = targetUserId && targetUserId !== currentUser.id;
            const checkOutUserId = targetUserId || currentUser.id;
            
            if (isHelping) {
                if (currentUser.profile?.role !== 'admin' && currentUser.profile?.role !== 'supervisor') {
                    this.showNotification('Only admins and supervisors can check out on behalf of others', 'error');
                    return { success: false, error: 'Insufficient permissions' };
                }
                console.log(`👥 Helping user check out: ${targetUserId}`);
            }

            // STEP 1: Check geolocation
            console.log('📍 Checking location...');
            
            try {
                const locationResult = await window.locationService.checkLocation();
                if (!locationResult.success || !locationResult.isWithin) {
                    const message = window.locationService.getLocationMessage(locationResult);
                    this.showNotification(message, 'error');
                    return { success: false, error: 'Location check failed' };
                }
                this.currentLocation = locationResult.location;
                console.log('✅ Location verified');
            } catch (locationError) {
                this.showNotification(`Location check failed: ${locationError.message}`, 'error');
                return { success: false, error: locationError.message };
            }

            // STEP 2: Show QR scanner for master QR verification
            return new Promise((resolve) => {
                this.showQRScannerForCheckIn(async (qrData) => {
                    if (!qrData) {
                        resolve({ success: false, error: 'QR scan cancelled' });
                        return;
                    }
                    
                    const qrVerification = await window.qrManager.verifyQR(qrData);
                    
                    if (!qrVerification.verified) {
                        this.showNotification(qrVerification.message, 'error');
                        resolve({ success: false, error: qrVerification.message });
                        return;
                    }
                    
                    const result = await this.processCheckOut(checkOutUserId);
                    resolve(result);
                });
            });
            
        } catch (error) {
            console.error('❌ Check-out error:', error);
            this.showNotification('Check-out failed: ' + error.message, 'error');
            return { success: false, error: error.message };
        }
    }

    async saveOfflineCheckOut(targetUserId, currentUser) {
        try {
            console.log('📱 Offline mode: Saving check-out locally');
            
            const isHelping = targetUserId && targetUserId !== currentUser.id;
            const checkOutUserId = targetUserId || currentUser.id;
            const today = new Date().toISOString().split('T')[0];
            const checkOutTime = new Date().toISOString();
            
            // Get user details
            let userFullName = currentUser.profile?.full_name || currentUser.email;
            if (isHelping) {
                const { data: userData } = await this.supabase
                    .from('users')
                    .select('full_name')
                    .eq('id', targetUserId)
                    .single();
                if (userData) {
                    userFullName = userData.full_name;
                }
            }
            
            const checkoutData = {
                userId: checkOutUserId,
                date: today,
                check_out_time: checkOutTime,
                helpedBy: isHelping ? currentUser.id : null,
                userFullName: userFullName
            };
            
            if (window.offlineSync) {
                await window.offlineSync.savePendingCheckout(checkoutData);
            } else {
                const offlineQueue = JSON.parse(localStorage.getItem('offline_attendance_queue') || '[]');
                offlineQueue.push(checkoutData);
                localStorage.setItem('offline_attendance_queue', JSON.stringify(offlineQueue));
            }
            
            this.showNotification(`✅ Check-out saved locally (Offline Mode)\n${userFullName} checked out at ${new Date().toLocaleTimeString()}\n\nThis will sync when back online.`, 'success');
            
            return { success: true, offline: true, data: checkoutData };
        } catch (error) {
            console.error('Offline save error:', error);
            return { success: false, error: error.message };
        }
    }

    async processCheckOut(userId) {
        try {
            const user = window.auth?.currentUser;
            if (!user) throw new Error('Not authenticated');

            const today = new Date().toISOString().split('T')[0];

            const { data: attendance, error: fetchError } = await this.supabase
                .from('attendance')
                .select('*')
                .eq('user_id', userId)
                .eq('date', today)
                .maybeSingle();

            if (fetchError) throw fetchError;
            if (!attendance) throw new Error('No check-in record found');
            if (attendance.check_out_time) throw new Error('Already checked out');

            const checkOutTime = new Date().toISOString();

            const { data, error } = await this.supabase
                .from('attendance')
                .update({ 
                    check_out_time: checkOutTime,
                    updated_at: new Date().toISOString()
                })
                .eq('id', attendance.id)
                .select();

            if (error) throw error;

            const { data: userData } = await this.supabase
                .from('users')
                .select('full_name')
                .eq('id', userId)
                .single();

            await window.auth.logActivity('CHECK_OUT', { 
                time: checkOutTime,
                date: today,
                user: userData?.full_name
            });

            const checkInTime = new Date(attendance.check_in_time);
            const checkOutDate = new Date(checkOutTime);
            const hoursWorked = ((checkOutDate - checkInTime) / (1000 * 60 * 60)).toFixed(2);
            
            this.showNotification(`✅ Check-out successful for ${userData?.full_name || 'user'} at ${new Date().toLocaleTimeString()}\nHours worked: ${hoursWorked}`, 'success');

            window.dispatchEvent(new CustomEvent('attendance-updated'));

            return { success: true, data: data[0] };
        } catch (error) {
            console.error('❌ Check-out error:', error);
            return { success: false, error: error.message };
        }
    }

    showQRScannerForCheckIn(callback) {
        let modal = document.getElementById('qrScanModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'qrScanModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <span class="close">&times;</span>
                    <h2>Scan Organization QR Code</h2>
                    <p>Please scan the QR code posted on the wall to verify your location.</p>
                    <div id="qr-scanner-container" style="width:100%; margin-top: 20px;"></div>
                    <div id="qr-scan-status" class="error-message" style="margin-top: 10px;"></div>
                </div>
            `;
            document.body.appendChild(modal);
            
            modal.querySelector('.close').onclick = () => {
                if (window.currentQrScanner) {
                    window.currentQrScanner.stop();
                }
                modal.style.display = 'none';
                callback(null);
            };
        }
        
        modal.style.display = 'block';
        
        const container = document.getElementById('qr-scanner-container');
        container.innerHTML = '<div id="qr-reader" style="width:100%"></div>';
        
        const html5QrCode = new Html5Qrcode('qr-reader');
        const statusDiv = document.getElementById('qr-scan-status');
        
        html5QrCode.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: 250 },
            (qrMessage) => {
                statusDiv.style.display = 'none';
                html5QrCode.stop();
                modal.style.display = 'none';
                window.currentQrScanner = null;
                callback(qrMessage);
            },
            (error) => {
                console.log('QR scan error:', error);
                statusDiv.textContent = 'Scanning... Position QR code in frame';
                statusDiv.style.display = 'block';
                statusDiv.style.color = '#666';
                statusDiv.style.background = '#f0f0f0';
            }
        );
        
        window.currentQrScanner = html5QrCode;
        
        const closeHandler = () => {
            if (window.currentQrScanner) {
                window.currentQrScanner.stop();
            }
            modal.style.display = 'none';
            callback(null);
        };
        
        modal.querySelector('.close').onclick = closeHandler;
        window.onclick = (event) => {
            if (event.target === modal) {
                closeHandler();
            }
        };
    }

    async getTodayStats() {
        try {
            console.log('📊 Fetching today\'s statistics...');
            const today = new Date().toISOString().split('T')[0];

            const { count: totalUsers, error: countError } = await this.supabase
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('is_active', true);

            if (countError) console.error('Error counting users:', countError);

            const { data: attendanceData, error: attendanceError } = await this.supabase
                .from('attendance')
                .select('*')
                .eq('date', today);

            if (attendanceError) throw attendanceError;

            const checkedInToday = attendanceData?.filter(r => r.check_in_time) || [];
            const present = checkedInToday.filter(r => !r.check_out_time).length;
            
            const cutoffTime = '09:00:00';
            const late = checkedInToday.filter(r => {
                if (!r.check_in_time) return false;
                const checkInTimeStr = new Date(r.check_in_time).toTimeString().split(' ')[0];
                return checkInTimeStr > cutoffTime;
            }).length;
            
            const totalCheckedIn = checkedInToday.length;
            const absent = (totalUsers || 0) - totalCheckedIn;

            return {
                total: totalUsers || 0,
                present: present,
                absent: absent < 0 ? 0 : absent,
                late: late
            };
        } catch (error) {
            console.error('Error in getTodayStats:', error);
            return { total: 0, present: 0, absent: 0, late: 0 };
        }
    }

    async getUserAttendance(userId = null, startDate = null, endDate = null) {
        try {
            const targetUser = userId || window.auth?.currentUser?.id;
            if (!targetUser) throw new Error('No user specified');

            let query = this.supabase
                .from('attendance')
                .select(`
                    *,
                    users (
                        full_name,
                        employee_id,
                        departments (name)
                    )
                `)
                .eq('user_id', targetUser)
                .order('date', { ascending: false });

            if (startDate) query = query.gte('date', startDate);
            if (endDate) query = query.lte('date', endDate);

            const { data, error } = await query;

            if (error) throw error;
            return { success: true, data: data || [] };
        } catch (error) {
            console.error('Error fetching attendance:', error);
            return { success: false, error: error.message, data: [] };
        }
    }

    async getTodayStatus() {
        try {
            const user = window.auth?.currentUser;
            if (!user) return null;

            const today = new Date().toISOString().split('T')[0];
            
            const { data, error } = await this.supabase
                .from('attendance')
                .select('*')
                .eq('user_id', user.id)
                .eq('date', today)
                .maybeSingle();

            if (error) return null;
            return data;
        } catch (error) {
            return null;
        }
    }

    async checkTodayStatus() {
        try {
            const status = await this.getTodayStatus();
            
            const checkInBtn = document.getElementById('checkInBtn');
            const checkOutBtn = document.getElementById('checkOutBtn');
            const assistBtn = document.getElementById('assistBtn');

            if (!checkInBtn || !checkOutBtn) return;

            if (status) {
                if (status.check_in_time && !status.check_out_time) {
                    checkInBtn.disabled = true;
                    checkOutBtn.disabled = false;
                    if (assistBtn) assistBtn.disabled = false;
                } else if (status.check_out_time) {
                    checkInBtn.disabled = true;
                    checkOutBtn.disabled = true;
                    if (assistBtn) assistBtn.disabled = true;
                }
            } else {
                checkInBtn.disabled = false;
                checkOutBtn.disabled = true;
                if (assistBtn) assistBtn.disabled = false;
            }
        } catch (error) {
            console.error('Error in checkTodayStatus:', error);
        }
    }

    initRealtimeSubscription() {
        const user = window.auth?.currentUser;
        if (!user) return;

        this.supabase
            .channel('attendance-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'attendance',
                    filter: `user_id=eq.${user.id}`
                },
                () => {
                    window.dispatchEvent(new CustomEvent('attendance-updated'));
                }
            )
            .subscribe();
    }

    async scanQRCode(qrData) {
        return this.checkIn('qr');
    }

    async generateQRCode() {
        return await window.qrManager.generateMasterQR();
    }
}

// Initialize attendance manager
document.addEventListener('DOMContentLoaded', () => {
    console.log('📅 DOM loaded, initializing AttendanceManager...');
    setTimeout(() => {
        if (!window.attendance) {
            window.attendance = new AttendanceManager();
            console.log('✅ AttendanceManager attached to window');
        }
    }, 500);
});

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => {
        if (!window.attendance) {
            window.attendance = new AttendanceManager();
            console.log('✅ AttendanceManager attached to window');
        }
    }, 500);
}

// Add animation styles for notifications
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