export type Role = 'admin' | 'staff' | 'resident';

export interface Resident {
  resident_id: number;
  user_id: number | null;
  name: string;
  address: string;
  contact_no: string;
  qr_code: string;
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

export type StockStatus = 'available' | 'low_stock' | 'out_of_stock';

export interface Medicine {
  medicine_id: number;
  medicine_name: string;
  category: string;
  unit: string;
  description: string | null;
  available_stock: number;
  status: StockStatus;
  reorder_level?: number;
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
  medicine: Pick<Medicine, 'medicine_id' | 'medicine_name' | 'unit'>;
}

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'dispensed' | 'fulfilled' | 'cancelled';

export interface MedicineRequest {
  request_id: number;
  resident_id: number;
  request_type: 'medicine' | 'restock';
  request_date: string;
  status: RequestStatus;
  reviewed_by: number | null;
  reviewed_at: string | null;
  remarks: string | null;
  items: RequestItem[];
  resident?: Resident;
  reviewer?: { user_id: number; name: string } | null;
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
  message: string;
  channel: string;
  status: 'sent' | 'failed' | 'logged';
  sent_at: string;
  resident?: Pick<Resident, 'resident_id' | 'name' | 'contact_no'>;
}

export interface ForecastResult {
  medicine_id: number;
  medicine_name: string;
  unit: string;
  forecast_date: string;
  history: Record<string, number>;
  methods: Record<'moving_average' | 'linear_regression' | 'exponential_smoothing', { predicted_demand: number; mae: number | null }>;
  best_method: string;
  predicted_demand: number;
  available_stock: number;
  reorder_level: number;
  recommended_restock: number;
}
