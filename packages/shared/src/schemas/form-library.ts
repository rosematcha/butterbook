import type { z } from 'zod';
import type { formFieldSchema } from './form.js';

/**
 * Zod *input* type for a form field — lets callers omit fields that have
 * defaults in the schema (isSystem, isPrimaryLabel). Library entries don't
 * need to spell those out unless they're overriding the default.
 */
type FormFieldInput = z.input<typeof formFieldSchema>;

/**
 * Preset catalog of commonly-used intake-form fields. Admins browse this in
 * the form editor and one-click add entries as pre-filled FormField drafts.
 * Each entry's `field` payload is a valid FormField minus `displayOrder`
 * (callers assign the order on insert).
 *
 * No DB table, no API surface — this is platform-wide content shipped in code
 * so it gets type-checked against formFieldSchema at build time.
 */

export type FieldLibraryCategory =
  | 'contact'
  | 'demographics'
  | 'visit'
  | 'accessibility'
  | 'school'
  | 'event'
  | 'kids'
  | 'consent';

export interface FieldLibraryCategoryMeta {
  id: FieldLibraryCategory;
  label: string;
  description: string;
}

export const FIELD_LIBRARY_CATEGORIES: FieldLibraryCategoryMeta[] = [
  { id: 'contact', label: 'Contact', description: 'Name, email, phone, and other ways to reach the visitor.' },
  { id: 'demographics', label: 'Demographics', description: 'Where visitors come from and how they found you.' },
  { id: 'visit', label: 'Visit logistics', description: 'Party size, membership, first-visit flag, occasion.' },
  { id: 'accessibility', label: 'Accessibility', description: 'Accommodation requests so staff can prepare.' },
  { id: 'school', label: 'School groups', description: 'Field trips and educational bookings.' },
  { id: 'event', label: 'Event logistics', description: 'Classes, workshops, performances, and tours.' },
  { id: 'kids', label: 'Kids & family', description: 'Child intake for drop-off programs and camps.' },
  { id: 'consent', label: 'Consent & marketing', description: 'Waivers, photo releases, newsletter opt-ins.' },
];

export interface FieldLibraryEntry {
  id: string;
  category: FieldLibraryCategory;
  title: string;
  description: string;
  keywords: string[];
  suggestedFor?: string[];
  field: Omit<FormFieldInput, 'displayOrder'>;
}

export const FIELD_LIBRARY: FieldLibraryEntry[] = [
  // ---------- Contact ----------
  {
    id: 'contact.full_name',
    category: 'contact',
    title: 'Full name',
    description: "The visitor's full name, used as their display label in lists.",
    keywords: ['name', 'full name', 'visitor'],
    field: {
      fieldKey: 'full_name',
      label: 'Full name',
      fieldType: 'text',
      required: true,
      isPrimaryLabel: true,
      validation: { minLength: 1, maxLength: 200 },
    },
  },
  {
    id: 'contact.first_name',
    category: 'contact',
    title: 'First name',
    description: "Split first-name field, for when you want first and last separately.",
    keywords: ['first name', 'given name'],
    field: {
      fieldKey: 'first_name',
      label: 'First name',
      fieldType: 'text',
      required: false,
      validation: { minLength: 1, maxLength: 100 },
    },
  },
  {
    id: 'contact.last_name',
    category: 'contact',
    title: 'Last name',
    description: 'Split last-name field, paired with First name.',
    keywords: ['last name', 'surname', 'family name'],
    field: {
      fieldKey: 'last_name',
      label: 'Last name',
      fieldType: 'text',
      required: false,
      validation: { minLength: 1, maxLength: 100 },
    },
  },
  {
    id: 'contact.email',
    category: 'contact',
    title: 'Email address',
    description: 'Validated email. Required for confirmation and reminder emails.',
    keywords: ['email', 'e-mail', 'mail'],
    field: {
      fieldKey: 'email',
      label: 'Email address',
      fieldType: 'email',
      required: false,
      placeholder: 'you@example.com',
    },
  },
  {
    id: 'contact.phone',
    category: 'contact',
    title: 'Phone number',
    description: 'Accepts digits, spaces, dashes, parens, plus sign.',
    keywords: ['phone', 'mobile', 'cell', 'telephone'],
    field: {
      fieldKey: 'phone',
      label: 'Phone number',
      fieldType: 'phone',
      required: false,
      placeholder: '(555) 123-4567',
    },
  },
  {
    id: 'contact.pronouns',
    category: 'contact',
    title: 'Pronouns',
    description: 'Dropdown of common pronouns with opt-out options.',
    keywords: ['pronouns', 'gender'],
    field: {
      fieldKey: 'pronouns',
      label: 'Pronouns',
      fieldType: 'select',
      required: false,
      options: ['She/her', 'He/him', 'They/them', 'Other', 'Prefer not to say'],
    },
  },
  {
    id: 'contact.preferred_language',
    category: 'contact',
    title: 'Preferred language',
    description: 'Helpful for multilingual programs and tours.',
    keywords: ['language', 'spoken', 'preferred'],
    field: {
      fieldKey: 'preferred_language',
      label: 'Preferred language',
      fieldType: 'select',
      required: false,
      options: ['English', 'Spanish', 'French', 'Mandarin', 'Other'],
    },
  },

  // ---------- Demographics / location ----------
  {
    id: 'demo.zip',
    category: 'demographics',
    title: 'ZIP / Postal code',
    description: 'Short text field for ZIP or international postal codes.',
    keywords: ['zip', 'postal', 'postcode'],
    field: {
      fieldKey: 'zip',
      label: 'ZIP / Postal code',
      fieldType: 'text',
      required: false,
      validation: { minLength: 1, maxLength: 20 },
    },
  },
  {
    id: 'demo.city',
    category: 'demographics',
    title: 'City',
    description: 'Where the visitor is travelling from.',
    keywords: ['city', 'town', 'location'],
    field: {
      fieldKey: 'city',
      label: 'City',
      fieldType: 'text',
      required: false,
      validation: { minLength: 1, maxLength: 100 },
    },
  },
  {
    id: 'demo.state',
    category: 'demographics',
    title: 'State / Region',
    description: 'State, province, or region name.',
    keywords: ['state', 'region', 'province'],
    field: {
      fieldKey: 'state',
      label: 'State / Region',
      fieldType: 'text',
      required: false,
      validation: { minLength: 1, maxLength: 100 },
    },
  },
  {
    id: 'demo.country',
    category: 'demographics',
    title: 'Country',
    description: 'Free-text country. Useful for international visitor reports.',
    keywords: ['country', 'nation', 'international'],
    field: {
      fieldKey: 'country',
      label: 'Country',
      fieldType: 'text',
      required: false,
      validation: { minLength: 1, maxLength: 100 },
    },
  },
  {
    id: 'demo.age_range',
    category: 'demographics',
    title: 'Age range',
    description: 'Banded age buckets — less invasive than asking for birthday.',
    keywords: ['age', 'age range', 'demographic'],
    field: {
      fieldKey: 'age_range',
      label: 'Age range',
      fieldType: 'select',
      required: false,
      options: ['Under 18', '18–24', '25–34', '35–44', '45–54', '55–64', '65+'],
    },
  },
  {
    id: 'demo.heard_about',
    category: 'demographics',
    title: 'How did you hear about us?',
    description: 'Attribution question for marketing reports.',
    keywords: ['heard about', 'source', 'marketing', 'referral'],
    field: {
      fieldKey: 'heard_about',
      label: 'How did you hear about us?',
      fieldType: 'select',
      required: false,
      options: ['Social media', 'Word of mouth', 'Search engine', 'News / article', 'Advertisement', 'Returning visitor', 'Other'],
    },
  },

  // ---------- Visit logistics ----------
  {
    id: 'visit.party_size',
    category: 'visit',
    title: 'Party size',
    description: 'Total number of people in the group, including the bookee.',
    keywords: ['party', 'group', 'headcount', 'people'],
    field: {
      fieldKey: 'party_size',
      label: 'Party size',
      fieldType: 'number',
      required: true,
      validation: { min: 1, max: 100, integer: true },
    },
  },
  {
    id: 'visit.adults',
    category: 'visit',
    title: 'Number of adults',
    description: 'For venues that price adults and children separately.',
    keywords: ['adults', 'party', 'group'],
    field: {
      fieldKey: 'adults',
      label: 'Number of adults',
      fieldType: 'number',
      required: false,
      validation: { min: 0, max: 50, integer: true },
    },
  },
  {
    id: 'visit.children',
    category: 'visit',
    title: 'Number of children',
    description: 'Count of under-18s in the party.',
    keywords: ['children', 'kids', 'party'],
    field: {
      fieldKey: 'children',
      label: 'Number of children',
      fieldType: 'number',
      required: false,
      validation: { min: 0, max: 50, integer: true },
    },
  },
  {
    id: 'visit.first_visit',
    category: 'visit',
    title: 'Is this your first visit?',
    description: 'Simple yes/no radio. Drives first-visit flows or greetings.',
    keywords: ['first visit', 'returning', 'new'],
    field: {
      fieldKey: 'first_visit',
      label: 'Is this your first visit?',
      fieldType: 'radio',
      required: false,
      options: ['Yes', 'No'],
    },
  },
  {
    id: 'visit.occasion',
    category: 'visit',
    title: 'Any special occasion?',
    description: 'Context that helps staff tailor the visit.',
    keywords: ['occasion', 'birthday', 'anniversary', 'reason'],
    field: {
      fieldKey: 'occasion',
      label: 'Any special occasion?',
      fieldType: 'select',
      required: false,
      options: ['Birthday', 'Anniversary', 'Field trip', 'Research', 'Just visiting', 'Other'],
    },
  },
  {
    id: 'visit.membership_status',
    category: 'visit',
    title: 'Membership status',
    description: 'Member / non-member / category — drives pricing and perks.',
    keywords: ['member', 'membership', 'status', 'tier'],
    field: {
      fieldKey: 'membership_status',
      label: 'Membership status',
      fieldType: 'select',
      required: false,
      options: ['Member', 'Non-member', 'Student', 'Senior', 'Educator'],
    },
  },
  {
    id: 'visit.membership_number',
    category: 'visit',
    title: 'Membership number',
    description: 'Free-text ID so members can self-identify.',
    keywords: ['membership', 'member number', 'id'],
    field: {
      fieldKey: 'membership_number',
      label: 'Membership number',
      fieldType: 'text',
      required: false,
      helpText: "If you're a member, enter your number for our records.",
      validation: { minLength: 1, maxLength: 64 },
    },
  },

  // ---------- Accessibility ----------
  {
    id: 'a11y.needs',
    category: 'accessibility',
    title: 'Accessibility needs',
    description: 'Multiselect of common accommodations so staff can prepare.',
    keywords: ['accessibility', 'accommodations', 'a11y', 'wheelchair', 'disability'],
    field: {
      fieldKey: 'accessibility_needs',
      label: 'Accessibility needs',
      fieldType: 'multiselect',
      required: false,
      options: [
        'Wheelchair access',
        'Hearing assistance',
        'Visual assistance',
        'Service animal',
        'Quiet space',
        'Sensory-friendly',
        'Large-print materials',
        'None',
      ],
    },
  },
  {
    id: 'a11y.notes',
    category: 'accessibility',
    title: 'Accommodation notes',
    description: 'Free-text space for anything not covered by the checklist.',
    keywords: ['notes', 'accommodations', 'accessibility'],
    field: {
      fieldKey: 'accommodation_notes',
      label: 'Accommodation notes',
      fieldType: 'textarea',
      required: false,
      helpText: 'Anything else we should know to make your visit easier?',
      validation: { maxLength: 500 },
    },
  },

  // ---------- School groups ----------
  {
    id: 'school.group_name',
    category: 'school',
    title: 'School or group name',
    description: 'Name of the booking school, scout troop, or community group.',
    keywords: ['school', 'group', 'organization'],
    field: {
      fieldKey: 'school_name',
      label: 'School or group name',
      fieldType: 'text',
      required: false,
      validation: { minLength: 1, maxLength: 200 },
    },
  },
  {
    id: 'school.grade_level',
    category: 'school',
    title: 'Grade level',
    description: 'Approximate age band — drives programming choices.',
    keywords: ['grade', 'level', 'age', 'school'],
    field: {
      fieldKey: 'grade_level',
      label: 'Grade level',
      fieldType: 'select',
      required: false,
      options: ['Pre-K', 'K–2', '3–5', '6–8', '9–12', 'College', 'Adult education', 'Mixed'],
    },
  },
  {
    id: 'school.group_size',
    category: 'school',
    title: 'Group size',
    description: 'Total students expected. Use alongside chaperone count.',
    keywords: ['group', 'size', 'students', 'count'],
    field: {
      fieldKey: 'group_size',
      label: 'Group size',
      fieldType: 'number',
      required: false,
      validation: { min: 1, max: 500, integer: true },
    },
  },
  {
    id: 'school.chaperone_count',
    category: 'school',
    title: 'Number of chaperones',
    description: 'Adults accompanying the group.',
    keywords: ['chaperones', 'adults', 'teachers', 'supervisors'],
    field: {
      fieldKey: 'chaperone_count',
      label: 'Number of chaperones',
      fieldType: 'number',
      required: false,
      validation: { min: 0, max: 50, integer: true },
    },
  },
  {
    id: 'school.lead_teacher_email',
    category: 'school',
    title: 'Lead teacher email',
    description: 'Primary contact for the school group.',
    keywords: ['teacher', 'email', 'contact', 'school'],
    field: {
      fieldKey: 'lead_teacher_email',
      label: 'Lead teacher email',
      fieldType: 'email',
      required: false,
    },
  },
  {
    id: 'school.lunch_needed',
    category: 'school',
    title: 'Lunch space needed?',
    description: 'Logistics flag for groups bringing packed lunches.',
    keywords: ['lunch', 'food', 'space', 'meal'],
    field: {
      fieldKey: 'lunch_needed',
      label: 'Will your group need a lunch space?',
      fieldType: 'radio',
      required: false,
      options: ['Yes', 'No', 'Bringing own, space not needed'],
    },
  },

  // ---------- Event logistics ----------
  {
    id: 'event.skill_level',
    category: 'event',
    title: 'Skill level',
    description: 'For classes and workshops with mixed ability levels.',
    keywords: ['skill', 'level', 'experience', 'class', 'workshop'],
    field: {
      fieldKey: 'skill_level',
      label: 'Skill level',
      fieldType: 'select',
      required: false,
      options: ['Beginner', 'Intermediate', 'Advanced', 'Mixed'],
    },
  },
  {
    id: 'event.tshirt_size',
    category: 'event',
    title: 'T-shirt size',
    description: 'For events that include swag or uniforms.',
    keywords: ['tshirt', 't-shirt', 'shirt', 'size', 'swag'],
    field: {
      fieldKey: 'tshirt_size',
      label: 'T-shirt size',
      fieldType: 'select',
      required: false,
      options: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
    },
  },
  {
    id: 'event.dietary_restrictions',
    category: 'event',
    title: 'Dietary restrictions',
    description: 'Multiselect of common dietary needs for catered events.',
    keywords: ['dietary', 'food', 'allergies', 'vegan', 'vegetarian', 'gluten'],
    field: {
      fieldKey: 'dietary_restrictions',
      label: 'Dietary restrictions',
      fieldType: 'multiselect',
      required: false,
      options: [
        'Vegetarian',
        'Vegan',
        'Gluten-free',
        'Dairy-free',
        'Nut allergy',
        'Shellfish allergy',
        'Kosher',
        'Halal',
        'Other',
      ],
    },
  },
  {
    id: 'event.dietary_notes',
    category: 'event',
    title: 'Other dietary notes',
    description: 'Free text for specifics not covered by the multiselect.',
    keywords: ['dietary', 'notes', 'food', 'allergies'],
    field: {
      fieldKey: 'dietary_notes',
      label: 'Other dietary notes',
      fieldType: 'textarea',
      required: false,
      validation: { maxLength: 500 },
    },
  },
  {
    id: 'event.emergency_contact_name',
    category: 'event',
    title: 'Emergency contact name',
    description: 'Who to call in case of an emergency on-site.',
    keywords: ['emergency', 'contact', 'name'],
    field: {
      fieldKey: 'emergency_contact_name',
      label: 'Emergency contact name',
      fieldType: 'text',
      required: false,
      validation: { minLength: 1, maxLength: 200 },
    },
  },
  {
    id: 'event.emergency_contact_phone',
    category: 'event',
    title: 'Emergency contact phone',
    description: 'Phone number for the emergency contact.',
    keywords: ['emergency', 'contact', 'phone'],
    field: {
      fieldKey: 'emergency_contact_phone',
      label: 'Emergency contact phone',
      fieldType: 'phone',
      required: false,
    },
  },
  {
    id: 'event.bringing_equipment',
    category: 'event',
    title: 'Bringing own equipment?',
    description: 'Yes/no for BYO-equipment events.',
    keywords: ['equipment', 'gear', 'bring'],
    field: {
      fieldKey: 'bringing_equipment',
      label: 'Will you be bringing your own equipment?',
      fieldType: 'checkbox',
      required: false,
    },
  },
  {
    id: 'event.equipment_notes',
    category: 'event',
    title: 'Equipment notes',
    description: 'Describe the equipment you plan to bring.',
    keywords: ['equipment', 'notes', 'gear'],
    field: {
      fieldKey: 'equipment_notes',
      label: 'Equipment notes',
      fieldType: 'textarea',
      required: false,
      validation: { maxLength: 500 },
    },
  },
  {
    id: 'event.tour_language',
    category: 'event',
    title: 'Preferred tour language',
    description: 'Language preference for guided tours.',
    keywords: ['tour', 'language', 'guide'],
    field: {
      fieldKey: 'tour_language',
      label: 'Preferred tour language',
      fieldType: 'select',
      required: false,
      options: ['English', 'Spanish', 'French', 'Mandarin', 'ASL', 'Other'],
    },
  },
  {
    id: 'event.seating_preference',
    category: 'event',
    title: 'Seating preference',
    description: 'For performances and ticketed venues.',
    keywords: ['seating', 'seat', 'preference', 'performance', 'theater'],
    field: {
      fieldKey: 'seating_preference',
      label: 'Seating preference',
      fieldType: 'radio',
      required: false,
      options: ['Aisle', 'Center', 'No preference', 'Accessible seating'],
    },
  },

  // ---------- Kids / family ----------
  {
    id: 'kids.child_age',
    category: 'kids',
    title: "Child's age",
    description: 'Age in years. Used for camps and age-gated activities.',
    keywords: ['child', 'age', 'kid', 'camp'],
    field: {
      fieldKey: 'child_age',
      label: "Child's age",
      fieldType: 'number',
      required: false,
      validation: { min: 0, max: 18, integer: true },
    },
  },
  {
    id: 'kids.child_allergies',
    category: 'kids',
    title: 'Child allergies / medical notes',
    description: 'Allergies, medications, or medical conditions staff should know.',
    keywords: ['child', 'allergies', 'medical', 'health'],
    field: {
      fieldKey: 'child_allergies',
      label: 'Child allergies / medical notes',
      fieldType: 'textarea',
      required: false,
      validation: { maxLength: 1000 },
    },
  },
  {
    id: 'kids.guardian_name',
    category: 'kids',
    title: 'Parent / guardian name',
    description: 'Adult responsible for the child.',
    keywords: ['parent', 'guardian', 'adult'],
    field: {
      fieldKey: 'guardian_name',
      label: 'Parent / guardian name',
      fieldType: 'text',
      required: false,
      validation: { minLength: 1, maxLength: 200 },
    },
  },
  {
    id: 'kids.pickup_authorized',
    category: 'kids',
    title: 'Authorized pickup names',
    description: 'Who, besides the guardian, may pick up the child.',
    keywords: ['pickup', 'authorized', 'drop-off', 'guardian'],
    field: {
      fieldKey: 'authorized_pickup',
      label: 'Authorized pickup names',
      fieldType: 'textarea',
      required: false,
      helpText: 'Who may pick up your child, besides yourself.',
      validation: { maxLength: 500 },
    },
  },

  // ---------- Consent & marketing ----------
  {
    id: 'consent.waiver',
    category: 'consent',
    title: 'Liability waiver',
    description: 'Required checkbox — visitor must agree before booking.',
    keywords: ['waiver', 'liability', 'consent', 'agreement'],
    field: {
      fieldKey: 'waiver_accepted',
      label: "I've read and agree to the liability waiver",
      fieldType: 'checkbox',
      required: true,
    },
  },
  {
    id: 'consent.photo_release',
    category: 'consent',
    title: 'Photo / media release',
    description: 'Opt-in for being photographed or filmed during the visit.',
    keywords: ['photo', 'media', 'release', 'consent', 'video'],
    field: {
      fieldKey: 'photo_release',
      label: 'I agree to be photographed or filmed during the visit',
      fieldType: 'checkbox',
      required: false,
    },
  },
  {
    id: 'consent.mailing_list',
    category: 'consent',
    title: 'Mailing list opt-in',
    description: 'Newsletter subscription checkbox.',
    keywords: ['mailing list', 'newsletter', 'email', 'subscribe'],
    field: {
      fieldKey: 'mailing_list_optin',
      label: 'Sign me up for the newsletter',
      fieldType: 'checkbox',
      required: false,
    },
  },
  {
    id: 'consent.text_updates',
    category: 'consent',
    title: 'Text-message updates',
    description: 'Opt-in for SMS reminders and updates.',
    keywords: ['sms', 'text', 'updates', 'reminders'],
    field: {
      fieldKey: 'text_updates_optin',
      label: 'Send me text-message reminders',
      fieldType: 'checkbox',
      required: false,
    },
  },
  {
    id: 'consent.minor_guardian',
    category: 'consent',
    title: 'Guardian of minors',
    description: 'Required for bookings that include children.',
    keywords: ['guardian', 'minor', 'parent', 'consent'],
    field: {
      fieldKey: 'guardian_consent',
      label: 'I am the parent or legal guardian of all minors in my party',
      fieldType: 'checkbox',
      required: false,
    },
  },
];
