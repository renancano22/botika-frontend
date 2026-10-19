export type Role = 'admin' | 'staff' | 'resident';

export interface Resident {
  resident_id: number;
  user_id: number | null;
  name: string;
  address: string;
  /** Empty for residents registered at the Botika without a cellphone (no SMS is sent to them). */
  contact_no: string | null;
  qr_code: string;
  /** Profile picture (data URL). Only included for the logged-in resident's own account. */
  photo?: string | null;
  created_at: string;
}

export interface User {
  user_id: number;
  name: string;
  email: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
  resident?: Resident | null;
}

/** unrecorded = staff have not recorded the stock yet (never shown as available). */
export type StockStatus = 'available' | 'low_stock' | 'out_of_stock' | 'unrecorded';

/** One stock batch of a medicine (staff/admin view). */
export interface MedicineBatch {
  inventory_id: number;
  quantity: number;
  expiration_date: string;
  expiry_status: 'ok' | 'near_expiry' | 'expired';
}

export interface Medicine {
  medicine_id: number;
  /** "MED-0007" */
  medicine_code?: string;
  /** Display name: generic name + strength + dosage form, e.g. "Amoxicillin 500mg Capsule". */
  medicine_name: string;
  generic_name?: string;
  strength?: string | null;
  dosage_form?: string | null;
  category: string;
  unit: string;
  description?: string | null;
  /** Can only be requested/dispensed with a doctor's prescription. */
  requires_prescription?: boolean;
  available_stock: number;
  /** false = stock not recorded yet by staff */
  stock_recorded?: boolean;
  status: StockStatus;
  reorder_level?: number;
  /** Staff/admin only: batches with stock, earliest expiry first. */
  batches?: MedicineBatch[];
  /** Staff/admin only: last change of the medicine record or its stock. */
  last_updated?: string | null;
  /** Staff/admin only: quantity promised to approved requests that are not dispensed yet. */
  reserved_stock?: number;
  /** Staff/admin only: available minus reserved (what walk-ins and new requests can use). */
  free_stock?: number;
}

export interface StockTransaction {
  transaction_id: number;
  medicine_id: number;
  inventory_id: number | null;
  type: 'stock_in' | 'stock_out' | 'dispensed';
  quantity: number;
  reason: string | null;
  /** Reason as shown in the history, e.g. "Dispensed to Juan Dela Cruz (BBC-000004) · Request No. 47". */
  reason_text?: string | null;
  dispensing_id: number | null;
  created_at: string;
  medicine?: Pick<Medicine, 'medicine_id' | 'medicine_name' | 'unit'>;
  batch?: { inventory_id: number; expiration_date: string } | null;
  performer?: { user_id: number; name: string } | null;
}

export interface InventoryBatch {
  inventory_id: number;
  medicine_id: number;
  quantity: number;
  expiration_date: string;
  last_updated: string;
  expiry_status?: 'ok' | 'near_expiry' | 'expired';
  medicine: Pick<Medicine, 'medicine_id' | 'medicine_name' | 'unit'> & { category?: string };
}

export interface LowStockAlert {
  medicine_id: number;
  medicine_name: string;
  unit: string;
  available_stock: number;
  reorder_level: number;
  status: StockStatus;
}

export interface Alerts {
  low_stock: LowStockAlert[];
  near_expiry: InventoryBatch[];
  expired: InventoryBatch[];
}

export interface RequestItem {
  request_item_id: number;
  medicine_id: number;
  quantity: number;
  medicine: Pick<Medicine, 'medicine_id' | 'medicine_name' | 'unit'> & { requires_prescription?: boolean };
}

/** Prescription uploaded with a request (the file itself is loaded separately). */
export interface PrescriptionInfo {
  prescription_id: number;
  file_name: string;
  mime_type: string;
  size: number;
  uploaded_at: string;
}

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'dispensed' | 'fulfilled' | 'cancelled' | 'expired';

export interface MedicineRequest {
  request_id: number;
  resident_id: number;
  request_type: 'medicine' | 'restock';
  request_date: string;
  /** The resident's reason / note for the request (optional). */
  resident_note?: string | null;
  status: RequestStatus;
  reviewed_by: number | null;
  reviewed_at: string | null;
  remarks: string | null;
  /** When the request was cancelled (or, for expired requests, when the pickup deadline passed). */
  cancelled_at?: string | null;
  cancelled_by?: number | null;
  /** When a restock request's medicine became available. */
  fulfilled_at?: string | null;
  /** Approved medicine requests: last day to claim before automatic cancellation. */
  claim_by?: string | null;
  /** Claim deadline of an approved medicine request, kept after it expires or is cancelled. */
  pickup_deadline?: string | null;
  /** Days the resident has to claim it (7). */
  pickup_days?: number | null;
  items: RequestItem[];
  resident?: Resident;
  reviewer?: { user_id: number; name: string } | null;
  canceller?: { user_id: number; name: string } | null;
  prescription?: PrescriptionInfo | null;
  prescription_verified_at?: string | null;
  prescription_verifier?: { user_id: number; name: string } | null;
  dispensing?: { dispensing_id: number; dispensed_at: string; dispenser?: { user_id: number; name: string } | null } | null;
}

export interface Dispensing {
  dispensing_id: number;
  request_id: number;
  dispensed_by: number | null;
  dispensed_at: string;
  items: { dispensing_item_id: number; medicine_id: number; quantity: number; medicine: Pick<Medicine, 'medicine_id' | 'medicine_name' | 'unit'> }[];
  request?: MedicineRequest;
  dispenser?: { user_id: number; name: string } | null;
}

export interface SmsNotification {
  notification_id: number;
  resident_id: number;
  request_id: number | null;
  /** submitted | approved | reminder | rejected | dispensed | cancelled | expired | available |
   *  announcement | closure | hours | distribution (null for older ones) */
  type?: string | null;
  message: string;
  channel: string;
  status: 'sent' | 'failed' | 'logged';
  sent_at: string;
  /** null = not read yet */
  read_at: string | null;
  resident?: Pick<Resident, 'resident_id' | 'name' | 'contact_no'>;
}

export type ForecastMethod = 'moving_average' | 'linear_regression' | 'exponential_smoothing';

/** The numbers behind one method's forecast (only the fields of that method are set). */
export interface ForecastCalculation {
  /** moving average: months averaged (up to 3), their quantities and the average */
  window?: number;
  months?: string[];
  values?: number[];
  average?: number;
  /** linear regression: change per month, line at the first month, direction, part of the line below 0 */
  slope?: number;
  intercept?: number;
  trend?: 'up' | 'down' | 'flat';
  below_zero?: boolean;
  /** exponential smoothing: alpha, the smoothed level after each month and the final level */
  alpha?: number;
  steps?: { month: string; actual: number; level: number }[];
  level?: number;
}

/** One method's forecast; null in its place = not enough months of records for that method. */
export interface ForecastMethodResult {
  predicted_demand: number;
  monthly: number[];
  mae: number | null;
  calculation: ForecastCalculation;
}

export interface ForecastMethodInfo {
  /** false = the method cannot forecast with the months of records available */
  available: boolean;
  /** true = based on fewer months than recommended (or on this month only, not finished yet) */
  provisional: boolean;
  min_months: number;
  recommended_months: number;
}

/** One medicine on the Demand Forecasting page. */
export interface ForecastResult {
  medicine_id: number;
  medicine_name: string;
  category: string;
  unit: string;
  forecast_date: string;
  /** dispensed quantity per past month, e.g. { "2026-04": 40 } */
  history: Record<string, number>;
  /** forecast of the chosen method per coming month */
  forecast: Record<string, number>;
  methods: Record<ForecastMethod, ForecastMethodResult | null>;
  /** most accurate method for this medicine (lowest back-tested error) */
  best_method: ForecastMethod;
  /** total for the whole forecast period, chosen method */
  predicted_demand: number;
  available_stock: number;
  reorder_level: number;
  /** false = staff have not recorded this medicine's stock yet (no restock is suggested) */
  stock_recorded?: boolean;
  recommended_restock: number;
  /** high = stock runs out within the period, medium = falls below the reorder level, null = enough stock */
  priority: 'high' | 'medium' | null;
}

export interface ForecastReport {
  generated_at: string;
  history_months: number;
  horizon: number;
  method: ForecastMethod;
  /** method asked for (it is replaced by the default when it cannot forecast yet) */
  requested_method: ForecastMethod | null;
  best_method: ForecastMethod;
  method_error: Record<ForecastMethod, number | null>;
  methods_info: Record<ForecastMethod, ForecastMethodInfo>;
  history_keys: string[];
  forecast_keys: string[];
  /** this month ('2026-10'); it is the last of history_keys and is counted so far */
  current_month: string;
  /** first month with dispensing records (null = none yet) */
  data_start: string | null;
  /** date of the very first dispensing record (null = none yet) */
  first_record_date: string | null;
  /** today ('2026-10-14') */
  today: string;
  /** months since records began in the chosen period (this month included) */
  months_with_data: number;
  /** months the methods learned from: complete months, or only this month so far (partial) when there is none yet */
  basis: { months: string[]; complete_months: number; partial: boolean };
  /** all medicines together: quantity per basis month and each method's calculation */
  overall: { series: Record<string, number>; methods: Record<ForecastMethod, ForecastMethodResult | null> };
  summary: { medicines_analyzed: number; potential_stockouts: number; restock_recommendations: number };
  top_barangays: { barangay: string; total: number }[];
  top_medicines: { medicine_id: number; medicine_name: string; unit: string; total: number; quantity: number }[];
  results: ForecastResult[];
  saved?: boolean;
}
