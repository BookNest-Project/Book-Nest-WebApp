export const INVITATION_ROLE_TYPES = ['user', 'author', 'publisher'];

export const DEFAULT_INVITATION_TEMPLATES = {
  user: {
    subject: 'You are invited to join BookNest',
    message: `Hello {{name}},

You have been invited to join BookNest as a reader. BookNest is your home for discovering, purchasing, and enjoying great books.

Click the button below to accept your invitation and create your account. This invitation will expire on {{expiresAt}}.

We look forward to welcoming you to the community!

The BookNest Team`,
  },
  author: {
    subject: 'BookNest Author Studio invitation',
    message: `Hello {{name}},

You have been invited to join BookNest as an author. You will be able to publish your work, manage your catalog, and reach readers on our platform.

Click the button below to accept your invitation and set up your author profile. This invitation expires on {{expiresAt}}.

The BookNest Team`,
  },
  publisher: {
    subject: 'BookNest Publisher invitation',
    message: `Hello {{name}},

You have been invited to join BookNest as a publisher. Partner with us to distribute titles and manage your publishing presence.

Click the button below to accept your invitation and complete onboarding. This invitation expires on {{expiresAt}}.

The BookNest Team`,
  },
};

export function getDefaultTemplate(roleType) {
  const key = INVITATION_ROLE_TYPES.includes(roleType) ? roleType : 'user';
  return { ...DEFAULT_INVITATION_TEMPLATES[key] };
}

export function applyTemplatePlaceholders(template, { name, expiresAt }) {
  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-US', { dateStyle: 'long' })
    : 'the expiration date';
  return template
    .replace(/\{\{name\}\}/g, name || 'there')
    .replace(/\{\{expiresAt\}\}/g, expiresLabel);
}

export function roleTypeToAppRole(roleType) {
  if (roleType === 'author') return 'author';
  if (roleType === 'publisher') return 'publisher';
  return 'reader';
}

export function roleTypeLabel(roleType) {
  const labels = { user: 'User', author: 'Author', publisher: 'Publisher' };
  return labels[roleType] || roleType;
}
