// Shared role helpers — keep the scattered role checks in one place.
const STAFF_ROLES = ['admin', 'moderator', 'superadmin', 'adviser'];
const ADMIN_ROLES = ['admin', 'superadmin'];
const ADVISER_ROLES = ['adviser', 'admin', 'superadmin'];

export const isStaff = (role) => STAFF_ROLES.includes(role);

export const isAdmin = (role) => ADMIN_ROLES.includes(role);

export const isAdviser = (role) => ADVISER_ROLES.includes(role);

export const ROLE_LABELS = {
  student: 'student',
  moderator: 'moderator',
  admin: 'admin',
  superadmin: 'super admin',
  adviser: 'adviser',
};

export const roleLabel = (role) => ROLE_LABELS[role] || role || 'student';
