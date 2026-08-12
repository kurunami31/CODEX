// Shared role helpers — keep the scattered role checks in one place.
const STAFF_ROLES = ['admin', 'moderator', 'superadmin'];
const ADMIN_ROLES = ['admin', 'superadmin'];

export const isStaff = (role) => STAFF_ROLES.includes(role);

export const isAdmin = (role) => ADMIN_ROLES.includes(role);

export const ROLE_LABELS = {
  student: 'student',
  moderator: 'moderator',
  admin: 'admin',
  superadmin: 'super admin',
};

export const roleLabel = (role) => ROLE_LABELS[role] || role || 'student';
