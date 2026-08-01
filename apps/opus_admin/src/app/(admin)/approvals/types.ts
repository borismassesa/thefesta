// Public type surface for the Approvals module. The shape of each
// request varies by category (Business Trip vs Contract Approval vs
// Procurement etc.), so the dynamic fields live under `fields` with
// string values keyed by field id. The category catalog in `data.ts`
// declares what each form should render.

export type ApprovalStatus = 'To Submit' | 'Submitted' | 'Approved' | 'Refused'

// Was a fixed union of nine literals. Owner/admin now author request types
// from the UI, so the set is open and lives in approval_categories. The DB
// still constrains the shape (`^[a-z0-9][a-z0-9-]*$`) and an FK from
// approval_requests.category guarantees a key always resolves.
export type ApprovalCategoryKey = string

// Business grouping for the Create catalog. Nine categories already reads
// as a wall; the roster is expected to keep growing (petty cash, expense,
// leave, training…), so the picker groups by owning function rather than
// listing everything flat.
export type ApprovalGroupKey =
  | 'travel'
  | 'finance'
  | 'procurement'
  | 'hr'
  | 'legal'
  | 'workplace'

export type ApprovalGroup = {
  key: ApprovalGroupKey
  label: string
  blurb: string
  // Each business function owns a colour so the catalog is scannable by
  // hue before it's read. Categories inside a group inherit the family.
  //
  // Deliberately no icon. Groups and their categories were drawing from
  // the same visual vocabulary, so a Travel header sat directly above a
  // Business Trip card wearing the identical plane, and Finance above
  // Payment Application wearing the identical wallet. The icon belongs on
  // the card, where it separates siblings; at group level the colour and
  // the label already carry the identity.
  accent: string
  tint: string
}

export type ApprovalFieldKind =
  | 'text'
  | 'textarea'
  | 'date'
  | 'date-range'
  | 'number'
  | 'amount'
  | 'list'

export type ApprovalField = {
  id: string
  label: string
  kind: ApprovalFieldKind
  placeholder?: string
  required?: boolean
  // Optional helper rendered under the label.
  hint?: string
}

export type ApprovalCategory = {
  key: ApprovalCategoryKey
  label: string
  // Which business function owns this request type. Drives the Create
  // tab's section headings.
  group: ApprovalGroupKey
  // Short description for the picker / sidebar.
  blurb: string
  // Hex used in pills, status chips and the icon tile.
  accent: string
  // Soft tint for icon backgrounds.
  tint: string
  // Lucide icon name (resolved on the client to avoid bundling the
  // whole icon map).
  iconKey:
    | 'Plane'
    | 'PackageOpen'
    | 'FileCheck2'
    | 'FileSignature'
    | 'Wallet'
    | 'Car'
    | 'UserPlus'
    | 'ShoppingCart'
    | 'FileText'
  // Form field schema for this category. Order is preserved.
  fields: ApprovalField[]
  // Retired types stop being offered in the Create catalog but keep resolving
  // their label for requests that already reference them.
  active: boolean
  sortOrder: number
}

export type ApprovalApprover = {
  id: string
  name: string
  role?: string
  email: string
}

export type ApprovalActivityKind = 'system' | 'note' | 'message'

export type ApprovalActivity = {
  id: string
  kind: ApprovalActivityKind
  at: string
  author: string
  authorInitials: string
  // Tailwind-color or hex used for the author's avatar tile.
  authorColor: string
  body: string
}

// A supporting document: a receipt, quote, invoice or contract.
//
// Deliberately no storage path and no URL. A URL in the page payload is a
// bearer token sitting in anyone's devtools for as long as it is valid, and a
// path is enough to request one. The client holds an id and asks for a short
// signed URL at the moment of the click, which is re-authorized then.
export type ApprovalAttachment = {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadedBy: string
  uploadedAt: string
}

// The logged-in admin acting on a request — used for activity entries,
// owner default when creating a new request, and as the `actor` party
// on outbound emails.
export type ApprovalActor = {
  name: string
  email: string
  initials: string
  // Hex color for the avatar tile.
  color: string
  // Optional role/title for email footer presentation.
  role?: string
}

export type ApprovalRequest = {
  id: string
  category: ApprovalCategoryKey
  subject: string
  owner: string
  ownerEmail: string
  ownerInitials: string
  // Free-form key/value map keyed by field id. Values are always
  // strings (amounts come pre-formatted, date ranges as "YYYY-MM-DD/YYYY-MM-DD").
  fields: Record<string, string>
  approvers: ApprovalApprover[]
  status: ApprovalStatus
  // ISO date for whichever transition matters most for sort order.
  // `Submitted` => submission date, otherwise creation date.
  updatedAt: string
  createdAt: string
  // Stamped the first time the request leaves `To Submit`. Null while it's
  // still a draft. Drives the "Submitted" column and every duration metric
  // on the Analytics tab — `createdAt` would count draft-sitting time as
  // approver latency.
  submittedAt: string | null
  // Discussion / system log shown in the right rail on the request form.
  activity: ApprovalActivity[]
  // Supporting documents. Empty for requests raised before attachments
  // existed, and for any request nobody has attached anything to.
  attachments: ApprovalAttachment[]
}
