export type PriceStatus = "priced" | "quote";
export type CommercialStatus = "active" | "discontinued";

export interface PaymentDiscount {
  label: string;
  discountPercent: number | null;
  resultingPrice: number;
}

export interface QuantityDiscount {
  minimumQuantity: number;
  resultingPrice: number;
}

export interface Product {
  id: string;
  providerId: string;
  providerName: string;
  code: string;
  description: string;
  listPrice: number;
  priceStatus: PriceStatus;
  currency: "ARS" | "USD";
  quantityDiscounts: QuantityDiscount[];
  paymentDiscounts: PaymentDiscount[];
  imageUrl: string | null;
  imageSource: "manual" | "supplier" | null;
  status: CommercialStatus;
  importedAt: string;
}

export interface Provider {
  id: string;
  name: string;
  legalName?: string;
  fantasyName?: string;
  contact?: string;
  latitude?: string;
  longitude?: string;
  description?: string;
  coverImageUrl?: string | null;
}

export interface Customer {
  id: string;
  legalName: string;
  commercialName: string;
  cuit: string;
  address: string;
  phone: string;
  whatsapp: string;
  email: string;
  contactPerson: string;
  notes: string;
}

export interface BrokerProfile {
  name: string;
  imageUrl: string | null;
  phone: string;
  whatsapp: string;
  email: string;
}

export interface ImportResult {
  products: Product[];
  skippedRows: number;
  sourceDate: string | null;
}
