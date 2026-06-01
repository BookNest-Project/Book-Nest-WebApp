/** Default revenue split when author has not set custom terms */
export const DEFAULT_AUTHOR_REVENUE_SHARE = 0.7;
export const DEFAULT_PLATFORM_REVENUE_SHARE = 0.3;
export const DEFAULT_REVENUE_AGREEMENT_VERSION = '1.0';
export const DEFAULT_CURRENCY = 'ETB';

export const MODERATION_CHECKLIST_KEYS = [
  'noCopyrightViolations',
  'noPlagiarism',
  'audioQualityAcceptable',
  'pdfFormattingAcceptable',
  'metadataAccurate',
  'pricingReasonable',
  'revenueAgreementSigned',
];

export const DEFAULT_REVIEW_STATE = {
  checklist: Object.fromEntries(MODERATION_CHECKLIST_KEYS.map((k) => [k, false])),
  pdfReview: { status: 'pending', comment: null, reviewedAt: null, reviewedBy: null },
  audioReview: { status: 'pending', comment: null, reviewedAt: null, reviewedBy: null },
  changeDecisions: {},
};
