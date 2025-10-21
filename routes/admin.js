const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Lab = require('../models/Lab');
const User = require('../models/User');
const Test = require('../models/Test');
const Package = require('../models/Package');
const { authenticateToken: auth } = require('../middleware/auth');

// @route   GET /api/admin/analytics
// @desc    Get comprehensive analytics data (Admin only)
// @access  Private (Admin only)
router.get('/analytics', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const { period = '30', metric = 'all' } = req.query;
    
    // Calculate date range based on period
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - parseInt(period));

    // Get overview statistics
    const totalBookings = await Booking.countDocuments({ isActive: true });
    const totalUsers = await User.countDocuments({ role: 'user' });
    const totalLabs = await Lab.countDocuments({ isActive: true });
    
    // Calculate total revenue
    const revenueData = await Booking.aggregate([
      { $match: { isActive: true, paymentStatus: 'completed' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const totalRevenue = revenueData.length > 0 ? revenueData[0].total : 0;

    // Get booking trends for the period
    const bookingTrends = await Booking.aggregate([
      {
        $match: {
          isActive: true,
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get bookings by status
    const bookingsByStatus = await Booking.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get bookings by lab
    const bookingsByLab = await Booking.aggregate([
      { $match: { isActive: true } },
      {
        $lookup: {
          from: 'labs',
          localField: 'labId',
          foreignField: '_id',
          as: 'lab'
        }
      },
      { $unwind: '$lab' },
      {
        $group: {
          _id: '$labId',
          labName: { $first: '$lab.name' },
          count: { $sum: 1 },
          revenue: { $sum: '$totalAmount' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Get popular tests
    const popularTests = await Booking.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$selectedTests' },
      {
        $lookup: {
          from: 'tests',
          localField: 'selectedTests.testId',
          foreignField: '_id',
          as: 'test'
        }
      },
      { $unwind: '$test' },
      {
        $group: {
          _id: '$selectedTests.testId',
          testName: { $first: '$test.name' },
          count: { $sum: 1 },
          revenue: { $sum: '$selectedTests.price' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Get tests by category
    const testsByCategory = await Booking.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$selectedTests' },
      {
        $lookup: {
          from: 'tests',
          localField: 'selectedTests.testId',
          foreignField: '_id',
          as: 'test'
        }
      },
      { $unwind: '$test' },
      {
        $group: {
          _id: '$test.category',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get payment method distribution
    const paymentMethods = await Booking.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          amount: { $sum: '$totalAmount' }
        }
      }
    ]);

    // Get user registration trends
    const userRegistrations = await User.aggregate([
      {
        $match: {
          role: 'user',
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Calculate performance metrics
    const completedBookings = await Booking.countDocuments({ 
      isActive: true, 
      status: 'completed' 
    });

    const avgBookingTime = await Booking.aggregate([
      { $match: { isActive: true, status: 'completed' } },
      {
        $group: {
          _id: null,
          avgTime: { $avg: { $subtract: ['$updatedAt', '$createdAt'] } }
        }
      }
    ]);

    // Calculate growth rates (compared to previous period)
    const prevStartDate = new Date(startDate);
    prevStartDate.setDate(prevStartDate.getDate() - parseInt(period));
    
    const prevPeriodBookings = await Booking.countDocuments({
      isActive: true,
      createdAt: { $gte: prevStartDate, $lt: startDate }
    });

    const currentPeriodBookings = await Booking.countDocuments({
      isActive: true,
      createdAt: { $gte: startDate, $lte: endDate }
    });

    const bookingGrowth = prevPeriodBookings > 0 
      ? ((currentPeriodBookings - prevPeriodBookings) / prevPeriodBookings) * 100 
      : 0;

    // Prepare response data
    const analytics = {
      overview: {
        totalBookings,
        totalRevenue,
        activeLabs: totalLabs,
        totalUsers,
        bookingGrowth: parseFloat(bookingGrowth.toFixed(1)),
        revenueGrowth: 0, // Would need revenue comparison
        userGrowth: 0 // Would need user comparison
      },
      bookings: {
        daily: bookingTrends,
        byStatus: bookingsByStatus,
        byLab: bookingsByLab
      },
      revenue: {
        monthly: [], // Would need monthly aggregation
        byPaymentMethod: paymentMethods
      },
      tests: {
        popular: popularTests,
        categories: testsByCategory
      },
      users: {
        newRegistrations: userRegistrations,
        activeUsers: await User.countDocuments({ 
          role: 'user', 
          lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } 
        }),
        retentionRate: 0 // Would need retention calculation
      },
      performance: {
        averageBookingTime: avgBookingTime.length > 0 
          ? Math.round(avgBookingTime[0].avgTime / (1000 * 60 * 60)) // Convert to hours
          : 0,
        labUtilization: 0, // Would need capacity data
        customerSatisfaction: 0, // Would need rating system
        reportDeliveryTime: 0 // Would need report timing data
      },
      period: {
        start: startDate,
        end: endDate,
        days: parseInt(period)
      }
    };

    res.json({
      success: true,
      data: analytics
    });

  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching analytics'
    });
  }
});

// @route   GET /api/admin/dashboard-stats
// @desc    Get quick dashboard statistics (Admin only)
// @access  Private (Admin only)
router.get('/dashboard-stats', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get yesterday's date range
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);

    // Quick stats
    const [
      totalBookings,
      todayBookings,
      yesterdayBookings,
      totalUsers,
      totalLabs,
      pendingBookings,
      completedBookings,
      cancelledBookings
    ] = await Promise.all([
      Booking.countDocuments({ isActive: true }),
      Booking.countDocuments({ 
        isActive: true, 
        createdAt: { $gte: today, $lt: tomorrow } 
      }),
      Booking.countDocuments({ 
        isActive: true, 
        createdAt: { $gte: yesterday, $lt: yesterdayEnd } 
      }),
      User.countDocuments({ role: 'user' }),
      Lab.countDocuments({ isActive: true }),
      Booking.countDocuments({ isActive: true, status: 'pending' }),
      Booking.countDocuments({ isActive: true, status: 'completed' }),
      Booking.countDocuments({ isActive: true, status: 'cancelled' })
    ]);

    // Calculate revenue
    const revenueData = await Booking.aggregate([
      { $match: { isActive: true, paymentStatus: 'completed' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const totalRevenue = revenueData.length > 0 ? revenueData[0].total : 0;

    // Calculate growth
    const bookingGrowth = yesterdayBookings > 0 
      ? ((todayBookings - yesterdayBookings) / yesterdayBookings) * 100 
      : 0;

    const stats = {
      bookings: {
        total: totalBookings,
        today: todayBookings,
        yesterday: yesterdayBookings,
        growth: parseFloat(bookingGrowth.toFixed(1))
      },
      users: {
        total: totalUsers
      },
      labs: {
        total: totalLabs
      },
      revenue: {
        total: totalRevenue
      },
      status: {
        pending: pendingBookings,
        completed: completedBookings,
        cancelled: cancelledBookings
      }
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard stats'
    });
  }
});

// @route   GET /api/admin/reports/export
// @desc    Export analytics data (Admin only)
// @access  Private (Admin only)
router.get('/reports/export', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const { format = 'json', period = '30' } = req.query;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - parseInt(period));

    // Get comprehensive data
    const bookings = await Booking.find({
      isActive: true,
      createdAt: { $gte: startDate, $lte: endDate }
    })
    .populate('userId', 'firstName lastName email phone')
    .populate('labId', 'name address contact')
    .sort({ createdAt: -1 });

    if (format === 'csv') {
      // Generate CSV
      const csvHeaders = [
        'Booking ID',
        'Patient Name',
        'Patient Email',
        'Patient Phone',
        'Lab Name',
        'Lab Address',
        'Appointment Date',
        'Appointment Time',
        'Status',
        'Payment Status',
        'Total Amount',
        'Payment Method',
        'Created At'
      ];

      const csvRows = bookings.map(booking => [
        booking._id,
        `${booking.userId?.firstName || ''} ${booking.userId?.lastName || ''}`,
        booking.userId?.email || '',
        booking.userId?.phone || '',
        booking.labId?.name || '',
        booking.labId?.address || '',
        booking.appointmentDate?.toISOString().split('T')[0] || '',
        booking.appointmentTime || '',
        booking.status || '',
        booking.paymentStatus || '',
        booking.totalAmount || 0,
        booking.paymentMethod || '',
        booking.createdAt?.toISOString() || ''
      ]);

      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="bookings-${period}-days.csv"`);
      res.send(csvContent);
    } else {
      // Return JSON
      res.json({
        success: true,
        data: {
          period: { start: startDate, end: endDate, days: parseInt(period) },
          bookings,
          summary: {
            totalBookings: bookings.length,
            totalRevenue: bookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0),
            statusDistribution: bookings.reduce((acc, b) => {
              acc[b.status] = (acc[b.status] || 0) + 1;
              return acc;
            }, {})
          }
        }
      });
    }

  } catch (error) {
    console.error('Error exporting reports:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while exporting reports'
    });
  }
});

module.exports = router;
