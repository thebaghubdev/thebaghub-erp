/** Maximum line items a client may attach to one consignment inquiry form. */
export const MAX_ITEMS_PER_INQUIRY = 10;

export type ConsignItemFormData = {
  itemModel: string;
  brand: string;
  category: string;
  serialNumber: string;
  color: string;
  material: string;
  condition: string;
  inclusions: string;
  datePurchased: string;
  sourceOfPurchase: string;
  specialInstructions: string;
  /** Client’s desired consignment list price (numeric text). */
  consignmentSellingPrice: string;
  /** Client’s desired direct-purchase price (numeric text). */
  directPurchaseSellingPrice: string;
  /** Opt-in: allow direct purchase; user may open terms without checking. */
  consentDirectPurchase: boolean;
  /** Authorize The Bag Hub to set price from market research (step 1 consent). */
  consentPriceNomination: boolean;
};

export function emptyConsignItemForm(): ConsignItemFormData {
  return {
    itemModel: "",
    brand: "",
    category: "",
    serialNumber: "",
    color: "",
    material: "",
    condition: "",
    inclusions: "",
    datePurchased: "",
    sourceOfPurchase: "",
    specialInstructions: "",
    consignmentSellingPrice: "",
    directPurchaseSellingPrice: "",
    consentDirectPurchase: false,
    consentPriceNomination: false,
  };
}

/** Local draft image (not uploaded to server). */
export type LocalConsignImage = {
  id: string;
  file: File;
  previewUrl: string;
};

export type DraftConsignItem = {
  id: string;
  form: ConsignItemFormData;
  images: LocalConsignImage[];
};
