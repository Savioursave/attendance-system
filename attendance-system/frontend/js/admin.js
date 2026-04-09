// Admin Manager - Complete Fixed Version
class AdminManager {
    constructor() {
        this.supabase = window.supabaseClient;
        console.log('✅ AdminManager constructor called');
        this.checkAdminAccess();
        console.log('✅ AdminManager initialized');
    }

    async checkAdminAccess() {
        try {
            const user = window.auth?.currentUser;
            if (!user || user.profile?.role !== 'admin') {
                console.warn('⚠️ Admin access required - current role:', user?.profile?.role);
                return false;
            }
            console.log('✅ Admin access verified');
            return true;
        } catch (error) {
            console.error('❌ Error checking admin access:', error);
            return false;
        }
    }

    // ============= MASTER QR CODE MANAGEMENT =============
    
    async generateMasterQR() {
        try {
            console.log('📱 Generating master QR code...');
            
            if (!window.qrManager) {
                throw new Error('QR Manager not initialized');
            }
            
            const result = await window.qrManager.generateMasterQR();
            
            if (result.success) {
                alert('✅ Master QR code generated successfully! You can now download it.');
                return result;
            } else {
                alert('❌ Failed to generate master QR: ' + result.error);
                return result;
            }
        } catch (error) {
            console.error('Error generating master QR:', error);
            alert('Error generating master QR: ' + error.message);
            return { success: false, error: error.message };
        }
    }
    
    async downloadMasterQR() {
        try {
            console.log('📥 Downloading master QR code...');
            
            if (!window.qrManager) {
                throw new Error('QR Manager not initialized');
            }
            
            const result = await window.qrManager.downloadMasterQR();
            
            if (result.success && result.qrCodeUrl) {
                const link = document.createElement('a');
                link.download = 'organization-qr-code.png';
                link.href = result.qrCodeUrl;
                link.click();
                alert('✅ Master QR code downloaded successfully! Print and display at the entrance.');
                return result;
            } else {
                alert('❌ Failed to download master QR: ' + (result.error || 'Unknown error'));
                return result;
            }
        } catch (error) {
            console.error('Error downloading master QR:', error);
            alert('Error downloading master QR: ' + error.message);
            return { success: false, error: error.message };
        }
    }
    
    async getMasterQRStatus() {
        try {
            if (!window.qrManager) {
                throw new Error('QR Manager not initialized');
            }
            const masterQR = window.qrManager.getMasterQR();
            return { 
                success: true, 
                exists: !!masterQR,
                qrData: masterQR 
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    async resetMasterQR() {
        try {
            if (confirm('Are you sure you want to reset the master QR code? This will invalidate all existing QR codes displayed at the entrance.')) {
                if (!window.qrManager) {
                    throw new Error('QR Manager not initialized');
                }
                const result = await window.qrManager.resetMasterQR();
                if (result.success) {
                    alert('✅ Master QR code reset successfully. Generate a new one to continue.');
                } else {
                    alert('❌ Failed to reset master QR: ' + result.error);
                }
                return result;
            }
            return { success: false, cancelled: true };
        } catch (error) {
            alert('Error resetting master QR: ' + error.message);
            return { success: false, error: error.message };
        }
    }

    // ============= USER MANAGEMENT =============

    async getUsers(filters = {}) {
        try {
            console.log('📋 Fetching users with filters:', filters);
            
            let query = this.supabase
                .from('users')
                .select(`
                    *,
                    departments (
                        name,
                        id
                    )
                `);

            if (filters.role) {
                query = query.eq('role', filters.role);
            }
            if (filters.department) {
                query = query.eq('department_id', filters.department);
            }
            if (filters.active !== undefined) {
                query = query.eq('is_active', filters.active);
            }

            const { data, error } = await query.order('full_name');

            if (error) {
                console.error('❌ Error fetching users:', error);
                throw error;
            }

            console.log(`✅ Fetched ${data?.length || 0} users`);
            return { success: true, data: data || [] };
        } catch (error) {
            console.error('❌ Error in getUsers:', error);
            return { success: false, error: error.message, data: [] };
        }
    }

    async getUserById(userId) {
        try {
            console.log('📋 Fetching user by ID:', userId);
            
            const { data, error } = await this.supabase
                .from('users')
                .select(`
                    *,
                    departments (
                        name,
                        id
                    )
                `)
                .eq('id', userId)
                .single();

            if (error) {
                console.error('❌ Error fetching user:', error);
                throw error;
            }

            console.log('✅ User fetched:', data);
            return { success: true, data };
        } catch (error) {
            console.error('❌ Error in getUserById:', error);
            return { success: false, error: error.message };
        }
    }

    async createUser(userData) {
        try {
            console.log('➕ Creating new user:', userData.email);
            
            if (!userData.email) throw new Error('Email is required');
            if (!userData.password) throw new Error('Password is required');
            if (!userData.full_name) throw new Error('Full name is required');
            if (!userData.role) throw new Error('Role is required');

            const { data: authData, error: authError } = await this.supabase.auth.signUp({
                email: userData.email,
                password: userData.password,
                options: {
                    data: {
                        full_name: userData.full_name,
                        role: userData.role
                    }
                }
            });

            if (authError) throw authError;
            if (!authData.user) throw new Error('Failed to create user');

            const { error: updateError } = await this.supabase
                .from('users')
                .update({
                    full_name: userData.full_name,
                    role: userData.role,
                    department_id: userData.department_id || null,
                    phone: userData.phone || null,
                    is_active: userData.is_active !== undefined ? userData.is_active : true
                })
                .eq('id', authData.user.id);

            if (updateError) console.error('⚠️ Error updating user details:', updateError);

            alert(`✅ User ${userData.email} created successfully! Password: ${userData.password}`);
            return { success: true, data: authData };
        } catch (error) {
            console.error('❌ Error in createUser:', error);
            alert('Error creating user: ' + error.message);
            return { success: false, error: error.message };
        }
    }

    async updateUser(userId, updates) {
        try {
            console.log('✏️ Updating user:', userId, updates);
            
            if (!userId) throw new Error('User ID is required');

            const hasPasswordUpdate = updates.password && updates.password.trim() !== '';

            const updateData = {
                full_name: updates.full_name,
                role: updates.role,
                department_id: updates.department_id || null,
                phone: updates.phone || null,
                is_active: updates.is_active,
                updated_at: new Date().toISOString()
            };
            delete updateData.password;

            const { data, error } = await this.supabase
                .from('users')
                .update(updateData)
                .eq('id', userId)
                .select();

            if (error) throw error;

            if (hasPasswordUpdate) {
                const { data: userData, error: fetchError } = await this.supabase
                    .from('users')
                    .select('employee_id')
                    .eq('id', userId)
                    .single();

                if (fetchError) {
                    alert('User details updated but could not fetch email for password change');
                } else {
                    try {
                        const { error: resetError } = await this.supabase.auth.resetPasswordForEmail(
                            userData.employee_id,
                            { redirectTo: window.location.origin + '/attendance-system/frontend/confirm-password.html' }
                        );
                        
                        if (resetError) throw resetError;
                        alert(`✅ User updated successfully!\n\n📧 Password reset email sent to ${userData.employee_id}`);
                    } catch (err) {
                        alert(`User details updated but password reset email failed: ${err.message}`);
                    }
                }
            } else {
                alert('✅ User updated successfully!');
            }

            return { success: true, data: data?.[0] };
        } catch (error) {
            console.error('❌ Error in updateUser:', error);
            alert('Error updating user: ' + error.message);
            return { success: false, error: error.message };
        }
    }

    async deleteUser(userId) {
        try {
            if (!confirm('Are you sure you want to deactivate this user?')) {
                return { success: false, cancelled: true };
            }

            const { error } = await this.supabase
                .from('users')
                .update({ is_active: false, deleted_at: new Date().toISOString() })
                .eq('id', userId);

            if (error) throw error;
            alert('User deactivated successfully');
            return { success: true };
        } catch (error) {
            alert('Error deactivating user: ' + error.message);
            return { success: false, error: error.message };
        }
    }

    async toggleUserStatus(userId, currentStatus) {
        return this.updateUser(userId, { is_active: !currentStatus });
    }

    // ============= BULK USER OPERATIONS =============

    async bulkImportUsers(csvData) {
        try {
            const results = { success: [], failed: [], total: 0 };
            const lines = csvData.split('\n').filter(line => line.trim());
            
            if (lines.length < 2) throw new Error('CSV must have headers and at least one data row');

            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            const requiredHeaders = ['full_name', 'email', 'role'];
            
            for (const required of requiredHeaders) {
                if (!headers.includes(required)) throw new Error(`CSV must contain column: ${required}`);
            }

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                const userData = {};
                headers.forEach((header, index) => { userData[header] = values[index] || ''; });
                if (!userData.password) userData.password = 'TempPass123!';

                try {
                    const result = await this.createUser({
                        email: userData.email,
                        password: userData.password,
                        full_name: userData.full_name,
                        role: userData.role,
                        department_id: userData.department_id || null,
                        phone: userData.phone || null,
                        is_active: userData.is_active !== 'false'
                    });
                    
                    if (result.success) results.success.push(userData);
                    else results.failed.push({ user: userData, error: result.error });
                } catch (error) {
                    results.failed.push({ user: userData, error: error.message });
                }
                results.total++;
            }

            alert(`Bulk import completed:\n✅ Success: ${results.success.length}\n❌ Failed: ${results.failed.length}`);
            return { success: true, data: results };
        } catch (error) {
            alert('Error in bulk import: ' + error.message);
            return { success: false, error: error.message };
        }
    }

    // ============= DEPARTMENT MANAGEMENT (FIXED) =============

    async getDepartments() {
        try {
            console.log('📋 Fetching departments...');
            const { data, error } = await this.supabase
                .from('departments')
                .select(`
                    *,
                    head_of_department:users!head_of_department (
                        id,
                        full_name,
                        employee_id
                    )
                `)
                .order('name');

            if (error) {
                console.error('❌ Error fetching departments:', error);
                throw error;
            }
            
            console.log(`✅ Fetched ${data?.length || 0} departments`);
            return { success: true, data: data || [] };
        } catch (error) {
            console.error('❌ Error in getDepartments:', error);
            return { success: false, error: error.message, data: [] };
        }
    }

    async createDepartment(deptData) {
        try {
            console.log('➕ Creating department:', deptData);
            
            if (!deptData.name) throw new Error('Department name is required');

            const { data, error } = await this.supabase
                .from('departments')
                .insert([{
                    name: deptData.name,
                    description: deptData.description || null,
                    head_of_department: deptData.head_of_department || null,
                    is_active: deptData.is_active !== undefined ? deptData.is_active : true,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }])
                .select();

            if (error) {
                console.error('❌ Error creating department:', error);
                throw error;
            }
            
            console.log('✅ Department created:', data);
            alert(`Department "${deptData.name}" created successfully!`);
            return { success: true, data: data?.[0] };
        } catch (error) {
            console.error('❌ Error in createDepartment:', error);
            alert('Error creating department: ' + error.message);
            return { success: false, error: error.message };
        }
    }

    async updateDepartment(deptId, updates) {
        try {
            console.log('✏️ Updating department:', deptId, updates);
            
            if (!deptId) throw new Error('Department ID is required');

            const { data, error } = await this.supabase
                .from('departments')
                .update({
                    name: updates.name,
                    description: updates.description,
                    head_of_department: updates.head_of_department || null,
                    is_active: updates.is_active,
                    updated_at: new Date().toISOString()
                })
                .eq('id', deptId)
                .select();

            if (error) {
                console.error('❌ Error updating department:', error);
                throw error;
            }
            
            console.log('✅ Department updated:', data);
            alert(`Department "${updates.name}" updated successfully!`);
            return { success: true, data: data?.[0] };
        } catch (error) {
            console.error('❌ Error in updateDepartment:', error);
            alert('Error updating department: ' + error.message);
            return { success: false, error: error.message };
        }
    }

    async deleteDepartment(deptId) {
        try {
            console.log('🗑️ Deleting department:', deptId);
            
            // Check if department has active users
            const { count, error: countError } = await this.supabase
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('department_id', deptId)
                .eq('is_active', true);

            if (countError) throw countError;
            
            if (count > 0) {
                throw new Error(`Cannot delete department with ${count} active users. Please reassign or deactivate users first.`);
            }

            const { error } = await this.supabase
                .from('departments')
                .delete()
                .eq('id', deptId);
                
            if (error) throw error;
            
            console.log('✅ Department deleted');
            alert('Department deleted successfully');
            return { success: true };
        } catch (error) {
            console.error('❌ Error in deleteDepartment:', error);
            alert('Error deleting department: ' + error.message);
            return { success: false, error: error.message };
        }
    }

    async toggleDepartmentStatus(deptId, currentStatus) {
        return this.updateDepartment(deptId, { is_active: !currentStatus });
    }

    // ============= REPORTS =============

    async generateReport(params) {
        try {
            let query = this.supabase
                .from('attendance')
                .select(`
                    *,
                    users (
                        employee_id,
                        full_name,
                        departments (name, id)
                    )
                `);

            if (params.startDate) query = query.gte('date', params.startDate);
            if (params.endDate) query = query.lte('date', params.endDate);
            if (params.departmentId) query = query.eq('users.department_id', params.departmentId);
            if (params.userId) query = query.eq('user_id', params.userId);

            const { data, error } = await query.order('date', { ascending: false });
            if (error) throw error;

            return { 
                success: true, 
                data: {
                    generatedAt: new Date().toISOString(),
                    params,
                    summary: this.calculateSummary(data || []),
                    details: data || []
                }
            };
        } catch (error) {
            console.error('❌ Error in generateReport:', error);
            return { success: false, error: error.message };
        }
    }

    calculateSummary(attendanceData) {
        const summary = { total: attendanceData.length, present: 0, absent: 0, late: 0, byDepartment: {} };
        attendanceData.forEach(record => {
            summary[record.status] = (summary[record.status] || 0) + 1;
            const deptName = record.users?.departments?.name || 'Unknown';
            if (!summary.byDepartment[deptName]) {
                summary.byDepartment[deptName] = { total: 0, present: 0, absent: 0, late: 0 };
            }
            summary.byDepartment[deptName].total++;
            summary.byDepartment[deptName][record.status]++;
        });
        return summary;
    }

    exportToCSV(data, filename = 'report.csv') {
        try {
            if (!data || !data.length) { alert('No data to export'); return; }
            const headers = Object.keys(data[0]).filter(key => !['users', 'location'].includes(key));
            let csv = headers.join(',') + '\n';
            data.forEach(row => {
                const values = headers.map(header => {
                    let value = row[header];
                    if (value === null || value === undefined) return '';
                    if (typeof value === 'object') return JSON.stringify(value);
                    if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                        return `"${value.replace(/"/g, '""')}"`;
                    }
                    return value;
                });
                csv += values.join(',') + '\n';
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            alert('Report exported successfully!');
        } catch (error) {
            alert('Error exporting CSV: ' + error.message);
        }
    }

    // ============= QR CODE MANAGEMENT =============

    async generateUserQRCode(userId) {
        try {
            const timestamp = Date.now();
            const signature = btoa(`${userId}-${timestamp}-attendance-system-secret`);
            const qrData = `${userId}|${timestamp}|${signature}`;
            const { error } = await this.supabase.from('users').update({ qr_code: qrData }).eq('id', userId);
            if (error) throw error;
            return { success: true, qrData };
        } catch (error) {
            console.error('❌ Error in generateUserQRCode:', error);
            return { success: false, error: error.message };
        }
    }

    async getAllUserQRCodes() {
        try {
            const { data, error } = await this.supabase.from('users').select('id, full_name, employee_id, qr_code').not('qr_code', 'is', null);
            if (error) throw error;
            return { success: true, data: data || [] };
        } catch (error) {
            console.error('❌ Error in getAllUserQRCodes:', error);
            return { success: false, error: error.message };
        }
    }

    // ============= SYSTEM STATISTICS =============

    async getSystemStats() {
        try {
            const { count: totalUsers } = await this.supabase.from('users').select('*', { count: 'exact', head: true });
            const { count: activeUsers } = await this.supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_active', true);
            const { count: totalDepts } = await this.supabase.from('departments').select('*', { count: 'exact', head: true });
            const today = new Date().toISOString().split('T')[0];
            const { data: todayAttendance } = await this.supabase.from('attendance').select('status').eq('date', today);
            
            return {
                success: true,
                data: {
                    totalUsers: totalUsers || 0,
                    activeUsers: activeUsers || 0,
                    inactiveUsers: (totalUsers || 0) - (activeUsers || 0),
                    totalDepartments: totalDepts || 0,
                    todayAttendance: {
                        total: todayAttendance?.length || 0,
                        present: todayAttendance?.filter(a => a.status === 'present').length || 0,
                        late: todayAttendance?.filter(a => a.status === 'late').length || 0,
                        absent: todayAttendance?.filter(a => a.status === 'absent').length || 0
                    }
                }
            };
        } catch (error) {
            console.error('❌ Error in getSystemStats:', error);
            return { success: false, error: error.message };
        }
    }

    // ============= AUDIT LOGS =============

    async getActivityLogs(limit = 100) {
        try {
            const { data, error } = await this.supabase
                .from('activity_logs')
                .select(`*, users (full_name, employee_id)`)
                .order('created_at', { ascending: false })
                .limit(limit);
            if (error) throw error;
            return { success: true, data: data || [] };
        } catch (error) {
            console.error('❌ Error in getActivityLogs:', error);
            return { success: false, error: error.message };
        }
    }
}

// Initialize admin manager
document.addEventListener('DOMContentLoaded', () => {
    console.log('👤 DOM loaded, initializing AdminManager...');
    setTimeout(() => {
        if (!window.admin) {
            window.admin = new AdminManager();
            console.log('✅ AdminManager attached to window');
        }
    }, 600);
});

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => {
        if (!window.admin) {
            window.admin = new AdminManager();
            console.log('✅ AdminManager attached to window');
        }
    }, 600);
}