function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    req.session.flash = { type: 'warning', message: 'Please sign in to continue.' };
    return res.redirect('/admin/login');
  }
  next();
}

module.exports = { requireAdmin };
