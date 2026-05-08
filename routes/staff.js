const router = require('express').Router();
const auth = require('../middleware/auth');
const Staff = require('../models/Staff');
const PDFDocument = require('pdfkit');
const User = require('../models/User');

// GET /api/staff
router.get('/', auth, async (req, res) => {
  try {
    const staff = await Staff.find({ user: req.ownerId }).select('-attendance').sort({ name: 1 });
    res.json(staff);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/staff/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const member = await Staff.findOne({ _id: req.params.id, user: req.ownerId });
    if (!member) return res.status(404).json({ message: 'Staff member not found' });
    res.json(member);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/staff
router.post('/', auth, async (req, res) => {
  try {
    const { name, role, salary, phone, joinDate } = req.body;
    if (!name || !role || salary === undefined) {
      return res.status(400).json({ message: 'Name, role, and salary are required' });
    }
    const member = await Staff.create({
      user: req.ownerId,
      name,
      role,
      salary,
      phone,
      joinDate: joinDate ? new Date(joinDate) : new Date(),
    });
    res.status(201).json(member);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/staff/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const member = await Staff.findOneAndUpdate(
      { _id: req.params.id, user: req.ownerId },
      { $set: { name: req.body.name, role: req.body.role, salary: req.body.salary, phone: req.body.phone } },
      { new: true }
    );
    if (!member) return res.status(404).json({ message: 'Staff member not found' });
    res.json(member);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/staff/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const member = await Staff.findOneAndDelete({ _id: req.params.id, user: req.ownerId });
    if (!member) return res.status(404).json({ message: 'Staff member not found' });
    res.json({ message: 'Staff member deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/staff/:id/attendance - mark or update attendance for a date
router.post('/:id/attendance', auth, async (req, res) => {
  try {
    const { date, status } = req.body;
    if (!date || !status) {
      return res.status(400).json({ message: 'Date and status are required' });
    }
    if (!['present', 'absent', 'half-day'].includes(status)) {
      return res.status(400).json({ message: 'Status must be present, absent, or half-day' });
    }

    const member = await Staff.findOne({ _id: req.params.id, user: req.ownerId });
    if (!member) return res.status(404).json({ message: 'Staff member not found' });

    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    const existingIndex = member.attendance.findIndex((a) => {
      const d = new Date(a.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === attendanceDate.getTime();
    });

    if (existingIndex >= 0) {
      member.attendance[existingIndex].status = status;
    } else {
      member.attendance.push({ date: attendanceDate, status });
    }

    await member.save();
    res.json({ message: 'Attendance marked', date: attendanceDate, status });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/staff/:id/attendance?month=4&year=2026
router.get('/:id/attendance', auth, async (req, res) => {
  try {
    const member = await Staff.findOne({ _id: req.params.id, user: req.ownerId });
    if (!member) return res.status(404).json({ message: 'Staff member not found' });

    const m = parseInt(req.query.month) || new Date().getMonth() + 1;
    const y = parseInt(req.query.year) || new Date().getFullYear();

    const monthAttendance = member.attendance.filter((a) => {
      const d = new Date(a.date);
      return d.getMonth() + 1 === m && d.getFullYear() === y;
    });

    const presentDays = monthAttendance.filter((a) => a.status === 'present').length;
    const halfDays = monthAttendance.filter((a) => a.status === 'half-day').length;
    const absentDays = monthAttendance.filter((a) => a.status === 'absent').length;
    const workingDays = new Date(y, m, 0).getDate();
    const dailyRate = member.salary / workingDays;
    const calculatedSalary = Math.round(presentDays * dailyRate + halfDays * dailyRate * 0.5);

    res.json({
      attendance: monthAttendance,
      presentDays,
      halfDays,
      absentDays,
      workingDays,
      calculatedSalary,
      fullSalary: member.salary,
    });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/staff/payroll/pdf?month=4&year=2026
// Generate a monthly payroll PDF for all staff
router.get('/payroll/pdf', auth, async (req, res) => {
  try {
    const m = parseInt(req.query.month) || new Date().getMonth() + 1;
    const y = parseInt(req.query.year) || new Date().getFullYear();

    const [allStaff, owner] = await Promise.all([
      Staff.find({ user: req.ownerId }),
      User.findById(req.ownerId).select('restaurantName name'),
    ]);

    const monthName = new Date(y, m - 1, 1).toLocaleString('default', { month: 'long' });
    const workingDays = new Date(y, m, 0).getDate();

    // Compute payroll for each staff member
    const rows = allStaff.map((member) => {
      const monthAtt = member.attendance.filter((a) => {
        const d = new Date(a.date);
        return d.getMonth() + 1 === m && d.getFullYear() === y;
      });
      const present = monthAtt.filter((a) => a.status === 'present').length;
      const half = monthAtt.filter((a) => a.status === 'half-day').length;
      const absent = monthAtt.filter((a) => a.status === 'absent').length;
      const dailyRate = member.salary / workingDays;
      const calculated = Math.round(present * dailyRate + half * dailyRate * 0.5);
      return { name: member.name, role: member.role, fullSalary: member.salary, present, half, absent, calculated };
    });

    const totalPayroll = rows.reduce((s, r) => s + r.calculated, 0);

    // Build PDF
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="payroll-${monthName}-${y}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text(`${owner?.restaurantName || 'Restaurant'} – Payroll`, { align: 'center' });
    doc.fontSize(12).font('Helvetica').text(`${monthName} ${y}  |  Working days: ${workingDays}`, { align: 'center' });
    doc.moveDown(1.5);

    // Table header
    const cols = { name: 40, role: 185, salary: 290, present: 360, half: 410, absent: 460, paid: 505 };
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Name', cols.name);
    doc.moveUp();
    doc.text('Role', cols.role);
    doc.moveUp();
    doc.text('Full Salary', cols.salary, undefined, { width: 65, align: 'right' });
    doc.moveUp();
    doc.text('P', cols.present, undefined, { width: 40, align: 'center' });
    doc.moveUp();
    doc.text('H', cols.half, undefined, { width: 40, align: 'center' });
    doc.moveUp();
    doc.text('A', cols.absent, undefined, { width: 40, align: 'center' });
    doc.moveUp();
    doc.text('Paid (रू)', cols.paid, undefined, { width: 60, align: 'right' });
    doc.moveDown(0.3);
    doc.moveTo(40, doc.y).lineTo(560, doc.y).stroke();
    doc.moveDown(0.4);

    // Table rows
    doc.font('Helvetica').fontSize(9);
    rows.forEach((r) => {
      doc.text(r.name.slice(0, 22), cols.name);
      doc.moveUp();
      doc.text(r.role.slice(0, 18), cols.role);
      doc.moveUp();
      doc.text(`रू ${r.fullSalary.toLocaleString()}`, cols.salary, undefined, { width: 65, align: 'right' });
      doc.moveUp();
      doc.text(String(r.present), cols.present, undefined, { width: 40, align: 'center' });
      doc.moveUp();
      doc.text(String(r.half), cols.half, undefined, { width: 40, align: 'center' });
      doc.moveUp();
      doc.text(String(r.absent), cols.absent, undefined, { width: 40, align: 'center' });
      doc.moveUp();
      doc.text(`रू ${r.calculated.toLocaleString()}`, cols.paid, undefined, { width: 60, align: 'right' });
      doc.moveDown(0.3);
    });

    // Footer total
    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(560, doc.y).stroke();
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text(`Total Payroll: रू ${totalPayroll.toLocaleString()}`, { align: 'right' });
    doc.moveDown(2);
    doc.font('Helvetica').fontSize(8).fillColor('#9ca3af')
      .text(`Generated on ${new Date().toLocaleDateString()}  ·  Restaurant Manager`, { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('Payroll PDF error:', err);
    if (!res.headersSent) res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
