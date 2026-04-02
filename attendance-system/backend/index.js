require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// Authentication middleware
const authenticateUser = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        
        if (error || !user) {
            throw error;
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get user profile
app.get('/api/users/profile', authenticateUser, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select(`
                *,
                departments (
                    name,
                    head_of_department
                )
            `)
            .eq('id', req.user.id)
            .single();

        if (error) throw error;

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get attendance records
app.get('/api/attendance', authenticateUser, async (req, res) => {
    try {
        const { startDate, endDate, userId } = req.query;
        let query = supabase
            .from('attendance')
            .select(`
                *,
                users (
                    employee_id,
                    full_name,
                    departments (name)
                )
            `);

        if (userId) {
            query = query.eq('user_id', userId);
        } else {
            query = query.eq('user_id', req.user.id);
        }

        if (startDate) {
            query = query.gte('date', startDate);
        }
        if (endDate) {
            query = query.lte('date', endDate);
        }

        const { data, error } = await query.order('date', { ascending: false });

        if (error) throw error;

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Generate QR code
app.post('/api/qrcode/generate', authenticateUser, async (req, res) => {
    try {
        const QRCode = require('qrcode');
        
        const qrData = JSON.stringify({
            userId: req.user.id,
            timestamp: Date.now(),
            email: req.user.email
        });

        const qrCode = await QRCode.toDataURL(qrData);

        // Store QR in database
        await supabase
            .from('users')
            .update({ qr_code: qrData })
            .eq('id', req.user.id);

        res.json({ success: true, qrCode });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Generate reports
app.post('/api/reports/generate', authenticateUser, async (req, res) => {
    try {
        const { startDate, endDate, departmentId, format = 'json' } = req.body;

        // Check if user has admin/supervisor role
        const { data: user } = await supabase
            .from('users')
            .select('role')
            .eq('id', req.user.id)
            .single();

        if (!['admin', 'supervisor'].includes(user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        let query = supabase
            .from('attendance')
            .select(`
                *,
                users (
                    employee_id,
                    full_name,
                    departments (name)
                )
            `)
            .gte('date', startDate)
            .lte('date', endDate);

        if (departmentId) {
            query = query.eq('users.department_id', departmentId);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Process data for report
        const report = {
            generatedAt: new Date().toISOString(),
            period: { startDate, endDate },
            summary: {
                total: data.length,
                present: data.filter(r => r.status === 'present').length,
                absent: data.filter(r => r.status === 'absent').length,
                late: data.filter(r => r.status === 'late').length
            },
            details: data
        };

        if (format === 'csv') {
            // Convert to CSV
            const csv = convertToCSV(data);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=report.csv');
            return res.send(csv);
        }

        res.json({ success: true, data: report });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Bulk import users (admin only)
app.post('/api/admin/users/import', authenticateUser, async (req, res) => {
    try {
        // Check admin role
        const { data: user } = await supabase
            .from('users')
            .select('role')
            .eq('id', req.user.id)
            .single();

        if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { users } = req.body;
        const results = [];

        for (const userData of users) {
            try {
                // Create auth user
                const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                    email: userData.email,
                    password: userData.password || 'TempPass123!',
                    email_confirm: true,
                    user_metadata: {
                        full_name: userData.full_name,
                        role: userData.role || 'staff'
                    }
                });

                if (authError) throw authError;

                results.push({
                    success: true,
                    email: userData.email,
                    userId: authData.user.id
                });
            } catch (error) {
                results.push({
                    success: false,
                    email: userData.email,
                    error: error.message
                });
            }
        }

        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send notifications
app.post('/api/notifications/send', authenticateUser, async (req, res) => {
    try {
        const { type, userId, message } = req.body;

        // Get user email
        const { data: user } = await supabase
            .from('users')
            .select('email, full_name')
            .eq('id', userId)
            .single();

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // In production, integrate with email service (SendGrid, AWS SES, etc.)
        console.log(`Sending ${type} notification to ${user.email}: ${message}`);

        // Log notification
        await supabase
            .from('activity_logs')
            .insert([{
                user_id: userId,
                action: 'NOTIFICATION_SENT',
                details: { type, message }
            }]);

        res.json({ success: true, message: 'Notification sent' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper function to convert to CSV
function convertToCSV(data) {
    if (!data || !data.length) return '';

    const headers = ['Date', 'Employee ID', 'Name', 'Department', 'Check In', 'Check Out', 'Status', 'Method'];
    const rows = data.map(record => [
        record.date,
        record.users?.employee_id || '',
        record.users?.full_name || '',
        record.users?.departments?.name || '',
        record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString() : '',
        record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString() : '',
        record.status,
        record.check_in_method
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});