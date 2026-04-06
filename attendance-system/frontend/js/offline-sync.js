/**
 * Offline Sync Module
 * Stores attendance records when offline and syncs when online
 */

class OfflineSync {
    constructor() {
        this.supabase = window.supabaseClient;
        this.dbName = 'AttendanceOfflineDB';
        this.dbVersion = 1;
        this.db = null;
        this.isOnline = navigator.onLine;
        this.init();
    }

    async init() {
        await this.openDatabase();
        this.setupEventListeners();
        if (this.isOnline) {
            await this.syncPendingRecords();
        }
    }

    openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => {
                console.error('Failed to open IndexedDB');
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB opened successfully');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Store for pending check-ins
                if (!db.objectStoreNames.contains('pendingCheckins')) {
                    const store = db.createObjectStore('pendingCheckins', { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('userId', 'userId', { unique: false });
                }
                
                // Store for pending check-outs
                if (!db.objectStoreNames.contains('pendingCheckouts')) {
                    const store = db.createObjectStore('pendingCheckouts', { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('userId', 'userId', { unique: false });
                }
                
                // Store for offline attendance records
                if (!db.objectStoreNames.contains('offlineAttendance')) {
                    const store = db.createObjectStore('offlineAttendance', { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    store.createIndex('date', 'date', { unique: false });
                    store.createIndex('userId', 'userId', { unique: false });
                    store.createIndex('synced', 'synced', { unique: false });
                }
                
                // Store for pending actions
                if (!db.objectStoreNames.contains('pendingActions')) {
                    const store = db.createObjectStore('pendingActions', { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    store.createIndex('action', 'action', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    setupEventListeners() {
        window.addEventListener('online', async () => {
            console.log('Back online - syncing pending records...');
            this.isOnline = true;
            await this.syncPendingRecords();
            this.showNotification('Back online! Syncing attendance records...', 'success');
        });
        
        window.addEventListener('offline', () => {
            console.log('Offline mode activated');
            this.isOnline = false;
            this.showNotification('You are offline. Attendance will be saved locally and synced when back online.', 'warning');
        });
    }

    async savePendingCheckin(checkinData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['pendingCheckins', 'offlineAttendance'], 'readwrite');
            const checkinStore = transaction.objectStore('pendingCheckins');
            const attendanceStore = transaction.objectStore('offlineAttendance');
            
            const record = {
                ...checkinData,
                timestamp: new Date().toISOString(),
                synced: false
            };
            
            const request = checkinStore.add(record);
            
            request.onsuccess = () => {
                // Also save to offline attendance
                attendanceStore.add({
                    ...checkinData,
                    synced: false,
                    offlineId: request.result
                });
                resolve(request.result);
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    async savePendingCheckout(checkoutData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['pendingCheckouts', 'offlineAttendance'], 'readwrite');
            const checkoutStore = transaction.objectStore('pendingCheckouts');
            const attendanceStore = transaction.objectStore('offlineAttendance');
            
            const record = {
                ...checkoutData,
                timestamp: new Date().toISOString(),
                synced: false
            };
            
            const request = checkoutStore.add(record);
            
            request.onsuccess = () => {
                // Update offline attendance
                const index = attendanceStore.index('userId');
                const getRequest = index.get(checkoutData.userId);
                
                getRequest.onsuccess = () => {
                    if (getRequest.result) {
                        attendanceStore.put({
                            ...getRequest.result,
                            check_out_time: checkoutData.check_out_time,
                            synced: false
                        });
                    }
                };
                
                resolve(request.result);
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    async getPendingCheckins() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['pendingCheckins'], 'readonly');
            const store = transaction.objectStore('pendingCheckins');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getPendingCheckouts() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['pendingCheckouts'], 'readonly');
            const store = transaction.objectStore('pendingCheckouts');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getOfflineAttendance() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['offlineAttendance'], 'readonly');
            const store = transaction.objectStore('offlineAttendance');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async syncPendingRecords() {
        if (!this.isOnline) {
            console.log('Still offline, cannot sync');
            return false;
        }
        
        try {
            // Sync pending check-ins
            const pendingCheckins = await this.getPendingCheckins();
            for (const checkin of pendingCheckins) {
                try {
                    const { error } = await this.supabase
                        .from('attendance')
                        .insert([{
                            user_id: checkin.userId,
                            date: checkin.date,
                            check_in_time: checkin.check_in_time,
                            check_in_method: checkin.method,
                            status: checkin.status,
                            location: checkin.location,
                            synced_from_offline: true,
                            original_timestamp: checkin.timestamp
                        }]);
                    
                    if (!error) {
                        await this.removePendingCheckin(checkin.id);
                    }
                } catch (error) {
                    console.error('Failed to sync check-in:', error);
                }
            }
            
            // Sync pending check-outs
            const pendingCheckouts = await this.getPendingCheckouts();
            for (const checkout of pendingCheckouts) {
                try {
                    const { error } = await this.supabase
                        .from('attendance')
                        .update({
                            check_out_time: checkout.check_out_time,
                            updated_at: new Date().toISOString(),
                            synced_from_offline: true
                        })
                        .eq('user_id', checkout.userId)
                        .eq('date', checkout.date);
                    
                    if (!error) {
                        await this.removePendingCheckout(checkout.id);
                    }
                } catch (error) {
                    console.error('Failed to sync check-out:', error);
                }
            }
            
            // Mark offline attendance as synced
            await this.markOfflineAttendanceSynced();
            
            console.log('Sync completed');
            return true;
        } catch (error) {
            console.error('Sync error:', error);
            return false;
        }
    }

    async removePendingCheckin(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['pendingCheckins'], 'readwrite');
            const store = transaction.objectStore('pendingCheckins');
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async removePendingCheckout(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['pendingCheckouts'], 'readwrite');
            const store = transaction.objectStore('pendingCheckouts');
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async markOfflineAttendanceSynced() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['offlineAttendance'], 'readwrite');
            const store = transaction.objectStore('offlineAttendance');
            const request = store.getAll();
            
            request.onsuccess = () => {
                const records = request.result;
                records.forEach(record => {
                    store.put({ ...record, synced: true });
                });
                resolve();
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    async clearAllPending() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['pendingCheckins', 'pendingCheckouts', 'offlineAttendance'], 'readwrite');
            
            transaction.objectStore('pendingCheckins').clear();
            transaction.objectStore('pendingCheckouts').clear();
            transaction.objectStore('offlineAttendance').clear();
            
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    showNotification(message, type) {
        // Use the global notification function if available
        if (typeof showNotification === 'function') {
            showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    async getPendingCount() {
        const pendingCheckins = await this.getPendingCheckins();
        const pendingCheckouts = await this.getPendingCheckouts();
        return pendingCheckins.length + pendingCheckouts.length;
    }
}

// Initialize offline sync
window.offlineSync = new OfflineSync();